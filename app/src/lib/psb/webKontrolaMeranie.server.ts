import type { D1Database } from "@cloudflare/workers-types";

import { nastavenie, servisnyUcet, ziskajToken } from "./googleAuth.server";
import { dnesPraha, posunDen } from "./cas";
import { type Ga4Odpoved, type MeranieData, odpovedZJson, navstevyZGa4, udalostiZGa4, UDALOSTI } from "./webKontrolaMeranie";

/**
 * Sťahovanie dát pre bod 4 nočnej kontroly webu.
 *
 * Rozhodovanie tu NIE JE — to je v `webKontrolaMeranie.ts` a má testy.
 * Tu je len to, čo sa bez siete overiť nedá: dva dopyty do GA4 a ústupy,
 * keď property nemá registrované vlastné rozmery.
 *
 * `fetch` sa dá podstrčiť parametrom. Prepisovanie `globalThis.fetch` v teste
 * funguje tiež, ale je to spoločný stav: jeden zabudnutý úklid a padá cudzí
 * test, ktorý s GA4 nemá nič.
 */

/**
 * Toľko z `fetch`, koľko tento modul naozaj používa.
 *
 * Prečo nie `typeof fetch`: test by potom musel vyrábať celé `Response`
 * s hlavičkami a `fetch` so všetkými preťaženiami, alebo si to dotlačiť
 * pretypovaním — a `as` je presne to, čo tu nemá byť.
 */
export type FetchPodobne = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const GA4 = (p: string) => `https://analyticsdata.googleapis.com/v1beta/properties/${p}:runReport`;

/** Dĺžka okna v dňoch. Končí VČERA — dnešný deň je neúplný a klamal by. */
export const DNI_OKNA = 7;

type Volanie =
  | { ok: true; data: Ga4Odpoved }
  | { ok: false; chyba: string; stav: number };

/** Hláška z tela odpovede, ak sa v ňom dá nájsť. */
function chybaZTela(j: unknown): string {
  if (!j || typeof j !== "object") return "";
  const e: unknown = Reflect.get(j, "error");
  if (e && typeof e === "object") {
    const m: unknown = Reflect.get(e, "message");
    if (typeof m === "string" && m) return m;
  }
  const m2: unknown = Reflect.get(j, "message");
  return typeof m2 === "string" ? m2 : "";
}

/**
 * Jeden `runReport`.
 *
 * Nerozobraná odpoveď sa NEHLÁSI stavovým kódom: „HTTP 400" sa nedá vyšetriť
 * a pátranie sa na ňom zastaví. Keď sa telo nedá prečítať ako JSON, ide von
 * jeho začiatok — aj stránka s chybou od proxy je stopa.
 */
async function post(url: string, token: string, telo: unknown, siet: FetchPodobne): Promise<Volanie> {
  try {
    const r = await siet(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(25000),
    });
    const text = await r.text();
    let j: unknown = null;
    try { j = JSON.parse(text); } catch { j = null; }
    if (!r.ok) {
      const sprava = chybaZTela(j);
      return {
        ok: false, stav: r.status,
        chyba: sprava
          ? `GA4 odmietla dopyt (HTTP ${r.status}): ${sprava.slice(0, 250)}`
          : `GA4 vrátila HTTP ${r.status} a odpoveď sa nedá rozobrať, prvých 200 znakov: ${text.slice(0, 200)}`,
      };
    }
    if (j === null) {
      return { ok: false, stav: r.status, chyba: `GA4 odpovedala niečím, čo nie je JSON, prvých 200 znakov: ${text.slice(0, 200)}` };
    }
    return { ok: true, data: odpovedZJson(j) };
  } catch (e) {
    return { ok: false, stav: 0, chyba: `spojenie s GA4 zlyhalo: ${String(e).slice(0, 200)}` };
  }
}

/**
 * Zostavy rozmerov od najbohatšej po najchudobnejšiu.
 *
 * K 7. 10. 2026 nie sú `duvod` ani `pole` v GA4 registrované ako vlastné
 * rozmery a dopyt na ne vráti HTTP 400. Pevne napísaná chudobná zostava by
 * fungovala tiež — ale v deň, keď ich Jerry v GA4 zaregistruje, by kontrola
 * ďalej hlásila zlyhania bez dôvodu a nikto by nevedel prečo. Rebrík sa
 * zlepší sám a každý ústup povie, čo v detaile chýba.
 */
const REBRIK: { dimenzie: string[]; chybaju: string[] }[] = [
  { dimenzie: ["date", "eventName", "pagePath", "customEvent:duvod", "customEvent:pole"], chybaju: [] },
  { dimenzie: ["date", "eventName", "pagePath", "customEvent:duvod"], chybaju: ["pole"] },
  { dimenzie: ["date", "eventName", "pagePath"], chybaju: ["duvod", "pole"] },
  { dimenzie: ["date", "eventName"], chybaju: ["duvod", "pole", "stranka"] },
];

/**
 * Dáta pre `skontrolujMeranie`. Vracia ich VŽDY — chyba je pole `chyba`,
 * nie vyhodená výnimka. Kontrola bez dát musí povedať „neviem", a to sa
 * z výnimky, ktorú zhltne volajúci, nedozvie nikto.
 */
export async function meranieZGa4(opt: {
  property: string;
  token: string;
  dnes?: string;
  fetch?: FetchPodobne;
}): Promise<MeranieData> {
  const prazdne: MeranieData = { udalosti: [], navstevy: [], chybajuceRozmery: [], chyba: "" };
  const dnes = opt.dnes || dnesPraha();
  const od = posunDen(dnes, -DNI_OKNA);
  const do_ = posunDen(dnes, -1);
  const siet = opt.fetch || ((url, init) => fetch(url, init));
  if (!opt.property) return { ...prazdne, chyba: "v Údajoch nie je zadané GA4 property ID (nastavenie google_ga4_property)" };

  const dateRanges = [{ startDate: od, endDate: do_ }];
  let udalosti: Volanie | null = null;
  let chybajuce: string[] = [];
  for (const krok of REBRIK) {
    udalosti = await post(GA4(opt.property), opt.token, {
      dateRanges,
      dimensions: krok.dimenzie.map((name) => ({ name })),
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...UDALOSTI] } } },
      limit: 5000,
    }, siet);
    chybajuce = krok.chybaju;
    // Ustupuje sa LEN pri 400 — to je odpoveď „taký rozmer neexistuje".
    // Pri 401/403 (odobraný prístup) alebo 429 by ďalšie kroky len zopakovali
    // tú istú chybu a zahodili by pôvodnú hlášku, ktorá hovorí pravdu.
    if (udalosti.ok || udalosti.stav !== 400) break;
  }
  if (!udalosti || !udalosti.ok) {
    return { ...prazdne, chyba: udalosti ? udalosti.chyba : "dopyt na udalosti sa vôbec nepustil" };
  }

  // Návštevy sú druhý dopyt zámerne: bez nich sa ticho v udalostiach nedá
  // odlíšiť od pokazeného merania, ale ich chýbanie nie je dôvod zahodiť
  // zlyhania, ktoré už máme v ruke.
  const navstevy = await post(GA4(opt.property), opt.token, {
    dateRanges, dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }], limit: 100,
  }, siet);

  return {
    udalosti: udalostiZGa4(udalosti.data),
    navstevy: navstevy.ok ? navstevyZGa4(navstevy.data) : [],
    chybajuceRozmery: chybajuce,
    // Dôvod ide celý do vlastného poľa. Značka „navstevy“ v `chybajuceRozmery`
    // povedala len to, ŽE sa druhý dopyt nepodaril, a hotovú vetu („GA4
    // odmietla dopyt (HTTP 429): Exhausted property tokens…“) zahodila — v
    // detaile nálezu potom nestál ani stavový kód. Pritom práve tento riadok
    // rozhoduje, či sa ticho v udalostiach dá vyhodnotiť, takže sa na ňom
    // pátranie zastaví.
    navstevyChyba: navstevy.ok ? "" : navstevy.chyba,
    chyba: "",
  };
}

/**
 * To isté, len si kľúč aj property vyzdvihne z databázy.
 *
 * Chýbajúci servisný účet nie je výnimka — je to legitímny stav (Kokpit beží
 * aj bez Google) a kontrola z neho musí vyrobiť „neviem", nie pád celého behu
 * nočnej kontroly, v ktorom sú aj body 1 a 3.
 */
export async function stiahniMeranie(
  DB: D1Database,
  opt: { dnes?: string; fetch?: FetchPodobne } = {},
): Promise<MeranieData> {
  const prazdne: MeranieData = { udalosti: [], navstevy: [], chybajuceRozmery: [], chyba: "" };
  try {
    const ucet = await servisnyUcet(DB);
    if (!ucet.ok) {
      return { ...prazdne, chyba: ucet.chyba === "chyba_kluc" ? "v Údajoch nie je uložený kľúč servisného účtu Google" : ucet.chyba };
    }
    const token = await ziskajToken(ucet.sa);
    if (!token.ok) return { ...prazdne, chyba: token.chyba };
    const property = await nastavenie(DB, "google_ga4_property");
    return await meranieZGa4({ property, token: token.token, dnes: opt.dnes, fetch: opt.fetch });
  } catch (e) {
    // Sito vyššie platí len pre návratové hodnoty. `servisnyUcet` aj
    // `nastavenie` čítajú `vzas_settings` cez `DB.prepare(...).first()` bez
    // vlastného try/catch a D1 pri chybe VYHADZUJE (rate-limit, prechodná
    // „Network connection lost“). Bez tohto obalu by výnimka vyletela do POST
    // nočnej kontroly ešte pred zápisom nálezov a do `web_kontroly` by sa
    // nezapísali ani body 1 a 3 — kontrola, ktorá mala povedať „neviem“, by
    // zhasla aj to, čo fungovalo.
    //
    // Prečo nie obal okolo každého čítania zvlášť: rozlíšiť „padlo čítanie
    // kľúča“ od „padlo čítanie property“ nikomu nepomôže; obe hovoria to isté
    // a oprava je tá istá. A `await` pri `meranieZGa4` tu musí byť — bez neho
    // by odmietnutý prísľub tento catch obišiel.
    return { ...prazdne, chyba: `nastavenia Google sa z databázy nedali prečítať: ${String(e).slice(0, 200)}` };
  }
}
