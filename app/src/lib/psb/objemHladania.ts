/**
 * Objem hľadania z plánovača kľúčových slov Google Ads (zoznam úloh č. 18; Jerry 20. 10. 2026 „začni“).
 *
 * ČO TO JE A ČO NIE
 *
 * Odhad Googlu, koľko ľudí mesačne napíše daný výraz do vyhľadávania (priemer
 * za 12 mesiacov, zaokrúhlený do pásiem – 10, 20, 30, 50, 70, 90, 110, 140…).
 * Nie je to návštevnosť webu ani počet zákazníkov. Pri malom meste vychádza
 * veľa výrazov na 0 alebo 10 – to neznamená „nikto“, ale „pod hranicou, ktorú
 * Google ešte hlási“.
 *
 * NA ČO TO JE (číslo bez akcie sa neukazuje)
 *
 * Výber tém: čo hľadá veľa ľudí a ešte o tom nemáš článok ani video. Preto má
 * každý riadok „+ Nápad“, ktorý tému pošle do Nápadov – nie len číslo.
 *
 * Čisté funkcie – volanie Googlu robí routes/api/google-ads.ts (akcia „objem“).
 */

export type RegionObjemu = "cz" | "brno";
export const REGIONY_OBJEMU: Record<RegionObjemu, string> = { cz: "Česko", brno: "Brno" };
/** Česko (geoTargetConstants/2203). Brno sa zisťuje cez geoTargetConstants:suggest a pamätá. */
export const GEO_CESKO = "geoTargetConstants/2203";
/** Čeština. */
export const JAZYK_CS = "languageConstants/1021";

/** Témy PSB, ktoré sa sledujú, kým si Jerry nenapíše vlastné. */
export const PREDVOLENE_VYRAZY = [
  "bolest zad",
  "bolest zad cviky",
  "bolest kolene",
  "bolest ramene",
  "bolest krční páteře",
  "výhřez ploténky cvičení",
  "skolióza cvičení",
  "držení těla",
  "plochá noha",
  "osobní trenér brno",
  "fyzioterapie brno",
  "funkční trénink",
];

export type MesiacObjemu = { mesiac: string; n: number };
export type Konkurencia = "nizka" | "stredna" | "vysoka" | "nezname";
export type ObjemVyrazu = {
  vyraz: string;
  /** Priemer za posledných 12 mesiacov (odhad Googlu). */
  mesacne: number;
  /** Mesiace od najstaršieho, „RRRR-MM“. */
  trend: MesiacObjemu[];
  konkurencia: Konkurencia;
  /** Cena za klik na vrchu stránky (Kč), ak ju Google dal. */
  cpcOd: number | null;
  cpcDo: number | null;
  /**
   * Google k výrazu nedal žiadne číslo (ani mesiace). Nie je to „nikto nehľadá“: plánovač tak odpovedá,
   * keď tvar zaradí pod iný (overené 20. 10. 2026 – „bolest zad“, „skolióza cvičení“ bez metrík,
   * „cviky na záda“ 2 900). Obrazovka to musí povedať, nie ukázať nulu.
   */
  bezDat?: boolean;
};
export type UlozenyObjem = {
  zistene: string;
  region: RegionObjemu;
  vyrazy: ObjemVyrazu[];
  /** Podobné výrazy, ktoré ľudia hľadajú (z generateKeywordIdeas), bez tých, čo sa už sledujú. */
  napady: ObjemVyrazu[];
};

const MESIACE_EN = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

const cislo = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const kc = (mikro: unknown): number | null => {
  const n = cislo(mikro);
  return n > 0 ? Math.round(n / 10000) / 100 : null;
};

function konkurencia(v: unknown): Konkurencia {
  const s = String(v ?? "").toUpperCase();
  return s === "LOW" ? "nizka" : s === "MEDIUM" ? "stredna" : s === "HIGH" ? "vysoka" : "nezname";
}

/** Mesiac z Googlu ({ month: "OCTOBER" | 11, year: "2025" }) → „2025-10“; nezmysel = "". */
export function mesiacZGooglu(m: { month?: unknown; year?: unknown }): string {
  const rok = cislo(m.year);
  const raw = m.month;
  const idx = typeof raw === "number" ? raw - 2 : MESIACE_EN.indexOf(String(raw ?? "").toUpperCase());
  // enum MonthOfYear: UNSPECIFIED=0, UNKNOWN=1, JANUARY=2 … – číslo sa posúva o 2
  if (rok < 2000 || idx < 0 || idx > 11) return "";
  return `${rok}-${String(idx + 1).padStart(2, "0")}`;
}

type Metriky = {
  avgMonthlySearches?: unknown;
  monthlySearchVolumes?: { month?: unknown; year?: unknown; monthlySearches?: unknown }[];
  competition?: unknown;
  lowTopOfPageBidMicros?: unknown;
  highTopOfPageBidMicros?: unknown;
};

function zMetrik(text: string, m: Metriky | undefined): ObjemVyrazu {
  const trend = (m?.monthlySearchVolumes ?? [])
    .map((x) => ({ mesiac: mesiacZGooglu(x), n: cislo(x.monthlySearches) }))
    .filter((x) => x.mesiac)
    .sort((a, b) => a.mesiac.localeCompare(b.mesiac));
  const bezDat = m?.avgMonthlySearches === undefined && !trend.length;
  return {
    ...(bezDat ? { bezDat: true } : {}),
    vyraz: text,
    mesacne: cislo(m?.avgMonthlySearches),
    trend,
    konkurencia: konkurencia(m?.competition),
    cpcOd: kc(m?.lowTopOfPageBidMicros),
    cpcDo: kc(m?.highTopOfPageBidMicros),
  };
}

/** Odpoveď generateKeywordHistoricalMetrics → výrazy v poradí, ako sa sledujú (chýbajúci = 0, nie vynechaný). */
export function zHistorickych(data: unknown, sledovane: string[]): ObjemVyrazu[] {
  const vysledky = ((data as { results?: { text?: string; keywordMetrics?: Metriky; closeVariants?: string[] }[] })?.results ?? []);
  const podla = new Map<string, ObjemVyrazu>();
  for (const r of vysledky) {
    if (!r.text) continue;
    const o = zMetrik(r.text, r.keywordMetrics);
    podla.set(normVyraz(r.text), o);
    // Google zlučuje blízke varianty (s diakritikou a bez) – sledovaný výraz nájde aj cez ne
    for (const v of r.closeVariants ?? []) if (!podla.has(normVyraz(v))) podla.set(normVyraz(v), { ...o, vyraz: v });
  }
  return sledovane.map((v) => ({ ...(podla.get(normVyraz(v)) ?? { mesacne: 0, trend: [], konkurencia: "nezname" as const, cpcOd: null, cpcDo: null, bezDat: true }), vyraz: v }));
}

/** Odpoveď generateKeywordIdeas → podobné výrazy (bez sledovaných), od najhľadanejšieho. */
export function zNapadov(data: unknown, sledovane: string[], max = 25): ObjemVyrazu[] {
  const uz = new Set(sledovane.map(normVyraz));
  const vysledky = ((data as { results?: { text?: string; keywordIdeaMetrics?: Metriky }[] })?.results ?? []);
  const out: ObjemVyrazu[] = [];
  for (const r of vysledky) {
    if (!r.text || uz.has(normVyraz(r.text))) continue;
    uz.add(normVyraz(r.text));
    out.push(zMetrik(r.text, r.keywordIdeaMetrics));
  }
  return out.filter((x) => x.mesacne > 0).sort((a, b) => b.mesacne - a.mesacne).slice(0, max);
}

/** Na porovnanie výrazov: malé písmená, bez diakritiky a nadbytočných medzier. */
export function normVyraz(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Výrazy z textu (riadok = výraz), bez prázdnych a duplicít; najviac 20 (limit Googlu na jedno volanie). */
export function vyrazyZTextu(t: string): string[] {
  const out: string[] = [];
  for (const r of t.split(/\n|,/)) {
    const v = r.replace(/\s+/g, " ").trim().slice(0, 80);
    if (v && !out.some((x) => normVyraz(x) === normVyraz(v))) out.push(v);
  }
  return out.slice(0, 20);
}

/**
 * Smer záujmu: posledné 3 mesiace proti rovnakým 3 mesiacom pred rokom (sezóna sa tak nepočíta ako rast).
 * Bez roka dát alebo pri malých číslach (< 30 spolu) = null – pri pásmach 10/20 by to bol šum.
 */
export function smerZaujmu(trend: MesiacObjemu[]): { zmena: number; text: string } | null {
  if (trend.length < 15) {
    if (trend.length < 6) return null;
    const posledne = trend.slice(-3).reduce((a, x) => a + x.n, 0);
    const predtym = trend.slice(-6, -3).reduce((a, x) => a + x.n, 0);
    if (posledne + predtym < 30 || predtym === 0) return null;
    const zmena = Math.round(((posledne - predtym) / predtym) * 100);
    return { zmena, text: `${zmena > 0 ? "+" : ""}${zmena} % za 3 mesiace` };
  }
  const posledne = trend.slice(-3).reduce((a, x) => a + x.n, 0);
  const rokPred = trend.slice(-15, -12).reduce((a, x) => a + x.n, 0);
  if (posledne + rokPred < 30 || rokPred === 0) return null;
  const zmena = Math.round(((posledne - rokPred) / rokPred) * 100);
  return { zmena, text: `${zmena > 0 ? "+" : ""}${zmena} % oproti minulému roku` };
}

/** Text nápadu, ktorý „+ Nápad“ pošle do Nápadov. */
export function textNapadu(o: Pick<ObjemVyrazu, "vyraz" | "mesacne">, region: RegionObjemu): string {
  return `Téma z hľadania na Googli: „${o.vyraz}“ – ${o.mesacne ? `asi ${o.mesacne}× mesačne` : "málo hľadané"} (${REGIONY_OBJEMU[region]})`;
}

/** Uložený objem z nastavení (JSON); poškodený alebo starý tvar = null. */
export function citajUlozeny(json: string | null | undefined): UlozenyObjem | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<UlozenyObjem>;
    if (!o || typeof o.zistene !== "string" || !Array.isArray(o.vyrazy)) return null;
    return { zistene: o.zistene, region: o.region === "brno" ? "brno" : "cz", vyrazy: o.vyrazy, napady: Array.isArray(o.napady) ? o.napady : [] };
  } catch {
    return null;
  }
}
