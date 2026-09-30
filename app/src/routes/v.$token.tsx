import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { deriveClients } from "../lib/psb/compute";
import { dlhKlienta, type BalicekDlh, type PlatbaDlh } from "../lib/psb/dlhKlienta";
import { historiaPreMail } from "../lib/psb/historiaMail";
import { loadData } from "../lib/psb/db.server";
import { mailKlientovi } from "../lib/psb/mailKlientovi";
import { osCasuKlienta } from "../lib/psb/klientOsCasu";
import { blokPocitovky } from "../lib/psb/pocitovkaStranka";
import { oblastiZJson, platnaHodnota, posledneHodnoty, POSUN, type Meranie, type Oblast } from "../lib/psb/pocitovka";
import { podlaKlienta } from "../lib/psb/anamneza.server";
import { qrObrazok } from "../lib/psb/fakturaHtml";
import { DODAVATEL, spayd } from "../lib/psb/vydanaFaktura";

/**
 * VEREJNÁ STRÁNKA KLIENTA — to, na čo klikne z SMS.
 *
 * Jerry, 30. 9. 2026: „je možnosť tam dať preklik, ktorý by ľudí preklikol
 * rovno do toho zobrazenia tréningov a na platbu?" SMS nemá miesto na
 * tabuľku; nesie odkaz `/v/<token>` a stránka ukáže to isté, čo mail
 * s výpisom: históriu tréningov a platieb — a keď klient niečo dlhuje,
 * aj QR na platbu so sumou.
 *
 * BEZPEČNOSŤ: token je náhodných 12 znakov z tabuľky `klient_odkazy` —
 * nedá sa uhádnuť ani odvodiť z mena a zmazaním riadku odkaz zhasne.
 * Stránka je NOINDEX a bez keše; okrem tokenu sa v adrese nič nenesie.
 * Sadzba je tá istá ako v maili (mailKlientovi) — jeden vzhľad, jedna
 * pravda; obrázky idú ako URL a data:, lebo stránka prílohy nemá.
 */
export const Route = createFileRoute("/v/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB, ANAMNEZA_KLUC } = bindings() as { DB?: import("@cloudflare/workers-types").D1Database; ANAMNEZA_KLUC?: string };
        const prec = (text: string, status: number) => new Response(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>ProSapiens</title></head>
<body style="margin:0;background:#232b1c;color:#f2f0e4;font-family:Arial,Helvetica,sans-serif"><div style="max-width:420px;margin:80px auto;padding:0 20px;text-align:center">
<div style="font-size:15px;line-height:1.6">${text}</div>
<div style="margin-top:18px;font-size:12px;color:#9aa284">ProSapiens Biomechanic · ${DODAVATEL.telefon}</div></div></body></html>`,
          { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
        );
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return prec("Tento odkaz neplatí.", 404);

        const r = await DB.prepare("SELECT klient FROM klient_odkazy WHERE token = ?1").bind(token).first<{ klient: string }>();
        if (!r) return prec("Tento odkaz neplatí. Ozvi sa nám a pošleme ti nový.", 404);

        const data = await loadData(DB);
        const c = deriveClients(data)[r.klient];
        if (!c) return prec("Tento odkaz neplatí. Ozvi sa nám a pošleme ti nový.", 404);

        const dnes = new Date().toISOString().slice(0, 10);
        const os = osCasuKlienta(c.name, {
          sessions: data.sessions, payments: data.payments, packages: data.packages,
          services: data.services, poplatky: data.poplatky, treningyZdarma: data.treningyZdarma,
          doplneniaHodiny: data.doplneniaHodiny || {},
        }, dnes);
        const dalsi = ((await DB.prepare(
          "SELECT MIN(zaciatok) z FROM kal_udalosti WHERE zmizla_at IS NULL AND klient = ?1 AND typ IN ('trening','uvodny') AND zaciatok > ?2",
        ).bind(c.name, new Date().toISOString().slice(0, 16)).first<{ z: string | null }>())?.z) || undefined;

        /**
         * DLH LEN Z VLASTNEJ EVIDENCIE — tá istá matematika ako mínus na
         * karte klienta (dlhKlienta): ručne nahodené balíčky mínus platby.
         * Keď nič nedlhuje, platobný blok sa nekreslí — QR na nulu je výzva
         * na omyl.
         */
        const balicky = ((await DB.prepare(
          "SELECT cena_czk, platnost_od, zdroj, zrusene_at, nazov FROM balicky WHERE klient = ?1",
        ).bind(c.name).all()).results || []) as unknown as { cena_czk: number | null; platnost_od: string; zdroj: string; zrusene_at: string | null; nazov: string }[];
        const platby = ((await DB.prepare(
          "SELECT suma_czk, datum, zrusene_at FROM platby WHERE klient = ?1",
        ).bind(c.name).all()).results || []) as unknown as { suma_czk: number; datum: string; zrusene_at: string | null }[];
        const dlh = dlhKlienta(
          balicky.map((b): BalicekDlh => ({ cena: b.cena_czk, platnostOd: b.platnost_od, zdroj: b.zdroj, zruseneAt: b.zrusene_at, nazov: b.nazov })),
          platby.map((p): PlatbaDlh => ({ suma: p.suma_czk, datum: p.datum, zruseneAt: p.zrusene_at })),
        );

        const vypis = historiaPreMail(c.name, os, c, dnes, dalsi);
        const origin = new URL(request.url).origin;
        let qrUrl: string | undefined;
        if (dlh.dlzi > 0) {
          // Do správy pre príjemcu ide MENO — podľa neho Kokpit platbu spáruje.
          const o = qrObrazok(spayd({ suma: dlh.dlzi, vs: "", sprava: c.name, prijemca: DODAVATEL.meno }));
          const bajty = new Uint8Array(o.data);
          let bin = "";
          for (let i = 0; i < bajty.length; i += 4096) bin += String.fromCharCode(...bajty.subarray(i, i + 4096));
          qrUrl = `data:${o.typ};base64,${btoa(bin)}`;
          vypis.platba = {
            popis: dlh.pocet === 1 ? "nezaplatený balíček" : `nezaplatené balíčky (${dlh.pocet})`,
            suma: dlh.dlzi, ucet: DODAVATEL.ucet, sprava: c.name,
          };
        }

        /**
         * POCITOVKA — tri otázky, ktoré si klepne klient sám. Sedí na tej
         * istej stránke, na ktorú aj tak klikne z SMS; vlastný odkaz by
         * znamenal druhý token, druhú stránku a druhú vetu v správe.
         */
        /**
         * Minulé odpovede sa ukazujú ako OBRYS, nie ako predvyber (Jerry,
         * 30. 9. 2026). Berú sa zo VŠETKÝCH doterajších hodnotení, nie len
         * z dnešného — „minule 6" je informácia aj o mesiac starej odpovedi.
         */
        const predosle = ((await DB.prepare(
          "SELECT datum, oblasti_json, posun, poznamka FROM klient_merania WHERE klient = ?1 AND zdroj = 'klient' ORDER BY datum",
        ).bind(c.name).all().catch(() => ({ results: [] }))).results || []) as unknown as
          { datum: string; oblasti_json: string | null; posun: number | null; poznamka: string | null }[];
        const merania: Meranie[] = predosle.map((r) => ({
          datum: r.datum, oblasti: oblastiZJson(r.oblasti_json), posun: r.posun, poznamka: r.poznamka || "",
        }));
        const sOdkazom = [...merania].reverse().find((m) => m.poznamka.trim());

        /**
         * Oblasti Z JEHO ANAMNÉZY — to, s čím prišiel. Zápis trénera prebíja
         * to, čo odklikol klient (tá istá prednosť ako v zhrnutí anamnézy):
         * na úvodnom sa to prejde spolu a upresní.
         *
         * Keď anamnéza nie je alebo sa nedá prečítať, pýta sa jeden
         * všeobecný riadok — otázka bez anamnézy je lepšia než žiadna.
         */
        let oblastiKlienta: string[] = [];
        if (ANAMNEZA_KLUC) {
          const a = await podlaKlienta(DB, c.name, ANAMNEZA_KLUC).catch(() => null);
          const z = a ? (a.zapisOdpovede.oblasti ?? a.klientOdpovede.oblasti) : null;
          oblastiKlienta = oblastiZJson(z).map((o) => o.oblast);
        }

        const pocity = blokPocitovky({
          oblasti: oblastiKlienta,
          minule: posledneHodnoty(merania),
          poslednyOdkaz: sOdkazom ? { datum: sOdkazom.datum, text: sOdkazom.poznamka.trim() } : undefined,
          vdaka: new URL(request.url).searchParams.get("vdaka") === "1",
        });

        const m = mailKlientovi({ ...vypis, qrUrl, logoUrl: `${origin}/znacka-napis-mail.png` });
        // Mailová sadzba nemá viewport — telefón by stránku zmenšil na známku.
        const html = m.html
          .replace(
            '<meta charset="utf-8">',
            '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">',
          )
          // Blok ide na KONIEC tela: výpis tréningov je to, kvôli čomu klient
          // prišiel, otázky sú to, o čo ho prosíme.
          .replace("</body>", `<div style="max-width:560px;margin:0 auto;padding:0 16px 28px;font-family:Arial,Helvetica,sans-serif;color:#f2f0e4">${pocity}</div></body>`);

        await DB.prepare("UPDATE klient_odkazy SET otvorene = otvorene + 1, posledne_otvorene = ?1 WHERE token = ?2")
          .bind(new Date().toISOString(), token).run().catch(() => null);

        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
        });
      },

      /**
       * ODPOVEĎ NA TRI OTÁZKY. Autorizuje TOKEN v adrese — ten istý, ktorý
       * stránku otvoril; nič iné sa z formulára neberie, takže sa cezeň nedá
       * zapísať nikomu inému.
       *
       * Zápis PREPISUJE dnešok (`ON CONFLICT`), nepridáva druhý riadok:
       * klient si to vie rozmyslieť a klepnúť znova, a oprava má odpoveď
       * zmeniť, nie postaviť vedľa nej ďalšiu. Čo neklepol, sa nemaže
       * (`COALESCE`) — prázdno nie je odpoveď.
       */
      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings();
        const spat = (vdaka: boolean) => new Response(null, {
          status: 303,
          headers: { location: `/v/${encodeURIComponent(token)}${vdaka ? "?vdaka=1" : ""}`, "cache-control": "no-store" },
        });
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return new Response("Tento odkaz neplatí.", { status: 404 });

        const r = await DB.prepare("SELECT klient FROM klient_odkazy WHERE token = ?1").bind(token).first<{ klient: string }>();
        if (!r) return new Response("Tento odkaz neplatí.", { status: 404 });

        const f = await request.formData();
        // Meno oblasti a jej hodnota sa páruje PORADÍM — „hrudní páteř" ani
        // „lokty / zápěstí" sa do názvu poľa dať nedajú.
        const mena = f.getAll("oblast_meno").map((x) => String(x).trim().slice(0, 60)).filter(Boolean);
        const oblasti: Oblast[] = mena
          .map((oblast, i) => ({ oblast, sila: platnaHodnota(f.get(`oblast_sila_${i}`)) }))
          .filter((o) => o.sila != null);
        const posun = platnaHodnota(f.get("posun"), 1, POSUN.moznosti.length);
        const poznamka = String(f.get("poznamka") ?? "").trim().slice(0, 1000);
        if (!oblasti.length && posun == null && !poznamka) return spat(false);

        const dnes = new Date().toISOString().slice(0, 10);
        await DB.prepare(
          `INSERT INTO klient_merania (id, klient, datum, oblasti_json, posun, poznamka, autor, created_at, zdroj)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'klient', ?7, 'klient')
           ON CONFLICT (klient, datum, zdroj) DO UPDATE SET
             oblasti_json = COALESCE(excluded.oblasti_json, klient_merania.oblasti_json),
             posun        = COALESCE(excluded.posun,        klient_merania.posun),
             poznamka     = CASE WHEN excluded.poznamka = '' THEN klient_merania.poznamka ELSE excluded.poznamka END`,
        ).bind(
          `${dnes}-${crypto.randomUUID().slice(0, 8)}`, r.klient, dnes,
          oblasti.length ? JSON.stringify(oblasti) : null,
          posun, poznamka, new Date().toISOString(),
        ).run();

        return spat(true);
      },
    },
  },
});
