/**
 * MESAČNÝ A KVARTÁLNY REPORT (Jerry, 8. 10. 2026: „postav C s kartami z A",
 * potom „chcel by som podrobnejšie — meriame veľa vecí, chcem vidieť to
 * najdôležitejšie; porovnania s PRIEMEROM, nie s predchádzajúcim mesiacom").
 *
 * Tri otázky — Máme dosť práce? Zarábame? Prichádzajú noví ľudia? — každá
 * so semaforom, jedným veľkým číslom a krivkou (karta z návrhu A), tabuľkou
 * najdôležitejších čísel proti priemeru a JEDNOU vecou, ktorú s tým urobiť
 * (návrh C; „číslo bez akcie je zbytočné"). Náčrt: navrhy-kokpitu/mesacny-report.html.
 *
 * PRIEMER: mesiac sa porovnáva s priemerom šiestich mesiacov pred ním,
 * štvrťrok s priemerom celých štvrťrokov pred ním (najviac troch). Predošlý
 * mesiac je zlé meradlo — august s dovolenkami urobí z každého septembra
 * rekord.
 *
 * Tu je len výpočet nad hotovými mesačnými číslami. Čísla skladá App z tých
 * istých zdrojov, ktoré ukazujú obrazovky — report nič nepočíta po svojom.
 */

export type MesiacReportu = {
  m: string;
  hodiny: number;
  aktivni: number;
  novi: number;
  dopyty: number;
  /** Trénovali v predošlom mesiaci, v tomto nie. */
  prestali?: number;
  hodinyJerry?: number;
  hodinyTerezka?: number;
  /** P&L — chýba, keď mesiac v P&L nie je. */
  prijmy?: number;
  naklady?: number;
  zisk?: number;
  vyplaty?: number;
  sledovatelia?: number;
  prirastokIg?: number;
  dosahReels?: number;
  reklama?: number;
  googleTrasy?: number;
  googleWeb?: number;
  /** Break-even z P&L (`breakEvenRad`): náklady bez výplat + nárok trénerov. */
  breakEven?: number;
  /** Aplikácie spolu (fixne.apps.*) a z toho AI (fixne.apps.ai). */
  apps?: number;
  ai?: number;
  /** Osobné financie zakladateľov — čo si vzali a spoločné výdavky domácnosti. */
  vyplataJerry?: number;
  vyplataTerezka?: number;
  /** Spoločné po kategóriách (Nájom, Potraviny, Ahsoka…). */
  spolocne?: Record<string, number>;
  /** Daň a odvody (Štát Jerry + Štát Terezka — paušálna daň). */
  dan?: number;
  /** Klienti (metrikyKlientov.ts), v percentách. */
  obnovaPct?: number;
  prezitiePct?: number;
  retenciaPct?: number;
  odchodyPct?: number;
  /** Úvodné tréningy a dopyty z reklamy — pre lievik a cenu dopytu. */
  uvodne?: number;
  dopytyReklama?: number;
};

export type ExtraReportu = {
  /** Aktívni klienti, ktorí v období netrénovali. */
  odmlcani: number;
  /** Zošit hotovosti za obdobie nie je zapísaný → P&L nie je úplné. */
  zositChyba: boolean;
  /** Najväčšie nákladové položky obdobia (bez výplat). */
  topVydaje?: { nazov: string; suma: number }[];
  /** Odkiaľ prišli dopyty v období. */
  zdroje?: { zdroj: string; pocet: number }[];
  /** Najlepší reels obdobia podľa zhliadnutí. */
  najlepsiReel?: { hook: string; views: number };
  /** Klienti, ktorým v období skončil balíček a nový neprišiel. */
  bezObnovy?: { klient: string; do: string }[];
  obnova?: { skoncilo: number; obnovene: number };
  prezitie?: { kohorta: string; novi: number; ostali: number };
  retencia?: { kohorta: number; ostali: number };
  hodnotaKlienta?: { pocet: number; priemer: number; mesiacov: number };
  /** Koncentrácia tržieb obdobia. */
  topKlient?: { klient: string; podiel: number };
  top20?: number;
  /** Strop hodín trénera za mesiac (Jerry, 8. 10. 2026: obom 120 h). */
  strop?: { jerry: number; terezka: number };
  /** Stav TERAZ (nie za obdobie): rezerva v mesiacoch, dlžné Kč, predplatené hodiny. */
  rezervaMesiacov?: number | null;
  dlzne?: number;
  predplateneHodiny?: number;
  /** Koľkí rôzni klienti za 12 mesiacov niekoho priviedli. */
  odporucatelia?: number;
};

export type Semafor = "z" | "o" | "c";
export type RiadokDetailu = { metrika: string; hodnota: string; priemer: string; rozdiel: string; smer: "hore" | "dole" | "rovno"; dobre?: boolean };
export type OtazkaReportu = {
  id: "praca" | "klienti" | "peniaze" | "novi" | "koncentracia" | "osobne";
  otazka: string;
  semafor: Semafor;
  odpoved: string;
  hlavne: { hodnota: number; jednotka: string; zmena: string; smer: "hore" | "dole" | "rovno"; seria: number[]; popisSerie: string[]; chyba?: boolean };
  detail: RiadokDetailu[];
  zoznamy: { nadpis: string; polozky: string[] }[];
  akcia: string;
};
export type Report = { druh: "mesiac" | "kvartal"; nadpis: string; porovnanie: string; otazky: OtazkaReportu[] };

const MES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
export const nazovMes = (m: string) => `${MES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mesKratko = (m: string) => MES[Number(m.slice(5, 7)) - 1];
export const kvartalMesiaca = (m: string) => Math.ceil(Number(m.slice(5, 7)) / 3);
/** Je to posledný mesiac štvrťroka (marec, jún, september, december)? */
export const koniecKvartalu = (m: string) => Number(m.slice(5, 7)) % 3 === 0;

/** 1 nový klient · 2–4 noví klienti · 5 nových klientov. */
export const noviKlienti = (n: number) => `${n} ${n === 1 ? "nový klient" : n >= 2 && n <= 4 ? "noví klienti" : "nových klientov"}`;
const kc = (n: number) => Math.round(n).toLocaleString("sk-SK").replace(/,/g, " ");
const sucet = (xs: (number | undefined)[]) => xs.reduce<number>((a, x) => a + (x || 0), 0);
const priemer = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
const definovane = <T,>(xs: (T | undefined)[]) => xs.filter((x): x is T => x !== undefined);

/** Zmena proti priemeru: „▲ 17 % nad priemerom". */
function protiPriemeru(teraz: number, p: number | undefined): { zmena: string; smer: "hore" | "dole" | "rovno" } {
  if (p === undefined || !Number.isFinite(p)) return { zmena: "bez priemeru", smer: "rovno" };
  if (p === 0) return teraz === 0 ? { zmena: "ako priemer", smer: "rovno" } : { zmena: "priemer 0", smer: teraz > 0 ? "hore" : "dole" };
  const pct = Math.round(((teraz - p) / Math.abs(p)) * 100);
  if (Math.abs(pct) < 3) return { zmena: "ako priemer", smer: "rovno" };
  return { zmena: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)} % ${pct > 0 ? "nad" : "pod"} priemerom`, smer: pct > 0 ? "hore" : "dole" };
}

const priemerPola = (ms: MesiacReportu[], k: keyof MesiacReportu) => {
  const v = ms.map((x) => x[k] as number | undefined).filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((a, x) => a + x, 0) / v.length : undefined;
};
/** Riadok bez porovnania (stav teraz, text). */
const riadokText = (metrika: string, hodnota: string, priemer = "—", rozdiel = "—"): RiadokDetailu => ({ metrika, hodnota, priemer, rozdiel, smer: "rovno" });

/** Súčty mesiacov za štvrťrok (sledovatelia = stav na konci, dosah = priemer). */
function spoj(ms: MesiacReportu[], m: string): MesiacReportu {
  const ma = (k: keyof MesiacReportu) => ms.some((x) => x[k] !== undefined);
  const sum = (k: keyof MesiacReportu) => (ma(k) ? sucet(ms.map((x) => x[k] as number | undefined)) : undefined);
  return {
    m,
    hodiny: sucet(ms.map((x) => x.hodiny)),
    aktivni: Math.max(0, ...ms.map((x) => x.aktivni)),
    novi: sucet(ms.map((x) => x.novi)),
    dopyty: sucet(ms.map((x) => x.dopyty)),
    prestali: sum("prestali"),
    hodinyJerry: sum("hodinyJerry"),
    hodinyTerezka: sum("hodinyTerezka"),
    prijmy: sum("prijmy"),
    naklady: sum("naklady"),
    zisk: sum("zisk"),
    vyplaty: sum("vyplaty"),
    sledovatelia: [...ms].reverse().find((x) => x.sledovatelia !== undefined)?.sledovatelia,
    prirastokIg: sum("prirastokIg"),
    dosahReels: ms.some((x) => x.dosahReels) ? Math.round(priemer(ms.filter((x) => x.dosahReels).map((x) => x.dosahReels as number))) : undefined,
    reklama: sum("reklama"),
    googleTrasy: sum("googleTrasy"),
    googleWeb: sum("googleWeb"),
    breakEven: sum("breakEven"),
    dan: sum("dan"),
    uvodne: sum("uvodne"),
    dopytyReklama: sum("dopytyReklama"),
    obnovaPct: priemerPola(ms, "obnovaPct"),
    prezitiePct: priemerPola(ms, "prezitiePct"),
    retenciaPct: priemerPola(ms, "retenciaPct"),
    odchodyPct: priemerPola(ms, "odchodyPct"),
    apps: sum("apps"),
    ai: sum("ai"),
    vyplataJerry: sum("vyplataJerry"),
    vyplataTerezka: sum("vyplataTerezka"),
    spolocne: ms.some((x) => x.spolocne) ? ms.reduce<Record<string, number>>((a, x) => {
      for (const [k, v] of Object.entries(x.spolocne || {})) a[k] = (a[k] || 0) + v;
      return a;
    }, {}) : undefined,
  };
}

/**
 * Riadok tabuľky: hodnota obdobia proti priemeru histórie.
 * `vyssieJeLepsie` určuje farbu (pri nákladoch je viac horšie).
 */
function riadok(metrika: string, akt: number | undefined, hist: (number | undefined)[], format: (n: number) => string, vyssieJeLepsie = true, vBodoch = false): RiadokDetailu | null {
  if (akt === undefined || !Number.isFinite(akt)) return null;
  const h = definovane(hist).filter((x) => Number.isFinite(x));
  const p = h.length ? priemer(h) : undefined;
  // Percentá (marža, konverzia) sa porovnávajú v percentuálnych bodoch —
  // „marža 26 % je o 465 % nad priemerom" nič nehovorí.
  if (vBodoch && p !== undefined) {
    const b = Math.round(akt - p);
    const smer = Math.abs(b) < 1 ? "rovno" : b > 0 ? "hore" : "dole";
    return { metrika, hodnota: format(akt), priemer: format(p), rozdiel: smer === "rovno" ? "≈" : `${b > 0 ? "▲ +" : "▼ "}${b} p. b.`, smer, dobre: smer === "rovno" ? undefined : (smer === "hore") === vyssieJeLepsie };
  }
  const z = protiPriemeru(akt, p);
  const rozdiel = z.zmena.replace(" priemerom", "").replace("ako priemer", "≈").replace("bez priemeru", "—");
  return { metrika, hodnota: format(akt), priemer: p === undefined ? "—" : format(p), rozdiel, smer: z.smer, dobre: z.smer === "rovno" ? undefined : (z.smer === "hore") === vyssieJeLepsie };
}
const nn = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);
const pct = (n: number) => `${Math.round(n)} %`;
const kcF = (n: number) => `${kc(n)} Kč`;
const cele = (n: number) => kc(n);

/**
 * @param mesiace chronologicky, aspoň cieľový mesiac; ideálne 12 (pre
 *                priemer šiestich mesiacov aj troch štvrťrokov).
 */
export function postavReport(mesiace: MesiacReportu[], ciel: string, druh: "mesiac" | "kvartal", extra: ExtraReportu): Report {
  const zoradene = [...mesiace].filter((x) => x.m <= ciel).sort((a, b) => a.m.localeCompare(b.m));
  let akt: MesiacReportu, historia: MesiacReportu[], seriaMes: MesiacReportu[], nadpis: string, porovnanie: string;

  if (druh === "kvartal") {
    const q = kvartalMesiaca(ciel);
    const rok = ciel.slice(0, 4);
    const kluc = (x: MesiacReportu) => `${x.m.slice(0, 4)}-Q${kvartalMesiaca(x.m)}`;
    const tentoKluc = `${rok}-Q${q}`;
    const tento = zoradene.filter((x) => kluc(x) === tentoKluc);
    akt = spoj(tento, ciel);
    // Celé štvrťroky pred týmto (najviac tri) — neúplný by priemer skreslil.
    const skupiny = new Map<string, MesiacReportu[]>();
    for (const x of zoradene) if (kluc(x) < tentoKluc) skupiny.set(kluc(x), [...(skupiny.get(kluc(x)) || []), x]);
    historia = [...skupiny.entries()].filter(([, v]) => v.length === 3).slice(-3).map(([k, v]) => spoj(v, k));
    seriaMes = tento;
    nadpis = `Q${q} ${rok}`;
    porovnanie = historia.length ? `proti priemeru ${historia.length === 1 ? "minulého štvrťroka" : `posledných ${historia.length} štvrťrokov`}` : "bez porovnania";
  } else {
    akt = zoradene[zoradene.length - 1] || { m: ciel, hodiny: 0, aktivni: 0, novi: 0, dopyty: 0 };
    historia = zoradene.slice(-7, -1);
    seriaMes = zoradene.slice(-7);
    nadpis = nazovMes(ciel);
    nadpis = nadpis.charAt(0).toUpperCase() + nadpis.slice(1);
    porovnanie = historia.length ? `proti priemeru ${historia.length === 1 ? "minulého mesiaca" : `posledných ${historia.length} mesiacov`}` : "bez porovnania";
  }
  const popisSerie = seriaMes.map((x) => mesKratko(x.m).slice(0, 3));
  const h = <K extends keyof MesiacReportu>(k: K) => historia.map((x) => x[k] as number | undefined);
  const priem = <K extends keyof MesiacReportu>(k: K) => { const v = definovane(h(k)); return v.length ? priemer(v) : undefined; };
  const naKlienta = (x: MesiacReportu) => (x.aktivni ? x.hodiny / x.aktivni : undefined);
  const marza = (x: MesiacReportu) => (x.prijmy && x.zisk !== undefined ? (x.zisk / x.prijmy) * 100 : undefined);
  const naHodinu = (x: MesiacReportu) => (x.prijmy && x.hodiny ? x.prijmy / x.hodiny : undefined);
  const konverzia = (x: MesiacReportu) => (x.dopyty ? (x.novi / x.dopyty) * 100 : undefined);
  /** Prevádzkový break-even: náklady bez výplat zakladateľov. */
  const beBezOdmien = (x: MesiacReportu) => (x.naklady !== undefined && x.vyplaty !== undefined ? x.naklady - x.vyplaty : undefined);
  const nadBe = (x: MesiacReportu) => (x.prijmy !== undefined && x.breakEven !== undefined ? x.prijmy - x.breakEven : undefined);
  /** Koľko hodín treba odtrénovať, aby tržby pokryli break-even (pri tržbe na hodinu obdobia). */
  const hodinNaBe = (x: MesiacReportu) => { const t = naHodinu(x); return t && x.breakEven !== undefined ? x.breakEven / t : undefined; };

  // Strop hodín (EOS Life, Company of One): pri kvartáli trojnásobok.
  const nasobok = druh === "kvartal" ? 3 : 1;
  const nadStropom: string[] = [];
  const stropRiadky: RiadokDetailu[] = [];
  for (const [kto, hod, strop] of [["Jerry", akt.hodinyJerry, extra.strop?.jerry], ["Terezka", akt.hodinyTerezka, extra.strop?.terezka]] as const) {
    if (hod === undefined || !strop) continue;
    const pctStropu = Math.round((hod / (strop * nasobok)) * 100);
    if (pctStropu > 100) nadStropom.push(`${kto} (${pctStropu} %)`);
    stropRiadky.push({ metrika: `Vyťaženie voči stropu — ${kto}`, hodnota: `${kc(hod)} / ${kc(strop * nasobok)} h`, priemer: "—", rozdiel: `${pctStropu} %`, smer: pctStropu > 100 ? "hore" : "rovno", dobre: pctStropu > 100 ? false : undefined });
  }

  // 1 · MÁME DOSŤ PRÁCE?
  const pHodin = priem("hodiny");
  const pomer = pHodin ? akt.hodiny / pHodin : 1;
  const sPraca: Semafor = pomer >= 0.95 ? "z" : pomer >= 0.8 ? "o" : "c";
  const praca: OtazkaReportu = {
    id: "praca", otazka: "Máme dosť práce?", semafor: sPraca,
    odpoved: sPraca === "z"
      ? `Áno. ${kc(akt.hodiny)} hodín${pHodin ? ` pri priemere ${kc(pHodin)}` : ""}, ${kc(akt.aktivni)} klientov trénovalo.`
      : `${sPraca === "o" ? "Menej než zvyčajne" : "Výrazne menej než zvyčajne"}: ${kc(akt.hodiny)} hodín pri priemere ${kc(pHodin || 0)}.`,
    hlavne: { hodnota: Math.round(akt.hodiny), jednotka: "hodín", ...protiPriemeru(akt.hodiny, pHodin), seria: seriaMes.map((x) => x.hodiny), popisSerie },
    detail: nn([
      riadok("Odtrénované hodiny", akt.hodiny, h("hodiny"), cele),
      riadok(druh === "kvartal" ? "Klienti (najviac v mesiaci)" : "Klienti, ktorí trénovali", akt.aktivni, h("aktivni"), cele),
      riadok("Hodín na klienta", naKlienta(akt), historia.map(naKlienta), (n) => n.toFixed(1).replace(".", ",")),
      riadok("Hodiny — Jerry", akt.hodinyJerry, h("hodinyJerry"), cele),
      riadok("Hodiny — Terezka", akt.hodinyTerezka, h("hodinyTerezka"), cele),
      ...stropRiadky,
    ]),
    zoznamy: [],
    akcia: nadStropom.length
      ? `Nad stropom hodín: ${nadStropom.join(", ")} — nových klientov dávať tomu, kto má voľno, alebo povedať „nie".`
      : extra.odmlcani > 0
      ? `${extra.odmlcani} ${extra.odmlcani === 1 ? "aktívny klient netrénoval" : extra.odmlcani <= 4 ? "aktívni klienti netrénovali" : "aktívnych klientov netrénovalo"} — ozvi sa im skôr, než vypadnú z rytmu.`
      : (akt.prestali || 0) > (priem("prestali") || 0) + 1
        ? `Prestalo chodiť ${kc(akt.prestali || 0)} klientov (priemer ${kc(priem("prestali") || 0)}) — zisti prečo, kým je to čerstvé.`
        : sPraca === "z" ? "Držať — dovolenky ohlasovať klientom dopredu, aby sa hodiny presunuli, nie stratili." : "Doplň voľné okná v kalendári ponukou termínov klientom, ktorí chodia menej.",
  };

  // 2 · ZARÁBAME? — z P&L, nie z banky.
  let peniaze: OtazkaReportu;
  const vydajeZoznam = (extra.topVydaje || []).slice(0, 3).map((v) => `${v.nazov} — ${kc(v.suma)} Kč`);
  if (akt.zisk === undefined || akt.prijmy === undefined) {
    peniaze = {
      id: "peniaze", otazka: "Zarábame?", semafor: "o",
      odpoved: "P&L za toto obdobie ešte nie je hotové — zisk sa nedá povedať.",
      hlavne: { hodnota: 0, jednotka: "Kč zisk", zmena: "chýba P&L", smer: "rovno", seria: seriaMes.map((x) => x.zisk || 0), popisSerie, chyba: true },
      detail: [], zoznamy: vydajeZoznam.length ? [{ nadpis: "Najväčšie náklady", polozky: vydajeZoznam }] : [],
      akcia: extra.zositChyba ? "Doplň zošit hotovosti — bez neho P&L nie je úplné." : "Dokonči uzávierku (Fio, zošit), potom sa zisk ukáže.",
    };
  } else {
    const pZisk = priem("zisk");
    const sPeniaze: Semafor = akt.zisk <= 0 ? "c" : pZisk === undefined || akt.zisk >= pZisk * 0.9 ? "z" : "o";
    const m = marza(akt) || 0;
    peniaze = {
      id: "peniaze", otazka: "Zarábame?", semafor: sPeniaze,
      odpoved: akt.zisk <= 0
        ? `Nie. Náklady ${kc(akt.naklady || 0)} Kč prevýšili tržby ${kc(akt.prijmy)} Kč.`
        : `${sPeniaze === "z" ? "Áno" : "Áno, ale menej než zvyčajne"}. Zisk ${kc(akt.zisk)} Kč${pZisk !== undefined ? ` pri priemere ${kc(pZisk)} Kč` : ""}, marža ${Math.round(m)} %.`,
      hlavne: { hodnota: Math.round(akt.zisk), jednotka: "Kč zisk", ...protiPriemeru(akt.zisk, pZisk), seria: seriaMes.map((x) => x.zisk || 0), popisSerie },
      detail: nn([
        riadok("Tržby", akt.prijmy, h("prijmy"), kcF),
        riadok("Náklady vrátane výplat", akt.naklady, h("naklady"), kcF, false),
        riadok("Zisk", akt.zisk, h("zisk"), kcF),
        riadok("Marža", marza(akt), historia.map(marza), pct, true, true),
        riadok("Break-even (tržby, pri ktorých je zisk 0)", akt.breakEven, h("breakEven"), kcF, false),
        riadok("Tržby nad break-even", nadBe(akt), historia.map(nadBe), kcF),
        riadok("Tržba na hodinu", naHodinu(akt), historia.map(naHodinu), kcF),
        riadok("Hodín na break-even", hodinNaBe(akt), historia.map(hodinNaBe), cele, false),
        riadok("Break-even bez odmien zakladateľov", beBezOdmien(akt), historia.map(beBezOdmien), kcF, false),
        riadok("Aplikácie spolu", akt.apps, h("apps"), kcF, false),
        riadok("z toho AI (Claude, ChatGPT, Perplexity…)", akt.ai, h("ai"), kcF, false),
        riadok("Výplaty zakladateľov", akt.vyplaty, h("vyplaty"), kcF),
        extra.rezervaMesiacov != null ? riadokText("Rezerva (teraz)", `${extra.rezervaMesiacov.toFixed(1).replace(".", ",")} mesiaca`, "cieľ ≥ 3", extra.rezervaMesiacov >= 3 ? "✓" : "pod prahom") : null,
        extra.predplateneHodiny !== undefined ? riadokText("Predplatené neodtrénované hodiny (teraz)", `${kc(extra.predplateneHodiny)} h`) : null,
        extra.dlzne !== undefined ? riadokText("Dlhy klientov (teraz)", `${kc(extra.dlzne)} Kč`) : null,
      ]),
      zoznamy: [
        ...(vydajeZoznam.length ? [{ nadpis: "Najväčšie náklady (bez výplat)", polozky: vydajeZoznam }] : []),
        ...(akt.prijmy ? [{ nadpis: "Kam išli tržby (Profit First: 5 / 50 / – / 30)", polozky: [
          `Zisk — ${Math.round(((akt.zisk || 0) / akt.prijmy) * 100)} %`,
          `Odmeny zakladateľov — ${Math.round(((akt.vyplaty || 0) / akt.prijmy) * 100)} %`,
          `Daň a odvody (paušál) — ${Math.round(((akt.dan || 0) / akt.prijmy) * 100)} %`,
          `Prevádzka — ${Math.round((((akt.naklady || 0) - (akt.vyplaty || 0) - (akt.dan || 0)) / akt.prijmy) * 100)} %`,
        ] }] : []),
      ],
      akcia: extra.zositChyba
        ? "Doplň zošit hotovosti — kým chýba, zisk je nadhodnotený o hotovostné výdavky."
        : (akt.naklady || 0) > (priem("naklady") || Infinity) * 1.15 && extra.topVydaje?.[0]
          ? `Náklady sú ${protiPriemeru(akt.naklady || 0, priem("naklady")).zmena}. Najväčší: ${extra.topVydaje[0].nazov} (${kc(extra.topVydaje[0].suma)} Kč) — patrí celý do tohto obdobia?`
          : nadBe(akt) !== undefined && (nadBe(akt) as number) < 0
            ? `Tržby sú ${kc(-(nadBe(akt) as number))} Kč pod break-even — to je ${kc(-(nadBe(akt) as number) / (naHodinu(akt) || 1))} hodín navyše, ktoré chýbali.`
            : (akt.ai || 0) > (priem("ai") || Infinity) * 1.3
              ? `AI stálo ${kc(akt.ai || 0)} Kč (priemer ${kc(priem("ai") || 0)}) — over, ktoré predplatné je navyše.`
              : sPeniaze === "z" ? "Držať." : "Tržby sú pod priemerom — pozri, komu končí balíček a kto ešte nekúpil ďalší.",
    };
  }

  // 3 · PRICHÁDZAJÚ NOVÍ ĽUDIA?
  const pDopyty = priem("dopyty") || 0;
  const sNovi: Semafor = akt.dopyty >= pDopyty && akt.novi >= 1 ? "z" : akt.dopyty >= pDopyty * 0.7 ? "o" : "c";
  const pDosah = priem("dosahReels");
  const bezReklamy = (akt.reklama || 0) < 100;
  const novi: OtazkaReportu = {
    id: "novi", otazka: "Prichádzajú noví ľudia?", semafor: sNovi,
    odpoved: `${kc(akt.dopyty)} dopytov${pDopyty ? ` pri priemere ${kc(pDopyty)}` : ""}, ${noviKlienti(akt.novi)}`
      + (akt.prirastokIg !== undefined ? `; Instagram ${akt.prirastokIg >= 0 ? "+" : ""}${kc(akt.prirastokIg)} sledovateľov${bezReklamy ? " bez reklamy" : ` pri reklame ${kc(akt.reklama || 0)} Kč`}` : "") + ".",
    hlavne: { hodnota: akt.dopyty, jednotka: "dopytov", ...protiPriemeru(akt.dopyty, priem("dopyty")), seria: seriaMes.map((x) => x.dopyty), popisSerie },
    detail: nn([
      riadok("Dopyty", akt.dopyty, h("dopyty"), cele),
      riadok("Noví klienti", akt.novi, h("novi"), cele),
      riadokText("Lievik: dopyty → úvodné → noví klienti", `${kc(akt.dopyty)} → ${akt.uvodne ?? "?"} → ${kc(akt.novi)}`),
      riadok("Z dopytu klient", konverzia(akt), historia.map(konverzia), pct, true, true),
      akt.dopytyReklama && akt.reklama ? riadokText("Reklama na 1 dopyt z reklamy", `${kc(akt.reklama / akt.dopytyReklama)} Kč`, "—", `${akt.dopytyReklama} dopytov`) : null,
      extra.odporucatelia !== undefined ? riadokText("Klienti, ktorí za 12 mes. niekoho priviedli", `${extra.odporucatelia}${akt.aktivni ? ` · ${Math.round((extra.odporucatelia / akt.aktivni) * 100)} %` : ""}`) : null,
      riadok("Prírastok sledovateľov IG", akt.prirastokIg, h("prirastokIg"), (n) => `${n >= 0 ? "+" : ""}${kc(n)}`),
      riadok("Priemerný dosah reels", akt.dosahReels, h("dosahReels"), cele),
      riadok("Reklama (Meta)", akt.reklama, h("reklama"), kcF, false),
      riadok("Google profil — trasa", akt.googleTrasy, h("googleTrasy"), cele),
      riadok("Google profil — klik na web", akt.googleWeb, h("googleWeb"), cele),
    ]),
    zoznamy: [
      ...(extra.zdroje?.length ? [{ nadpis: "Odkiaľ prišli dopyty", polozky: extra.zdroje.map((z) => `${z.zdroj} — ${z.pocet}`) }] : []),
      ...(extra.najlepsiReel ? [{ nadpis: "Najlepší reels", polozky: [`„${extra.najlepsiReel.hook.slice(0, 90)}${extra.najlepsiReel.hook.length > 90 ? "…" : ""}" — ${kc(extra.najlepsiReel.views)} zhliadnutí`] }] : []),
      ...(akt.sledovatelia ? [{ nadpis: "Sledovatelia Instagram", polozky: [`${kc(akt.sledovatelia)} na konci obdobia`] }] : []),
    ],
    akcia: akt.dosahReels && pDosah && akt.dosahReels < pDosah * 0.8
      ? `Dosah reels ${kc(akt.dosahReels)} je pod priemerom ${kc(pDosah)}. Natoč príbeh klienta — v dátach majú najväčší dosah, teoretické videá najmenší.`
      : bezReklamy && (akt.prirastokIg ?? 0) <= 0
        ? "Bez reklamy sledovatelia neprirastajú — rozhodni, či v ďalšom mesiaci pustiť reklamu."
        : akt.dopyty > 0
          ? `Odpovedaj na dopyty do 24 hodín — z ${kc(akt.dopyty)} dopytov ${akt.novi >= 2 && akt.novi <= 4 ? "sú" : "je"} ${noviKlienti(akt.novi)}.`
          : "Žiadny dopyt — skontroluj, či formuláre na webe fungujú (nočná kontrola) a či beží reklama.",
  };

  // 4 · OSOBNÉ FINANCIE — výplaty a spoločné výdavky domácnosti po kategóriách
  // (Jerry, 8. 10. 2026: „nájom spoločné 23k — prečo to mám vidieť medzi
  // nákladmi? To patrí do osobných financií, kde sú aj výplaty").
  const spolocneSpolu = (x: MesiacReportu) => (x.spolocne ? Object.values(x.spolocne).reduce((a, v) => a + v, 0) : undefined);
  const domov = (x: MesiacReportu) => (x.vyplataJerry !== undefined || x.vyplataTerezka !== undefined ? (x.vyplataJerry || 0) + (x.vyplataTerezka || 0) : undefined);
  const kategorie = Object.entries(akt.spolocne || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const histSpol = historia.map(spolocneSpolu);
  const pSpolocne = definovane(histSpol).length ? priemer(definovane(histSpol)) : undefined;
  const sOsobne: Semafor = spolocneSpolu(akt) !== undefined && pSpolocne && (spolocneSpolu(akt) as number) > pSpolocne * 1.2 ? "o" : "z";
  const najvacsiaKat = kategorie[0];
  const osobne: OtazkaReportu = {
    id: "osobne", otazka: "Koľko si berieme domov?", semafor: sOsobne,
    odpoved: domov(akt) !== undefined
      ? `Výplaty spolu ${kc(domov(akt) as number)} Kč${spolocneSpolu(akt) !== undefined ? `; spoločné výdavky domácnosti ${kc(spolocneSpolu(akt) as number)} Kč${pSpolocne ? ` (priemer ${kc(pSpolocne)})` : ""}` : ""}.`
      : "Výplaty za obdobie ešte nie sú v P&L.",
    hlavne: { hodnota: Math.round(domov(akt) || 0), jednotka: "Kč výplaty", ...protiPriemeru(domov(akt) || 0, (() => { const v = definovane(historia.map(domov)); return v.length ? priemer(v) : undefined; })()), seria: seriaMes.map((x) => domov(x) || 0), popisSerie, chyba: domov(akt) === undefined },
    detail: nn([
      riadok("Výplata — Jerry", akt.vyplataJerry, h("vyplataJerry"), kcF),
      riadok("Výplata — Terezka", akt.vyplataTerezka, h("vyplataTerezka"), kcF),
      riadok("Spoločné výdavky spolu", spolocneSpolu(akt), histSpol, kcF, false),
      ...kategorie.map(([k, v]) => riadok(`· ${k}`, v, historia.map((x) => x.spolocne?.[k] ?? 0), kcF, false)),
    ]),
    zoznamy: [],
    akcia: sOsobne === "o" && najvacsiaKat
      ? `Spoločné výdavky sú nad priemerom — najviac ${najvacsiaKat[0]} (${kc(najvacsiaKat[1])} Kč).`
      : "Bez zmeny — spoločné výdavky sú v priemere.",
  };

  // 2 · DRŽIA SA KLIENTI? (obnova, prežitie, retencia, odchody)
  const pct0 = (n: number) => `${Math.round(n)} %`;
  const obn = akt.obnovaPct;
  const sKlienti: Semafor = obn === undefined ? "o" : obn >= 75 && (akt.retenciaPct ?? 100) >= 70 ? "z" : obn >= 60 ? "o" : "c";
  const bezObnovy = extra.bezObnovy || [];
  const den = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
  const klienti: OtazkaReportu = {
    id: "klienti", otazka: "Držia sa klienti?", semafor: sKlienti,
    odpoved: [
      extra.obnova ? `Balíček obnovilo ${extra.obnova.obnovene} z ${extra.obnova.skoncilo}` : "",
      extra.retencia?.kohorta ? `z klientov spred pol roka trénuje ${extra.retencia.ostali} z ${extra.retencia.kohorta}` : "",
      extra.prezitie?.novi ? `z nováčikov spred 4 mesiacov po 100 dňoch trénuje ${extra.prezitie.ostali} z ${extra.prezitie.novi}` : "",
    ].filter(Boolean).join("; ").replace(/^./, (c) => c.toUpperCase()) + ".",
    hlavne: { hodnota: Math.round(obn ?? 0), jednotka: "% obnovilo balíček", ...protiPriemeru(obn ?? 0, priem("obnovaPct")), seria: seriaMes.map((x) => x.obnovaPct ?? 0), popisSerie, chyba: obn === undefined },
    detail: nn([
      riadok("Obnova balíčkov (do 30 dní)", akt.obnovaPct, h("obnovaPct"), pct0, true, true),
      riadok("Prežitie prvých 100 dní", akt.prezitiePct, h("prezitiePct"), pct0, true, true),
      riadok("Retencia po 6 mesiacoch (cieľ 80 %)", akt.retenciaPct, h("retenciaPct"), pct0, true, true),
      riadok("Odchody", akt.odchodyPct, h("odchodyPct"), pct0, false, true),
      riadok("Prestali chodiť (počet)", akt.prestali, h("prestali"), cele, false),
      extra.hodnotaKlienta?.pocet ? riadokText("Hodnota klienta za celú spoluprácu", `${kc(extra.hodnotaKlienta.priemer)} Kč`, `${extra.hodnotaKlienta.mesiacov.toFixed(1).replace(".", ",")} mes.`, `${extra.hodnotaKlienta.pocet} klientov`) : null,
    ]),
    zoznamy: bezObnovy.length ? [{ nadpis: "Skončil balíček, nový neprišiel", polozky: bezObnovy.map((b) => `${b.klient} (${den(b.do)})`) }] : [],
    akcia: bezObnovy.length
      ? `Ozvi sa ${bezObnovy.length === 1 ? "klientovi" : "klientom"} bez obnovy: ${bezObnovy.map((b) => b.klient).join(", ")}.`
      : extra.prezitie?.novi && extra.prezitie.ostali / extra.prezitie.novi < 0.6
        ? "Nováčikovia odchádzajú v prvých 100 dňoch — po 3. tréningu sa ich spýtaj, ako sa im darí."
        : "Držať — obnovy aj návraty sú v poriadku.",
  };

  // 5 · NESTOJÍME NA PÁR ĽUĎOCH? (Built to Sell, E-Myth)
  const hodSpolu = (akt.hodinyJerry || 0) + (akt.hodinyTerezka || 0);
  const podiel = (x: MesiacReportu, kto: "hodinyJerry" | "hodinyTerezka") => { const sp = (x.hodinyJerry || 0) + (x.hodinyTerezka || 0); return sp ? ((x[kto] || 0) / sp) * 100 : undefined; };
  const top = extra.topKlient;
  const sKonc: Semafor = top && top.podiel > 15 ? "c" : "z";
  const neutral = (x: RiadokDetailu | null) => (x ? { ...x, dobre: undefined } : null);
  const koncentraciaQ: OtazkaReportu = {
    id: "koncentracia", otazka: "Nestojíme na pár ľuďoch?", semafor: sKonc,
    odpoved: top ? `Najväčší klient tvorí ${Math.round(top.podiel)} % tržieb (prah 15 %), horných 20 % klientov ${Math.round(extra.top20 || 0)} %.` : "Tržby podľa klientov za obdobie nie sú.",
    hlavne: { hodnota: Math.round(top?.podiel || 0), jednotka: "% tržieb od najväčšieho klienta", zmena: top && top.podiel > 15 ? "nad prahom 15 %" : "pod prahom 15 %", smer: "rovno", seria: [], popisSerie: [], chyba: !top },
    detail: nn([
      top ? riadokText("Najväčší klient z tržieb", pct0(top.podiel), "prah ≤ 15 %", top.podiel > 15 ? "nad" : "✓") : null,
      extra.top20 !== undefined ? riadokText("Horných 20 % klientov z tržieb", pct0(extra.top20)) : null,
      hodSpolu ? neutral(riadok("Hodiny odtrénované Jerrym", podiel(akt, "hodinyJerry"), historia.map((x) => podiel(x, "hodinyJerry")), pct0, true, true)) : null,
      hodSpolu ? neutral(riadok("Hodiny odtrénované Terezkou", podiel(akt, "hodinyTerezka"), historia.map((x) => podiel(x, "hodinyTerezka")), pct0, true, true)) : null,
    ]),
    zoznamy: [],
    akcia: top && top.podiel > 15
      ? `${top.klient} tvorí ${Math.round(top.podiel)} % tržieb — keby odišiel, chýba to hneď.`
      : nadStropom.length ? "Nových klientov dávať trénerovi, ktorý je pod stropom." : "Bez zmeny.",
  };

  return { druh, nadpis, porovnanie, otazky: [praca, klienti, peniaze, novi, koncentraciaQ, osobne] };
}

/** Report ako markdown pre tlač do PDF (`vytlacReport`), grafy cez značky. */
export function reportNaMarkdown(r: Report): string {
  const ZN = { z: "✓", o: "!", c: "✕" } as const;
  const out: string[] = [`# ${r.druh === "kvartal" ? `Kvartálny report ${r.nadpis}` : `Report — ${r.nadpis}`}`, "", `*${r.porovnanie}*`, ""];
  for (const o of r.otazky) {
    out.push(`## ${ZN[o.semafor]} ${o.otazka}`, "", o.odpoved, "");
    out.push(`**${o.hlavne.chyba ? "—" : kc(o.hlavne.hodnota)} ${o.hlavne.jednotka}** · ${o.hlavne.zmena}`, "", `::graf:${o.id}::`, "");
    if (o.detail.length) {
      out.push("| | Toto obdobie | Priemer | Rozdiel |", "|---|---:|---:|---:|");
      for (const d of o.detail) out.push(`| ${d.metrika} | ${d.hodnota} | ${d.priemer} | ${d.rozdiel} |`);
      out.push("");
    }
    for (const z of o.zoznamy) { out.push(`**${z.nadpis}**`); for (const p of z.polozky) out.push(`- ${p}`); out.push(""); }
    out.push(`**Urob:** ${o.akcia}`, "");
  }
  return out.join("\n");
}
