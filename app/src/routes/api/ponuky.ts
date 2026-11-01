import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { dnesPraha, terazPraha } from "../../lib/psb/cas";
import { KALENDAR_TRENERA, pripravCas } from "../../lib/psb/nahodTrening";
import { DLZKA_TRENINGU, menoJeCislo, platiDo, prekryva, prekryvVPonuke, smsKPonukam, stavPonuky, volneCasy } from "../../lib/psb/ponukaTerminov";
import { nacitajPonuku, obsadeneVOkne, oknoCasov, type RiadokPonuky } from "../../lib/psb/ponukaTerminov.server";
import { cisloPreBranu } from "../../lib/psb/sms";
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
        // Odišla SMS? Výpadok dopytu nesmie vyzerať ako „neodišla" — vtedy zoznam mlčí.
        const smsRiadky = ((await DB.prepare("SELECT at, payment_id FROM vzas_audit WHERE action = 'sms-ponuka' AND at >= ?1").bind(od).all().catch(() => null))?.results || null) as { at: string; payment_id: string }[] | null;
        const smsKedy = smsRiadky ? smsKPonukam(ponuky, smsRiadky.map((x) => ({ at: x.at, predmet: x.payment_id }))) : null;
        // Čísla aj ľudí, ktorí ešte nemajú profil — aby sa dali nájsť znova.
        const kontakty = ((await DB.prepare("SELECT klient, telefon FROM klient_fakturacia WHERE telefon <> ''").all().catch(() => null))?.results || []) as { klient: string; telefon: string }[];
        const von = [];
        for (const p of ponuky) {
          const n = await nacitajPonuku(DB, p.token);
          const casy = n?.casy || [];
          const o = oknoCasov(casy);
          // Výpadok dopytu nesmie vyzerať ako „všetko voľné" (obsadeneVOkne chybu púšťa von).
          const obsadene = await obsadeneVOkne(DB, o.od, o.do, p.token).catch(() => null);
          if (!obsadene) return chyba("Kalendár sa teraz nedá prečítať, skús to o chvíľu.", 503);
          const volne = volneCasy(casy, obsadene, teraz);
          von.push({
            token: p.token, klient: p.klient, telefon: p.telefon, typ: p.typ, platiDo: p.plati_do,
            vybranyId: p.vybrany_id, vybranyZaciatok: p.vybrany_zaciatok || null, vybraneAt: p.vybrane_at, zruseneAt: p.zrusene_at, kto: p.kto, createdAt: p.created_at,
            casy, volnych: volne.length, stav: stavPonuky(p, dnes, volne.length),
            url: verejnyOdkaz(`/t/${p.token}`, origin),
            smsKedy: smsKedy ? smsKedy[p.token] : undefined,
          });
        }
        return Response.json({ ok: true, ponuky: von, kontakty }, { headers: { "cache-control": "no-store" } });
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
        if (menoJeCislo(klient)) return chyba("Do „Komu" patrí meno — číslo daj do políčka na telefón pod ním.");
        const telefon = String(b.telefon || "").trim().slice(0, 40) || null;
        const typ = b.typ === "uvodny" ? "uvodny" : "trening";
        const vstup = Array.isArray(b.casy) ? (b.casy as Record<string, unknown>[]) : [];
        if (!vstup.length) return chyba("Chýba aspoň jeden termín.");
        if (vstup.length > 40) return chyba("Priveľa termínov naraz.");

        const casy: { id: string; trener: string; zaciatok: string; koniec: string }[] = [];
        for (const x of vstup) {
          const trener = String(x.trener || "");
          if (!KALENDAR_TRENERA[trener]) return chyba(`Neznámy tréner „${trener}“.`);
          // Rozmedzie (11. 10. 2026): ponúknutý čas smie byť až 12 h, klient si
          // v ňom vyberie začiatok hodinového tréningu. Kratší než tréning nie.
          const minut = x.minut == null ? DLZKA_TRENINGU : Number(x.minut);
          if (minut < DLZKA_TRENINGU) return chyba(`Ponúknutý čas musí mať aspoň ${DLZKA_TRENINGU} minút.`);
          const c = pripravCas(String(x.den || ""), String(x.cas || ""), minut, 720);
          if (!c.ok) return chyba(c.chyba);
          casy.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, trener, zaciatok: c.zaciatok, koniec: c.koniec });
        }
        if (prekryvVPonuke(casy)) return chyba("Dva ponúknuté termíny sa prekrývajú.");
        const teraz = terazPraha();
        if (casy.some((c) => c.zaciatok <= teraz)) return chyba("Niektorý termín je už v minulosti.");
        // Server overí to isté, čo obrazovka: ponuka do obsadeného času nevznikne.
        const o = oknoCasov(casy);
        const obsadene = await obsadeneVOkne(DB, o.od, o.do).catch(() => null);
        if (!obsadene) return chyba("Kalendár sa teraz nedá prečítať, skús to o chvíľu.", 503);
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
        /**
         * ČÍSLO NOVÉHO ČLOVEKA SA NESMIE STRATIŤ S PONUKOU (Leon Box, 1. 11. 2026).
         * Stálo len pri ponuke, takže o týždeň ho nebolo kde nájsť. Uloží sa ku
         * kontaktom, ale existujúce číslo neprepíše. Ponuku to nezhodí — už stojí.
         */
        let upozornenie = "";
        if (telefon && cisloPreBranu(telefon)) {
          await DB.prepare(
            `INSERT INTO klient_fakturacia (klient, telefon, updated_at) VALUES (?1,?2,?3)
             ON CONFLICT(klient) DO UPDATE SET telefon = excluded.telefon, updated_at = excluded.updated_at WHERE telefon = ''`,
          ).bind(klient, telefon, new Date().toISOString()).run()
            .catch((e) => { upozornenie = `Ponuka je hotová, ale číslo sa k menu neuložilo: ${String(e).slice(0, 160)}`; });
        }
        return Response.json({ ok: true, token, url: verejnyOdkaz(`/t/${token}`, new URL(request.url).origin), platiDo: platiDo(casy), ...(upozornenie ? { upozornenie } : {}) });
      },
    },
  },
});
