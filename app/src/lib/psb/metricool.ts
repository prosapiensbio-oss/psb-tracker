/**
 * METRICOOL BEZ EXPORTOV (Jerry, 8. 10. 2026: „prerob mesačnú uzávierku tak,
 * že v nej len ťuknem a stiahne sa to samé").
 *
 * API Metricoolu je len v pláne Advanced. MCP server (ai.metricool.com/mcp)
 * je na KAŽDOM pláne a prihlasuje sa štandardným OAuth s dynamickou
 * registráciou klienta — Kokpit sa preto pripojí rovnako ako Claude: raz
 * „Pripojiť" (Jerry povolí v Metricoole), potom už len obnovuje token.
 *
 * Tu sú len čisté časti (mapovanie riadkov, rozbor odpovede MCP); siete
 * a tokeny sú v `metricool.server.ts`.
 *
 * Zapisuje sa TO ISTÉ, čo import CSV exportu (`parseMetricool` → tabuľka
 * `mkt_prispevky`) a PDF zostavy (`kanaly_mesiace`). ID príspevku a reelsu
 * sú v MCP rovnaké ako v exporte (`<media>_<účet>`), story má ako ID adresu
 * — overené 8. 10. 2026, takže sa nič nezdvojí.
 */

export const MCP_URL = "https://ai.metricool.com/mcp";
/** ProSapiens Biomechanic v Metricoole. */
export const BRAND_PSB = "2101108";
/** Účet Metricoolu (prosapiens.bio@gmail.com) — patrí do žiadosti o prístup. */
export const POUZIVATEL_MC = "1737317";

export type PrispevokMc = {
  id: string; druh: "post" | "reel" | "story"; datum: string; mesiac: string; url: string; hook: string;
  views: number; dosah: number; ulozenia: number; zdielania: number; komentare: number; lajky: number;
  spend: number; viewRate: number; watchTime: number;
};

// Poradie polí v dopyte = poradie stĺpcov v odpovedi.
export const POLIA_REELS = ["IGRE04", "IGRE02", "IGRE06", "IGRE03", "IGRE23", "IGRE11", "IGRE12", "IGRE21", "IGRE07", "IGRE10", "IGRE20", "IGRE28", "IGRE24"];
export const POLIA_POSTS = ["IGPO04", "IGPO02", "IGPO06", "IGPO03", "IGPO28", "IGPO14", "IGPO15", "IGPO27", "IGPO08", "IGPO13", "IGPO26"];
export const POLIA_STORIES = ["IGST06", "IGST02", "IGST03", "IGST09", "IGST10"];
/** Vývoj účtu po dňoch: sledovatelia, získaní, stratení, zobrazenia, dosah (+ deň na konci). */
export const POLIA_VYVOJ = ["IGEV01", "IGEV43", "IGEV44", "IGEV05", "IGEV06"];

const cislo = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const text = (x: unknown) => (x == null ? "" : String(x));
/** „20260828205644" → „2026-08-28". */
export const denZCasu = (t: unknown) => { const s = text(t); return /^\d{8}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ""; };
const hook = (x: unknown) => text(x).replace(/\s+/g, " ").trim().slice(0, 300);

export function riadkyNaPrispevky(druh: PrispevokMc["druh"], rows: unknown[][]): PrispevokMc[] {
  const out: PrispevokMc[] = [];
  for (const r of rows) {
    const datum = denZCasu(r[1]);
    const id = text(r[0]);
    if (!id || !datum) continue;
    const zaklad = { id, druh, datum, mesiac: datum.slice(0, 7), url: text(r[2]) || (druh === "story" ? id : ""), hook: hook(r[3]) };
    if (druh === "reel") {
      out.push({ ...zaklad, views: cislo(r[4]), dosah: cislo(r[5]), ulozenia: cislo(r[6]), zdielania: cislo(r[7]), komentare: cislo(r[8]), lajky: cislo(r[9]),
        // Export nesie spend, pomer zhliadnutí v % a priemerný čas v ms — MCP čas v sekundách.
        spend: cislo(r[10]), viewRate: Math.round(cislo(r[11]) * 10) / 10, watchTime: Math.round(cislo(r[12]) * 1000) });
    } else if (druh === "post") {
      out.push({ ...zaklad, views: cislo(r[4]), dosah: cislo(r[5]), ulozenia: cislo(r[6]), zdielania: cislo(r[7]), komentare: cislo(r[8]), lajky: cislo(r[9]),
        spend: cislo(r[10]), viewRate: 0, watchTime: 0 });
    } else {
      out.push({ ...zaklad, url: id, hook: hook(r[2]), views: cislo(r[3]), dosah: cislo(r[4]), ulozenia: 0, zdielania: 0, komentare: 0, lajky: 0, spend: 0, viewRate: 0, watchTime: 0 });
    }
  }
  return out;
}

/**
 * Mesačné čísla Instagramu do `kanaly_mesiace` — tie isté názvy metrík, aké
 * zapisuje PDF zostava (Kanaly.tsx ich číta presne týmito reťazcami).
 * Riadok vývoja: [sledovatelia, získaní, stratení, zobrazenia, dosah, deň].
 */
export function mesacneInstagram(vyvoj: unknown[][], prispevky: PrispevokMc[], mesiac: string): { metrika: string; hodnota: number }[] {
  const dni = vyvoj
    .map((r) => ({ den: text(r[r.length - 1]), sled: r[0] == null ? null : cislo(r[0]), plus: cislo(r[1]), minus: cislo(r[2]), views: cislo(r[3]), dosah: cislo(r[4]) }))
    .filter((d) => /^\d{8}$/.test(d.den) && `${d.den.slice(0, 4)}-${d.den.slice(4, 6)}` === mesiac)
    .sort((a, b) => a.den.localeCompare(b.den));
  const posledni = [...dni].reverse().find((d) => d.sled != null);
  const out: { metrika: string; hodnota: number }[] = [];
  if (posledni) out.push({ metrika: "Followers", hodnota: posledni.sled as number });
  if (dni.length) {
    out.push({ metrika: "Followers balance", hodnota: dni.reduce((a, d) => a + d.plus - d.minus, 0) });
    out.push({ metrika: "Views", hodnota: dni.reduce((a, d) => a + d.views, 0) });
    out.push({ metrika: "Reach", hodnota: dni.reduce((a, d) => a + d.dosah, 0) });
  }
  return [...out, ...suhrnPrispevkov(prispevky, mesiac)];
}

/** Mesačné čísla Instagramu, ktoré sa počítajú z jednotlivých príspevkov. */
function suhrnPrispevkov(prispevky: PrispevokMc[], mesiac: string): { metrika: string; hodnota: number }[] {
  const v = prispevky.filter((p) => p.mesiac === mesiac);
  const druh = (d: PrispevokMc["druh"]) => v.filter((p) => p.druh === d);
  const priemer = (xs: PrispevokMc[]) => (xs.length ? Math.round((xs.reduce((a, p) => a + p.dosah, 0) / xs.length) * 100) / 100 : 0);
  return [
    { metrika: "Posts", hodnota: druh("post").length },
    { metrika: "Reels", hodnota: druh("reel").length },
    { metrika: "Stories", hodnota: druh("story").length },
    { metrika: "Avg reach per post", hodnota: priemer(druh("post")) },
    { metrika: "Avg reach per reel", hodnota: priemer(druh("reel")) },
    { metrika: "Avg reach per story", hodnota: priemer(druh("story")) },
    { metrika: "Saved", hodnota: v.reduce((a, p) => a + p.ulozenia, 0) },
    { metrika: "Shares", hodnota: v.reduce((a, p) => a + p.zdielania, 0) },
  ];
}

/**
 * Odpoveď MCP môže prísť ako JSON aj ako prúd udalostí (SSE) — podľa toho,
 * ako sa serveru zachce. Vráti JSON-RPC správu s daným id.
 */
export function rozoberOdpovedMcp(telo: string, contentType: string, id: number): { result?: unknown; error?: { message?: string } } | null {
  const kandidati: string[] = [];
  if (/event-stream/i.test(contentType)) {
    for (const blok of telo.split(/\r?\n\r?\n/)) {
      const data = blok.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (data) kandidati.push(data);
    }
  } else kandidati.push(telo);
  for (const k of kandidati) {
    try {
      const j = JSON.parse(k) as { id?: number } | { id?: number }[];
      const zoznam = Array.isArray(j) ? j : [j];
      const m = zoznam.find((x) => x && x.id === id);
      if (m) return m as { result?: unknown; error?: { message?: string } };
    } catch { /* ďalší blok */ }
  }
  return null;
}

/** Výsledok nástroja → riadky. Nástroj vracia text s JSON `{rows:[…]}`, alebo chybu ako text. */
export function riadkyZVysledku(result: unknown): { rows: unknown[][] } | { chyba: string } {
  const r = result as { content?: { type?: string; text?: string }[]; isError?: boolean; structuredContent?: { rows?: unknown[][] } };
  if (r?.structuredContent?.rows) return { rows: r.structuredContent.rows };
  const t = (r?.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("\n");
  if (r?.isError) return { chyba: t.slice(0, 300) || "Metricool vrátil chybu." };
  try {
    const j = JSON.parse(t) as { rows?: unknown[][] };
    return { rows: Array.isArray(j.rows) ? j.rows : [] };
  } catch {
    return { chyba: t.slice(0, 300) || "Odpoveď Metricoolu sa nedala prečítať." };
  }
}

/** Mesiac → rozsah pre Metricool v pražskom čase (ISO s posunom). */
export function rozsahMesiaca(mesiac: string): { from: string; to: string } {
  const [r, m] = mesiac.split("-").map(Number);
  const posledny = new Date(Date.UTC(r, m, 0)).getUTCDate();
  // Posun pásma stačí približne — Metricool reže po dňoch.
  const posun = (mm: number) => (mm >= 4 && mm <= 10 ? "+02:00" : "+01:00");
  return { from: `${mesiac}-01T00:00:00${posun(m)}`, to: `${mesiac}-${String(posledny).padStart(2, "0")}T23:59:59${posun(m)}` };
}

/**
 * OSTATNÉ SIETE (Jerry, 8. 10. 2026: „áno, chcem aj ostatné"). Vývoj účtu po
 * dňoch → jeden mesačný riadok na metriku do `kanaly_mesiace`. Názvy kanálov
 * a metrík sú tie, ktoré zapisuje PDF zostava a číta Kanaly.tsx.
 *   posledna — stav ku koncu mesiaca (sledovatelia)
 *   sucet    — súčet dní
 *   rozdiel  — prvé pole mínus druhé (získaní − stratení)
 */
export type MetrikaSiete = { metrika: string; polia: string[]; ako: "posledna" | "sucet" | "rozdiel" };
export type Siet = { kanal: string; metriky: MetrikaSiete[] };

export const SIETE: Siet[] = [
  { kanal: "Facebook", metriky: [
    { metrika: "Followers", polia: ["FBEV17"], ako: "posledna" },
    { metrika: "Acquired", polia: ["FBEV47"], ako: "sucet" },
    { metrika: "Lost", polia: ["FBEV48"], ako: "sucet" },
    { metrika: "Page visits", polia: ["FBEV03"], ako: "sucet" },
    { metrika: "Views", polia: ["FBEV49"], ako: "sucet" },
    { metrika: "Posts", polia: ["FBEV04"], ako: "sucet" },
    { metrika: "Reels", polia: ["FBEV21"], ako: "sucet" },
    { metrika: "Video views", polia: ["FBEV22"], ako: "sucet" },
    { metrika: "Interactions", polia: ["FBEV10"], ako: "sucet" },
    { metrika: "Shares", polia: ["FBEV15"], ako: "sucet" },
  ] },
  { kanal: "TikTok", metriky: [
    { metrika: "Followers", polia: ["TKEV07"], ako: "posledna" },
    { metrika: "Followers balance", polia: ["TKEV08"], ako: "sucet" },
    { metrika: "Videos", polia: ["TKEV01"], ako: "sucet" },
    { metrika: "Views", polia: ["TKEV02"], ako: "sucet" },
    { metrika: "Reach", polia: ["TKEV11"], ako: "sucet" },
    { metrika: "Profile views", polia: ["TKEV09"], ako: "sucet" },
    { metrika: "Interactions", polia: ["TKEV06"], ako: "sucet" },
    { metrika: "Shares", polia: ["TKEV05"], ako: "sucet" },
  ] },
  { kanal: "YouTube", metriky: [
    { metrika: "Followers", polia: ["YTEV01"], ako: "posledna" },
    { metrika: "Followers balance", polia: ["YTEV05", "YTEV06"], ako: "rozdiel" },
    { metrika: "Videos", polia: ["YTEV04"], ako: "sucet" },
    { metrika: "Views", polia: ["YTEV02"], ako: "sucet" },
  ] },
  { kanal: "LinkedIn", metriky: [
    { metrika: "Followers", polia: ["LIEV01"], ako: "posledna" },
    { metrika: "Followers balance", polia: ["LIEV08"], ako: "sucet" },
    { metrika: "Posts", polia: ["LIEV04"], ako: "sucet" },
    { metrika: "Impressions", polia: ["LIEV18"], ako: "sucet" },
    { metrika: "Interactions", polia: ["LIEV10"], ako: "sucet" },
  ] },
  { kanal: "Threads", metriky: [
    { metrika: "Followers", polia: ["THEV01"], ako: "posledna" },
    { metrika: "Followers balance", polia: ["THEV03"], ako: "sucet" },
    { metrika: "Posts", polia: ["THEV02"], ako: "sucet" },
    { metrika: "Views", polia: ["THEV06"], ako: "sucet" },
    { metrika: "Interactions", polia: ["THEV05"], ako: "sucet" },
  ] },
  { kanal: "Google Business", metriky: [
    { metrika: "Views search", polia: ["GMEV18"], ako: "sucet" },
    { metrika: "Views maps", polia: ["GMEV19"], ako: "sucet" },
    { metrika: "Website clicks", polia: ["GMEV21"], ako: "sucet" },
    { metrika: "Calls", polia: ["GMEV22"], ako: "sucet" },
    { metrika: "Directions", polia: ["GMEV23"], ako: "sucet" },
    { metrika: "Reviews", polia: ["GMEV13"], ako: "sucet" },
  ] },
];

/** Všetky polia siete v poradí, v akom idú do dopytu (deň príde ako stĺpec navyše na konci). */
export const poliaSiete = (s: Siet) => [...new Set(s.metriky.flatMap((m) => m.polia))];

/**
 * Riadky vývoja siete → mesačné čísla. Metrika, ktorej pole za celý mesiac
 * neprišlo (sieť ho nehlási), sa nezapíše — nula by tvrdila niečo, čo sa nevie.
 */
export function mesacneSiete(s: Siet, rows: unknown[][], mesiac: string): { metrika: string; hodnota: number }[] {
  const polia = poliaSiete(s);
  const dni = rows
    .map((r) => ({ den: text(r[r.length - 1]), r }))
    .filter((d) => /^\d{8}$/.test(d.den) && `${d.den.slice(0, 4)}-${d.den.slice(4, 6)}` === mesiac)
    .sort((a, b) => a.den.localeCompare(b.den));
  const hodnoty = (pole: string) => dni.map((d) => d.r[polia.indexOf(pole)]).filter((v) => v != null && v !== "").map(cislo);
  const out: { metrika: string; hodnota: number }[] = [];
  for (const m of s.metriky) {
    const a = hodnoty(m.polia[0]);
    if (!a.length) continue;
    if (m.ako === "posledna") out.push({ metrika: m.metrika, hodnota: a[a.length - 1] });
    else if (m.ako === "sucet") out.push({ metrika: m.metrika, hodnota: a.reduce((x, y) => x + y, 0) });
    else out.push({ metrika: m.metrika, hodnota: a.reduce((x, y) => x + y, 0) - hodnoty(m.polia[1]).reduce((x, y) => x + y, 0) });
  }
  return out;
}

/** 403 „Access denied to blog" = Kokpit dostal prístup k inej značke než ProSapiens. */
export const jeInaZnacka = (sprava: string) => /access denied to blog/i.test(sprava);

/**
 * API METRICOOLU (plán Advanced, Jerry 3. 11. 2026) — kľúč vedľa pripojenia cez MCP.
 *
 * S kľúčom idú cezeň aj nočné čísla; MCP ostáva len ako záloha, kým kľúč nie je
 * uložený. API navyše vie to, čo MCP nemá: text recenzií, komentáre a správy,
 * konkurentov a odkiaľ sú sledovatelia.
 * Prehľad nižšie vracia LEN POČTY — nič z obsahu neide do prehliadača ani do logu.
 */
export const API_ZAKLAD = "https://app.metricool.com/api";
export const API_UZIVATEL = "1737317";

export type VerdiktKluca = { ok: true } | { ok: false; chyba: string };

/** Uloží sa len kľúč, ktorý Metricool prijal — zlý by sa ukázal až pri prvom sťahovaní. */
export function verdiktKluca(status: number): VerdiktKluca {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 401) return { ok: false, chyba: "Metricool tento kľúč neprijal. Skopíruj ho znova celý: Nastavenia účtu → API." };
  if (status === 402 || status === 403) return { ok: false, chyba: "Metricool pre tento účet API odmieta. Over, že je plán Advanced už aktívny." };
  return { ok: false, chyba: `Metricool odpovedal chybou ${status}. Skús to o chvíľu.` };
}

export const vyzeraAkoKluc = (k: string): boolean => k.length >= 8 && !/\s/.test(k);

export type SondaApi = { id: string; nazov: string; naco: string; cesta: string; parametre: Record<string, string>; opravnenie?: string };

/** Čo Kokpit pri kľúči skúša. Z obdobia posledných 90 dní, značka PSB. */
export function sondyApi(dnes: string): SondaApi[] {
  const od = new Date(Date.parse(`${dnes}T12:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  const obdobie = { from: `${od}T00:00:00+01:00`, to: `${dnes}T23:59:59+01:00`, timezone: "Europe/Prague" };
  return [
    { id: "reels", nazov: "Reels s dĺžkou pozerania", naco: "za koľko ľudia odskočia, reel po reeli", cesta: "/v2/analytics/reels/instagram", parametre: obdobie },
    { id: "recenzie", nazov: "Recenzie na Google", naco: "text a hviezdičky, či sme odpovedali", cesta: "/v2/analytics/reviews/gbp", parametre: obdobie },
    { id: "slova", nazov: "Čo ľudia hľadajú na Google profile", naco: "slová, cez ktoré nás našli", cesta: "/v2/analytics/keywords/gbp", parametre: obdobie },
    { id: "komentare", nazov: "Komentáre na Instagrame", naco: "otázky pod príspevkami", cesta: "/v2/inbox/post-comments", parametre: { provider: "instagram" }, opravnenie: "/v2/inbox/post-comments/authorizations" },
    { id: "spravy", nazov: "Správy na Instagrame", naco: "dopyty, ktoré prišli do DM", cesta: "/v2/inbox/conversations", parametre: { provider: "instagram" }, opravnenie: "/v2/inbox/conversations/authorizations" },
    { id: "konkurenti", nazov: "Konkurenti na Instagrame", naco: "kto je sledovaný a čo mu funguje", cesta: "/v2/analytics/competitors/instagram", parametre: { ...obdobie, limit: "50" } },
    { id: "mesta", nazov: "Mestá sledovateľov", naco: "koľko sledovateľov je z Brna", cesta: "/stats/city/instagram", parametre: {} },
  ];
}

/** Metricool vracia raz pole, raz `{ data: … }`, raz mapu mesto → počet. */
export function pocetPoloziek(telo: unknown): number | null {
  const d = telo && typeof telo === "object" && !Array.isArray(telo) && "data" in telo ? (telo as { data: unknown }).data : telo;
  if (Array.isArray(d)) return d.length;
  if (d && typeof d === "object") return Object.keys(d).length;
  return null;
}

export type RiadokPrehladu = { id: string; nazov: string; naco: string; ok: boolean; pocet: number | null; poznamka: string };

/** Riadok prehľadu: stavový kód sám nič nehovorí, preto ide von aj začiatok odpovede. */
export function riadokPrehladu(s: SondaApi, status: number, telo: unknown, text: string, chybaPovolenia: string[] = []): RiadokPrehladu {
  const zaklad = { id: s.id, nazov: s.nazov, naco: s.naco };
  if (status === 0) return { ...zaklad, ok: false, pocet: null, poznamka: "Metricool neodpovedal." };
  if (status < 200 || status >= 300) {
    return { ...zaklad, ok: false, pocet: null, poznamka: `Chyba ${status}: ${text.replace(/\s+/g, " ").trim().slice(0, 160) || "bez popisu"}` };
  }
  if (chybaPovolenia.length) return { ...zaklad, ok: false, pocet: null, poznamka: `Metricool na to nemá povolenie Instagramu: ${chybaPovolenia.join(", ").slice(0, 120)}` };
  return { ...zaklad, ok: true, pocet: pocetPoloziek(telo), poznamka: "" };
}

/**
 * MESAČNÉ ČÍSLA CEZ API. Názvy a podmety sú zistené porovnaním s tým, čo Kokpit
 * už mal za október 2026: 42 metrík sedelo na číslo. `subject` API vyžaduje pri
 * účte; bez neho vráti 400 a nie prázdno.
 */
export type SeriaApi = { kanal: string; metrika: string; network: string; metric: string; subject?: string; ako: "posledna" | "sucet"; minus?: string };

const seria = (kanal: string, network: string, riadky: [string, string, string | undefined, SeriaApi["ako"], string?][]): SeriaApi[] =>
  riadky.map(([metrika, metric, subject, ako, minus]) => ({ kanal, metrika, network, metric, ...(subject ? { subject } : {}), ako, ...(minus ? { minus } : {}) }));

export const SERIE_API: SeriaApi[] = [
  ...seria("Instagram", "instagram", [
    ["Followers", "followers", "account", "posledna"], ["Followers balance", "delta_followers", "account", "sucet"],
    ["Views", "views", "account", "sucet"], ["Reach", "reach", "account", "sucet"],
  ]),
  ...seria("Facebook", "facebook", [
    ["Followers", "pageFollows", "account", "posledna"], ["Acquired", "page_daily_follows_unique", "account", "sucet"],
    ["Lost", "page_daily_unfollows_unique", "account", "sucet"], ["Page visits", "pageViews", "account", "sucet"],
    ["Views", "page_media_view", "account", "sucet"], ["Posts", "count", "posts", "sucet"], ["Reels", "count", "reels", "sucet"],
    ["Video views", "blue_reels_play_count", "reels", "sucet"], ["Interactions", "interactions", "posts", "sucet"], ["Shares", "shares", "posts", "sucet"],
  ]),
  ...seria("TikTok", "tiktok", [
    ["Followers", "followers_count", "account", "posledna"], ["Followers balance", "followers_delta_count", "account", "sucet"],
    ["Videos", "videos", undefined, "sucet"], ["Views", "views", undefined, "sucet"], ["Reach", "reach", undefined, "sucet"],
    ["Profile views", "profile_views", "account", "sucet"], ["Interactions", "interactions", undefined, "sucet"], ["Shares", "shares", undefined, "sucet"],
  ]),
  ...seria("YouTube", "youtube", [
    ["Followers", "totalSubscribers", "account", "posledna"], ["Followers balance", "subscribersGained", undefined, "sucet", "subscribersLost"], ["Views", "views", undefined, "sucet"],
  ]),
  ...seria("LinkedIn", "linkedin", [
    ["Followers", "followers", "account", "posledna"], ["Followers balance", "deltaFollowers", "account", "sucet"], ["Posts", "postsCount", "account", "sucet"],
    ["Impressions", "impressionCount", "account", "sucet"], ["Interactions", "interactions", "posts", "sucet"],
  ]),
  ...seria("Threads", "threads", [
    ["Followers", "followers_count", "account", "posledna"], ["Followers balance", "delta_followers", "account", "sucet"], ["Posts", "count", "posts", "sucet"],
    ["Views", "views", "posts", "sucet"], ["Interactions", "interactions", "posts", "sucet"],
  ]),
  ...seria("Google Business", "gmb", [
    ["Views search", "business_impressions_search", undefined, "sucet"], ["Views maps", "business_impressions_maps", undefined, "sucet"],
    ["Website clicks", "website_clicks", undefined, "sucet"], ["Calls", "call_clicks", undefined, "sucet"], ["Directions", "business_direction_requests", undefined, "sucet"],
  ]),
];

type BodApi = { dateTime?: string; value?: number | null };
/** Hodnoty série z odpovede `{data:[{values:[…]}]}`. API ich dáva od najnovšej. */
export function hodnotySerie(telo: unknown): BodApi[] {
  const d = (telo as { data?: { values?: BodApi[] }[] } | null)?.data?.[0]?.values;
  return Array.isArray(d) ? d.filter((b) => b && b.value != null) : [];
}

/** Hodnota metriky za mesiac. Prázdna suma je 0 (nič sa nestalo), prázdna „posledná" sa nezapíše. */
export function hodnotaSerie(s: SeriaApi, body: BodApi[], minus: BodApi[] = []): number | null {
  const sucet = (x: BodApi[]) => Math.round(x.reduce((a, b) => a + Number(b.value), 0) * 100) / 100;
  if (s.ako === "sucet") return sucet(body) - sucet(minus);
  if (!body.length) return null;
  return Number([...body].sort((a, b) => String(b.dateTime).localeCompare(String(a.dateTime)))[0].value);
}

/** Začiatok a koniec mesiaca s pražským posunom (október začína letným a končí zimným časom). */
export function obdobieMesiacaApi(mesiac: string): { from: string; to: string; timezone: string } {
  const [r, m] = mesiac.split("-").map(Number);
  const posledny = new Date(Date.UTC(r, m, 0)).getUTCDate();
  const posun = (d: Date) => (new Intl.DateTimeFormat("en", { timeZone: "Europe/Prague", timeZoneName: "longOffset" }).formatToParts(d).find((x) => x.type === "timeZoneName")?.value || "GMT+01:00").replace("GMT", "");
  const mm = String(m).padStart(2, "0");
  return {
    from: `${r}-${mm}-01T00:00:00${posun(new Date(Date.UTC(r, m - 1, 1, 12)))}`,
    to: `${r}-${mm}-${String(posledny).padStart(2, "0")}T23:59:59${posun(new Date(Date.UTC(r, m - 1, posledny, 12)))}`,
    timezone: "Europe/Prague",
  };
}

type RiadokApi = Record<string, unknown>;
const denApi = (x: RiadokApi) => text((x.publishedAt as { dateTime?: string } | undefined)?.dateTime).slice(0, 10);

/**
 * Príspevky z API v tom istom tvare ako z MCP a exportu. Id sú rovnaké, takže nič
 * nezdvojí. Riadok bez id zahodí: príbeh bez adresy (MCP ho vynechával tiež).
 */
export function prispevkyZApi(druh: PrispevokMc["druh"], riadky: RiadokApi[]): PrispevokMc[] {
  const out: PrispevokMc[] = [];
  for (const x of riadky) {
    const datum = denApi(x);
    const id = text(druh === "reel" ? x.reelId : druh === "post" ? x.postId : x.permalink);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) continue;
    const zaklad = { id, druh, datum, mesiac: datum.slice(0, 7) };
    if (druh === "story") {
      out.push({ ...zaklad, url: id, hook: "", views: cislo(x.impressions), dosah: cislo(x.reach), ulozenia: 0, zdielania: 0, komentare: 0, lajky: 0, spend: 0, viewRate: 0, watchTime: 0 });
      continue;
    }
    const spolocne = { ...zaklad, url: text(x.url), hook: hook(x.content), views: cislo(x.views), dosah: cislo(x.reach), ulozenia: cislo(x.saved), zdielania: cislo(x.shares), komentare: cislo(x.comments), lajky: cislo(x.likes), spend: cislo(x.spend) };
    out.push(druh === "reel"
      // View rate je opak miery preskočenia. Priemerný čas je v sekundách, ukladá sa v ms.
      ? { ...spolocne, viewRate: x.reelsSkipRate == null ? 0 : Math.round((100 - cislo(x.reelsSkipRate)) * 10) / 10, watchTime: Math.round(cislo(x.averageWatchTime) * 1000) }
      : { ...spolocne, viewRate: 0, watchTime: 0 });
  }
  return out;
}

/** Súhrn z príspevkov pre Instagram; série ho doplnia o sledovateľov a dosah účtu. */
export const suhrnInstagramuZApi = (prispevky: PrispevokMc[], mesiac: string) => suhrnPrispevkov(prispevky, mesiac);

export const POCET_V_MESIACI = (riadky: RiadokApi[], mesiac: string) => riadky.filter((x) => denApi(x).startsWith(mesiac)).length;
