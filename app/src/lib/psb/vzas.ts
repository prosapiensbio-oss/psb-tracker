// VZAS — the financial half of the Tracker: monthly P&L, the two founders'
// salary model, and debt bookkeeping (founders ↔ company, plus the external
// investor). Pure data + pure functions, no browser globals.
//
// PHASE 1 (read-only): the figures below are the validated snapshot from the
// "VZAS 2025" and "VZAS 2026" Excels — 18 months, jan 2025 … jún 2026. Every
// month reconciles to the Excel to the koruna (costs, payouts, revenue, debts);
// the reconciliation is asserted in the extraction, not assumed. Later phases
// replace them with values derived from imported Fio bank statements + Tracker
// Sessions, at which point this file keeps only the calculations.
//
// Why 18 months and not 6: the salary model changed mid-2025 (see SALARY_ERAS)
// and that change is the single most important thing that ever happened to this
// company's numbers. A 6-month window starts after it and so cannot show it.

// Mesiace rastú samy až po dnešok.
//
// Boli natvrdo po jún 2026 a keď prišiel júl, jednoducho nemal kam pristáť:
// tržby aj náklady sa nahrali, ale VZAS o tom mesiaci nevedel. Rovnaká chyba
// by sa opakovala každý mesiac. Excel končí júnom 2026 — všetko po ňom plnia
// importy (PTminder, Fio), takže stačí, aby mesiac existoval.
const POSLEDNY_Z_EXCELU = "2026-06";
const MESIACE_SK = ["Jan", "Feb", "Mar", "Apr", "Máj", "Jún", "Júl", "Aug", "Sep", "Okt", "Nov", "Dec"];

function vygenerujMesiace(): { keys: string[]; labels: string[] } {
  const keys: string[] = [];
  const labels: string[] = [];
  const dnes = new Date();
  // O mesiac dopredu, nech je kam zapísať aj rozbehnutý mesiac.
  const koniec = `${dnes.getFullYear()}-${String(dnes.getMonth() + 1).padStart(2, "0")}`;
  let r = 2025, m = 1;
  for (;;) {
    const k = `${r}-${String(m).padStart(2, "0")}`;
    keys.push(k);
    labels.push(`${MESIACE_SK[m - 1]} ${String(r).slice(2)}`);
    if (k >= koniec) break;
    if (++m > 12) { m = 1; r++; }
    if (keys.length > 240) break; // poistka proti nekonečnu
  }
  return { keys, labels };
}
const _M = vygenerujMesiace();
export const VZAS_MONTHS: string[] = _M.keys;
export const VZAS_MONTH_LABELS: string[] = _M.labels;
const N = VZAS_MONTHS.length;

// Všetky rady v tomto súbore sú prepis Excelu, ktorý končí júnom 2026. Keď
// pribudne mesiac, musia sa dorovnať nulami — inak by index nového mesiaca bol
// `undefined` a každý súčet by skončil ako NaN. Dopĺňa sa na jednom mieste,
// nie ručne v štyridsiatich poliach.
function dorovnaj(v: number[]): number[] {
  while (v.length < N) v.push(0);
  return v;
}

// Index ranges the UI offers as period presets.
// Roky a kvartály sa odvodzujú z mesiacov, nie z ručného zoznamu. Boli natvrdo
// a pri každom novom mesiaci sa museli dopisovať — čo znamená, že sa jeden deň
// zabudnú a filter ticho vynechá časť roka.
export const YEAR_IDX: Record<string, number[]> = (() => {
  const out: Record<string, number[]> = {};
  VZAS_MONTHS.forEach((m, i) => (out[m.slice(0, 4)] ||= []).push(i));
  return out;
})();
export const QUARTERS: { id: string; label: string; idx: number[] }[] = (() => {
  const mapa = new Map<string, number[]>();
  VZAS_MONTHS.forEach((m, i) => {
    const rok = m.slice(0, 4);
    const q = Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1;
    const kluc = `${rok}q${q}`;
    if (!mapa.has(kluc)) mapa.set(kluc, []);
    mapa.get(kluc)!.push(i);
  });
  return [...mapa.entries()].map(([id, idx]) => ({
    id,
    label: `Q${id.slice(-1)} ${id.slice(2, 4)}`,
    idx,
  }));
})();
export const yearOf = (i: number) => VZAS_MONTHS[i].slice(0, 4);

export type Vals = number[]; // one value per month, length N

export type VzasItem = { label: string; values: Vals };
export type VzasGroup = { label: string; items: Record<string, VzasItem> };
export type VzasSection = { label: string; subcategories: Record<string, VzasGroup> };

// ── P&L ──────────────────────────────────────────────────────────────────────
// Rows that only ever existed in one of the two years (MultiBox/WeNet, Freelo,
// Bonus na Finančák, Bitcoin fond, Tlač, Školenia, Opravár, Iné produkty in
// 2025; Štát Jerry/Terezka, Telefón, Atipické in 2026) are kept as their own
// lines rather than merged into today's categories — merging would hide that
// the cost base itself changed. All-zero rows are hidden by the UI.

export const PNL: Record<"fixne" | "variabilne", VzasSection> = {
  fixne: {
    label: "Fixné náklady",
    subcategories: {
      prevadzka: {
        label: "Prevádzka",
        items: {
          najom: { label: "Nájom + energie", values: [44995, 29250, 29250, 29250, 29250, 29250, 29250, 29250, 29250, 29250, 29250, 29250, 29250, 32261, 10000, 48500, 29250, 29250] },
          splatkaJarek: { label: "Splátka Jarek", values: [0, 4000, 4000, 4000, 4000, 0, 0, 4000, 4000, 4000, 4000, 4000, 5000, 5000, 5000, 5000, 5000, 0] },
          statTerezka: { label: "Štát Terezka", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1595, 1595, 1595, 6048, 12264, 5832] },
          statJerry: { label: "Štát Jerry", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9761, 19635, 9761, 9761, 9761] },
          bonusFinancak: { label: "Bonus na Finančák", values: [0, 1218, 0, 0, 0, 0, 0, 18716, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          bitcoinFond: { label: "Bitcoin fond", values: [0, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          fondNaradie: { label: "Fond na náradie", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -10000, 0, 0, 0] },
        },
      },
      marketing: {
        label: "Marketing",
        items: {
          facebook: { label: "Facebook", values: [0, 1299.78, 0, 999.85, 771.31, 1527.33, 1300.79, 296.37, 1980.34, 2019.21, 600, 999.65, 0, 1399, 3794, 3344, 3052, 2162] },
          google: { label: "Google", values: [0, 0, 0, 722.44, 2983.15, 0, 5153.83, 2198.63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          multibox: { label: "MultiBox / WeNet", values: [2192.52, 2192.52, 2192.52, 2192.52, 2192.52, 2192.52, 2192.52, 0, 4385.04, 2192.52, 2192.52, 2192.52, 0, 0, 0, 0, 0, 0] },
          offline: { label: "Offline", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        },
      },
      apps: {
        label: "Apps",
        items: {
          adobe: { label: "Adobe", values: [1880.48, 1864.5, 1554.61, 2040.08, 2028.38, 2021.11, 2007.94, 1994.52, 1979.32, 2283.3, 1970.35, 2053.96, 1973, 1976, 1992, 1982, 465, 464] },
          canva: { label: "Canva", values: [0, 696.06, 0, 700.33, 692.01, 688.39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 800, 0, 0] },
          captions: { label: "Captions", values: [0, 0, 0, 0, 0, 0, 0, 0, 299, 598, 699, 699, 1398, 299, 699, 699, 699, 699] },
          capcut: { label: "CapCut", values: [0, 0, 0, 0, 0, 0, 0, 0, 699, 699, 699, 699, 699, 699, 699, 699, 699, 699] },
          ai: { label: "ChatGPT/Claude/Perplexity/HF", values: [593.63, 594.34, 574.29, 545.98, 546.57, 530.9, 519.73, 522.56, 515.7, 521.14, 522.46, 513.98, 514, 2287, 1074, 1686, 2553, 3550] },
          freelo: { label: "Freelo", values: [1197.9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          idoklad: { label: "i.doklad", values: [532.4, 532.4, 532.4, 532.4, 520.8, 580.8, 580.8, 580.8, 580.8, 580.8, 290.4, 290.4, 290, 290, 290, 290, 290, 290] },
          mailer: { label: "Mailer", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 430.4, 0, 0, 0, 0, 0, 0, 0, 0] },
          metricool: { label: "Metricool", values: [0, 668.56, 652.27, 617.71, 602.33, 594.58, 573.86, 581.65, 573.58, 565.92, 579.61, 566.54, 565, 565, 579, 582, 570, 571] },
          microsoft: { label: "Microsoft", values: [0, 0, 0, 0, 0, 269, 269, 269, 269, 269, 816, 549, 349, 349, 349, 349, 349, 349] },
          ptminder: { label: "PTminder", values: [2143.64, 2137.72, 2137, 2132.37, 2129.17, 2331.84, 0, 1010.72, 1792.09, 2273.59, 987.69, 1567.48, 1568, 2489, 1749, 2296, 1627, 2267] },
          truecoach: { label: "TrueCoach", values: [0, 0, 0, 0, 0, 0, 0, 0, 12.87, 0, 652.82, 638.54, 642, 630, 655, 641, 640, 645] },
          ine: { label: "Iné", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 121, 0, 240, 0, 0, 0] },
        },
      },
    },
  },
  variabilne: {
    label: "Variabilné náklady",
    subcategories: {
      sluzby: {
        label: "Služby",
        items: {
          pravnicka: { label: "Právnička/Účto", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3450, 0, 0, 0, 0, 0] },
          telefon: { label: "Telefón", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1629, 1639, 1702, 1686, 1690] },
          grafik: { label: "Grafik/Ads manager", values: [0, 2250, 2250, 0, 0, 0, 5000, 0, 1500, 0, 0, 0, 0, 2003, 2000, 0, 0, 0] },
          web: { label: "Web/hosting", values: [0, 0, 0, 0, 0, 4103.15, 0, 91.42, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4763] },
          tlac: { label: "Tlač/vizitky", values: [0, 1140.6, 0, 0, 0, 0, 0, 0, 0, 205, 0, 0, 0, 0, 0, 0, 0, 0] },
          skolenie: { label: "Školenia/kurzy", values: [0, 0, 0, 0, 0, 0, 0, 7495, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          opravar: { label: "Opravár", values: [0, 0, 200, 0, 606, 0, 0, 399, 0, 736, 0, 0, 0, 0, 0, 0, 0, 0] },
          teambuilding: { label: "Teambuilding", values: [0, 0, 0, 0, 0, 506, 0, 0, 488.25, 0, 0, 2231.14, 0, 0, 0, 0, 0, 0] },
          ine: { label: "Iné výdaje", values: [0, 0, 0, 0, 18191, 0, 0, 0, 0, 0, 0, 769.51, 0, 0, 469, 550, 0, 3000] },
        },
      },
      produkty: {
        label: "Produkty",
        items: {
          atipicke: { label: "Atipické nákupy", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 355, 0, 0] },
          merch: { label: "Merch/doplnky", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          ine: { label: "Iné produkty", values: [432, 0, 0, 0, 0, 0, 0, 0, 0, 0, 776.36, 0, 0, 0, 0, 0, 0, 0] },
        },
      },
      prevadzka2: {
        label: "Prevádzka",
        items: {
          pomocky: { label: "Pomôcky na cvičenie", values: [0, 0, 5479, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2317, 0, 7997, 0] },
          kava: { label: "Káva", values: [700, 958, 1517, 0, 0, 325, 419, 935, 740.5, 1349, 0, 0, 1349, 0, 1349, 0, 0, 1349] },
          caj: { label: "Čaj/kakao", values: [125, 0, 109.9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          drogeria: { label: "Drogéria", values: [419, 109.8, 500, 160, 619, 0, 280, 340, 430, 1146.02, 370, 49.9, 425, 697, 240, 440, 60, 180] },
          elektro: { label: "Elektro/Filtre", values: [0, 0, 0, 0, 0, 0, 0, 0, 757, 0, 210, 0, 6724, 1435, 0, 0, 0, 3187] },
          poistenie: { label: "Popl. za poistenie", values: [10, 10, 10, 10, 10, 20, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10] },
        },
      },
    },
  },
};

// Dorovnanie všetkých radov po pridaní mesiaca. Musí bežať skôr, než sa
// čokoľvek počíta — preto hneď za definíciou PNL a pred mzdovým modelom.
for (const sek of Object.values(PNL))
  for (const sub of Object.values(sek.subcategories))
    for (const item of Object.values(sub.items)) dorovnaj(item.values);

// ── salary model ─────────────────────────────────────────────────────────────
export type PersonKey = "jerry" | "terezka";

// The model changed twice in 2025. This is the whole story of the company's
// turnaround, so it is data, not a footnote:
//   jan–júl 2025  "70/30" — a client paid, 70 % went straight to the trainer,
//                 30 % stayed with the firm. At ~164 000 Kč/mes revenue that
//                 left ~49 000 for a ~66 000 Kč overhead: the firm could not
//                 break even no matter how much anyone trained.
//   aug 2025      transition — "znížili sme si výplatu", amounts agreed ad hoc.
//   sep 2025 →    fix 27 000 + (hodiny − 60) × 850, the model still in force.
//                 The formula in the Excel is NOT clamped at zero: below 60 h
//                 the variable part goes negative (Jerry, dec 2025: 56 h →
//                 −3 400 → nárok 23 600). Keeping it unclamped is what makes
//                 the debt balances reconcile.
export type SalaryEraKind = "share70" | "prechod" | "fixvar";
export type SalaryEra = {
  from: number; // first month index the era applies to
  kind: SalaryEraKind;
  label: string;
  fix: number;
  hoursThreshold: number;
  hourlyRate: number;
  note: string;
};
export const SALARY_ERAS: SalaryEra[] = [
  {
    from: 0, kind: "share70", label: "70 % / 30 %", fix: 0, hoursThreshold: 0, hourlyRate: 0,
    note: "Z každej klientovej platby išlo 70 % trénerovi a 30 % zostalo firme. Nárok neexistoval — čo klient zaplatil, to sa rozdelilo. Firme tak zostávalo ~49 000 Kč mesačne na réžiu ~66 000 Kč.",
  },
  {
    from: 7, kind: "prechod", label: "Prechodný mesiac", fix: 0, hoursThreshold: 0, hourlyRate: 0,
    note: "August 2025 — prvý mesiac konsolidácie: „znížili sme si výplatu“, sumy dohodnuté ad hoc, ešte bez vzorca.",
  },
  {
    from: 8, kind: "fixvar", label: "Fix + variabil", fix: 27000, hoursThreshold: 60, hourlyRate: 850,
    note: "Nárok = 27 000 Kč fix + (hodiny − 60) × 850 Kč. Platí od septembra 2025 dodnes — vtedy zároveň vzniká pojem „dlh voči firme“.",
  },
];
export const eraAt = (i: number): SalaryEra =>
  SALARY_ERAS.reduce((acc, e) => (i >= e.from ? e : acc), SALARY_ERAS[0]);
export const CURRENT_ERA = SALARY_ERAS[SALARY_ERAS.length - 1];

export type SalaryPerson = {
  label: string;
  // Kept for the screens that ask "what are today's parameters?" — they mirror
  // the current era; historical months read their own era via eraAt().
  fix: number;
  hoursThreshold: number;
  hourlyRate: number;
  hours: Vals;
  personal: Record<string, Vals>;
};

// HOURS — the rule, confirmed by Jerry (2026-07-31), so nobody "fixes" it later:
// ÚVODNÉ TRÉNINGY DO MZDOVÝCH HODÍN NEPATRIA. They are paid separately (300/600
// Kč a piece in 2025) and PTminder logs them at 60 min in 2025 / 90 min in 2026.
// That is the whole reason PTminder reports 18–25 h more per person than the
// rows below: the gap tracks the intro sessions almost exactly (apr 2026, the
// one month with zero intros, matches to the hour). Switching these arrays to
// raw PTminder hours would silently inflate both founders' entitlement by
// ~43 h ≈ 36 000 Kč and shrink the debts by the same amount.
//
// Two months WERE corrected against PTminder (Jerry apr 2025 51 → 58, Terezka
// aug 2025 61 → 68) — those gaps are not explained by intros and both months
// carry Jerry's own note about the books being behind ("boli sme v Amerike",
// "dostrácali sme sa vo výplatách"), so they read as typos in the Excel. Neither
// month falls under the fix+variabil model, so no debt balance moves.

export const SALARY: Record<PersonKey, SalaryPerson> = {
  jerry: {
    label: "Jerry",
    fix: CURRENT_ERA.fix,
    hoursThreshold: CURRENT_ERA.hoursThreshold,
    hourlyRate: CURRENT_ERA.hourlyRate,
    hours: [73.5, 88, 85, 58, 101, 76.5, 79, 75, 79.5, 92, 74, 56, 85, 86, 106, 106, 84, 82],
    personal: {
      // 2025 jan–júl is the sheet's own split (základ + úvodné + extra);
      // aug–dec the Excel records only the monthly total, so it lands in "Výplata".
      "Výplata": [70181, 84455, 58573.9, 20188, 50454.6, 49812, 61171.95, 54696, 47108.93, 62891.1, 49407.5, 63282.5, 12000, 18000, 20500, 30712, 36727, 21024],
      "Úvodné tréningy (2025)": [0, 600, 600, 0, 600, 0, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "Extra (2025)": [0, 0, 0, 27500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "BTC": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2800, 1500, 9000, 0, 1000, 1500],
      "FP.Spain": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2440, 0, 13575, 0, 0],
      "Invest": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500, 1500, 0, 500, 0, 500],
      "Salina": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 550, 550, 0, 550, 0, 1370],
      "Notebook": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 2000, 2000, 2000, 0, 0],
      "Štát (len jan 26)": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9761, 0, 0, 0, 0, 0],
    },
  },
  terezka: {
    label: "Terezka",
    fix: CURRENT_ERA.fix,
    hoursThreshold: CURRENT_ERA.hoursThreshold,
    hourlyRate: CURRENT_ERA.hourlyRate,
    hours: [81, 94, 104, 61, 93, 87, 74, 68, 74, 86, 70, 66, 73, 67, 95, 97, 99, 84],
    personal: {
      "Výplata": [45320.9, 45521.7, 59832.5, 53854.5, 57633.8, 47075, 53074, 23410, 44138.93, 45764.4, 38366.5, 37802.5, 10900, 17230, 18200, 24000, 9438, 20500],
      "Úvodné tréningy (2025)": [0, 0, 600, 0, 300, 300, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "Extra (2025)": [0, 0, 0, 27500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "BTC": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1600, 0, 2500, 0, 0, 0],
      "Invest": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500, 500, 0, 0, 0, 0],
      "Salina": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 550, 500, 0, 0, 0, 0],
      "Notebook": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 2000, 2000, 2000, 0, 0],
      "Štát dlžob": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3600, 0, 0, 0, 0],
    },
  },
};

// ── Osobné výplatné kategórie sa dajú upravovať ──────────────────────────────
//
// Riadky v SALARY[*].personal sú prepis Excelu a boli natvrdo v kóde. Lenže
// výplata je jediná položka, ktorú Jerry mení najčastejšie: pribudne dôvod
// („Notebook", „Salina"), niečo sa preúčtuje, niečo dopíše spätne. Kým to bolo
// v kóde, znamenala každá zmena nasadenie.
//
// Preto sa dá zoznam prepísať z databázy. Východzí stav zo zdrojáku zostáva
// uložený zvlášť, aby sa dalo kedykoľvek vrátiť späť a aby opakované volanie
// nebolo kumulatívne.
export type VyplatyKategorie = Record<string, Vals>;
const VYPLATY_ZO_ZDROJAKU: Record<PersonKey, VyplatyKategorie> = {
  jerry: {}, terezka: {},
};
export let VYPLATY_SU_UPRAVENE = false;
/** Kategórie presunuté z osobných výplat do SPOLOCNE — v uložených dátach sa ignorujú. */
const PRESUNUTE_DO_SPOLOCNYCH = new Set(["Nájom 2"]);
// Kategórie, ktoré držia rok 2025 a nesmú zmiznúť ani vtedy, keď ich niekto
// odškrtne. Nový systém výplat ich nepoužíva a v tabuľkách za 2026 nemajú čo
// robiť — ale ich sumy sú súčasťou nákladov roku 2025 a bez nich by tamojší
// zisk vyskočil o 58 600 Kč. Preto sa vždy doplnia zo zdrojáku; z pohľadu sa
// strácajú tým, že riadok bez pohybu v zobrazenom období sa nekreslí.
const HISTORICKE = new Set(["Úvodné tréningy (2025)", "Extra (2025)"]);

/** Zapíše upravené kategórie do modelu. Prázdny vstup = návrat k zdrojáku. */
export function nastavVyplaty(ulozene?: Partial<Record<PersonKey, VyplatyKategorie>>): boolean {
  // Prvé volanie si odloží pôvodný stav.
  for (const key of ["jerry", "terezka"] as PersonKey[]) {
    if (!Object.keys(VYPLATY_ZO_ZDROJAKU[key]).length) {
      for (const [k, v] of Object.entries(SALARY[key].personal)) VYPLATY_ZO_ZDROJAKU[key][k] = [...v];
    }
  }
  let zmena = false;
  for (const key of ["jerry", "terezka"] as PersonKey[]) {
    const nove = ulozene?.[key];
    const maNove = !!nove && Object.keys(nove).length > 0;
    const zdroj = maNove ? nove : VYPLATY_ZO_ZDROJAKU[key];
    const ciel = SALARY[key].personal;
    // Riadok „Z banky" nepochádza ani z Excelu, ani z ručných úprav — plní ho
    // import z Fio. Bez tejto výnimky ho načítanie uložených nastavení zmazalo
    // a výplaty za júl zmizli, hoci v banke boli.
    const prvyImportny = VZAS_MONTHS.indexOf(PRVY_MESIAC_Z_FIO);
    const zImportu: Record<string, number[]> = {};
    for (const r of RIADKY_Z_IMPORTU) {
      if (!ciel[r] || prvyImportny < 0) continue;
      zImportu[r] = ciel[r].slice(prvyImportny);
    }
    for (const k of Object.keys(ciel)) delete ciel[k];
    for (const [k, v] of Object.entries(zdroj)) {
      // Kategórie, ktoré sa medzitým presunuli do spoločných výdavkov, sa z
      // uložených nastavení zahadzujú. Bez toho by sa po presune počítali
      // dvakrát — raz osobne a raz ako polovica spoločného nákladu.
      if (PRESUNUTE_DO_SPOLOCNYCH.has(k)) { zmena = true; continue; }
      ciel[k] = Array.from({ length: N }, (_, i) => Number(v?.[i]) || 0);
    }
    // Späť to, čo plnia importy: mesiace od júla 2026 patria banke a BTC appke,
    // uložené nastavenia ich nesmú prepísať nulou.
    for (const [r, hodnoty] of Object.entries(zImportu)) {
      if (!ciel[r]) ciel[r] = Array.from({ length: N }, () => 0);
      dorovnaj(ciel[r]);
      hodnoty.forEach((v, k) => { if (v) ciel[r][prvyImportny + k] = v; });
    }
    // Chýbajúce historické kategórie sa doplnia zo zdrojáku — ich zmazanie by
    // ticho prepísalo náklady roku 2025.
    if (maNove) {
      for (const h of HISTORICKE) {
        if (!ciel[h] && VYPLATY_ZO_ZDROJAKU[key][h]) ciel[h] = [...VYPLATY_ZO_ZDROJAKU[key][h]];
      }
    }
    if (maNove) zmena = true;
  }
  VYPLATY_SU_UPRAVENE = zmena;
  return zmena;
}

/** Aktuálny stav v tvare, v akom sa ukladá do databázy. */
export const vyplatyNaUlozenie = (): Record<PersonKey, VyplatyKategorie> => {
  // „Z banky" sa neukladá: pri ďalšom otvorení ho znova naplní import a
  // uložená kópia by sa s ním časom rozišla.
  const bez = (o: VyplatyKategorie) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => {
      // Mesiace, ktoré plnia importy, sa neukladajú — pri ďalšom otvorení ich
      // naplní banka a uložená kópia by sa s ňou časom rozišla.
      const p0 = VZAS_MONTHS.indexOf(PRVY_MESIAC_Z_FIO);
      if (!RIADKY_Z_IMPORTU.includes(k) || p0 < 0) return [k, [...v]];
      return [k, v.map((x, i) => (i >= p0 ? 0 : x))];
    }));
  return { jerry: bez(SALARY.jerry.personal), terezka: bez(SALARY.terezka.personal) };
};

// Shared household spending — summed, then split /2 into each founder's
// "Poslané". Only tracked from 2026; in 2025 each founder's payout went to
// them whole, so the 2025 columns are zero (not missing data — it did not exist
// as a category then).
export const SPOLOCNE: Record<string, Vals> = {
  "Nájom": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 19700, 19700, 8000, 34700, 19700, 19700],
  // Presunuté z osobných výplat oboch (Jerry, 4. 8. 2026). Každý mal vlastný
  // riadok „Nájom 2" s tou istou sumou — je to jeden spoločný náklad platený
  // na polovicu, takže patrí sem. Zmena je pre výpočet neutrálna: každý stratil
  // 1 500 z osobnej časti a dostal späť 1 500 ako polovicu z 3 000, takže
  // Poslané, Rozdiel ani kumulovaný dlh sa nepohli.
  "Nájom 2": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3000, 3000, 0, 3000, 3000, 3300],
  "Potraviny": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13900, 19500, 19500, 20000, 14093, 25201],
  "Ahsoka": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8000, 25998, 19725],
  "Výlety": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2924, 0],
  "Doplnky": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2377, 0, 1544, 0, 978, 1216],
  "Iné": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1400, 6300, 3654, 17500, 2999, 3789],
};

// Matyáš — employee for all of 2025 and jan–mar 2026 (no entitlement/debt
// logic, just a payroll cost). The prototype omitted him, which understated
// Výplaty (and so overstated profit).
export const MATYAS: Vals = dorovnaj([3200, 2720, 4320, 5120, 2560, 2860, 3840, 2880, 3180, 3520, 4160, 2560, 2310, 2890, 3700, 0, 0, 0]);

// Dorovnanie zvyšku radov (spoločné výdavky, mzdové hodiny a osobné položky).
for (const v of Object.values(SPOLOCNE)) dorovnaj(v);
for (const k of ["jerry", "terezka"] as PersonKey[]) {
  dorovnaj(SALARY[k].hours);
  for (const v of Object.values(SALARY[k].personal)) dorovnaj(v);
}

// Monthly income. PRIJMY = what the Excel calls "Tržby/Príjmy spolu" and is the
// basis of Hrubý zisk: PTminder revenue plus the rare non-training income.
// (The Excel's own "Mesačné výsledky" sheet lists only the PTminder figure next
// to a profit computed from the total — which is why jan/feb 2025 look
// inconsistent there. Here both lines are visible.)
export const PRIJMY_PTMINDER: Vals = dorovnaj([166417, 219349, 170952, 105775, 189237, 133560, 190118.5, 153946.5, 134345, 145895.5, 180407, 168836, 149933, 221660, 122285.5, 245495, 221560, 180850]);
export const PRIJMY_INE: Vals = dorovnaj([14000, 34000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500, 180, 0, 0, 0, 0, 0]);
export const PRIJMY: Vals = PRIJMY_PTMINDER.map((v, i) => v + PRIJMY_INE[i]);

// Tržby z PTmindera boli doteraz PREPÍSANÉ z Excelu — druhý zdroj pravdy o
// čísle, ktoré appka počíta živo z platieb. Kým sedeli (overené na korunu za
// jan 2025 – jún 2026), nič sa nedialo; ale každý ďalší mesiac by ich musel
// niekto prepisovať ručne a prvý preklep by sa nedal odhaliť, lebo by nebolo
// s čím porovnať. Setter nahradí excelové hodnoty živými pri každom otvorení
// VZAS. Mutuje sa priamo pole: čítajú ho výpočty za behu (pnlCalc, KPI) a
// desiatka komponentov — prepojiť to cez props by znamenalo prepísať celý súbor.
//
// Júl a august tu zámerne NIE SÚ: pridať mesiac len s tržbami by znamenalo
// P&L, kde zisk = tržby, lebo náklady (nula) ešte neexistujú. Vymyslený zisk
// je horší než chýbajúci mesiac. Mesiace pribudnú s nákladmi z Fio.
// ── Náklady z banky ─────────────────────────────────────────────────────────
//
// Excel končí júnom 2026. Od júla je zdrojom pravdy o nákladoch Fio — rovnako
// ako je PTminder zdrojom pravdy o tržbách. Zapisujú sa len mesiace, ktoré v
// Exceli nie sú: prepísať historické mesiace bankou by zahodilo rok práce a
// zároveň by sa stratila možnosť oboje porovnať.
export let NAKLADY_Z_FIO: string[] = [];
/** Prvý mesiac, ktorý Excel nemá — od neho vyššie plnia dáta importy. */
const PRVY_MESIAC_Z_FIO = "2026-07";

/** Riadok „Z banky" v osobných výplatách — pre mesiace, ktoré Excel nemá. */
/**
 * Mzdové hodiny pre mesiace, ktoré Excel nemá — z PTmindera.
 *
 * Bez nich má nový mesiac nula hodín, takže nárok je len fix a dlh sa rozíde
 * s realitou. Platí pravidlo potvrdené Jerrym 2026-07-31: uvodne treningy do
 * mzdovych hodin NEPATRIA (platia sa zvlast), takze sem prichadzaju uz bez
 * nich. Starsie mesiace zostavaju z Excelu — su overene a dva razy opravene
 * proti PTminderu.
 */
/**
 * Barterové členstvá ako splátka Jarkovho dlhu.
 *
 * Sofia trénuje od januára 2025 (59 sedení) a nezaplatila ani korunu — jej
 * členstvo je barter proti Jarkovmu dlhu. PTminder pritom vie, koľko ten
 * balíček stál (payment_czk), takže sa to nemusí prepisovať ručne: keď jej
 * začne nové členstvo, cena sa započíta ako vzdaná tržba v mesiaci, keď
 * platnosť začala.
 *
 * Zapisuje sa len od júla 2026 — staršie mesiace sú v Exceli a sú overené.
 */
export function nastavJarekZTrackera(splatky: Record<string, number>): boolean {
  const rad = JAREK_SPLATKY["Sofia (vzdaná tržba)"];
  if (!rad) return false;
  dorovnaj(rad);
  let zmena = false;
  for (const [mk, suma] of Object.entries(splatky)) {
    const i = VZAS_MONTHS.indexOf(mk);
    if (i < 0 || mk < PRVY_MESIAC_Z_FIO) continue;
    if (Math.abs(rad[i] - suma) > 0.5) { rad[i] = suma; zmena = true; }
  }
  return zmena;
}

/** Klienti, ktorých členstvo je barter proti Jarkovmu dlhu, nie tržba. */
export const BARTER_KLIENTI = ["Sofia Resnerová"];

/**
 * Výplaty vyplatené v bitcoine — z appky PSB Bitcoin.
 *
 * Časť výplaty neodíde z účtu, ale z bitcoinovej rezervy. Na bankovom výpise
 * nie sú, takže bez tohto by mesiac vyzeral, akoby si tréner vzal menej, než
 * naozaj vzal — a dlh by sa rozišiel s realitou. „FP spain" má vlastný riadok,
 * lebo to nie je bežná výplata.
 */
export function nastavBtcVyplaty(
  data: Record<string, { jerry: number; terezka: number; jerryFp: number }>,
): boolean {
  let zmena = false;
  for (const [mk, v] of Object.entries(data)) {
    const i = VZAS_MONTHS.indexOf(mk);
    if (i < 0 || mk < PRVY_MESIAC_Z_FIO) continue;
    const zapis = (kto: PersonKey, riadok: string, suma: number) => {
      const per = SALARY[kto].personal;
      if (!per[riadok]) per[riadok] = Array.from({ length: N }, () => 0);
      dorovnaj(per[riadok]);
      if (Math.abs(per[riadok][i] - suma) > 0.5) { per[riadok][i] = suma; zmena = true; }
    };
    zapis("jerry", RIADOK_BTC, v.jerry);
    zapis("terezka", RIADOK_BTC, v.terezka);
    if (v.jerryFp) zapis("jerry", RIADOK_FP, v.jerryFp);
  }
  return zmena;
}

export function nastavHodinyZTrackera(hodiny: Record<string, { jerry: number; terezka: number }>): boolean {
  let zmena = false;
  for (const [mk, h] of Object.entries(hodiny)) {
    const i = VZAS_MONTHS.indexOf(mk);
    if (i < 0 || mk < PRVY_MESIAC_Z_FIO) continue;
    for (const [k, v] of [["jerry", h.jerry], ["terezka", h.terezka]] as const) {
      const rad = SALARY[k as PersonKey].hours;
      dorovnaj(rad);
      if (Math.abs(rad[i] - v) > 0.05) { rad[i] = v; zmena = true; }
    }
  }
  return zmena;
}

// Výplaty z banky idú do riadku „Výplata" — je to tá istá vec, len z iného
// zdroja, a samostatný riadok len rozdeľoval jedno číslo na dve. Excel má za
// tieto mesiace nulu, takže sa nič neprepisuje.
const RIADOK_VYPLATA = "Výplata";
/** Výplaty vyplatené v bitcoine — riadok, ktorý Excel používa tiež. */
const RIADOK_BTC = "BTC";
/** „FP spain" chodí tiež z BTC appky, ale nie je to bežná výplata. */
const RIADOK_FP = "FP.Spain";
/** Riadky, ktoré plnia importy — nesmú sa stratiť pri načítaní uložených úprav. */
const RIADKY_Z_IMPORTU = [RIADOK_VYPLATA, RIADOK_BTC, RIADOK_FP];

/**
 * `sumy` = { "2026-07": { "fixne.apps.adobe": 464, … } } — kladné čísla.
 * `vyplaty` = { "2026-07": { jerry: 40000, terezka: 12000 } }.
 *
 * Bez výplat by zisk za nový mesiac vyšiel o celé mzdy vyšší, než je — a to je
 * presne tá chyba, ktorú má appka odstraňovať, nie vyrábať.
 */
export function nastavNakladyZFio(
  sumy: Record<string, Record<string, number>>,
  vyplaty: Record<string, { jerry: number; terezka: number }> = {},
): boolean {
  let zmena = false;
  const mesiace: string[] = [];
  for (const [mk, podlaKategorie] of Object.entries(sumy)) {
    const i = VZAS_MONTHS.indexOf(mk);
    if (i < 0 || mk < PRVY_MESIAC_Z_FIO) continue;
    mesiace.push(mk);
    // Mesiac sa najprv vynuluje, aby opakovaný import nesčítaval.
    for (const sek of Object.values(PNL))
      for (const sub of Object.values(sek.subcategories))
        for (const item of Object.values(sub.items)) item.values[i] = 0;
    for (const v of Object.values(SPOLOCNE)) v[i] = 0;

    for (const [kat, suma] of Object.entries(podlaKategorie)) {
      // Splátka Jarkovi je v Exceli na dvoch miestach naraz: ako náklad v P&L
      // a ako zníženie dlhu. Z banky príde raz, takže sa musí zapísať na obe —
      // inak by dlh stál na mieste, hoci sa spláca.
      if (kat === "fixne.prevadzka.splatkaJarek") {
        const rad = JAREK_SPLATKY["Fix splátka (P&L náklad)"];
        if (rad) { dorovnaj(rad); rad[i] = suma; }
      }
      if (kat.startsWith("spolocne.")) {
        const meno = kat.slice("spolocne.".length);
        if (SPOLOCNE[meno]) { SPOLOCNE[meno][i] = suma; zmena = true; }
        continue;
      }
      const [sekK, subK, itemK] = kat.split(".");
      const item = (PNL as Record<string, VzasSection>)[sekK]?.subcategories?.[subK]?.items?.[itemK];
      if (item) { item.values[i] = suma; zmena = true; }
    }
  }
  for (const [mk, v] of Object.entries(vyplaty)) {
    const i = VZAS_MONTHS.indexOf(mk);
    if (i < 0 || mk < PRVY_MESIAC_Z_FIO) continue;
    for (const [k, suma] of [["jerry", v.jerry], ["terezka", v.terezka]] as const) {
      const per = SALARY[k as PersonKey].personal;
      if (!per[RIADOK_VYPLATA]) per[RIADOK_VYPLATA] = Array.from({ length: N }, () => 0);
      dorovnaj(per[RIADOK_VYPLATA]);
      if (per[RIADOK_VYPLATA][i] !== suma) { per[RIADOK_VYPLATA][i] = suma; zmena = true; }
    }
  }
  NAKLADY_Z_FIO = mesiace.sort();
  return zmena;
}

export let PRIJMY_SU_ZIVE = false;
export function nastavPrijmyZTrackera(cashPodlaMesiaca: Record<string, number>): boolean {
  let zmena = !PRIJMY_SU_ZIVE;
  VZAS_MONTHS.forEach((mk, i) => {
    const v = cashPodlaMesiaca[mk];
    if (v == null || v <= 0) return;
    if (Math.abs(PRIJMY_PTMINDER[i] - v) > 0.5) { PRIJMY_PTMINDER[i] = v; zmena = true; }
  });
  VZAS_MONTHS.forEach((_, i) => { PRIJMY[i] = PRIJMY_PTMINDER[i] + PRIJMY_INE[i]; });
  PRIJMY_SU_ZIVE = true;
  return zmena;
}

// Debt bookkeeping starts empty at 1.1.2025 — every balance below is built up
// month by month from the records, not carried in as an assumption.
export const DEBT_START = 0;

// Checkpoint from the brief: balances at 1.1.2026. The computed chain hits
// these (Jerry −74 139, Terezka −10 473, Jarek −334 910); the founders' figures
// land within ~1 Kč of them because sep–dec 2025 are computed from the model
// (nárok − poslané) while the Excel's loan rows are rounded to whole koruny.
export const DEBT_CHECKPOINT_2026: Record<PersonKey | "jarek", number> = {
  jerry: -74139,
  terezka: -10473,
  jarek: -334910,
};

// Before the fix+variabil model existed there was no "nárok", so a founder's
// debt did not follow from a formula — it was booked directly as a loan from
// or a repayment to the company. These are those records (jan–aug 2025); from
// sep 2025 the debt follows from Nárok − Poslané.
export const RECORDED_DEBT: Record<PersonKey, { pozicka: Vals; splatka: Vals }> = {
  jerry: {
    pozicka: [2470, 1784.9, 12840, 6638, 360, 10840, 6165, 1500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    splatka: [4254.53, 0, 10580, 1500, 540, 0, 14000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  terezka: {
    pozicka: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    splatka: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

// Jarek (external investor): fix repayment is BOTH a P&L cost and a debt
// operation; "Sofia" is forgone revenue (never a bank transaction).
// The 20 % discount is NOT a one-off: Jarek renews his annual membership every
// year (2025-01-22, then 2026-06-23) and the discount is credited against the
// debt each time. 2026: list price 91 000 → he pays 80 % (72 800), and the
// remaining 18 200 comes off the debt. Confirmed by Jerry 2026-07-31; the
// 54 600 Kč cash payment on 23.6. plus this 18 200 is exactly that 72 800.
// Dorovnanie dlhových záznamov.
for (const k of ["jerry", "terezka"] as PersonKey[]) {
  dorovnaj(RECORDED_DEBT[k].pozicka);
  dorovnaj(RECORDED_DEBT[k].splatka);
}

export const JAREK_ZLAVA_ROCNE = 18200; // 20 % z 91 000, obnova 2026
export const JAREK_OBNOVA = { datum: "2026-06-23", platba: 54600, mesiacIdx: 17 };

export const JAREK_SPLATKY: Record<string, Vals> = {
  "Fix splátka (P&L náklad)": [0, 8000, 4000, 4000, 4000, 0, 0, 4000, 4000, 4000, 4000, 4000, 5000, 5000, 5000, 5000, 5000, 0],
  "Sofia (vzdaná tržba)": [6850, 0, 6850, 0, 6850, 0, 0, 6850, 0, 6850, 0, 0, 7790, 0, 7790, 7790, 0, 0],
  "20 % zľava ročné": [16880, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18200],
};

// Money in from the investor. The jan 2025 figure is the balance carried over
// from 2024 (the Excel cell says "ZOSTATOK 2024"), not a fresh deposit; the
// 300 000 in feb 2025 is the real second injection.
for (const v of Object.values(JAREK_SPLATKY)) dorovnaj(v);

export const JAREK_VKLADY: Vals = dorovnaj([126040.34, 300000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

// ── helpers ──────────────────────────────────────────────────────────────────
export const vSum = (a: Vals): number => a.reduce((x, y) => x + (y || 0), 0);
export const vAdd = (...rows: Vals[]): Vals =>
  Array.from({ length: N }, (_, i) => rows.reduce((t, r) => t + (r[i] || 0), 0));

export const sumItems = (items: Record<string, VzasItem>): Vals =>
  vAdd(...Object.values(items).map((it) => it.values));

export const sumSection = (section: VzasSection): Vals =>
  vAdd(...Object.values(section.subcategories).map((g) => sumItems(g.items)));

export const spolocneTotal = (): Vals => vAdd(...Object.values(SPOLOCNE));
export const spolocneHalf = (): Vals => spolocneTotal().map((v) => v / 2);

export type SalaryCalc = {
  variabil: Vals;
  narok: Vals;          // era 70/30: the payout itself (there was no entitlement)
  hasModel: boolean[];  // false where "nárok" is not a modelled number
  personalTotal: Vals;
  spolocneHalf: Vals;
  poslane: Vals;
  rozdiel: Vals;
  cumDebt: Vals;
};

// Nárok = Fix + (hodiny − prah) × sadzba   (unclamped, per the Excel)
// Poslané = osobné kanály + Spoločné/2
// Rozdiel = Nárok − Poslané  (kladný = firma dlží trénerovi)
// Kumulovaný dlh(N) = dlh(N−1) + Rozdiel(N)   ← per brief §06
// Pred sep 2025 nárok neexistoval, takže Rozdiel = Splátka − Pôžička zo záznamov.
/**
 * Posledný mesiac, o ktorom appka niečo vie.
 *
 * Mesiace rastú dopredu, aby mali nové dáta kam pristáť — ale mesiac, do
 * ktorého sa ešte nič nenahralo, nesmie nič ovplyvniť. Bez tohto sa v ňom
 * počítal nárok bez odrobených hodín a bez výplaty, takže dlh firmy voči
 * trénerom rástol o celý fix za mesiac, ktorý sa ešte nestal.
 */
export function poslednyMesiacSDatami(): number {
  for (let i = VZAS_MONTHS.length - 1; i >= 0; i--) {
    const maHodiny = SALARY.jerry.hours[i] > 0 || SALARY.terezka.hours[i] > 0;
    const maPrijem = PRIJMY[i] > 0;
    const maNaklad = sumSection(PNL.fixne)[i] > 0 || sumSection(PNL.variabilne)[i] > 0;
    if (maHodiny || maPrijem || maNaklad) return i;
  }
  return VZAS_MONTHS.length - 1;
}

export function salaryCalc(key: PersonKey): SalaryCalc {
  const s = SALARY[key];
  const rec = RECORDED_DEBT[key];
  const half = spolocneHalf();
  const personalTotal = vAdd(...Object.values(s.personal));
  const poslane = vAdd(personalTotal, half);

  const variabil: Vals = [];
  const narok: Vals = [];
  const hasModel: boolean[] = [];
  const rozdiel: Vals = [];
  const cumDebt: Vals = [];

  const posledny = poslednyMesiacSDatami();
  for (let i = 0; i < N; i++) {
    const era = eraAt(i);
    const modelled = era.kind === "fixvar";
    hasModel.push(modelled);
    const v = modelled ? (s.hours[i] - era.hoursThreshold) * era.hourlyRate : 0;
    variabil.push(v);
    narok.push(modelled ? era.fix + v : poslane[i]);
    // Mesiac, ktorý ešte nenastal (alebo doňho nič nepribudlo), dlh nehýbe.
    // Inak by nárok bez odrobených hodín a bez výplaty pripísal firme dlh
    // za mesiac, ktorý sa nestal.
    const prazdny = i > posledny;
    rozdiel.push(prazdny ? 0 : modelled ? narok[i] - poslane[i] : rec.splatka[i] - rec.pozicka[i]);
    cumDebt.push((i === 0 ? DEBT_START : cumDebt[i - 1]) + rozdiel[i]);
  }
  return { variabil, narok, hasModel, personalTotal, spolocneHalf: half, poslane, rozdiel, cumDebt };
}

// Stav Jarek(N) = Stav(N−1) + Splátky(N) − Vklady(N).
export function jarekCalc(): { splatkySpolu: Vals; vklady: Vals; stav: Vals } {
  const splatkySpolu = vAdd(...Object.values(JAREK_SPLATKY));
  const stav: Vals = [];
  splatkySpolu.forEach((s, i) => {
    stav.push((i === 0 ? DEBT_START : stav[i - 1]) + s - JAREK_VKLADY[i]);
  });
  return { splatkySpolu, vklady: JAREK_VKLADY, stav };
}

export type PnlCalc = {
  fixneTotal: Vals;
  varTotal: Vals;
  bezVyplat: Vals;
  poslaneJerry: Vals;
  poslaneTerezka: Vals;
  matyas: Vals;
  vyplatySpolu: Vals;
  celkoveNaklady: Vals;
  prijmy: Vals;
  hrubyZisk: Vals;
  marza: Vals;
};

export function pnlCalc(): PnlCalc {
  const fixneTotal = sumSection(PNL.fixne);
  const varTotal = sumSection(PNL.variabilne);
  const bezVyplat = vAdd(fixneTotal, varTotal);
  const poslaneJerry = salaryCalc("jerry").poslane;
  const poslaneTerezka = salaryCalc("terezka").poslane;
  const vyplatySpolu = vAdd(poslaneJerry, poslaneTerezka, MATYAS);
  const celkoveNaklady = vAdd(bezVyplat, vyplatySpolu);
  const hrubyZisk = PRIJMY.map((p, i) => p - celkoveNaklady[i]);
  const marza = PRIJMY.map((p, i) => (p > 0 ? (hrubyZisk[i] / p) * 100 : 0));
  return { fixneTotal, varTotal, bezVyplat, poslaneJerry, poslaneTerezka, matyas: MATYAS, vyplatySpolu, celkoveNaklady, prijmy: PRIJMY, hrubyZisk, marza };
}

// ── Alternative lens: commitment, not fix/variable ───────────────────────────
// The fix/variable split says little for decisions — several "fixed" rows swing
// wildly (Facebook ads, AI tools, štát) and two aren't operating costs at all.
// The useful question is "in a bad month, what can I actually stop paying?".
//   zavazne      — contracts, the state, and systems the studio can't run without
//   volitelne    — marketing, creative tools, equipment, hospitality: pausable
//   neprevadzkove— not an operating expense: debt principal, reserve transfers
export type Commitment = "zavazne" | "volitelne" | "neprevadzkove";

// Keyed "section.group.item" because item keys repeat across groups (e.g. "ine").
const COMMITMENT: Record<string, Commitment> = {
  "fixne.prevadzka.najom": "zavazne",
  "fixne.prevadzka.splatkaJarek": "neprevadzkove",
  "fixne.prevadzka.statTerezka": "zavazne",
  "fixne.prevadzka.statJerry": "zavazne",
  "fixne.prevadzka.bonusFinancak": "zavazne",
  "fixne.prevadzka.bitcoinFond": "neprevadzkove",
  "fixne.prevadzka.fondNaradie": "neprevadzkove",
  "fixne.marketing.facebook": "volitelne",
  "fixne.marketing.google": "volitelne",
  "fixne.marketing.multibox": "volitelne",
  "fixne.marketing.offline": "volitelne",
  "fixne.apps.adobe": "volitelne",
  "fixne.apps.canva": "volitelne",
  "fixne.apps.captions": "volitelne",
  "fixne.apps.capcut": "volitelne",
  "fixne.apps.ai": "volitelne",
  "fixne.apps.freelo": "volitelne",
  "fixne.apps.idoklad": "zavazne",
  "fixne.apps.mailer": "volitelne",
  "fixne.apps.metricool": "volitelne",
  "fixne.apps.microsoft": "zavazne",
  "fixne.apps.ptminder": "zavazne",
  "fixne.apps.truecoach": "zavazne",
  "fixne.apps.ine": "volitelne",
  "variabilne.sluzby.pravnicka": "zavazne",
  "variabilne.sluzby.telefon": "zavazne",
  "variabilne.sluzby.grafik": "volitelne",
  "variabilne.sluzby.web": "zavazne",
  "variabilne.sluzby.tlac": "volitelne",
  "variabilne.sluzby.skolenie": "volitelne",
  "variabilne.sluzby.opravar": "volitelne",
  "variabilne.sluzby.teambuilding": "volitelne",
  "variabilne.sluzby.ine": "volitelne",
  "variabilne.produkty.atipicke": "volitelne",
  "variabilne.produkty.merch": "volitelne",
  "variabilne.produkty.ine": "volitelne",
  "variabilne.prevadzka2.pomocky": "volitelne",
  "variabilne.prevadzka2.kava": "volitelne",
  "variabilne.prevadzka2.caj": "volitelne",
  "variabilne.prevadzka2.drogeria": "zavazne",
  "variabilne.prevadzka2.elektro": "volitelne",
  "variabilne.prevadzka2.poistenie": "zavazne",
};
export type CommitmentBucket = { key: Commitment; label: string; items: { path: string; label: string; values: Vals; group: string }[] };

// Regroup every P&L line by commitment, keeping the original group name so a row
// still reads "Nájom + energie · Prevádzka".
export function byCommitment(): Record<Commitment, CommitmentBucket> {
  const out: Record<Commitment, CommitmentBucket> = {
    zavazne: { key: "zavazne", label: "Záväzné náklady", items: [] },
    volitelne: { key: "volitelne", label: "Voliteľné náklady", items: [] },
    neprevadzkove: { key: "neprevadzkove", label: "Neprevádzkové", items: [] },
  };
  for (const [sk, section] of Object.entries(PNL)) {
    for (const [gk, group] of Object.entries(section.subcategories)) {
      for (const [ik, item] of Object.entries(group.items)) {
        const path = `${sk}.${gk}.${ik}`;
        const c = COMMITMENT[path] ?? "zavazne";
        out[c].items.push({ path, label: item.label, values: item.values, group: group.label });
      }
    }
  }
  for (const b of Object.values(out)) b.items.sort((a, z) => vSum(z.values) - vSum(a.values));
  return out;
}

export const commitmentTotal = (b: CommitmentBucket): Vals => vAdd(...b.items.map((i) => i.values));

// ── Monthly commentary ───────────────────────────────────────────────────────
export const monthKeyOf = (i: number) => VZAS_MONTHS[i];

// Jerry's monthly review. Six questions, reworked with him from the original
// seven in the Excel: three of those asked the same "one-off vs recurring"
// thing from different angles, and two (čo fungovalo / nefungovalo) went
// unanswered five months out of six. "energy" renders as a slider plus a
// non-training hours field — the model only pays for training hours, so
// without that second number an energy score can't be read honestly.
export const MONTH_QUESTIONS: { id: string; q: string }[] = [
  { id: "stalo", q: "Čo zásadné sa tento mesiac stalo?" },
  { id: "jednorazove", q: "Čo z tržieb aj výdavkov bolo jednorazové a čo sa bude opakovať?" },
  { id: "klienti", q: "Pribudol alebo odišiel niekto z klientov? Prečo?" },
  { id: "buduci", q: "Čo už teraz viem o budúcom mesiaci?" },
];
// Every question is answered by both founders; the answers live under
// "<id>__jerry" / "<id>__terezka" in the same JSON blob.
export const answerKey = (base: string, person: PersonKey) => `${base}__${person}`;

// Jerry's existing answers, remapped onto the new questions. The wording is
// his (2025 entries come from the cell comments on row 137 of the 2025 sheet,
// with only obvious typos fixed); only the grouping changed.
export const SEED_ANSWERS: Record<string, Record<string, string>> = {
  "2025-02": {
    stalo__jerry: "Tento mesiac si T. Krčmar predplatil, mali sme 2 úvodné tréningy cez Jarka. Stále však nevieme vytvoriť stabilný príjem nových klientov, preto teraz skúšame kontaktovať lekárov a iných odborníkov ohľadom spolupráce.",
  },
  "2025-04": {
    stalo__jerry: "Apríl sme boli v Amerike 2 týždne a aj napriek tomu sme spravili celkom dobrý počet tréningov aj príjmov vďaka tomu, že Matyáš nám zobral pár hodín. Zostalo nám však veľa restov v podobe 2 nedokončených mesiacov v tabuľkách a kvartálnych výsledkov, ktoré sme urobili až v máji.",
  },
  "2025-06": {
    stalo__jerry: "Tento mesiac bol masakrálny. Exekúcia za minulý mesiac, nahromadenie dlhu u finančného úradu, platenie za doménu (web) — všetko sa to nazbieralo a miestami to vyzeralo, že nebudeme mať na nič. Našťastie si predplatila Lenka aj Akis. Na Google sme stále dlžní 200 USD, stále nie je doplatený finančák. Spustili sme reklamu na online analýzu držania tela.",
  },
  "2025-08": {
    stalo__jerry: "Spustila sa konsolidácia: 1. znížili sme si výplatu. Počas mesiaca to vyzeralo veľmi zle s tým, či vykryjeme všetky náklady — posledný týždeň v nedeľu a pondelok bolo jasné, že nebudeme mať dosť, ale od stredy do piatku zaplatilo viacero klientov, všetko sa urovnalo a nakoniec nám aj niečo zostalo.",
  },
  "2025-09": {
    stalo__jerry: "Druhý mesiac konsolidácie. Výplaty máme zjavne o niečo nižšie ako pôvodný model, takže sa nám niečo podarilo aj ušetriť, aj keď bol september 2. najslabší mesiac v roku. Môže to byť spôsobené aj tým, že ľudia platia obmesiac, keďže majú veľakrát 8/12 hodín. Každopádne aj tak sme v nejakom zisku. Súčasne sme mali najviac úvodných, z toho 1 nepokračuje.",
  },
  "2025-10": {
    stalo__jerry: "Tento mesiac bol ako optická ilúzia — počas mesiaca som mal pocit, že máme celkom pekné príjmy, Lenka si predplatila 3 mesiace, ale tabuľka ukázala, že to nie je celkom pravda.",
  },
  "2026-01": {
    stalo__jerry: "prešli sme na nové členstvá, ostalo už len pár klientov so starými sumami",
    jednorazove__jerry: "Konsolidácia cien — trvalá zmena, nie jednorazová: náklady sú nižšie ako kedysi a aj na výplatách sme trošku ušetrili.",
    klienti__jerry: "Noví prevažne cez referencie. Zo 7 úvodných pokračovalo 5 klientov, dvaja nie — len to skúšali.",
  },
  "2026-02": {
    stalo__jerry: "Radek a Lenka si predplatili 18 h a Gažo omylom poslal za 16 h",
    jednorazove__jerry: "Predplatby Radek + Lenka (18 h) a omylom poslaná platba od Gaža (za 16 h) — jednorazové, v ďalších mesiacoch sa nezopakujú.",
    klienti__jerry: "Prokop prišiel cez Google (organika), ostatní cez referencie. Z úvodných pokračovali traja.",
  },
  "2026-03": {
    stalo__jerry: "mali sme najviac tréningov s najmenej tržbami. veľa ľudí vyprokrastinovalo platby, mali by sme o cca 50k viac keby nemeškali. je to naša chyba, pretože sme na nich málo tlačili",
    jednorazove__jerry: "Chýbajúcich ~50 000 boli oneskorené platby klientov, nie výpadok dopytu — presunuli sa do ďalších mesiacov.",
    klienti__jerry: "Noví prevažne cez referencie. Z úvodných pokračovali 4 z 5.",
  },
  "2026-04": {
    stalo__jerry: "zomrela Katka, Janovi sme preto pomohli zaplatiť aspoň jeden mesiac nájmu. súčasne sme mali najvyššie tržby za jeden mesiac",
    jednorazove__jerry: "Jednorazové: viacerí klienti predplatili hodiny dopredu a pomoc Janovi s nájmom. Trvalé: všetkým dobehli staré balíčky za staré ceny, takže sa naplno prejavila konsolidácia.",
    klienti__jerry: "Väčšina nových cez referencie.",
  },
  "2026-06": {
    stalo__jerry: "tento mesiac sme mali obmedzenú prevádzku, pretože sme mali Ahsoku",
    jednorazove__jerry: "Obmedzená prevádzka kvôli Ahsoke — jednorazové.",
  },
};

// Free-form note per month. Item-level detail also shows as a hover on the P&L
// line itself (ITEM_NOTES); it is repeated here so a month reads as one story.
export const SEED_NOTES: Record<string, string> = {
  "2025-01": "Detaily k položkám (z Excelu):\n• Predplatné: Jarek — ročné členstvo\n• Iné produkty: Knihovnicka.cz — test tlače protokolu\n• Jarek vklad 126 040 Kč je zostatok z roku 2024, nie nový vklad",
  "2025-02": "Detaily k položkám (z Excelu):\n• Predplatné: Tomáš Krčmar — ročné členstvo\n• Tlač: vizitky, letáky\n• Príjmy iné: Jarkov preplatok za kurz 29 000 Kč + Bitcoin 5 000 Kč — jednorazové",
  "2025-05": "Detaily k položkám (z Excelu):\n• Iné výdaje: exekúcia 18 191 Kč\n• Opravár: palice s ručkami na cvičenie",
  "2025-08": "Prvý mesiac konsolidácie.\n\nDetaily k položkám (z Excelu):\n• Bonus na Finančák: 100 % PSB príspevok na štát (18 716 Kč)\n• Školenia/kurzy: Matyáš — príspevok na školenie\n• Web/hosting: femflex\n• K výplatám: „Neviem, koľko je — dostrácali sme sa vo výplatách. V Air Bank sme dali spočítať všetky príchodzie platby od Fio banky, to je 78 106 za oboch.“",
  "2025-09": "Detaily k položkám (z Excelu):\n• Grafik: Daša",
  "2025-10": "Detaily k položkám (z Excelu):\n• Tlač: Google recenzie\n• Opravár: Laver King + svetlo na záchod",
  "2025-12": "Detaily k položkám (z Excelu):\n• Predplatné: vianočné poukazy — Stoklaskova 2×, +10 h, kanape 1×\n• Iné výdaje: Amazon reklama + darček pre Jarka (mango, Uganda)",
  "2026-01": "Fungovalo: hovorenie na internete.\n\nDetaily k položkám (z Excelu):\n• Captions: nedoplatok za december, tým pádom bol Captions 2× v januári účtovaný\n• Apps/Iné: Amazon Group Media\n• Právnička/Účto: Dumbrovská zmluva na polročné členstvá\n• Elektro/Filtre: Apple Pen + kryt iPad, vysávač, stojan na kotúče, kábel USB-B 3\n• BTC výdaje: 31.1 – 1000 Kč Jerry výplata; 29.1 – 1000 Kč Terka výplata; 16.1 – 600 Kč Terez výplata; 15.1 – 1000 Kč Jerry výplata; 9.1 – 500 Kč Jerry výplata; 3.1 – 300 Kč Jerry výplata; 26.1 – 3826 Kč vysávač, kábel, stojan; 17.1 – 1400 Kč hrniec, miska; 7.1 – 2898 Kč iPad; 7.1 – 2377 Kč doplnky",
  "2026-02": "Detaily k položkám (z Excelu):\n• Nájom + energie: platili sme energie 3011\n• AI nástroje: Claude PRO\n• BTC výdaje: 26.2 – 1500 Kč (106776) Jerry výplata; 4.2 – 2440 Kč (156789) Jerry FP",
  "2026-03": "Detaily k položkám (z Excelu):\n• Štát Jerry: dlh + platba\n• AI nástroje: Claude + ChatGPT\n• Apps/Iné: Higgsfield\n• Iné výdaje: UniHobby presadzanie\n• Pomôcky na cvičenie: kotúče 10 kg, 5 kg + lopta 4 kg",
  "2026-04": "Detaily k položkám (z Excelu):\n• Iné výdaje: Lozias poslanie 550 Kč — neviem za čo\n• Atipické nákupy: olej na kladku (Joom)",
  "2026-05": "Detaily k položkám (z Excelu):\n• Pomôcky na cvičenie: RG Bell 3 + 9 kg, FP tričká 2×",
  "2026-06": "Detaily k položkám (z Excelu):\n• Iné výdaje: Nubound Robo školenie\n• Elektro/Filtre: adaptér na nabíjačky + ventilátor + kanvica",
};

// Per-cell notes from the Excel, keyed "<section.group.item>|<monthIndex>".
// These surface as a hover on the exact P&L line they belong to.
// Index 0 = jan 2025, index 12 = jan 2026.
export const ITEM_NOTES: Record<string, string> = {
  // 2025
  "fixne.prevadzka.bonusFinancak|7": "100 % PSB príspevok na štát",
  "variabilne.sluzby.tlac|1": "Vizitky, letáky",
  "variabilne.sluzby.tlac|9": "Google recenzie",
  "variabilne.sluzby.web|7": "Femflex",
  "variabilne.sluzby.skolenie|7": "Matyáš — príspevok na školenie",
  "variabilne.sluzby.grafik|8": "Daša",
  "variabilne.sluzby.opravar|2": "Šitie v brašnárstve — NeckFunction",
  "variabilne.sluzby.opravar|4": "Palice s ručkami na cvičenie",
  "variabilne.sluzby.opravar|7": "Čistidlo na kávovar",
  "variabilne.sluzby.opravar|9": "Laver King + svetlo na záchod",
  "variabilne.sluzby.ine|4": "Exekúcia",
  "variabilne.sluzby.ine|11": "Amazon reklama + darček pre Jarka (mango, Uganda)",
  "variabilne.produkty.ine|0": "Knihovnicka.cz — test tlače protokolu",
  "variabilne.produkty.ine|10": "Amazon Media Group",
  "variabilne.prevadzka2.pomocky|2": "Váha, kotúče 5 kg a 2,5 kg",
  "variabilne.prevadzka2.elektro|10": "Svetlo na záchod",
  // 2026
  "fixne.prevadzka.najom|13": "platili sme energie 3011",
  "fixne.prevadzka.statJerry|14": "Dlh + platba",
  "fixne.apps.captions|12": "nedoplatok za december, tým pádom bol Captions 2× v januári účtovaný",
  "fixne.apps.ai|13": "Claude PRO",
  "fixne.apps.ai|14": "Claude + ChatGPT",
  "fixne.apps.ine|12": "Amazon Group Media",
  "fixne.apps.ine|14": "Higgsfield",
  "variabilne.sluzby.pravnicka|12": "Dumbrovská zmluva na polročné členstvá",
  "variabilne.sluzby.ine|14": "UniHobby presadzanie",
  "variabilne.sluzby.ine|15": "Lozias poslanie 550 Kč — neviem za čo",
  "variabilne.sluzby.ine|17": "Nubound Robo školenie",
  "variabilne.produkty.atipicke|15": "Olej na kladku (Joom)",
  "variabilne.prevadzka2.pomocky|14": "Kotúče 10 kg, 5 kg + lopta 4 kg",
  "variabilne.prevadzka2.pomocky|16": "RG Bell 3 + 9 kg, FP tričká 2×",
  "variabilne.prevadzka2.elektro|12": "Apple Pen + kryt iPad, vysávač, stojan na kotúče, kábel USB-B 3",
  "variabilne.prevadzka2.elektro|17": "Adaptér na nabíjačky + ventilátor + kanvica",
};
export const itemNote = (path: string, monthIdx: number): string | undefined => ITEM_NOTES[`${path}|${monthIdx}`];

export type Deviation = { label: string; group: string; value: number; typical: number; diff: number; pct: number };

// What actually made this month different: every line compared against its own
// average across the other months IN THE SAME YEAR — comparing a 2025 month
// against 2026 prices would flag the price change, not the month.
export function monthDeviations(monthIdx: number, topN = 6, floor = 3000): Deviation[] {
  const out: Deviation[] = [];
  const peers = YEAR_IDX[yearOf(monthIdx)].filter((i) => i !== monthIdx);
  const consider = (label: string, group: string, values: Vals) => {
    if (!peers.length) return;
    const typical = peers.reduce((a, i) => a + values[i], 0) / peers.length;
    const value = values[monthIdx];
    const diff = value - typical;
    if (Math.abs(diff) < floor) return;
    out.push({ label, group, value, typical, diff, pct: typical !== 0 ? (diff / Math.abs(typical)) * 100 : 0 });
  };
  for (const section of Object.values(PNL))
    for (const g of Object.values(section.subcategories))
      for (const it of Object.values(g.items)) consider(it.label, g.label, it.values);
  consider("Výplata Jerry", "Výplaty", salaryCalc("jerry").poslane);
  consider("Výplata Terezka", "Výplaty", salaryCalc("terezka").poslane);
  consider("Tržby", "Príjmy", PRIJMY);
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, topN);
}

// Targets for the KPI cards (Výsledky). 2025 comes from the "KPI" sheet of the
// 2025 Excel (Ciel 2025), 2026 from the brief.
export type YearTargets = { rocneTrzby: number; marzaPct: number; hodinyJerry: number; hodinyTerezka: number };
export const VZAS_TARGETS_BY_YEAR: Record<string, YearTargets> = {
  "2025": { rocneTrzby: 2000000, marzaPct: 3, hodinyJerry: 90, hodinyTerezka: 80 },
  "2026": { rocneTrzby: 2300000, marzaPct: 12, hodinyJerry: 90, hodinyTerezka: 80 },
};
export const VZAS_TARGETS = VZAS_TARGETS_BY_YEAR["2026"]; // medzikrok 12–15 %, dlhodobo 20 %

// ── KPI ──────────────────────────────────────────────────────────────────────
// Jerry's own KPI sheets, now computed from data instead of retyped by hand.
// Two things stay explicit: WHOSE number a target is (his sheet vs my proposal)
// and WHAT WINDOW it was measured over — a year-to-date figure judged against a
// full-year target is the single easiest way to make a good year look like a
// failure, which is exactly what the old Tržby card used to do.
export type KpiUnit = "czk" | "pct" | "num" | "h";
export type KpiGroup = "peniaze" | "lievik" | "kapacita" | "cena";
export type KpiDef = {
  id: string;
  label: string;
  unit: KpiUnit;
  group: KpiGroup;
  lo?: number;      // bottom of the target band (also the pass mark)
  hi?: number;      // top of the band, informational — above it is not a failure
  annual?: boolean; // target is a full-year total → pro-rated by months elapsed
  navrh?: boolean;  // my proposal, not from Jerry's sheet
  why: string;
};

export const KPI_GROUP_LABELS: Record<KpiGroup, string> = {
  peniaze: "Peniaze",
  lievik: "Lievik — odkiaľ chodia klienti",
  kapacita: "Kapacita a klienti",
  cena: "Cena a mix",
};

const KPI_COMMON: KpiDef[] = [
  { id: "trzby", label: "Tržby", unit: "czk", group: "peniaze", annual: true, why: "Ročný plán prepočítaný na uplynulé mesiace." },
  { id: "marza", label: "Zisková marža", unit: "pct", group: "peniaze", why: "Koľko z tržby zostane po všetkom vrátane výplat." },
  // "Rezerva" was the wrong word: Jerry's own goal #7 is a 120 000 Kč cash
  // reserve, and two different things called rezerva on the same screen is one
  // misreading away from a bad decision. This one is a distance, not money set
  // aside — so it says rozdiel, and shows the koruny as well as the percentage.
  { id: "rezerva", label: "Rozdiel nad break-even", unit: "pct", group: "peniaze", lo: 20, navrh: true, why: "O koľko % sú tržby nad bodom, kde firma pokryje prevádzku aj nároky na výplaty. Nie je to odložená hotovosť — je to odstup. Pod 20 % stačí jeden slabý mesiac na stratu a presne to sa v 2025 stalo päťkrát." },
  { id: "uvodne", label: "Úvodné tréningy", unit: "num", group: "lievik", annual: true, why: "Vrch lievika: bez úvodných niet nových klientov." },
  { id: "uspesnost", label: "Úspešnosť po úvodnom", unit: "pct", group: "lievik", why: "Koľko % ľudí po úvodnom tréningu pokračovalo. Kvalita > kvantita." },
  { id: "aktivni", label: "Aktívni klienti (Ø/mes.)", unit: "num", group: "kapacita", why: "Koľko rôznych ľudí za mesiac reálne prišlo." },
  { id: "hodiny", label: "Individuálne hodiny", unit: "h", group: "kapacita", annual: true, why: "Odtrénované hodiny bez úvodných — optimum bez vyhorenia." },
  { id: "dlzka", label: "Priemerná dĺžka spolupráce", unit: "num", group: "kapacita", lo: 12, navrh: true, why: "Koľko mesiacov klient v priemere zostane. V štúdiu rozhoduje o tržbách viac než počet nových — jeden mesiac navyše u každého klienta je lacnejší než celý nový lievik. Číslo je orezané dĺžkou histórie, takže je to spodná hranica." },
  { id: "hodinovka", label: "Priemerná hodinovka", unit: "czk", group: "cena", why: "Tržby delené odtrénovanými hodinami — základ pre 20 % maržu." },
  { id: "rezervaMes", label: "Rezerva v mesiacoch prevádzky", unit: "num", group: "peniaze", lo: 3, navrh: true, why: "Koľko mesiacov by firma ustála bez jedinej tržby. Počíta sa z bitcoinovej rezervy delenej break-evenom. Tvoj cieľ „Rezerva 120 000 Kč+“ je v korunách; toto je to isté číslo prepočítané na čas, čo je jediné, čo v zlom mesiaci naozaj rozhoduje." },
  { id: "ltv", label: "Hodnota klienta (LTV)", unit: "czk", group: "cena", lo: 30000, navrh: true, why: "Koľko za celý čas spolupráce klient v priemere zaplatí. S týmto číslom sa dá povedať, koľko sa oplatí zaplatiť za získanie jedného klienta." },
];

// Jerry's numbers per year; anything not listed keeps the common definition
// without a target (shown as informational).
const KPI_YEAR_TARGETS: Record<string, Record<string, { lo?: number; hi?: number }>> = {
  "2025": {
    trzby: { lo: 2000000 },
    marza: { lo: 3 },
    uvodne: { lo: 40 },
    uspesnost: { lo: 75 },
    hodiny: { lo: 2250 },
  },
  "2026": {
    trzby: { lo: 2300000 },
    marza: { lo: 12 },
    uvodne: { lo: 36, hi: 48 },
    uspesnost: { lo: 60, hi: 65 },
    aktivni: { lo: 45, hi: 50 },
    hodiny: { lo: 2050, hi: 2150 },
    hodinovka: { lo: 1050 },
    online: { lo: 10, hi: 15 },
    hodinKlient: { lo: 25 },
  },
};

// Two 2026-only KPIs from his sheet — they had no meaning in 2025 (no online
// service existed) but they are his, so they show up when the year has them.
const KPI_EXTRA: KpiDef[] = [
  // Annual, like his sheet: 25 h per client is a YEAR's worth, so a seven-month
  // figure has to be judged against seven twelfths of it.
  { id: "hodinKlient", label: "Priemer hodín na klienta", unit: "h", group: "kapacita", annual: true, why: "Ročné hodiny delené počtom klientov — stabilnejší cashflow než veľa ľudí občas." },
  { id: "marketingPct", label: "Marketing z tržieb", unit: "pct", group: "cena", lo: 5, navrh: true, why: "Koľko z tržieb ide na marketing. Tvoj cieľ na 2026 je 5 % — dnes je to zlomok toho, čo znamená, že rast stojí takmer výlučne na referenciách." },
  { id: "online", label: "Online podiel", unit: "pct", group: "cena", why: "Podiel online tréningov na hodnote odtrénovaného — decentralizácia rizika." },
];

// Targets Jerry moved himself, keyed year → kpi id. They win over his sheet.
export type KpiOverrides = Record<string, Record<string, { lo?: number; hi?: number }>>;

export function kpiDefs(year: string, overrides?: KpiOverrides): KpiDef[] {
  const t = KPI_YEAR_TARGETS[year] ?? {};
  const o = overrides?.[year] ?? {};
  return [...KPI_COMMON, ...KPI_EXTRA]
    .filter((d) => d.navrh || t[d.id] || d.id === "marza" || d.id === "trzby")
    .map((d) => ({ ...d, ...(t[d.id] ?? {}), ...(o[d.id] ?? {}) }));
}

// Slider bounds for editing a target: wide enough to be useful, tight enough
// that dragging it feels like a decision rather than a lottery.
export function kpiSlider(def: KpiDef): { min: number; max: number; step: number } {
  const base = def.lo || 1;
  if (def.unit === "czk") {
    const step = base >= 500000 ? 50000 : base >= 10000 ? 1000 : 50;
    return { min: Math.max(0, Math.round((base * 0.4) / step) * step), max: Math.round((base * 2) / step) * step, step };
  }
  if (def.unit === "pct") return { min: 0, max: Math.max(30, Math.ceil(base * 2)), step: 1 };
  if (def.unit === "h") return { min: Math.round(base * 0.4), max: Math.round(base * 1.8), step: base > 500 ? 50 : 1 };
  return { min: Math.max(0, Math.round(base * 0.4)), max: Math.round(base * 2), step: 1 };
}

// What to actually do about a KPI that is off target. Two rules: every line has
// to name a lever this studio can pull, and where a number can be computed it is
// computed — "zdvihni cenu" is advice, "+100 Kč/h ≈ +21 000 Kč/mes" is a decision.
// Jerry's own book notes get added here once he sends them; until then this is
// grounded in PSB's data and the advisory rules already in the knowledge base.
export type KpiAdviceCtx = { value: number; target: number | null; unit: KpiUnit; hodinyMes: number; trzbyMes: number; klienti: number };

export function kpiAdvice(id: string, c: KpiAdviceCtx): string[] {
  const chyba = c.target != null ? c.target - c.value : 0;
  const kc = (n: number) => `${Math.round(n).toLocaleString("sk-SK")} Kč`;
  switch (id) {
    case "trzby":
      return [
        "Tržby sú výsledok troch čísel: koľko hodín odtrénuješ, za koľko, a ako dlho klient zostane. Rásť sa dá v ktoromkoľvek — najlacnejšie je to tretie.",
        `Dnes robíš ${Math.round(c.hodinyMes)} h/mes. Keby si zdvihol cenu o 100 Kč/h, je to ${kc(c.hodinyMes * 100)}/mes bez jedinej hodiny navyše.`,
      ];
    case "marza":
      return [
        chyba > 0 ? `Do cieľa chýba ${chyba.toFixed(1)} b. p., čo je pri dnešných tržbách asi ${kc((chyba / 100) * c.trzbyMes)}/mes.` : "Si na cieli — drž náklady, keď porastú tržby.",
        "Marža sa nezlepší škrtaním drobností. Dve páky, ktoré s ňou naozaj hýbu: cena za hodinu a podiel výplat na tržbách (dnes ~60 %).",
        "Pozor na poradie: najprv cena, potom náklady. Škrtanie voliteľných nákladov ti dá pár tisíc, cena desaťtisíce.",
      ];
    case "rezerva":
      return [
        "Toto číslo rozhoduje, či ťa jeden slabý mesiac položí. Break-even ráta s nárokom oboch trénerov, takže rastie zakaždým, keď si zvýšite výplatu.",
        "Najrýchlejšia páka nie sú tržby, ale záväzné náklady — tie platíš aj v mesiaci, keď nikto nepríde.",
      ];
    case "uvodne":
      return [
        "Vrch lievika. Ak je tempo nad cieľom a úspešnosť tiež, problém nie je v počte úvodných — netlač viac ľudí do dverí, ktoré fungujú.",
        "Referencie sú tvoj najsilnejší kanál. Pripomienka na 10 % zľavu za doporučenie je v „Na čo sa pozrieť“ — to je lacnejší úvodný tréning než akákoľvek reklama.",
      ];
    case "uspesnost":
      return [
        "Vysoká úspešnosť pri malom počte úvodných znamená, že brzdou je vrch lievika, nie predaj.",
        "Ak klesne: nie je to o cene. Podľa tvojho vlastného manuálu je námietka „je to drahé“ takmer vždy o nejasnom výsledku — vráť sa k tomu, čo klient dostane za 8 týždňov.",
      ];
    case "aktivni":
      return [
        `Dnes ${Math.round(c.value)} ľudí mesačne. Každý ďalší znamená ďalšie hodiny — pozri najprv kapacitu, či je kam rásť.`,
        "Ak je kapacita plná, rast už nie je o počte klientov, ale o cene za hodinu.",
      ];
    case "hodiny":
      return [
        "Strop nie je cieľ. Zdravá zóna je 24–34 h týždenne na trénera; nad ňou rastie riziko vyhorenia rýchlejšie než tržby.",
        "Ak si na tempe a marža stále zaostáva, odpoveď nie je viac hodín.",
      ];
    case "hodinKlient":
      return [
        "Málo hodín na klienta = veľa ľudí, čo chodia občas. To je najhorší mix: rovnaká réžia, menej tržieb, horšie výsledky.",
        "Páka je frekvencia a viazanosť — klient s 6M členstvom má toto číslo dvojnásobné oproti balíčkovému.",
      ];
    case "dlzka":
      return [
        `Priemer ${c.value.toFixed(1)} mes. Jeden mesiac navyše u každého z ${c.klienti} klientov je ~${kc((c.trzbyMes / Math.max(1, c.klienti)) * c.klienti)} tržieb — a nestojí ani korunu marketingu.`,
        "Najväčší odchod je na konci balíčka. Widget „Blíži sa koniec balíčka“ je presne na to — ozvať sa skôr, než sa rozhodne sám.",
        "Prechod z balíčkov na 6M členstvo rieši toto číslo aj kolísavý cashflow naraz.",
      ];
    case "hodinovka":
      return [
        `Každých +50 Kč/h je pri dnešnom objeme ~${kc(c.hodinyMes * 50)}/mes navyše.`,
        "Cena sa dá zdvihnúť aj bez cenníka: doviesť starých klientov na nové členstvá, obmedziť zľavy na tie, čo majú dôvod (referencia, BTC).",
      ];
    case "ltv":
      return [
        `Klient ti za celý čas prinesie ~${kc(c.value)}. To je strop toho, čo sa oplatí zaplatiť za jeho získanie — a odpoveď na otázku, či má Google reklama zmysel.`,
        "LTV rastie dvomi cestami: dlhšou spoluprácou alebo vyššou cenou. Prvá je lacnejšia.",
      ];
    case "online":
      return [
        "Online je jediná páka, ktorá zvyšuje tržby bez ďalších hodín v štúdiu — preto je v cieľoch.",
        "Ak sa nehýbe, nie je to o dopyte, ale o tom, že sa neponúka. Zaraď ho do úvodného tréningu ako druhú možnosť, nie ako náhradu.",
      ];
    default:
      return [];
  }
}

export type KpiActual = {
  def: KpiDef;
  value: number;
  target: number | null;   // pro-rated where annual
  targetLabel: string;
  status: "ok" | "blizko" | "mimo" | "info";
  window: string;
  extra?: string;          // second reading of the same fact, e.g. the koruny behind a %
  advice: string[];
};

type SessionLike = { date: string; client: string; sessionTrainer: string; sessionType: string; duration: number; price: number };
type PaymentLike = { date: string; amount: number };

// Everything here is derived from the Tracker's own data (PTminder), not from
// the Excel — the Excel is an archive from 2026-07-31 on.
export function computeKpis(year: string, sessions: SessionLike[], payments: PaymentLike[], overrides?: KpiOverrides, rezervaCzk?: number | null): KpiActual[] {
  const inYear = sessions.filter((s) => s.date.slice(0, 4) === year);
  const months = new Set(inYear.map((s) => s.date.slice(0, 7)));
  const nMonths = months.size || 1;
  const payYear = payments.filter((p) => p.date.slice(0, 4) === year);

  const uvodne = inYear.filter((s) => s.sessionType === "UVODNE");
  const trenovane = inYear.filter((s) => s.sessionType !== "UVODNE");
  const hodiny = trenovane.reduce((a, s) => a + s.duration / 60, 0);
  const hodnota = inYear.reduce((a, s) => a + s.price, 0);
  const onlineHodnota = inYear.filter((s) => s.sessionType === "ONLINE").reduce((a, s) => a + s.price, 0);
  const trzby = payYear.reduce((a, p) => a + p.amount, 0);
  const klienti = new Set(inYear.map((s) => s.client)).size || 1;

  // Active clients: distinct people who actually came, averaged over months.
  const perMonth: Record<string, Set<string>> = {};
  for (const s of inYear) (perMonth[s.date.slice(0, 7)] ||= new Set()).add(s.client);
  const aktivni = Object.values(perMonth).reduce((a, s) => a + s.size, 0) / nMonths;

  // Conversion: of the people whose first intro session falls in this year, how
  // many came back for a real session afterwards.
  const firstUvodny: Record<string, string> = {};
  for (const s of sessions) {
    if (s.sessionType !== "UVODNE") continue;
    if (!firstUvodny[s.client] || s.date < firstUvodny[s.client]) firstUvodny[s.client] = s.date;
  }
  const kandidati = Object.entries(firstUvodny).filter(([, d]) => d.slice(0, 4) === year);
  const pokracovali = kandidati.filter(([c, d]) =>
    sessions.some((s) => s.client === c && s.date > d && s.sessionType !== "UVODNE"));
  const uspesnost = kandidati.length ? (pokracovali.length / kandidati.length) * 100 : 0;

  // Tenure + LTV over the whole history (not just this year) — a one-year slice
  // would say more about the window than about the clients.
  const span: Record<string, { first: string; last: string; czk: number; n: number }> = {};
  for (const s of sessions) {
    const g = (span[s.client] ||= { first: s.date, last: s.date, czk: 0, n: 0 });
    if (s.date < g.first) g.first = s.date;
    if (s.date > g.last) g.last = s.date;
    g.czk += s.price;
    g.n++;
  }
  const usadeni = Object.values(span).filter((g) => g.n >= 3);
  const MES = 1000 * 60 * 60 * 24 * 30.44;
  const dlzka = usadeni.length ? usadeni.reduce((a, g) => a + (new Date(g.last).getTime() - new Date(g.first).getTime()) / MES, 0) / usadeni.length : 0;
  const ltv = usadeni.length ? usadeni.reduce((a, g) => a + g.czk, 0) / usadeni.length : 0;

  // Margin + break-even reserve come from VZAS (Excel-validated costs), so they
  // only span the months VZAS covers — jan–jún for 2026, not the full year.
  const p = pnlCalc();
  const idx = YEAR_IDX[year] ?? [];
  const vzasPrijmy = idx.reduce((a, i) => a + p.prijmy[i], 0);
  const vzasZisk = idx.reduce((a, i) => a + p.hrubyZisk[i], 0);
  const marza = vzasPrijmy > 0 ? (vzasZisk / vzasPrijmy) * 100 : 0;
  const j = salaryCalc("jerry");
  const t = salaryCalc("terezka");
  const be = idx.reduce((a, i) => a + p.bezVyplat[i] + j.narok[i] + t.narok[i] + p.matyas[i], 0);
  const rezerva = be > 0 ? ((vzasPrijmy - be) / be) * 100 : 0;

  const raw: Record<string, number> = {
    trzby, marza, rezerva, uvodne: uvodne.length, uspesnost, aktivni, hodiny,
    hodinKlient: hodiny / klienti, hodinovka: hodiny > 0 ? trzby / hodiny : 0,
    online: hodnota > 0 ? (onlineHodnota / hodnota) * 100 : 0, dlzka, ltv,
    // Reserve comes from the Bitcoin app; without it the row shows 0 and says so.
    rezervaMes: rezervaCzk && be > 0 ? rezervaCzk / (be / idx.length) : 0,
    marketingPct: vzasPrijmy > 0 ? (idx.reduce((a, i) => a + sumItems(PNL.fixne.subcategories.marketing.items)[i], 0) / vzasPrijmy) * 100 : 0,
  };

  const vzasWindow = `${VZAS_MONTH_LABELS[idx[0]]} – ${VZAS_MONTH_LABELS[idx[idx.length - 1]]}`;
  const dataWindow = `${nMonths} mes. ${year}`;
  const ctx: KpiAdviceCtx = {
    value: 0, target: null, unit: "num",
    hodinyMes: hodiny / nMonths,
    trzbyMes: trzby / nMonths,
    klienti: Math.round(aktivni),
  };
  // The koruna reading of the break-even gap — a percentage alone never told
  // anyone how big a bad month can be.
  const rezervaKc = idx.length ? (vzasPrijmy - be) / idx.length : 0;

  return kpiDefs(year, overrides).map((def) => {
    const value = raw[def.id] ?? 0;
    const target = def.lo == null ? null : def.annual ? (def.lo / 12) * nMonths : def.lo;
    const targetLabel = def.lo == null ? "—"
      : def.annual ? (def.hi ? `${def.lo}–${def.hi} / rok` : `${def.lo} / rok`)
      : def.hi ? `${def.lo}–${def.hi}` : `≥ ${def.lo}`;
    const status: KpiActual["status"] =
      target == null ? "info" : value >= target ? "ok" : value >= target * 0.85 ? "blizko" : "mimo";
    const window = def.id === "rezervaMes" ? "dnes, z BTC appky"
      : def.id === "marketingPct" ? vzasWindow
      : def.id === "marza" || def.id === "rezerva" ? vzasWindow
      : def.id === "dlzka" || def.id === "ltv" ? "celá história"
      : dataWindow;
    const extra = def.id === "rezerva" ? `${Math.round(rezervaKc).toLocaleString("sk-SK")} Kč / mes. nad break-even`
      : def.id === "dlzka" ? "mesiacov"
      : undefined;
    return { def, value, target, targetLabel, status, window, extra, advice: kpiAdvice(def.id, { ...ctx, value, target, unit: def.unit }) };
  });
}

// ── Ciele ────────────────────────────────────────────────────────────────────
// From the "Ciele 2026" sheet. Two of his thirteen are gone on purpose: "Rezerva
// 120 000 Kč+" and "Online tréningy 5–10 % obratu" are already tracked as KPIs,
// and a goal that lives in two places gets updated in neither.
//
// The split that matters: a MEASURABLE goal points at a KPI and a target value,
// so the app computes progress instead of asking; a PROJECT goal has no
// percentage, only a state and a next step. Without that next step a goal list
// is a wish list — it is the one field that decides whether anything moves.
export type GoalStav = "nezacate" | "bezi" | "hotove" | "zrusene";
export type GoalPriorita = "vysoka" | "stredna" | "nizka";
export type Goal = {
  id: string;
  nazov: string;
  preco: string;
  typ: "meratelny" | "projekt";
  kpiId?: string;
  cielovaHodnota?: number;
  termin?: string;      // YYYY-MM-DD
  stav: GoalStav;
  priorita: GoalPriorita;
  dalsiKrok?: string;
  poznamka?: string;
};

export const GOAL_STAV_LABEL: Record<GoalStav, string> = {
  nezacate: "Nezačaté", bezi: "Beží", hotove: "Hotové", zrusene: "Zrušené",
};
export const GOAL_PRIORITA_LABEL: Record<GoalPriorita, string> = {
  vysoka: "Vysoká", stredna: "Stredná", nizka: "Nízka",
};

// Ciele navrhnuté z dát (atribúcia z anamnéz, 1. 8. 2026). Nepatria do
// SEED_CIELE: Jerry si zoznam medzitým sám prepísal a seed sa už nepoužíva —
// tieto sa k jeho zoznamu PRIDAJÚ podľa id, takže sa nikdy nezduplikujú a nič
// z toho, čo napísal, neprepíšu.
export const NOVE_CIELE: Goal[] = [
  { id: "dalsi-trener", nazov: "Ďalší tréner", preco: "Jediný cieľ, ktorý reálne zníži Jerryho hodiny. Web je zámerne písaný pre trénerov, ale nikde sa nemeria, koľko ľudí sa ozvalo.", typ: "projekt", termin: "2027-06-30", stav: "nezacate", priorita: "vysoka", dalsiKrok: "Merať počet uchádzačov; cieľ aspoň 5, z toho 1 nastúpi", poznamka: "Navrhol Jarvis · úzke hrdlo firmy podľa ich vlastného profilu" },
  { id: "fp-adresar", nazov: "FP adresár — 12 klientov za rok", preco: "Šesť klientov za 13 mesiacov prišlo cez stránku Functional Patterns. Kanál zadarmo, ktorý nikto nespravuje ani nesleduje — a je na úrovni Googlu.", typ: "projekt", termin: "2027-07-31", stav: "nezacate", priorita: "stredna", dalsiKrok: "Aktualizovať profil v FP adresári a skontrolovať, kam odkazuje", poznamka: "Navrhol Jarvis" },
  { id: "ig-zdielania", nazov: "Zdieľania na Instagrame 7 → 20 mesačne", preco: "Zdieľanie je najbližšia vec k referencii — je to moment, keď niekto pošle obsah kamarátovi. Spadlo z 34 (apr 2026) na 7 (jún 2026), pričom uloženia zostali rovnaké. Obsah je stále užitočný, ale prestal byť prerozprávateľný.", typ: "projekt", termin: "2026-12-31", stav: "nezacate", priorita: "stredna", dalsiKrok: "Nie viac príspevkov — viac klientskych príbehov, kde prvú vetu hovorí klient", poznamka: "Navrhol Jarvis" },
  { id: "google-kliky", nazov: "Kliky z Googlu 240 → 350 mesačne", preco: "Najpomalší kanál a jediný, ktorý neprestane fungovať, keď prestaneš platiť. Rastie sám (110 → 240 za rok), cieľ je hlavne poistka, aby si ho neprestal sledovať.", typ: "projekt", termin: "2026-12-31", stav: "nezacate", priorita: "nizka", dalsiKrok: "Prepísať titulky stránok s vysokými zobrazeniami a nulovým preklikom", poznamka: "Navrhol Jarvis" },
];

export const SEED_CIELE: Goal[] = [
  { id: "google", nazov: "Google reklamy a marketing", preco: "Referencie sú silné, ale nedajú sa naplánovať — potrebujem kanál, ktorý viem zapnúť.", typ: "meratelny", kpiId: "marketingPct", cielovaHodnota: 5, termin: "2026-02-28", stav: "bezi", priorita: "vysoka", dalsiKrok: "Navýšiť marketing na 5 % tržieb, z toho 75 % Google", poznamka: "" },
  { id: "viazanost", nazov: "Polročná viazanosť", preco: "Dlhšia spolupráca je lacnejšia než nový klient a vyrovnáva cashflow.", typ: "projekt", termin: "2026-02-28", stav: "bezi", priorita: "vysoka", dalsiKrok: "Vymyslieť spôsob, ako ich predávať pri úvodnom tréningu", poznamka: "" },
  { id: "online2x", nazov: "2× online tréning ZDARMA", preco: "Vstupná brána do online bez rizika pre klienta.", typ: "projekt", termin: "2026-02-28", stav: "nezacate", priorita: "vysoka", dalsiKrok: "Vytvoriť reklamu", poznamka: "" },
  { id: "uvodny3", nazov: "3-krokový úvodný proces", preco: "Úvodný tréning konvertuje na 83 %, ale je ich málo — proces zvýši počet aj kvalitu.", typ: "projekt", termin: "2026-03-31", stav: "nezacate", priorita: "vysoka", dalsiKrok: "Samoanalýza → 20 min call → úvodný tréning", poznamka: "" },
  { id: "newsletter", nazov: "Newsletter / Mailer", preco: "Kontakt na ľudí, ktorí ešte nie sú klienti — dnes ich nemám kde osloviť.", typ: "projekt", termin: "2026-06-30", stav: "nezacate", priorita: "stredna", dalsiKrok: "Pravidelný newsletter a testovanie ponúk", poznamka: "" },
  { id: "eshop", nazov: "E-shop PSB.cz", preco: "Príjem, ktorý nestojí na odtrénovanej hodine.", typ: "projekt", termin: "2026-09-30", stav: "nezacate", priorita: "stredna", dalsiKrok: "Digitálne produkty — Bitrilógia, kapitoly", poznamka: "" },
  { id: "vzdelavanie", nazov: "Vzdelávanie Nubound / P-DTR", preco: "Rozšírenie odborných kompetencií.", typ: "projekt", termin: "2026-12-31", stav: "bezi", priorita: "vysoka", dalsiKrok: "", poznamka: "" },
  { id: "vybavenie", nazov: "Doplnenie vybavenia", preco: "Tyč, kettlebell, mace, medicinbal, závažia — chýbajúce náradie limituje tréning.", typ: "projekt", termin: "2026-12-31", stav: "bezi", priorita: "stredna", dalsiKrok: "", poznamka: "Nákupný zoznam z Excelu: ~17 000 Kč" },
  { id: "vyziva", nazov: "Výživa — pilotný projekt", preco: "Test, či má zmysel doplnková služba.", typ: "projekt", termin: "2026-12-31", stav: "nezacate", priorita: "stredna", dalsiKrok: "2 klienti zdarma, case studies", poznamka: "" },
  { id: "merch", nazov: "Merch (mikiny)", preco: "Budovanie značky + doplnkový príjem.", typ: "projekt", stav: "nezacate", priorita: "nizka", dalsiKrok: "", poznamka: "" },
  { id: "herohero", nazov: "HeroHero / Patreon", preco: "Exkluzívny obsah — len ak bude jasná hodnota pre platiaceho.", typ: "projekt", stav: "nezacate", priorita: "nizka", dalsiKrok: "", poznamka: "" },
];
