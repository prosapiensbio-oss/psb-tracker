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

/**
 * Vetа pod grafom kanálov — počítaná, nie napísaná.
 *
 * PREČO TO NIE JE PEVNÝ TEXT
 *
 * Do 13. 8. tu stálo: „web drží stabilných ~280 nových mesačne z vyhľadávania
 * a priameho prístupu — to je základ, ktorý nezmizne, keď prestaneš platiť."
 * V čase, keď to vzniklo, to bola pravda. V roku 2026 už nie: marec mal 149,
 * apríl a máj sa nemerali vôbec a jún 21. Veta ale ostala a tvrdila svoje ďalej.
 *
 * Záver, ktorý sa nepočíta z dát, prežije dáta, ktoré ho vyvrátili. Preto sa
 * počíta.
 */
export type WebMesiac = { m: string; novi: number; paidSocial: number; chyba?: boolean; castocne?: boolean };

/** Medián — priemer by jeden reklamný mesiac vytiahol tak, že by neplatil pre žiadny. */
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

export function zhrnutieWebu(mesiace: WebMesiac[]): string {
  const merane = mesiace.filter((x) => !x.chyba);
  if (!merane.length) return "";

  const spolu = merane.reduce((a, x) => a + x.novi, 0);
  const platene = merane.reduce((a, x) => a + x.paidSocial, 0);
  const vety: string[] = [];

  if (platene > 0) {
    const najlepsi = merane.reduce((a, x) => (x.paidSocial > a.paidSocial ? x : a));
    vety.push(
      `Z ${spolu.toLocaleString("sk")} nových ľudí prišlo ${platene.toLocaleString("sk")} z platenej reklamy (${Math.round((platene / spolu) * 100)} %), najviac v mesiaci ${najlepsi.m} — ${najlepsi.paidSocial.toLocaleString("sk")}.`,
    );
  } else {
    vety.push(`Na web nešla v tomto období ani koruna z reklamy — všetkých ${spolu.toLocaleString("sk")} nových ľudí prišlo organicky.`);
  }

  // Základ sa počíta len z mesiacov bez reklamy a bez výhrady. Čiastočný mesiac
  // by ho stiahol dole a tváril sa pritom ako plnohodnotný.
  const bezReklamy = merane.filter((x) => x.paidSocial === 0 && !x.castocne);
  if (bezReklamy.length >= 3) {
    vety.push(`Bez reklamy drží web zhruba ${median(bezReklamy.map((x) => x.novi)).toLocaleString("sk")} nových mesačne — to je základ, ktorý nezmizne, keď prestaneš platiť.`);
  }

  return vety.join(" ");
}

/**
 * Odvodené pohľady na dopyty z vyhľadávania.
 *
 * PREČO SA POČÍTAJÚ A NIE UKLADAJÚ
 *
 * Do 13. 8. boli „príležitosti" aj „dopyty so zámerom kúpiť" v kóde napísané
 * natvrdo — snímka z jari 2025, ktorú import nikdy neprepísal. Vyzerali živo
 * a neboli. Rovnaká rodina chýb ako veta „web drží ~280 nových mesačne".
 *
 * Sú to pritom len dva filtre nad rebríčkom, ktorý živý JE. Uložiť ich zvlášť
 * by znamenalo mať dve verzie toho istého a otázku, ktorá platí.
 */

export type Dopyt = { dopyt: string; kliky: number; zobrazenia: number; ctr: number; pozicia: number };

/** Nad koľko zobrazení má zmysel hovoriť o premárnenej príležitosti. */
const DOSŤ_VIDENÝ = 300;

/** Miera prekliku, pod ktorou je to „vidia ma a neklikajú". */
const NEKLIKAJÚ = 1.5;

/**
 * Kde sa zobrazuješ, ale nikto neklikne.
 *
 * Veľa zobrazení a takmer žiadny preklik znamená, že Google už web na tú tému
 * ukazuje — chýba len dôvod kliknúť. Je to najlacnejší obsah, aký sa dá
 * napísať: pozícia je zaplatená, treba doplniť titulok.
 */
export function prilezitosti(dopyty: Dopyt[], kolko = 10): Dopyt[] {
  return dopyty
    .filter((d) => d.zobrazenia >= DOSŤ_VIDENÝ && d.ctr < NEKLIKAJÚ)
    .sort((a, b) => b.zobrazenia - a.zobrazenia)
    .slice(0, kolko);
}

/**
 * Slová, ktoré prezrádzajú, že človek nehľadá poučenie, ale tréning.
 *
 * „fascie" je téma; „osobní trenér brno" je zákazník. Zoznam je zámerne krátky
 * a doslovný — hádať zámer zo slov sa dá len hrubo a širší zoznam by sem
 * pustil každý druhý dopyt.
 */
const ZAMER_KUPIT = [
  "trenér", "trener", "trénink", "trenink", "trénování", "osobní", "individuální",
  "terapie", "brno", "lekce", "konzultace", "cvičení s", "hodina",
];

/** Dopyty, v ktorých je počuť zámer kúpiť — nie zvedavosť. */
export function soZamerom(dopyty: Dopyt[], kolko = 10): Dopyt[] {
  return dopyty
    .filter((d) => {
      const t = d.dopyt.toLowerCase();
      return ZAMER_KUPIT.some((k) => t.includes(k));
    })
    .sort((a, b) => b.zobrazenia - a.zobrazenia)
    .slice(0, kolko);
}

/**
 * Servisné stránky, ktoré do rebríčka článkov nepatria.
 *
 * Domov a Kontakt vyhrajú vždy a nič tým nepovedia — nie sú to témy, ktoré
 * si niekto vybral, ale dvere, ktorými prejde každý.
 */
const SERVISNE = [
  "/", "/kontakt", "/kontakty", "/sluzby", "/služby", "/o-nas", "/o-mne",
  "/cenik", "/ceník", "/uvodni-trenink", "/podekovani", "/dychani", "/blog",
];

export type Strana = { url: string; kliky: number; zobrazenia: number };

/** Články, ktoré ľudia naozaj čítajú. Servisné stránky von. */
export function clanky(strany: Strana[], kolko = 12): Strana[] {
  return strany
    .filter((s) => {
      const u = s.url.replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "").toLowerCase();
      const bez = u.endsWith("/") && u.length > 1 ? u.slice(0, -1) : u;
      return !SERVISNE.includes(bez) && !SERVISNE.includes(`${bez}/`);
    })
    .sort((a, b) => b.zobrazenia - a.zobrazenia || b.kliky - a.kliky)
    .slice(0, kolko);
}

/** Rozdelenie klikov podľa zariadenia — zo Search Console. */
export function zariadenia(o: GscOdpoved): { zariadenie: string; kliky: number; zobrazenia: number }[] {
  const nazov: Record<string, string> = { MOBILE: "Mobil", DESKTOP: "Stolný počítač", TABLET: "Tablet" };
  return (o.rows || [])
    .map((r) => ({
      zariadenie: nazov[(r.keys?.[0] || "").toUpperCase()] || (r.keys?.[0] || "—"),
      kliky: Math.round(r.clicks || 0),
      zobrazenia: Math.round(r.impressions || 0),
    }))
    .filter((x) => x.kliky > 0 || x.zobrazenia > 0)
    .sort((a, b) => b.kliky - a.kliky);
}

/** Stránky z GA4 — rozmer pagePath, metrika screenPageViews. */
export function ga4Strany(o: Ga4Odpoved): Strana[] {
  return (o.rows || [])
    .map((r) => ({
      url: (r.dimensionValues?.[0]?.value || "").trim(),
      kliky: 0,
      zobrazenia: Math.round(Number(r.metricValues?.[0]?.value) || 0),
    }))
    .filter((x) => x.url)
    .sort((a, b) => b.zobrazenia - a.zobrazenia);
}
