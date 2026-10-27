import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";
import { terazPraha, dnesPraha } from "../lib/psb/cas";

import { bindings } from "../lib/bindings.server";
import { uvodnaStrankaHtml } from "../lib/psb/uvodnaStranka";
import { UKAZKA, jeUkazka } from "../lib/psb/ukazka";
import { audit } from "../lib/psb/audit.server";
import { normName } from "../lib/psb/format";
import { odlozOdberatela } from "../lib/psb/odberatelOdlozenie.server";
import {
  rucnaAdresaFirmy, udajeZAres, vstupZFormulara,
  type BlokFaktury, type UdajeFirmy, type UlozeneUdaje,
} from "../lib/psb/fakturaKlienta";

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
const HLAVICKY = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };

/** Fakturačné údaje klienta, ako ich má Kokpit; `null`, keď ešte žiadne. */
async function ulozeneUdaje(DB: D1Database, klient: string): Promise<UlozeneUdaje | null> {
  return await DB.prepare(
    "SELECT firma, ico, dic, ulica, psc, mesto, email FROM klient_fakturacia WHERE klient = ?1",
  ).bind(klient).first<UlozeneUdaje>().catch(() => null);
}

/**
 * Register firiem (ARES). `null` = IČO tam nie je, `"nedostupne"` = register
 * neodpovedá — to druhé nie je chyba klienta, preto iná hláška.
 */
async function firmaZAres(ico: string): Promise<UdajeFirmy | null | "nedostupne"> {
  try {
    const r = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000),
    });
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) return "nedostupne";
    return udajeZAres(await r.json());
  } catch {
    return "nedostupne";
  }
}

type RiadokOdkazu = { klient: string; druh: string; trener: string; kedy: string | null; cena_czk: number | null };

/** Celá stránka — z GET aj z POST, keď sa formulár vracia s chybou. */
async function stranka(DB: D1Database, request: Request, r: RiadokOdkazu, extra: { odpovedPoslana?: boolean; faktura?: BlokFaktury | null }): Promise<string> {
  const o = new URL(request.url).origin;
  const druh = r.druh === "po" ? "po" : "pred";
  const teraz = terazPraha();

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

  return uvodnaStrankaHtml({
    druh,
    trener: r.trener,
    kedy: zKalendara || r.kedy,
    cenaCzk: r.cena_czk,
    logoUrl: `${o}/znacka-napis-tmava.svg`,
    figuraUrl: `${o}/znacka-figura-biela.svg`,
    anamnezaUrl: anamneza ? `${o}/a/${anamneza}` : null,
    odpovedPoslana: extra.odpovedPoslana,
    faktura: druh === "po"
      ? (extra.faktura ?? { klient: r.klient, udaje: await ulozeneUdaje(DB, r.klient) })
      : null,
  });
}

/**
 * ULOŽENIE FAKTURAČNÝCH ÚDAJOV Z ODKAZU (Jerry, 28. 10. 2026).
 *
 * Pri firme sa názov a adresa berú z registra ARES — klient napíše len IČO
 * a nemá kde urobiť preklep v adrese. Ručná adresa platí, len keď ju register
 * nemá. Keď register neodpovedá, NEULOŽÍ sa polovica (IČO bez názvu by na
 * faktúre vyšlo s menom človeka): klient dostane hlášku a skúsi znova.
 *
 * Zápis mení len fakturačné polia; telefón, kontaktná osoba a ďalšie maily
 * ostanú. Doterajšia firma sa odloží medzi ďalšie firmy klienta
 * (`odlozOdberatela`), doterajší e-mail medzi ďalšie maily — nič sa nestratí.
 *
 * Chyba sa vracia ako stránka s vyplneným formulárom, nie presmerovaním:
 * údaje by inak museli ísť cez adresu, a osobné údaje do adresy nepatria.
 */
async function ulozFakturu(DB: D1Database | null, request: Request, token: string, f: FormData): Promise<Response> {
  const polia: Record<string, string> = {};
  f.forEach((v, k) => { if (typeof v === "string") polia[k] = v; });

  const ukazka = jeUkazka(token);
  const r: RiadokOdkazu | null = ukazka
    ? { klient: "Jan Ukázka", druh: "po", trener: "Jerry", kedy: "2026-10-16T09:00", cena_czk: null }
    : DB ? await DB.prepare("SELECT klient, druh, trener, kedy, cena_czk FROM uvodne_odkazy WHERE token = ?1")
        .bind(token).first<RiadokOdkazu>().catch(() => null) : null;
  if (!r) return new Response(null, { status: 303, headers: { location: `/u/${encodeURIComponent(token)}`, "cache-control": "no-store" } });

  const sChybou = async (chyba: string, udaje: UlozeneUdaje | null = null) => {
    const faktura: BlokFaktury = { klient: r.klient, udaje: udaje ?? (DB && !ukazka ? await ulozeneUdaje(DB, r.klient) : null), chyba, vstup: polia };
    const o = new URL(request.url).origin;
    const html = DB && !ukazka
      ? await stranka(DB, request, r, { faktura })
      : uvodnaStrankaHtml({ druh: "po", trener: r.trener, kedy: r.kedy, cenaCzk: null, logoUrl: `${o}/znacka-napis-tmava.svg`, figuraUrl: `${o}/znacka-figura-biela.svg`, faktura });
    return new Response(html, { status: 200, headers: HLAVICKY });
  };

  const vysledok = vstupZFormulara(polia);
  if (!vysledok.ok) return sChybou(vysledok.chyba);
  const v = vysledok.v;

  let nove: { firma: string; ico: string; dic: string; ulica: string; psc: string; mesto: string };
  if (v.komu === "firma") {
    const z = await firmaZAres(v.ico);
    if (z && z !== "nedostupne") {
      nove = { firma: z.firma, ico: v.ico, dic: v.dic || z.dic, ulica: z.ulica, psc: z.psc, mesto: z.mesto };
    } else if (rucnaAdresaFirmy(v)) {
      nove = { firma: v.nazov, ico: v.ico, dic: v.dic, ulica: v.ulica, psc: v.psc, mesto: v.mesto };
    } else {
      return sChybou(z === "nedostupne" ? "nedostupne" : "ares");
    }
  } else {
    // Meno rovnaké ako v Kokpite sa neukladá ako „firma" — faktúra ho vezme z klienta.
    nove = { firma: normName(v.nazov) === normName(r.klient) ? "" : v.nazov, ico: "", dic: "", ulica: v.ulica, psc: v.psc, mesto: v.mesto };
  }

  // Ukážka: nič sa nezapisuje, len sa ukáže, čo by sa uložilo (aj s výsledkom z ARES).
  if (ukazka || !DB) {
    const o = new URL(request.url).origin;
    return new Response(uvodnaStrankaHtml({
      druh: "po", trener: r.trener, kedy: r.kedy, cenaCzk: null,
      logoUrl: `${o}/znacka-napis-tmava.svg`, figuraUrl: `${o}/znacka-figura-biela.svg`,
      faktura: { klient: r.klient, udaje: { ...nove, email: v.email }, ulozene: true },
    }), { headers: HLAVICKY });
  }

  const bolo = await DB.prepare(
    "SELECT stat, firma, ico, dic, ulica, psc, mesto, email, dalsie_maily FROM klient_fakturacia WHERE klient = ?1",
  ).bind(r.klient).first<Record<string, string | null>>().catch(() => null);
  const odlozene = await odlozOdberatela(DB, r.klient, bolo, nove, "klient");
  if (!odlozene.ok) return sChybou("nedostupne");

  const stary = String(bolo?.email || "").trim().toLowerCase();
  const dalsie = String(bolo?.dalsie_maily || "").split("\n").map((x) => x.trim()).filter(Boolean);
  if (stary && stary !== v.email && !dalsie.includes(stary)) dalsie.push(stary);

  await DB.prepare(
    `INSERT INTO klient_fakturacia (klient, firma, ico, dic, ulica, psc, mesto, email, dalsie_maily, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
     ON CONFLICT(klient) DO UPDATE SET firma=?2, ico=?3, dic=?4, ulica=?5, psc=?6, mesto=?7, email=?8,
       dalsie_maily=?9, updated_at=?10`,
  ).bind(r.klient, nove.firma, nove.ico, nove.dic, nove.ulica, nove.psc, nove.mesto, v.email,
    dalsie.join("\n").slice(0, 400), new Date().toISOString()).run();
  await audit(DB, { action: "fakturacne-udaje", predmet: r.klient, actor: "klient (odkaz po úvodnom)" });

  return new Response(null, {
    status: 303,
    headers: { location: `/u/${encodeURIComponent(token)}?faktura=ok#faktura`, "cache-control": "no-store" },
  });
}

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
        if (!/^[A-Za-z0-9]{8,24}$/.test(token)) return prec("Tento odkaz neplatí.", 404);

        /**
         * UKÁŽKA — vymyslený termín, žiadny klient, žiadne počítadlo.
         * Viď `ukazka.ts`: skúšobné SMS musia niesť odkazy, ktoré sa dajú
         * otvoriť, inak sa nimi nedá nič overiť.
         */
        if (jeUkazka(token)) {
          const o = new URL(request.url).origin;
          const po = token === UKAZKA.poUvodnom;
          const html = uvodnaStrankaHtml({
            druh: po ? "po" : "pred",
            trener: "Jerry",
            kedy: po ? "2026-10-16T09:00" : "2026-10-09T09:00",
            cenaCzk: null,
            logoUrl: `${o}/znacka-napis-tmava.svg`,
            figuraUrl: `${o}/znacka-figura-biela.svg`,
            anamnezaUrl: po ? null : `${o}/a/${UKAZKA.anamneza}`,
            faktura: po ? { klient: "Jan Ukázka", udaje: null } : null,
          });
          return new Response(html, { headers: HLAVICKY });
        }

        if (!DB) return prec("Tento odkaz neplatí.", 404);

        const r = await DB.prepare(
          "SELECT klient, druh, trener, kedy, cena_czk FROM uvodne_odkazy WHERE token = ?1",
        ).bind(token).first<RiadokOdkazu>();
        if (!r) return prec("Tento odkaz neplatí. Ozvěte se nám a pošleme nový.", 404);

        const q = new URL(request.url).searchParams;
        const fakturaUlozena = q.get("faktura") === "ok";
        const html = await stranka(DB, request, r, {
          odpovedPoslana: q.get("odpoved") === "1",
          faktura: fakturaUlozena && r.druh === "po"
            ? { klient: r.klient, udaje: await ulozeneUdaje(DB, r.klient), ulozene: true }
            : null,
        });

        // Náhľad trénera (?nahlad=1) ani návrat po odoslaní sa do „otvoril" nepočíta.
        if (q.get("nahlad") !== "1" && !fakturaUlozena && q.get("odpoved") !== "1") {
          await DB.prepare(
            "UPDATE uvodne_odkazy SET otvorene = otvorene + 1, posledne_otvorene = ?1 WHERE token = ?2",
          ).bind(new Date().toISOString(), token).run().catch(() => null);
        }

        return new Response(html, { headers: HLAVICKY });
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
        if (!/^[A-Za-z0-9]{8,24}$/.test(token)) return spat(false);
        if (!DB) {
          // Ukážka nemá databázu ani klienta — formulár sa len overí a vykreslí.
          const f = await request.formData().catch(() => null);
          if (jeUkazka(token) && f?.get("akcia") === "faktura") return await ulozFakturu(null, request, token, f);
          return spat(false);
        }

        const f = await request.formData().catch(() => null);
        if (f?.get("akcia") === "faktura") return await ulozFakturu(DB, request, token, f);

        const r = await DB.prepare("SELECT klient, druh FROM uvodne_odkazy WHERE token = ?1")
          .bind(token).first<{ klient: string; druh: string }>();
        if (!r || r.druh !== "po") return spat(false);

        const text = String(f?.get("odpoved") ?? "").trim().slice(0, 1000);
        if (!text) return spat(false);

        const dnes = dnesPraha();
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
