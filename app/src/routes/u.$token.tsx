import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";
import { uvodnaStrankaHtml } from "../lib/psb/uvodnaStranka";

/**
 * STRÁNKA ZA ODKAZOM V SMS — `/u/<token>`.
 *
 * Pred úvodným tréningom a po ňom. Obsah skladá `uvodnaStranka.ts`; tu sa
 * len rozhodne, O KOM a O KTOROM TERMÍNE stránka hovorí.
 *
 * TERMÍN SA BERIE ŽIVO Z KALENDÁRA, nie z riadku odkazu. Keď sa hodina
 * presunie, odkaz má ukázať nový čas — presne to je dôvod, prečo je za SMS
 * stránka a nie šesť bubliniek s dátumom, ktorý sa už nedá opraviť.
 * Uložené `kedy` je záchranná sieť pre prípad, že sa udalosť nenájde.
 *
 * BEZPEČNOSŤ: token je náhodných 12 znakov, nedá sa uhádnuť ani odvodiť
 * z mena, a zmazaním riadku odkaz zhasne. Stránka je NOINDEX a bez keše.
 */
export const Route = createFileRoute("/u/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings();
        const prec = (text: string, status: number) => new Response(
          `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>ProSapiens</title></head>
<body style="margin:0;background:#FFFFFF;color:#1A2E24;font-family:Arial,Helvetica,sans-serif"><div style="max-width:420px;margin:80px auto;padding:0 20px;text-align:center">
<div style="font-size:15px;line-height:1.6">${text}</div></div></body></html>`,
          { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
        );
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return prec("Tento odkaz neplatí.", 404);

        const r = await DB.prepare(
          "SELECT klient, druh, trener, kedy, cena_czk FROM uvodne_odkazy WHERE token = ?1",
        ).bind(token).first<{ klient: string; druh: string; trener: string; kedy: string | null; cena_czk: number | null }>();
        if (!r) return prec("Tento odkaz neplatí. Ozvěte se nám a pošleme nový.", 404);

        const druh = r.druh === "po" ? "po" : "pred";
        const teraz = new Date().toISOString().slice(0, 16);

        /**
         * Pred úvodným hľadáme najbližší ÚVODNÝ, po ňom najbližší bežný
         * tréning. `zmizla_at IS NULL` je povinné — zrušené udalosti v tabuľke
         * zostávajú ako stopa a bez filtra by stránka pozývala na hodinu,
         * ktorá sa nekoná.
         */
        const zKalendara = (await DB.prepare(
          `SELECT MIN(zaciatok) AS z FROM kal_udalosti
            WHERE zmizla_at IS NULL AND klient = ?1 AND typ = ?2 AND zaciatok > ?3`,
        ).bind(r.klient, druh === "pred" ? "uvodny" : "trening", teraz)
          .first<{ z: string | null }>().catch(() => null))?.z || null;

        /**
         * Odkaz na anamnézu — druhé CTA vedľa videa (Jerry, 2. 10. 2026).
         * Berie sa ten, čo klient UŽ MÁ; nový sa tu nezakladá, lebo GET nemá
         * nič zapisovať. Keď riadok ešte neexistuje, tlačidlo sa nekreslí —
         * odkaz, ktorý nikam nevedie, je horší než žiadny. Riadok vzniká pri
         * príprave SMS pred úvodným (`/api/uvodny`).
         */
        const anamneza = druh === "pred"
          ? (await DB.prepare("SELECT token FROM anamnezy WHERE klient = ?1")
              .bind(r.klient).first<{ token: string }>().catch(() => null))?.token || null
          : null;

        const html = uvodnaStrankaHtml({
          druh,
          trener: r.trener,
          kedy: zKalendara || r.kedy,
          cenaCzk: r.cena_czk,
          logoUrl: `${new URL(request.url).origin}/znacka-napis-tmava.svg`,
          anamnezaUrl: anamneza ? `${new URL(request.url).origin}/a/${anamneza}` : null,
          odpovedPoslana: new URL(request.url).searchParams.get("odpoved") === "1",
        });

        await DB.prepare(
          "UPDATE uvodne_odkazy SET otvorene = otvorene + 1, posledne_otvorene = ?1 WHERE token = ?2",
        ).bind(new Date().toISOString(), token).run().catch(() => null);

        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
        });
      },

      /**
       * ČO KLIENT NAPÍŠE PO ÚVODNOM.
       *
       * Jerry, 2. 10. 2026: „SMS po úvodnom — jak se dnes cítíte — mohol by
       * tam byť priestor, kde by ten klient mohol odpovedať."
       *
       * Ukladá sa do `klient_merania` so `zdroj = 'klient'`, teda tam, kam
       * píše aj pocitovka. Nie je to lenivosť: je to tá istá vec — klientove
       * vlastné slová o tom, ako mu je — a tým pádom sa objaví všade, kde sa
       * už číta (denník klienta, Jarvis), bez nového stĺpca a bez druhého
       * miesta, na ktoré by sa dalo zabudnúť.
       *
       * Prázdne sa neukladá a existujúci zápis z toho dňa sa neprepíše
       * prázdnom — tá istá poistka, akú má pocitovka.
       */
      POST: async ({ request, params }) => {
        const token = String((params as { token?: string }).token || "");
        const { DB } = bindings();
        const spat = (ok: boolean) => new Response(null, {
          status: 303,
          headers: { location: `/u/${encodeURIComponent(token)}${ok ? "?odpoved=1" : ""}`, "cache-control": "no-store" },
        });
        if (!DB || !/^[A-Za-z0-9]{8,24}$/.test(token)) return spat(false);

        const r = await DB.prepare("SELECT klient, druh FROM uvodne_odkazy WHERE token = ?1")
          .bind(token).first<{ klient: string; druh: string }>();
        if (!r || r.druh !== "po") return spat(false);

        const f = await request.formData().catch(() => null);
        const text = String(f?.get("odpoved") ?? "").trim().slice(0, 1000);
        if (!text) return spat(false);

        const dnes = new Date().toISOString().slice(0, 10);
        await DB.prepare(
          `INSERT INTO klient_merania (id, klient, datum, poznamka, autor, created_at, zdroj)
           VALUES (?1, ?2, ?3, ?4, 'klient', ?5, 'klient')
           ON CONFLICT (klient, datum, zdroj) DO UPDATE SET
             poznamka = CASE WHEN excluded.poznamka = '' THEN klient_merania.poznamka ELSE excluded.poznamka END`,
        ).bind(`${dnes}-${crypto.randomUUID().slice(0, 8)}`, r.klient, dnes, text, new Date().toISOString())
          .run().catch(() => null);

        return spat(true);
      },
    },
  },
});
