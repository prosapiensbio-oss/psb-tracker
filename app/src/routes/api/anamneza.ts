import { createFileRoute } from "@tanstack/react-router";

import { audit } from "../../lib/psb/audit.server";
import { bindings } from "../../lib/bindings.server";
import { currentUser, isAuthed, unauthorized } from "../../lib/psb/auth.server";
import { FORMULAR } from "../../lib/psb/anamnezaFormular";
import { podlaKlienta, predvyplnZapisu, ulozZapis, zalozAleboNajdi } from "../../lib/psb/anamneza.server";
import { prevezmi, type StaryRiadok } from "../../lib/psb/anamnezaImport";
import { zasifruj } from "../../lib/psb/sifra.server";
import { dnesPraha } from "../../lib/psb/cas";

/**
 * ANAMNÉZA — strana trénera.
 *
 *   GET  ?klient=X          → definícia formulára, uložené odpovede,
 *                             predvyplnené hodnoty a odkaz pre klienta
 *   POST { akcia: "odkaz" } → založí anamnézu a vráti odkaz /a/<token>
 *   POST { akcia: "zapis" } → uloží zápis z úvodného tréningu
 *
 * Odpovede sú v databáze ŠIFROVANÉ (`sifra.server.ts`); rozšifruje ich až
 * tento endpoint, a to len prihlásenému. Bez `ANAMNEZA_KLUC` sa nedá ani
 * čítať, ani zapisovať — a je to lepšie než ticho zapísať čitateľný
 * zdravotný záznam.
 */

const kus = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export const Route = createFileRoute("/api/anamneza")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        if (!ANAMNEZA_KLUC) return Response.json({ ok: false, error: "Šifrovací kľúč nie je nastavený (ANAMNEZA_KLUC)." }, { status: 503 });

        const q = new URL(request.url).searchParams;

        /**
         * ZOZNAM PRE KARTU ANAMNÉZY — všetky pokope.
         *
         * Jerry, 30. 9. 2026: „chcem mať celú jednu kartu, kde budú všetky
         * anamnézy pokope." Nie je to teda fronta toho, čo chýba, ale
         * kartotéka: rozpracované hore, hotové pod nimi.
         *
         * Do zoznamu patria aj klienti, ktorí anamnézu ešte NEMAJÚ a idú na
         * úvodný tréning (okno ±30 dní) — inak by sa nový človek objavil
         * až potom, čo mu niekto ručne založí riadok.
         *
         * Obsah odpovedí sa tu NEROZŠIFRÚVA. Na zoznam stačí stav a dátumy;
         * rozšifrovať päťdesiat zdravotných záznamov kvôli výpisu mien je
         * zbytočná práca s citlivými dátami.
         */
        if (q.get("zoznam")) {
          const dnes = dnesPraha();
          const od = dnesPraha(new Date(Date.now() - 30 * 86400000));
          const doDna = dnesPraha(new Date(Date.now() + 30 * 86400000));
          const origin = new URL(request.url).origin;

          const rs = await DB.prepare(
            `SELECT a.klient, a.stav, a.token, a.klient_vyplnil_at, a.zapis_at, a.vytvorene_at,
                    (SELECT MIN(u.zaciatok) FROM kal_udalosti u
                      WHERE u.klient = a.klient AND u.typ = 'uvodny' AND u.zmizla_at IS NULL) AS uvodny
               FROM anamnezy a`,
          ).all();

          // Kto ide na úvodný a riadok ešte nemá.
          const chybaju = await DB.prepare(
            `SELECT u.klient, u.trener, MIN(u.zaciatok) AS uvodny
               FROM kal_udalosti u
              WHERE u.zmizla_at IS NULL AND u.typ = 'uvodny' AND u.klient IS NOT NULL
                AND substr(u.zaciatok, 1, 10) BETWEEN ?1 AND ?2
                AND NOT EXISTS (SELECT 1 FROM anamnezy a WHERE a.klient = u.klient)
              GROUP BY u.klient, u.trener`,
          ).bind(od, doDna).all();

          // Tréner klienta — zoznam sa filtruje ním, nie trénerom udalosti.
          const treneri = new Map<string, string>();
          for (const r of ((await DB.prepare("SELECT name, primary_trainer FROM client_overrides WHERE primary_trainer IS NOT NULL").all()).results || []) as unknown as { name: string; primary_trainer: string }[]) {
            treneri.set(r.name, r.primary_trainer);
          }

          type Riadok = { klient: string; stav: string; token: string | null; klient_vyplnil_at: string | null; zapis_at: string | null; vytvorene_at: string | null; uvodny: string | null; trener?: string };
          const polozky = [
            ...((rs.results || []) as unknown as Riadok[]).map((r) => ({
              klient: r.klient,
              trener: treneri.get(r.klient) || "",
              uvodny: r.uvodny,
              stav: r.stav || "ceka",
              odkaz: r.token ? `${origin}/a/${r.token}` : null,
              klientVyplnilAt: r.klient_vyplnil_at,
              zapisAt: r.zapis_at,
              uzBol: !!r.uvodny && r.uvodny.slice(0, 10) <= dnes,
            })),
            ...((chybaju.results || []) as unknown as Riadok[]).map((r) => ({
              klient: r.klient,
              trener: treneri.get(r.klient) || r.trener || "",
              uvodny: r.uvodny,
              stav: "ceka" as const,
              odkaz: null,
              klientVyplnilAt: null,
              zapisAt: null,
              uzBol: !!r.uvodny && r.uvodny.slice(0, 10) <= dnes,
            })),
          ];

          // Rozpracované hore (najbližší úvodný prvý), hotové dole.
          polozky.sort((a, b) => {
            const h = (x: typeof a) => (x.zapisAt ? 1 : 0);
            if (h(a) !== h(b)) return h(a) - h(b);
            return String(b.uvodny || b.klient).localeCompare(String(a.uvodny || a.klient));
          });
          return Response.json({ ok: true, polozky }, { headers: { "cache-control": "no-store" } });
        }

        const klient = kus(q.get("klient"), 120);
        if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });

        const a = await podlaKlienta(DB, klient, ANAMNEZA_KLUC);
        // Dopyt klienta nesie test postury aj zdroj — obe sa predvypĺňajú.
        const lead = await DB.prepare(
          "SELECT note, date FROM leads WHERE lower(trim(name)) = lower(trim(?1)) ORDER BY date DESC LIMIT 1",
        ).bind(klient).first<{ note: string | null; date: string | null }>();
        const ov = await DB.prepare(
          "SELECT zdroj, zdroj_kto FROM client_overrides WHERE name = ?1",
        ).bind(klient).first<{ zdroj: string | null; zdroj_kto: string | null }>();

        const predvyplnene = predvyplnZapisu({
          klientOdpovede: a?.klientOdpovede || {},
          klientVyplnilAt: a?.klientVyplnilAt || null,
          lead, zdroj: ov?.zdroj, zdrojKto: ov?.zdroj_kto,
        });

        return Response.json({
          ok: true,
          formular: FORMULAR,
          anamneza: a && {
            stav: a.stav, token: a.token,
            klientOdpovede: a.klientOdpovede, zapisOdpovede: a.zapisOdpovede,
            suhlasy: a.suhlasy, klientVyplnilAt: a.klientVyplnilAt, zapisAt: a.zapisAt,
          },
          predvyplnene,
          odkaz: a ? `${new URL(request.url).origin}/a/${a.token}` : null,
        }, { headers: { "cache-control": "no-store" } });
      },

      POST: async ({ request }) => {
        if (!(await isAuthed(request))) return unauthorized();
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        if (!DB) return Response.json({ ok: false, error: "no_db" }, { status: 500 });
        if (!ANAMNEZA_KLUC) return Response.json({ ok: false, error: "Šifrovací kľúč nie je nastavený (ANAMNEZA_KLUC)." }, { status: 503 });

        let b: Record<string, unknown>;
        try { b = (await request.json()) as Record<string, unknown>; }
        catch { return Response.json({ ok: false, error: "bad_request" }, { status: 400 }); }
        const kto = (await currentUser(request)) || "";
        /**
         * IMPORT STARÝCH ANAMNÉZ Z GOOGLE FORMS.
         *
         * Beží tadiaľto, a nie skriptom z príkazového riadka, z jediného
         * dôvodu: šifrovací kľúč je Worker secret a mimo workera k nemu
         * nikto nemá prístup — ani ja. Zdravotné odpovede sa tým pádom
         * zašifrujú na tom istom mieste, kde vznikajú aj bežné zápisy.
         *
         * Klienta určuje VOLAJÚCI (párovanie mena a mailu je spravené
         * a ukázané mimo appky); server ho len overí. Hádať by sa tu
         * nesmelo: zle priradená anamnéza je cudzí zdravotný záznam na
         * karte klienta, a to sa spätne nedá poznať.
         *
         * NIKDY NEPREPÍŠE HOTOVÝ ZÁPIS. Opakované spustenie preto nič
         * nepokazí — druhýkrát sa riadok preskočí.
         */
        if (b.akcia === "import-stary") {
          /**
           * Dva tvary dávky, lebo hlavička exportu má cez dva kilobajty.
           * Pri päťdesiatich riadkoch by sa poslala päťdesiatkrát; s `hlavicka`
           * ide raz a riadok nesie len hodnoty v tom istom poradí.
           */
          const hlavicka = (Array.isArray(b.hlavicka) ? b.hlavicka : []) as string[];
          const riadky = ((Array.isArray(b.riadky) ? b.riadky : []) as { klient: string; data?: StaryRiadok; h?: string[] }[])
            .map((r) => ({
              klient: r.klient,
              data: r.data || Object.fromEntries((r.h || []).map((v, idx) => [hlavicka[idx] || `#${idx}`, v])),
            }));
          if (!riadky.length) return Response.json({ ok: false, error: "Prázdna dávka." }, { status: 400 });

          const vysledky: { klient: string; stav: string }[] = [];
          for (const r of riadky) {
            const klientR = kus(r.klient, 120);
            if (!klientR) { vysledky.push({ klient: "?", stav: "bez mena" }); continue; }

            const jeKlient = await DB.prepare(
              "SELECT 1 x FROM sessions WHERE client_name = ?1 LIMIT 1",
            ).bind(klientR).first<{ x: number }>();
            if (!jeKlient) { vysledky.push({ klient: klientR, stav: "klient v Kokpite nie je" }); continue; }

            const uz = await DB.prepare("SELECT zapis_at FROM anamnezy WHERE klient = ?1").bind(klientR).first<{ zapis_at: string | null }>();
            if (uz?.zapis_at) { vysledky.push({ klient: klientR, stav: "preskočené — zápis už má" }); continue; }

            const v = prevezmi(r.data || {});
            if (!Object.keys(v.odpovede).length) { vysledky.push({ klient: klientR, stav: "prázdny riadok" }); continue; }

            const a = await zalozAleboNajdi(DB, klientR, ANAMNEZA_KLUC, kto);
            const sifra = await zasifruj(JSON.stringify(v.odpovede), ANAMNEZA_KLUC);
            await DB.prepare(
              `UPDATE anamnezy SET zapis_json = ?1, zapis_at = ?2, stav = 'hotova',
                      suhlasy_json = COALESCE(suhlasy_json, ?3)
                WHERE klient = ?4`,
            ).bind(sifra, v.kedy || new Date().toISOString(), v.suhlasy ? JSON.stringify(v.suhlasy) : null, klientR).run();
            vysledky.push({ klient: klientR, stav: `prevzaté · ${a.token ? "" : ""}${(v.kedy || "").slice(0, 10)}` });
          }

          await audit(DB, {
            action: "anamnezy-import",
            predmet: `${vysledky.filter((x) => x.stav.startsWith("prevzaté")).length} z ${riadky.length} z Google Forms`,
            actor: kto,
          });
          return Response.json({ ok: true, vysledky });
        }

        const klient = kus(b.klient, 120);
        if (!klient) return Response.json({ ok: false, error: "Chýba klient." }, { status: 400 });

        if (b.akcia === "odkaz") {
          const a = await zalozAleboNajdi(DB, klient, ANAMNEZA_KLUC, kto);
          return Response.json({ ok: true, odkaz: `${new URL(request.url).origin}/a/${a.token}`, stav: a.stav });
        }

        if (b.akcia === "zapis") {
          const odpovede = (b.odpovede || {}) as Record<string, unknown>;
          // Zápis vzniká aj vtedy, keď klient nevyplnil nič — Jerry ho píše
          // pri tréningu a anamnéza dovtedy existovať nemusí.
          await zalozAleboNajdi(DB, klient, ANAMNEZA_KLUC, kto);
          const ok = await ulozZapis(DB, klient, odpovede, ANAMNEZA_KLUC);
          if (!ok) return Response.json({ ok: false, error: "Zápis sa neuložil." }, { status: 500 });
          await audit(DB, { action: "anamneza-zapis", predmet: klient, actor: kto });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "Neznáma akcia." }, { status: 400 });
      },
    },
  },
});
