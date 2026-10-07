import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { dnesPraha, terazPraha } from "../../lib/psb/cas";
import { KALENDAR_TRENERA, pripravCas } from "../../lib/psb/nahodTrening";
import { platiDo, prekryva, prekryvVPonuke, stavPonuky, volneCasy } from "../../lib/psb/ponukaTerminov";
import { nacitajPonuku, obsadeneVOkne, oknoCasov, type RiadokPonuky } from "../../lib/psb/ponukaTerminov.server";
import { verejnyOdkaz } from "../../lib/psb/verejnyOdkaz";

/**
 * PONUKA TERMÍNOV — Kokpit (Workspace → Ponuka termínov), 7. 10. 2026.
 *
 *   GET                       → ponuky za posledné tri týždne so stavom
 *   POST { akcia: "vytvor", klient, telefon?, typ?, casy: [{ trener, den, cas, minut }] }
 *                             → token a adresa /t/<token>
 *   POST { akcia: "zrus", token }
 *
 * Klient si vyberá na verejnej stránke `routes/t.$token.tsx`.
 */
const chyba = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
const novyToken = () => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map((x) => abc[x % abc.length]).join("");
};

export const Route = createFileRoute("/api/ponuky")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const od = new Date(Date.now() - 21 * 86400000).toISOString();
        const ponuky = ((await DB.prepare("SELECT * FROM ponuky_terminov WHERE created_at >= ?1 ORDER BY created_at DESC LIMIT 60")
          .bind(od).all().catch(() => null))?.results || null) as unknown as RiadokPonuky[] | null;
        if (!ponuky) return chyba("Ponuky nemajú tabuľky (migrácia 0100).", 500);
        const origin = new URL(request.url).origin;
        const dnes = dnesPraha(), teraz = terazPraha();
        const von = [];
        for (const p of ponuky) {
          const n = await nacitajPonuku(DB, p.token);
          const casy = n?.casy || [];
          const o = oknoCasov(casy);
          const volne = volneCasy(casy, await obsadeneVOkne(DB, o.od, o.do, p.token), teraz);
          von.push({
            token: p.token, klient: p.klient, telefon: p.telefon, typ: p.typ, platiDo: p.plati_do,
            vybranyId: p.vybrany_id, vybraneAt: p.vybrane_at, zruseneAt: p.zrusene_at, kto: p.kto, createdAt: p.created_at,
            casy, volnych: volne.length, stav: stavPonuky(p, dnes, volne.length),
            url: verejnyOdkaz(`/t/${p.token}`, origin),
          });
        }
        return Response.json({ ok: true, ponuky: von }, { headers: { "cache-control": "no-store" } });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB } = bindings();
        if (!DB) return chyba("no_db", 500);
        const kto = (await currentUser(request)) || "";
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

        if (b.akcia === "zrus") {
          const token = String(b.token || "");
          const r = await DB.prepare("UPDATE ponuky_terminov SET zrusene_at = ?2 WHERE token = ?1 AND vybrany_id IS NULL AND zrusene_at IS NULL")
            .bind(token, new Date().toISOString()).run();
          if (!r.meta.changes) return chyba("Ponuka už je vybraná alebo zrušená.", 409);
          await audit(DB, { action: "ponuka-zrusena", predmet: token, actor: kto || undefined });
          return Response.json({ ok: true });
        }

        if (b.akcia !== "vytvor") return chyba("neznáma akcia");
        const klient = String(b.klient || "").replace(/\s+/g, " ").trim().slice(0, 120);
        if (!klient) return chyba("Komu? Chýba meno.");
        const telefon = String(b.telefon || "").trim().slice(0, 40) || null;
        const typ = b.typ === "uvodny" ? "uvodny" : "trening";
        const vstup = Array.isArray(b.casy) ? (b.casy as Record<string, unknown>[]) : [];
        if (!vstup.length) return chyba("Chýba aspoň jeden termín.");
        if (vstup.length > 40) return chyba("Priveľa termínov naraz.");

        const casy: { id: string; trener: string; zaciatok: string; koniec: string }[] = [];
        for (const x of vstup) {
          const trener = String(x.trener || "");
          if (!KALENDAR_TRENERA[trener]) return chyba(`Neznámy tréner „${trener}“.`);
          const c = pripravCas(String(x.den || ""), String(x.cas || ""), x.minut == null ? undefined : Number(x.minut));
          if (!c.ok) return chyba(c.chyba);
          casy.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, trener, zaciatok: c.zaciatok, koniec: c.koniec });
        }
        if (prekryvVPonuke(casy)) return chyba("Dva ponúknuté termíny sa prekrývajú.");
        const teraz = terazPraha();
        if (casy.some((c) => c.zaciatok <= teraz)) return chyba("Niektorý termín je už v minulosti.");
        // Server overí to isté, čo obrazovka: ponuka do obsadeného času nevznikne.
        const o = oknoCasov(casy);
        const obsadene = await obsadeneVOkne(DB, o.od, o.do);
        const zrazka = casy.find((c) => obsadene.some((x) => x.trener === c.trener && prekryva(c, x)));
        if (zrazka) return chyba(`Termín ${zrazka.zaciatok.slice(8, 10)}. ${zrazka.zaciatok.slice(5, 7)}. o ${zrazka.zaciatok.slice(11, 16)} je už v kalendári obsadený.`, 409);

        const token = novyToken();
        await DB.batch([
          DB.prepare("INSERT INTO ponuky_terminov (token, klient, telefon, typ, plati_do, kto, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
            .bind(token, klient, telefon, typ, platiDo(casy), kto, new Date().toISOString()),
          ...casy.map((c) => DB.prepare("INSERT INTO ponuky_terminov_casy (id, token, trener, zaciatok, koniec) VALUES (?1,?2,?3,?4,?5)")
            .bind(c.id, token, c.trener, c.zaciatok, c.koniec)),
        ]);
        await audit(DB, { action: "ponuka-vytvorena", predmet: klient, neu: { token, terminov: casy.length, platiDo: platiDo(casy) }, actor: kto || undefined });
        return Response.json({ ok: true, token, url: verejnyOdkaz(`/t/${token}`, new URL(request.url).origin), platiDo: platiDo(casy) });
      },
    },
  },
});
