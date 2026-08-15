/**
 * PageSpeed Insights — čítanie odpovede a čo z nej vyplýva.
 *
 * PREČO SÚ TIETO FUNKCIE ODDELENÉ OD ROUTE
 *
 * Odpoveď z Lighthouse je hlboko zanorený objekt, kde skóre je desatinné číslo
 * od 0 do 1, časy sú niekedy `numericValue` a niekedy chýbajú, a keď meranie
 * zlyhá, príde HTTP 200 s chybou vnútri. Kód napísaný „ako to asi vyzerá"
 * uloží samé nuly a vyzerá to ako pomalý web. Preto s testami.
 *
 * ČO Z TOHO MÁ CENU
 *
 * `hodnotenie()`. Samotné číslo 47/100 nie je akcia — akcia je „obrázky sú
 * o 2,4 s a to je väčšina toho, čo človek čaká".
 */

export type PsRiadok = {
  url: string; strategia: string; meraneAt: string;
  vykon: number | null; seo: number | null; pristupnost: number | null; postupy: number | null;
  lcpMs: number | null; cls: number | null; tbtMs: number | null; fcpMs: number | null;
  prilezitosti: { nazov: string; usetriMs: number }[];
  chyba: string;
};

/** Skóre z Lighthouse je 0–1 a môže chýbať. 0 a „nemeralo sa" nie je to isté. */
export function skore(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return Math.round(v * 100);
}

function audit(lh: Record<string, unknown>, id: string): Record<string, unknown> | null {
  const audity = lh?.audits as Record<string, unknown> | undefined;
  const a = audity?.[id] as Record<string, unknown> | undefined;
  return a && typeof a === "object" ? a : null;
}

function cislo(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return v;
}

/**
 * Príležitosti — audity, ktoré vedia povedať, koľko milisekúnd sa dá ušetriť.
 *
 * Berú sa len tie nad 150 ms. Pod tým je to meranie šumu: Lighthouse beží na
 * simulovanom pripojení a rozdiel stotín sa medzi dvoma behmi mení sám od seba.
 */
const DOST_USETRI_MS = 150;

export function prilezitostiZLighthouse(lh: Record<string, unknown>, limit = 5): { nazov: string; usetriMs: number }[] {
  const audity = (lh?.audits || {}) as Record<string, Record<string, unknown>>;
  const von: { nazov: string; usetriMs: number }[] = [];
  for (const a of Object.values(audity)) {
    const d = a?.details as Record<string, unknown> | undefined;
    const ms = cislo(d?.overallSavingsMs);
    if (ms === null || ms < DOST_USETRI_MS) continue;
    const nazov = String(a?.title || "").trim();
    if (!nazov) continue;
    von.push({ nazov, usetriMs: Math.round(ms) });
  }
  return von.sort((a, b) => b.usetriMs - a.usetriMs).slice(0, limit);
}

/**
 * Odpoveď PSI → riadok.
 *
 * Meranie môže zlyhať s HTTP 200 a chybou vnútri (napr. keď stránka odpovie
 * pomaly alebo Lighthouse spadne). Uložiť za to nuly by znamenalo tvrdiť, že
 * stránka má výkon 0 — preto sa chyba nesie ďalej ako chyba.
 */
export function riadokZOdpovede(telo: unknown, url: string, strategia: string, meraneAt: string): PsRiadok {
  const zaklad: PsRiadok = {
    url, strategia, meraneAt,
    vykon: null, seo: null, pristupnost: null, postupy: null,
    lcpMs: null, cls: null, tbtMs: null, fcpMs: null,
    prilezitosti: [], chyba: "",
  };
  const t = (telo || {}) as Record<string, unknown>;
  const chyba = t.error as Record<string, unknown> | undefined;
  if (chyba) return { ...zaklad, chyba: String(chyba.message || "meranie zlyhalo").slice(0, 300) };

  const lh = t.lighthouseResult as Record<string, unknown> | undefined;
  if (!lh) return { ...zaklad, chyba: "odpoveď nemá lighthouseResult" };

  const kat = (lh.categories || {}) as Record<string, Record<string, unknown>>;
  const lcp = audit(lh, "largest-contentful-paint");
  const cls = audit(lh, "cumulative-layout-shift");
  const tbt = audit(lh, "total-blocking-time");
  const fcp = audit(lh, "first-contentful-paint");

  const ms = (a: Record<string, unknown> | null) => {
    const v = cislo(a?.numericValue);
    return v === null ? null : Math.round(v);
  };

  return {
    ...zaklad,
    vykon: skore(kat.performance?.score),
    seo: skore(kat.seo?.score),
    pristupnost: skore(kat.accessibility?.score),
    postupy: skore(kat["best-practices"]?.score),
    lcpMs: ms(lcp),
    cls: cislo(cls?.numericValue) === null ? null : Math.round((cislo(cls?.numericValue) as number) * 1000) / 1000,
    tbtMs: ms(tbt),
    fcpMs: ms(fcp),
    prilezitosti: prilezitostiZLighthouse(lh),
  };
}

/**
 * Prahy sú Googlove, nie moje: LCP do 2,5 s dobré, do 4 s hraničné; CLS do
 * 0,1 dobré, do 0,25 hraničné. Sú to hranice Core Web Vitals, ktoré Google
 * sám používa ako faktor v hodnotení.
 */
const LCP_DOBRE = 2500, LCP_ZLE = 4000;
const CLS_DOBRE = 0.1, CLS_ZLE = 0.25;

export type Hodnotenie = { stav: "dobre" | "hranicne" | "zle" | "nezmerane"; veta: string };

/**
 * Čo z čísel vyplýva — vetou, nie skóre.
 *
 * Skóre 47/100 nie je akcia. „Človek na mobile pozerá na prázdnu stránku 4,3
 * sekundy, kým niečo uvidí" je.
 */
export function hodnotenie(r: PsRiadok): Hodnotenie {
  if (r.chyba) return { stav: "nezmerane", veta: `Meranie neprešlo: ${r.chyba}` };
  if (r.lcpMs === null) return { stav: "nezmerane", veta: "Meranie prebehlo, ale nevrátilo časy." };

  const s = (r.lcpMs / 1000).toFixed(1).replace(".", ",");
  const kde = r.strategia === "mobile" ? "na mobile" : "na počítači";
  const casti: string[] = [];

  let stav: Hodnotenie["stav"] = "dobre";
  if (r.lcpMs > LCP_ZLE) { stav = "zle"; casti.push(`${kde} človek pozerá na neúplnú stránku ${s} s, kým uvidí hlavný obsah`); }
  else if (r.lcpMs > LCP_DOBRE) { stav = "hranicne"; casti.push(`${kde} hlavný obsah nabehne za ${s} s — Google berie do 2,5 s ako dobré`); }
  else casti.push(`${kde} hlavný obsah nabehne za ${s} s, čo je v poriadku`);

  if (r.cls !== null && r.cls > CLS_ZLE) {
    stav = "zle";
    casti.push(`obsah pod prstom poskakuje (CLS ${String(r.cls).replace(".", ",")})`);
  } else if (r.cls !== null && r.cls > CLS_DOBRE) {
    if (stav === "dobre") stav = "hranicne";
    casti.push(`obsah sa pri načítaní posúva (CLS ${String(r.cls).replace(".", ",")})`);
  }

  const naj = r.prilezitosti[0];
  if (naj && naj.usetriMs >= 500) {
    casti.push(`najväčší jediný zisk je „${naj.nazov}“ — ${(naj.usetriMs / 1000).toFixed(1).replace(".", ",")} s`);
  }

  return { stav, veta: casti.join("; ") + "." };
}

/** Stránky, ktoré stojí za to zmerať skôr než ostatné. */
export function poradieMerania(
  stranky: { url: string }[],
  gsc: { url: string; zobrazenia: number }[],
  limit = 20,
): string[] {
  // Merať 79 stránok je 40 minút čakania za niečo, čo pri stránke bez jediného
  // zobrazenia nikoho nezaujíma. Poradie určuje, koľko ľudí to naozaj vidí.
  const vaha = new Map<string, number>();
  for (const g of gsc) vaha.set(String(g.url || "").replace(/\/+$/, ""), g.zobrazenia || 0);
  return stranky
    .map((s) => ({ url: s.url, z: vaha.get(String(s.url || "").replace(/\/+$/, "")) ?? 0 }))
    .sort((a, b) => b.z - a.z)
    .slice(0, limit)
    .map((x) => x.url);
}
