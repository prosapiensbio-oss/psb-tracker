/**
 * Google — GA4 a Search Console.
 *
 * PREČO PRÁVE TIETO DVA NARAZ
 *
 * Sú to dve polovice tej istej otázky: Search Console hovorí, na čo sa ľudia
 * pýtajú SKÔR, než prídu, GA4 hovorí, čo urobili POTOM. Oddelene sa z nich dá
 * prečítať málo; spolu ukazujú, kde sa cesta na web trhá.
 *
 * Obidve idú cez jeden servisný účet v jednom Google Cloud projekte, takže
 * napojenie je jedno, nie dve.
 *
 * PREČO PÍŠE DO TÝCH ISTÝCH TABULIEK AKO RUČNÝ IMPORT
 *
 * `ga4_mesiace`, `gsc_mesiace`, `gsc_dopyty` a `gsc_strany` už existujú a plní
 * ich CSV import. Keby API písalo vedľa, vznikli by dve verzie tých istých
 * čísel a otázka „ktorá platí" by nemala odpoveď. Kľúčom je mesiac, takže nový
 * sťah ten istý mesiac prepíše — nie pripočíta.
 *
 * PREČO SA METRIKY MUSIA ZHODOVAŤ S EXPORTOM
 *
 * Ručný export bral kanály z bloku „Hlavná skupina kanálov NOVÉHO
 * POUŽÍVATEĽA", nie z bloku pre relácie — relácie sú návštevy, nie ľudia,
 * a zámena by čísla nafúkla asi o tretinu. API preto pýta
 * `firstUserDefaultChannelGroup` a `newUsers`, aby na seba obidva zdroje
 * nadväzovali a mesiace z rôznych zdrojov sa dali čítať v jednom rade.
 */

/** Rozsahy, ktoré servisný účet potrebuje. Obidva sú len na čítanie. */
export const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
].join(" ");

export type Ga4Mesiac = {
  mesiac: string; novi: number; organicSearch: number; paidSocial: number;
  organicSocial: number; direct: number; referral: number; udalosti: number;
};

export type GscMesiac = { mesiac: string; kliky: number; zobrazenia: number };
export type GscRiadok = { kluc: string; kliky: number; zobrazenia: number; ctr: number; pozicia: number };

/**
 * Kanály GA4 → stĺpce v `ga4_mesiace`.
 *
 * GA4 pomenúva skupiny po anglicky bez ohľadu na jazyk rozhrania, ale písmená
 * sa medzi verziami menili („Paid Social" verzus „paid social"), preto sa
 * porovnáva v malých písmenách.
 *
 * Čo tu nie je — Email, Organic Video, Unassigned, Display — sa do `novi`
 * napočíta, ale vlastný stĺpec nedostane. Tak to robil aj ručný export:
 * `novi` je súčet VŠETKÝCH kanálov, nie súčet tých piatich vymenovaných.
 */
const KANAL: Record<string, keyof Ga4Mesiac> = {
  "organic search": "organicSearch",
  "paid social": "paidSocial",
  "organic social": "organicSocial",
  direct: "direct",
  referral: "referral",
};

const prazdny = (mesiac: string): Ga4Mesiac =>
  ({ mesiac, novi: 0, organicSearch: 0, paidSocial: 0, organicSocial: 0, direct: 0, referral: 0, udalosti: 0 });

/** „202607" → „2026-07". Prázdny reťazec pri čomkoľvek inom. */
export const mesiacZGa4 = (v: string): string =>
  /^\d{6}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4)}` : "";

type Ga4Odpoved = {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
};

/**
 * Zloží mesačné riadky z dvoch reportov.
 *
 * `kanaly` má rozmery [yearMonth, firstUserDefaultChannelGroup] a metriku
 * newUsers; `udalosti` má rozmer [yearMonth] a metriku keyEvents. Druhý report
 * môže chýbať — kľúčové udalosti nemá nastavené každý účet a to nie je chyba.
 */
export function ga4Mesiace(kanaly: Ga4Odpoved, udalosti?: Ga4Odpoved): Ga4Mesiac[] {
  const mapa = new Map<string, Ga4Mesiac>();

  for (const r of kanaly.rows || []) {
    const mesiac = mesiacZGa4(r.dimensionValues?.[0]?.value || "");
    if (!mesiac) continue;
    const kanal = (r.dimensionValues?.[1]?.value || "").trim().toLowerCase();
    const hodnota = Math.round(Number(r.metricValues?.[0]?.value) || 0);
    const m = mapa.get(mesiac) || prazdny(mesiac);
    // Do `novi` ide každý kanál — aj ten, ktorý nemá vlastný stĺpec.
    m.novi += hodnota;
    const stlpec = KANAL[kanal];
    if (stlpec) (m[stlpec] as number) += hodnota;
    mapa.set(mesiac, m);
  }

  for (const r of udalosti?.rows || []) {
    const mesiac = mesiacZGa4(r.dimensionValues?.[0]?.value || "");
    if (!mesiac) continue;
    const m = mapa.get(mesiac) || prazdny(mesiac);
    m.udalosti = Math.round(Number(r.metricValues?.[0]?.value) || 0);
    mapa.set(mesiac, m);
  }

  return [...mapa.values()].sort((a, b) => a.mesiac.localeCompare(b.mesiac));
}

type GscOdpoved = {
  rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[];
};

/**
 * Denné riadky zo Search Console zlúčené na mesiace.
 *
 * Kliky a zobrazenia sa sčítavajú — sú to počty. CTR a pozícia nie: to sú
 * priemery a súčet priemerov nie je priemer. Preto ich mesačná tabuľka ani
 * nemá.
 */
export function gscMesiace(o: GscOdpoved): GscMesiac[] {
  const mapa = new Map<string, GscMesiac>();
  for (const r of o.rows || []) {
    const d = r.keys?.[0] || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const mesiac = d.slice(0, 7);
    const m = mapa.get(mesiac) || { mesiac, kliky: 0, zobrazenia: 0 };
    m.kliky += Math.round(r.clicks || 0);
    m.zobrazenia += Math.round(r.impressions || 0);
    mapa.set(mesiac, m);
  }
  return [...mapa.values()].sort((a, b) => a.mesiac.localeCompare(b.mesiac));
}

/** Rebríček dopytov alebo strán — snímka za obdobie, nie časový rad. */
export function gscRebricek(o: GscOdpoved): GscRiadok[] {
  const von: GscRiadok[] = [];
  for (const r of o.rows || []) {
    const kluc = (r.keys?.[0] || "").trim();
    if (!kluc) continue;
    von.push({
      kluc,
      kliky: Math.round(r.clicks || 0),
      zobrazenia: Math.round(r.impressions || 0),
      // Search Console posiela CTR ako podiel (0,037), Kokpit ho drží
      // v percentách — tak ho ukladal aj ručný import z CSV.
      ctr: Math.round((r.ctr || 0) * 1000) / 10,
      pozicia: Math.round((r.position || 0) * 10) / 10,
    });
  }
  return von.sort((a, b) => b.kliky - a.kliky || b.zobrazenia - a.zobrazenia);
}

/**
 * Adresa webu v tvare, akému Search Console rozumie.
 *
 * Sú dva druhy vlastníctva a API ich rozlišuje: doménové (`sc-domain:...`,
 * pokrýva všetky subdomény a obidva protokoly) a predponové (celá URL vrátane
 * `https://` a koncového lomítka). Zadanie „prosapiens.cz" bez ďalšieho by
 * skončilo na 403 s hláškou, z ktorej sa dôvod nedá uhádnuť, preto sa holá
 * doména berie ako doménové vlastníctvo.
 */
export function normSite(s: string): string {
  const t = s.trim();
  if (!t) return "";
  if (t.startsWith("sc-domain:")) return t;
  if (/^https?:\/\//i.test(t)) return t.endsWith("/") ? t : `${t}/`;
  return `sc-domain:${t.replace(/^www\./i, "")}`;
}

/**
 * Číslo GA4 property z toho, čo Jerry vloží.
 *
 * V rozhraní GA4 sa ukazuje ako „properties/123456789" aj ako holé číslo
 * a ľudia lepia raz jedno, raz druhé.
 */
export function normProperty(s: string): string {
  const t = s.trim().replace(/^properties\//i, "");
  return /^\d+$/.test(t) ? t : "";
}

/** Prvý deň mesiaca `n` mesiacov dozadu — `YYYY-MM-DD`, na rozsah sťahu. */
export function odKedy(dnes: Date, mesiacov: number): string {
  const d = new Date(Date.UTC(dnes.getUTCFullYear(), dnes.getUTCMonth() - mesiacov + 1, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Nároky do JWT pre servisný účet.
 *
 * Google odmieta tokeny s časom v budúcnosti aj o sekundu, a hodiny na
 * Cloudflare a v Google nie sú tie isté — preto `iat` o minútu dozadu.
 */
export function narokyJwt(email: string, now: number): Record<string, string | number> {
  const iat = Math.floor(now / 1000) - 60;
  return {
    iss: email,
    scope: SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  };
}
