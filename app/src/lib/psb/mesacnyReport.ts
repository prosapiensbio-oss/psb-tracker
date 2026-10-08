/**
 * MESAČNÝ A KVARTÁLNY REPORT (Jerry, 8. 10. 2026: „postav C s kartami z A").
 *
 * Tri otázky — Máme dosť práce? Zarábame? Prichádzajú noví ľudia? — každá
 * so semaforom, jedným veľkým číslom so zmenou a krivkou (karta z návrhu A)
 * a JEDNOU vecou, ktorú s tým urobiť (návrh C; Jerryho pravidlo „číslo bez
 * akcie je zbytočné"). Náčrt: navrhy-kokpitu/mesacny-report.html.
 *
 * Tu je len výpočet nad hotovými mesačnými číslami. Čísla skladá App z tých
 * istých zdrojov, ktoré ukazujú obrazovky (P&L z `pnlCalc`, hodiny zo sedení,
 * Instagram z `kanaly_mesiace`) — report nič nepočíta druhýkrát po svojom.
 */

export type MesiacReportu = {
  m: string;
  hodiny: number;
  aktivni: number;
  novi: number;
  dopyty: number;
  /** P&L — chýba, keď mesiac v P&L nie je. */
  prijmy?: number;
  naklady?: number;
  zisk?: number;
  sledovatelia?: number;
  prirastokIg?: number;
  dosahReels?: number;
  reklama?: number;
};

export type ExtraReportu = {
  /** Aktívni klienti, ktorí v mesiaci netrénovali. */
  odmlcani: number;
  /** Zošit hotovosti za mesiac nie je zapísaný → P&L nie je úplné. */
  zositChyba: boolean;
  /** Najväčšia nákladová položka mesiaca. */
  topVydaj?: { nazov: string; suma: number };
};

export type Semafor = "z" | "o" | "c";
export type OtazkaReportu = {
  id: "praca" | "peniaze" | "novi";
  otazka: string;
  semafor: Semafor;
  odpoved: string;
  hlavne: { hodnota: number; jednotka: string; zmena: string; smer: "hore" | "dole" | "rovno"; seria: number[]; popisSerie: string[] };
  cisla: { hodnota: string; popis: string }[];
  akcia: string;
};
export type Report = { druh: "mesiac" | "kvartal"; nadpis: string; porovnanie: string; otazky: OtazkaReportu[] };

const MES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
export const nazovMes = (m: string) => `${MES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mesKratko = (m: string) => MES[Number(m.slice(5, 7)) - 1];
const INSTR = ["januárom", "februárom", "marcom", "aprílom", "májom", "júnom", "júlom", "augustom", "septembrom", "októbrom", "novembrom", "decembrom"];
const DATIV = ["januáru", "februáru", "marcu", "aprílu", "máju", "júnu", "júlu", "augustu", "septembru", "októbru", "novembru", "decembru"];
export const kvartalMesiaca = (m: string) => Math.ceil(Number(m.slice(5, 7)) / 3);
/** Je to posledný mesiac štvrťroka (marec, jún, september, december)? */
export const koniecKvartalu = (m: string) => Number(m.slice(5, 7)) % 3 === 0;

const kc = (n: number) => `${Math.round(n).toLocaleString("sk-SK").replace(/,/g, " ")}`;
const sucet = (xs: (number | undefined)[]) => xs.reduce<number>((a, x) => a + (x || 0), 0);
const priemer = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);

function zmena(teraz: number, predtym: number | undefined, nazovPredtym: string, dativ = nazovPredtym): { zmena: string; smer: "hore" | "dole" | "rovno" } {
  if (predtym === undefined || !Number.isFinite(predtym)) return { zmena: "bez porovnania", smer: "rovno" };
  if (predtym === 0) return teraz === 0 ? { zmena: `ako ${nazovPredtym}`, smer: "rovno" } : { zmena: `${nazovPredtym} 0`, smer: teraz > 0 ? "hore" : "dole" };
  const p = Math.round(((teraz - predtym) / Math.abs(predtym)) * 100);
  if (Math.abs(p) < 3) return { zmena: `ako ${nazovPredtym}`, smer: "rovno" };
  return { zmena: `${p > 0 ? "▲" : "▼"} ${Math.abs(p)} % oproti ${dativ}`, smer: p > 0 ? "hore" : "dole" };
}

/** Súčty mesiacov za štvrťrok (sledovatelia = stav na konci, dosah = priemer). */
function spoj(ms: MesiacReportu[], m: string): MesiacReportu {
  const ma = (k: keyof MesiacReportu) => ms.some((x) => x[k] !== undefined);
  return {
    m,
    hodiny: sucet(ms.map((x) => x.hodiny)),
    aktivni: Math.max(0, ...ms.map((x) => x.aktivni)),
    novi: sucet(ms.map((x) => x.novi)),
    dopyty: sucet(ms.map((x) => x.dopyty)),
    prijmy: ma("prijmy") ? sucet(ms.map((x) => x.prijmy)) : undefined,
    naklady: ma("naklady") ? sucet(ms.map((x) => x.naklady)) : undefined,
    zisk: ma("zisk") ? sucet(ms.map((x) => x.zisk)) : undefined,
    sledovatelia: [...ms].reverse().find((x) => x.sledovatelia !== undefined)?.sledovatelia,
    prirastokIg: ma("prirastokIg") ? sucet(ms.map((x) => x.prirastokIg)) : undefined,
    dosahReels: ms.some((x) => x.dosahReels) ? Math.round(priemer(ms.filter((x) => x.dosahReels).map((x) => x.dosahReels as number))) : undefined,
    reklama: ma("reklama") ? sucet(ms.map((x) => x.reklama)) : undefined,
  };
}

/**
 * @param mesiace chronologicky, aspoň cieľový mesiac; pre porovnanie ideálne 6
 *                (mesiac) alebo 6 (kvartál = tento a predošlý štvrťrok).
 */
export function postavReport(mesiace: MesiacReportu[], ciel: string, druh: "mesiac" | "kvartal", extra: ExtraReportu): Report {
  const zoradene = [...mesiace].filter((x) => x.m <= ciel).sort((a, b) => a.m.localeCompare(b.m));
  let akt: MesiacReportu, pred: MesiacReportu | undefined, historia: MesiacReportu[], seriaMes: MesiacReportu[], nazovPred: string, dativPred: string, nadpis: string;

  if (druh === "kvartal") {
    const q = kvartalMesiaca(ciel);
    const rok = ciel.slice(0, 4);
    const vKvartali = (x: MesiacReportu, rr: string, qq: number) => x.m.slice(0, 4) === rr && kvartalMesiaca(x.m) === qq;
    const tento = zoradene.filter((x) => vKvartali(x, rok, q));
    const [pr, pq] = q === 1 ? [String(Number(rok) - 1), 4] : [rok, q - 1];
    const minuly = zoradene.filter((x) => vKvartali(x, pr, pq));
    akt = spoj(tento, ciel);
    pred = minuly.length ? spoj(minuly, `${pr}-Q${pq}`) : undefined;
    historia = pred ? [pred] : [];
    seriaMes = tento;
    nazovPred = `Q${pq}`;
    dativPred = nazovPred;
    nadpis = `Q${q} ${rok}`;
  } else {
    akt = zoradene[zoradene.length - 1] || { m: ciel, hodiny: 0, aktivni: 0, novi: 0, dopyty: 0 };
    pred = zoradene[zoradene.length - 2];
    historia = zoradene.slice(-7, -1);
    seriaMes = zoradene.slice(-6);
    nazovPred = pred ? mesKratko(pred.m) : "";
    dativPred = pred ? DATIV[Number(pred.m.slice(5, 7)) - 1] : "";
    nadpis = nazovMes(ciel);
    nadpis = nadpis.charAt(0).toUpperCase() + nadpis.slice(1);
  }
  const popisSerie = seriaMes.map((x) => mesKratko(x.m).slice(0, 3));

  // 1 · MÁME DOSŤ PRÁCE? — hodiny proti priemeru predošlých období.
  const priemerHodin = priemer(historia.map((x) => x.hodiny).filter((x) => x > 0));
  const pomerHodin = priemerHodin ? akt.hodiny / priemerHodin : 1;
  const sPraca: Semafor = pomerHodin >= 0.95 ? "z" : pomerHodin >= 0.8 ? "o" : "c";
  const praca: OtazkaReportu = {
    id: "praca", otazka: "Máme dosť práce?", semafor: sPraca,
    odpoved: sPraca === "z"
      ? `Áno. ${kc(akt.hodiny)} hodín${priemerHodin ? `, priemer ${druh === "kvartal" ? "minulého štvrťroka" : "posledných mesiacov"} ${kc(priemerHodin)}` : ""}.`
      : `${sPraca === "o" ? "Menej než zvyčajne" : "Výrazne menej než zvyčajne"}: ${kc(akt.hodiny)} hodín proti priemeru ${kc(priemerHodin)}.`,
    hlavne: { hodnota: Math.round(akt.hodiny), jednotka: "hodín", ...zmena(akt.hodiny, pred?.hodiny, nazovPred, dativPred), seria: seriaMes.map((x) => x.hodiny), popisSerie },
    cisla: [
      { hodnota: kc(akt.aktivni), popis: druh === "kvartal" ? "aktívnych (najviac v mesiaci)" : "aktívnych klientov" },
      { hodnota: kc(akt.novi), popis: "noví klienti" },
      { hodnota: kc(extra.odmlcani), popis: "aktívni bez tréningu" },
    ],
    akcia: extra.odmlcani > 0
      ? `${extra.odmlcani} ${extra.odmlcani === 1 ? "aktívny klient netrénoval" : "aktívnych klientov netrénovalo"} — ozvi sa im skôr, než vypadnú z rytmu.`
      : sPraca === "z" ? "Nič meniť — len dovolenky ohlasovať klientom dopredu, aby sa hodiny presunuli, nie stratili." : "Pozri kalendár na ďalší mesiac a doplň voľné okná ponukou termínov.",
  };

  // 2 · ZARÁBAME? — zisk z P&L (nie z banky).
  let peniaze: OtazkaReportu;
  if (akt.zisk === undefined || akt.prijmy === undefined) {
    peniaze = {
      id: "peniaze", otazka: "Zarábame?", semafor: "o",
      odpoved: "P&L za toto obdobie ešte nie je hotové — zisk sa nedá povedať.",
      hlavne: { hodnota: 0, jednotka: "Kč", zmena: "chýba P&L", smer: "rovno", seria: seriaMes.map((x) => x.zisk || 0), popisSerie },
      cisla: [],
      akcia: extra.zositChyba ? "Doplň zošit hotovosti — bez neho P&L nie je úplné." : "Dokonči uzávierku (Fio, zošit), potom sa zisk ukáže.",
    };
  } else {
    const priemerZisku = priemer(historia.map((x) => x.zisk).filter((x): x is number => x !== undefined));
    const sPeniaze: Semafor = akt.zisk <= 0 ? "c" : !historia.length || akt.zisk >= priemerZisku * 0.9 ? "z" : "o";
    const marza = akt.prijmy > 0 ? Math.round((akt.zisk / akt.prijmy) * 100) : 0;
    peniaze = {
      id: "peniaze", otazka: "Zarábame?", semafor: sPeniaze,
      odpoved: akt.zisk <= 0
        ? `Nie. Náklady ${kc(akt.naklady || 0)} Kč prevýšili tržby ${kc(akt.prijmy)} Kč.`
        : `${sPeniaze === "z" ? "Áno" : "Áno, ale menej než zvyčajne"}. Zisk ${kc(akt.zisk)} Kč, marža ${marza} %.`,
      hlavne: { hodnota: Math.round(akt.zisk), jednotka: "Kč zisk", ...zmena(akt.zisk, pred?.zisk, nazovPred, dativPred), seria: seriaMes.map((x) => x.zisk || 0), popisSerie },
      cisla: [
        { hodnota: `${kc(akt.prijmy)} Kč`, popis: "tržby" },
        { hodnota: `${kc(akt.naklady || 0)} Kč`, popis: "náklady vrátane výplat" },
        { hodnota: `${marza} %`, popis: "marža" },
      ],
      akcia: extra.zositChyba
        ? "Doplň zošit hotovosti — kým chýba, zisk je nadhodnotený o hotovostné výdavky."
        : sPeniaze === "z"
          ? extra.topVydaj ? `Držať. Najväčší náklad bol ${extra.topVydaj.nazov} (${kc(extra.topVydaj.suma)} Kč).` : "Držať."
          : extra.topVydaj ? `Pozri najväčší náklad: ${extra.topVydaj.nazov} (${kc(extra.topVydaj.suma)} Kč) — patrí celý do tohto obdobia?` : "Pozri náklady v uzávierke — čo bolo navyše?",
    };
  }

  // 3 · PRICHÁDZAJÚ NOVÍ ĽUDIA? — dopyty, noví klienti, Instagram.
  const priemerDopytov = priemer(historia.map((x) => x.dopyty));
  const sNovi: Semafor = akt.dopyty >= priemerDopytov && akt.novi >= 1 ? "z" : akt.dopyty >= priemerDopytov * 0.7 ? "o" : "c";
  const priemerDosahu = priemer(historia.map((x) => x.dosahReels || 0).filter((x) => x > 0));
  const bezReklamy = (akt.reklama || 0) < 100;
  const novi: OtazkaReportu = {
    id: "novi", otazka: "Prichádzajú noví ľudia?", semafor: sNovi,
    odpoved: `${kc(akt.dopyty)} dopytov, ${kc(akt.novi)} ${akt.novi === 1 ? "nový klient" : "noví klienti"}`
      + (akt.prirastokIg !== undefined ? `; Instagram ${akt.prirastokIg >= 0 ? "+" : ""}${kc(akt.prirastokIg)} sledovateľov${bezReklamy ? " bez reklamy" : ` pri reklame ${kc(akt.reklama || 0)} Kč`}` : "") + ".",
    hlavne: { hodnota: akt.dopyty, jednotka: "dopytov", ...zmena(akt.dopyty, pred?.dopyty, nazovPred, dativPred), seria: seriaMes.map((x) => x.dopyty), popisSerie },
    cisla: [
      ...(akt.prirastokIg !== undefined ? [{ hodnota: `${akt.prirastokIg >= 0 ? "+" : ""}${kc(akt.prirastokIg)}`, popis: `sledovatelia IG${akt.sledovatelia ? ` (${kc(akt.sledovatelia)})` : ""}` }] : []),
      ...(akt.dosahReels ? [{ hodnota: kc(akt.dosahReels), popis: `dosah reels${priemerDosahu ? ` (priemer ${kc(priemerDosahu)})` : ""}` }] : []),
      { hodnota: `${kc(akt.reklama || 0)} Kč`, popis: "reklama" },
    ],
    akcia: akt.dosahReels && priemerDosahu && akt.dosahReels < priemerDosahu * 0.8
      ? `Dosah reels klesol na ${kc(akt.dosahReels)} (priemer ${kc(priemerDosahu)}). Natoč príbeh klienta — v dátach majú najväčší dosah, teoretické videá najmenší.`
      : bezReklamy && (akt.prirastokIg ?? 0) <= 0
        ? "Bez reklamy sledovatelia neprirastajú — rozhodni, či v ďalšom mesiaci pustiť reklamu."
        : akt.dopyty > 0
          ? `Odpovedaj na dopyty do 24 hodín — z ${kc(akt.dopyty)} dopytov ${akt.novi === 1 ? "je 1 nový klient" : `je ${kc(akt.novi)} nových klientov`}.`
          : "Žiadny dopyt — skontroluj, či formuláre na webe fungujú (nočná kontrola) a či beží reklama.",
  };

  return {
    druh,
    nadpis,
    porovnanie: pred ? `porovnanie s ${druh === "kvartal" ? nazovPred : INSTR[Number(pred.m.slice(5, 7)) - 1]}` : "bez porovnania",
    otazky: [praca, peniaze, novi],
  };
}
