// VZAS — the financial half of the Tracker: monthly P&L, the two founders'
// salary model, and debt bookkeeping (founders ↔ company, plus the external
// investor). Pure data + pure functions, no browser globals.
//
// PHASE 1 (read-only): the figures below are the validated snapshot from the
// "VZAS 2026" Excel (Jan–Jún 2026). Later phases replace them with values
// derived from imported Fio bank statements + Tracker Sessions, at which point
// this file keeps only the calculations.

export const VZAS_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"] as const;
export const VZAS_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Máj", "Jún"] as const;
const N = VZAS_MONTHS.length;

export type Vals = number[]; // one value per month, length N

export type VzasItem = { label: string; values: Vals };
export type VzasGroup = { label: string; items: Record<string, VzasItem> };
export type VzasSection = { label: string; subcategories: Record<string, VzasGroup> };

// ── P&L ──────────────────────────────────────────────────────────────────────
export const PNL: Record<"fixne" | "variabilne", VzasSection> = {
  fixne: {
    label: "Fixné náklady",
    subcategories: {
      prevadzka: {
        label: "Prevádzka",
        items: {
          najom: { label: "Nájom + energie", values: [29250, 32261, 10000, 48500, 29250, 29250] },
          splatkaJarek: { label: "Splátka Jarek", values: [5000, 5000, 5000, 5000, 5000, 0] },
          statTerezka: { label: "Štát Terezka", values: [1595, 1595, 1595, 6048, 12264, 5832] },
          // Od feb 2026 je Štát Jerry výhradne P&L náklad; v jan 2026 šiel
          // naposledy cez osobný kanál výplaty (preto je tu 0 a suma je v Poslanom).
          statJerry: { label: "Štát Jerry", values: [0, 9761, 19635, 9761, 9761, 9761] },
          fondNaradie: { label: "Fond na náradie", values: [0, 0, -10000, 0, 0, 0] },
        },
      },
      marketing: {
        label: "Marketing",
        items: {
          facebook: { label: "Facebook", values: [0, 1399, 3794, 3344, 3052, 2162] },
          google: { label: "Google", values: [0, 0, 0, 0, 0, 0] },
          offline: { label: "Offline", values: [0, 0, 0, 0, 0, 0] },
        },
      },
      apps: {
        label: "Apps",
        items: {
          adobe: { label: "Adobe", values: [1973, 1976, 1992, 1982, 465, 464] },
          canva: { label: "Canva", values: [0, 0, 0, 800, 0, 0] },
          captions: { label: "Captions", values: [1398, 299, 699, 699, 699, 699] },
          capcut: { label: "CapCut", values: [699, 699, 699, 699, 699, 699] },
          ai: { label: "ChatGPT/Claude/Perplexity/HF", values: [514, 2287, 1074, 1686, 2553, 3550] },
          idoklad: { label: "i.doklad", values: [290, 290, 290, 290, 290, 290] },
          mailer: { label: "Mailer", values: [0, 0, 0, 0, 0, 0] },
          metricool: { label: "Metricool", values: [565, 565, 579, 582, 570, 571] },
          microsoft: { label: "Microsoft", values: [349, 349, 349, 349, 349, 349] },
          ptminder: { label: "PTminder", values: [1568, 2489, 1749, 2296, 1627, 2267] },
          truecoach: { label: "TrueCoach", values: [642, 630, 655, 641, 640, 645] },
          ine: { label: "Iné", values: [121, 0, 240, 0, 0, 0] },
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
          pravnicka: { label: "Právnička/Účto", values: [3450, 0, 0, 0, 0, 0] },
          telefon: { label: "Telefón", values: [0, 1629, 1639, 1702, 1686, 1690] },
          grafik: { label: "Grafik/Ads manager", values: [0, 2003, 2000, 0, 0, 0] },
          web: { label: "Web/hosting", values: [0, 0, 0, 0, 0, 4763] },
          teambuilding: { label: "Teambuilding", values: [0, 0, 0, 0, 0, 0] },
          ine: { label: "Iné výdaje", values: [0, 0, 469, 550, 0, 3000] },
        },
      },
      produkty: {
        label: "Produkty",
        items: {
          atipicke: { label: "Atipické nákupy", values: [0, 0, 0, 355, 0, 0] },
          merch: { label: "Merch/doplnky", values: [0, 0, 0, 0, 0, 0] },
        },
      },
      prevadzka2: {
        label: "Prevádzka",
        items: {
          pomocky: { label: "Pomôcky na cvičenie", values: [0, 0, 2317, 0, 7997, 0] },
          kava: { label: "Káva", values: [1349, 0, 1349, 0, 0, 1349] },
          caj: { label: "Čaj/kakao", values: [0, 0, 0, 0, 0, 0] },
          drogeria: { label: "Drogéria", values: [425, 697, 240, 440, 60, 180] },
          elektro: { label: "Elektro/Filtre", values: [6724, 1435, 0, 0, 0, 3187] },
          poistenie: { label: "Popl. za poistenie", values: [10, 10, 10, 10, 10, 10] },
        },
      },
    },
  },
};

// ── salary model ─────────────────────────────────────────────────────────────
export type PersonKey = "jerry" | "terezka";

export type SalaryPerson = {
  label: string;
  fix: number;
  hoursThreshold: number;
  hourlyRate: number;
  hours: Vals;
  personal: Record<string, Vals>;
};

export const SALARY: Record<PersonKey, SalaryPerson> = {
  jerry: {
    label: "Jerry",
    fix: 27000,
    hoursThreshold: 60,
    hourlyRate: 850,
    hours: [85, 86, 106, 106, 84, 82],
    personal: {
      "Výplata": [12000, 18000, 20500, 30712, 36727, 21024],
      "BTC": [2800, 1500, 9000, 0, 1000, 1500],
      "FP.Spain": [0, 2440, 0, 13575, 0, 0],
      "Invest": [500, 1500, 0, 500, 0, 500],
      "Salina": [550, 550, 0, 550, 0, 1370],
      "Notebook": [2000, 2000, 2000, 2000, 0, 0],
      "Nájom 2": [1500, 1500, 0, 1500, 1500, 1650],
      "Štát (len jan 26)": [9761, 0, 0, 0, 0, 0],
    },
  },
  terezka: {
    label: "Terezka",
    fix: 27000,
    hoursThreshold: 60,
    hourlyRate: 850,
    hours: [73, 67, 95, 97, 99, 84],
    personal: {
      "Výplata": [10900, 17230, 18200, 24000, 9438, 20500],
      "BTC": [1600, 0, 2500, 0, 0, 0],
      "Invest": [500, 500, 0, 0, 0, 0],
      "Salina": [550, 500, 0, 0, 0, 0],
      "Notebook": [2000, 2000, 2000, 2000, 0, 0],
      "Štát dlžob": [0, 3600, 0, 0, 0, 0],
      "Nájom 2": [1500, 1500, 0, 1500, 1500, 1650],
    },
  },
};

// Shared household spending — summed, then split /2 into each founder's "Poslané".
export const SPOLOCNE: Record<string, Vals> = {
  "Nájom": [19700, 19700, 8000, 34700, 19700, 19700],
  "Potraviny": [13900, 19500, 19500, 20000, 14093, 25201],
  "Ahsoka": [0, 0, 0, 8000, 25998, 19725],
  "Výlety": [0, 0, 0, 0, 2924, 0],
  "Doplnky": [2377, 0, 1544, 0, 978, 1216],
  "Iné": [1400, 6300, 3654, 17500, 2999, 3789],
};

// Matyáš — employee Jan–Mar 2026 (no entitlement/debt logic, just a payroll cost).
// Source: "Matyáš vyplata" sheet, monthly totals. The prototype omitted him,
// which understated Výplaty (and so overstated profit) for Q1.
export const MATYAS: Vals = [2310, 2890, 3700, 0, 0, 0];

// Monthly income (tržby) — PTminder is the authoritative source.
export const PRIJMY: Vals = [150113, 221660, 122286, 245495, 221470, 180850];

// Opening debt balances at 1.1.2026 (negative = the person owes the company).
export const DEBT_OPENING: Record<PersonKey | "jarek", number> = {
  jerry: -74139,
  terezka: -10473,
  jarek: -334910,
};

// Jarek (external investor): fix repayment is BOTH a P&L cost and a debt
// operation; "Sofia" is forgone revenue (never a bank transaction).
export const JAREK_SPLATKY: Record<string, Vals> = {
  "Fix splátka (P&L náklad)": [5000, 5000, 5000, 5000, 5000, 0],
  "Sofia (vzdaná tržba)": [7790, 0, 7790, 7790, 0, 0],
  "20 % zľava ročné": [0, 0, 0, 0, 0, 0],
};

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
  narok: Vals;
  personalTotal: Vals;
  spolocneHalf: Vals;
  poslane: Vals;
  rozdiel: Vals;
  cumDebt: Vals;
};

// Nárok = Fix + max(0, (hodiny − prah) × sadzba)
// Poslané = osobné kanály + Spoločné/2
// Rozdiel = Nárok − Poslané  (kladný = firma dlží trénerovi)
// Kumulovaný dlh(N) = dlh(N−1) + Rozdiel(N)   ← per brief §06
export function salaryCalc(key: PersonKey): SalaryCalc {
  const s = SALARY[key];
  const variabil = s.hours.map((h) => Math.max(0, (h - s.hoursThreshold) * s.hourlyRate));
  const narok = variabil.map((v) => v + s.fix);
  const personalTotal = vAdd(...Object.values(s.personal));
  const half = spolocneHalf();
  const poslane = vAdd(personalTotal, half);
  const rozdiel = narok.map((v, i) => v - poslane[i]);
  const cumDebt: Vals = [];
  rozdiel.forEach((r, i) => {
    const prev = i === 0 ? DEBT_OPENING[key] : cumDebt[i - 1];
    cumDebt.push(prev + r);
  });
  return { variabil, narok, personalTotal, spolocneHalf: half, poslane, rozdiel, cumDebt };
}

// Stav Jarek(N) = Stav(N−1) + Splátky(N) − Nové vklady(N). (Žiadne nové vklady zatiaľ.)
export function jarekCalc(): { splatkySpolu: Vals; stav: Vals } {
  const splatkySpolu = vAdd(...Object.values(JAREK_SPLATKY));
  const stav: Vals = [];
  splatkySpolu.forEach((s, i) => {
    const prev = i === 0 ? DEBT_OPENING.jarek : stav[i - 1];
    stav.push(prev + s);
  });
  return { splatkySpolu, stav };
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
  // Fixné → Prevádzka
  "fixne.prevadzka.najom": "zavazne",
  "fixne.prevadzka.splatkaJarek": "neprevadzkove", // splátka istiny = financovanie
  "fixne.prevadzka.statTerezka": "zavazne",
  "fixne.prevadzka.statJerry": "zavazne",
  "fixne.prevadzka.fondNaradie": "neprevadzkove", // presun do/z rezervy, nie výdavok
  // Fixné → Marketing (všetko voliteľné — rozhoduješ sa každý mesiac)
  "fixne.marketing.facebook": "volitelne",
  "fixne.marketing.google": "volitelne",
  "fixne.marketing.offline": "volitelne",
  // Fixné → Apps
  "fixne.apps.adobe": "volitelne",
  "fixne.apps.canva": "volitelne",
  "fixne.apps.captions": "volitelne",
  "fixne.apps.capcut": "volitelne",
  "fixne.apps.ai": "volitelne",
  "fixne.apps.idoklad": "zavazne", // účtovníctvo
  "fixne.apps.mailer": "volitelne",
  "fixne.apps.metricool": "volitelne",
  "fixne.apps.microsoft": "zavazne",
  "fixne.apps.ptminder": "zavazne", // rezervácie — bez toho štúdio nebeží
  "fixne.apps.truecoach": "zavazne", // doručovanie tréningov klientom
  "fixne.apps.ine": "volitelne",
  // Variabilné → Služby
  "variabilne.sluzby.pravnicka": "zavazne",
  "variabilne.sluzby.telefon": "zavazne",
  "variabilne.sluzby.grafik": "volitelne",
  "variabilne.sluzby.web": "zavazne",
  "variabilne.sluzby.teambuilding": "volitelne",
  "variabilne.sluzby.ine": "volitelne",
  // Variabilné → Produkty
  "variabilne.produkty.atipicke": "volitelne",
  "variabilne.produkty.merch": "volitelne",
  // Variabilné → Prevádzka
  "variabilne.prevadzka2.pomocky": "volitelne",
  "variabilne.prevadzka2.kava": "volitelne",
  "variabilne.prevadzka2.caj": "volitelne",
  "variabilne.prevadzka2.drogeria": "zavazne", // upratovanie — prevádzková nutnosť
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
export const monthKeyOf = (i: number) => `2026-${String(i + 1).padStart(2, "0")}`;

// Jerry's monthly review. Six questions, reworked with him from the original
// seven in the Excel: three of those asked the same "one-off vs recurring"
// thing from different angles, and two (čo fungovalo / nefungovalo) went
// unanswered five months out of six. "energy" renders as a slider plus a
// non-training hours field — the model only pays for training hours, so
// without that second number an energy score can't be read honestly.
export type QuestionKind = "text" | "energy";
export const MONTH_QUESTIONS: { id: string; q: string; kind?: QuestionKind }[] = [
  { id: "stalo", q: "Čo zásadné sa tento mesiac stalo?" },
  { id: "jednorazove", q: "Čo z tržieb aj výdavkov bolo jednorazové a čo sa bude opakovať?" },
  { id: "klienti", q: "Pribudol alebo odišiel niekto z klientov? Prečo?" },
  { id: "energia", q: "Energia a záťaž", kind: "energy" },
  { id: "buduci", q: "Čo už teraz viem o budúcom mesiaci?" },
];
// Energy answers live under these keys inside the same answers JSON.
export const ENERGY_SCORE = "energia_score";
export const ENERGY_HOURS = "energia_hodiny";
export const ENERGY_NOTE = "energia_note";

// Every question is answered by both founders; the answers live under
// "<id>__jerry" / "<id>__terezka" in the same JSON blob.
export const answerKey = (base: string, person: PersonKey) => `${base}__${person}`;

// Jerry's existing answers, remapped onto the new questions. The wording is
// his; only the grouping changed (e.g. "odkiaľ noví" + "koľko pokračovalo"
// merged into one client question). Energy scores are read from his own words
// and are a starting point he can drag.
export const SEED_ANSWERS: Record<string, Record<string, string>> = {
  "2026-01": {
    stalo__jerry: "prešli sme na nové členstvá, ostalo už len pár klientov so starými sumami",
    jednorazove__jerry: "Konsolidácia cien — trvalá zmena, nie jednorazová: náklady sú nižšie ako kedysi a aj na výplatách sme trošku ušetrili.",
    klienti__jerry: "Noví prevažne cez referencie. Zo 7 úvodných pokračovalo 5 klientov, dvaja nie — len to skúšali.",
    energia_score__jerry: "8",
    energia_note__jerry: "veľká rezerva",
  },
  "2026-02": {
    stalo__jerry: "Radek a Lenka si predplatili 18 h a Gažo omylom poslal za 16 h",
    jednorazove__jerry: "Predplatby Radek + Lenka (18 h) a omylom poslaná platba od Gaža (za 16 h) — jednorazové, v ďalších mesiacoch sa nezopakujú.",
    klienti__jerry: "Prokop prišiel cez Google (organika), ostatní cez referencie. Z úvodných pokračovali traja.",
    energia_score__jerry: "8",
    energia_note__jerry: "je tam stále rezerva, spravili sme 160 h, čo je málo",
  },
  "2026-03": {
    stalo__jerry: "mali sme najviac tréningov s najmenej tržbami. veľa ľudí vyprokrastinovalo platby, mali by sme o cca 50k viac keby nemeškali. je to naša chyba, pretože sme na nich málo tlačili",
    jednorazove__jerry: "Chýbajúcich ~50 000 boli oneskorené platby klientov, nie výpadok dopytu — presunuli sa do ďalších mesiacov.",
    klienti__jerry: "Noví prevažne cez referencie. Z úvodných pokračovali 4 z 5.",
    energia_score__jerry: "7",
    energia_note__jerry: "na to, že sme spravili najviac hodín a bol tu týždeň cez 30 h týždenne, sa cítim celkom fresh",
  },
  "2026-04": {
    stalo__jerry: "zomrela Katka, Janovi sme preto pomohli zaplatiť aspoň jeden mesiac nájmu. súčasne sme mali najvyššie tržby za jeden mesiac",
    jednorazove__jerry: "Jednorazové: viacerí klienti predplatili hodiny dopredu a pomoc Janovi s nájmom. Trvalé: všetkým dobehli staré balíčky za staré ceny, takže sa naplno prejavila konsolidácia.",
    klienti__jerry: "Väčšina nových cez referencie.",
    energia_score__jerry: "7",
    energia_note__jerry: "je tam stále rezerva, s ktorou sa dá pracovať",
  },
  "2026-06": {
    stalo__jerry: "tento mesiac sme mali obmedzenú prevádzku, pretože sme mali Ahsoku",
    jednorazove__jerry: "Obmedzená prevádzka kvôli Ahsoke — jednorazové.",
  },
};

// Free-form note per month. Item-level detail also shows as a hover on the P&L
// line itself (ITEM_NOTES); it is repeated here so a month reads as one story.
export const SEED_NOTES: Record<string, string> = {
  "2026-01": "Fungovalo: hovorenie na internete.\n\nDetaily k položkám (z Excelu):\n• Captions: nedoplatok za december, tým pádom bol Captions 2× v januári účtovaný\n• Apps/Iné: Amazon Group Media\n• Právnička/Účto: Dumbrovská zmluva na polročné členstvá\n• Elektro/Filtre: Apple Pen + kryt iPad, vysávač, stojan na kotúče, kábel USB-B 3\n• BTC výdaje: 31.1 – 1000 Kč Jerry výplata; 29.1 – 1000 Kč Terka výplata; 16.1 – 600 Kč Terez výplata; 15.1 – 1000 Kč Jerry výplata; 9.1 – 500 Kč Jerry výplata; 3.1 – 300 Kč Jerry výplata; 26.1 – 3826 Kč vysávač, kábel, stojan; 17.1 – 1400 Kč hrniec, miska; 7.1 – 2898 Kč iPad; 7.1 – 2377 Kč doplnky",
  "2026-02": "Detaily k položkám (z Excelu):\n• Nájom + energie: platili sme energie 3011\n• AI nástroje: Claude PRO\n• BTC výdaje: 26.2 – 1500 Kč (106776) Jerry výplata; 4.2 – 2440 Kč (156789) Jerry FP",
  "2026-03": "Detaily k položkám (z Excelu):\n• Štát Jerry: dlh + platba\n• AI nástroje: Claude + ChatGPT\n• Apps/Iné: Higgsfield\n• Iné výdaje: UniHobby presadzanie\n• Pomôcky na cvičenie: kotúče 10 kg, 5 kg + lopta 4 kg",
  "2026-04": "Detaily k položkám (z Excelu):\n• Iné výdaje: Lozias poslanie 550 Kč — neviem za čo\n• Atipické nákupy: olej na kladku (Joom)",
  "2026-05": "Detaily k položkám (z Excelu):\n• Pomôcky na cvičenie: RG Bell 3 + 9 kg, FP tričká 2×",
  "2026-06": "Detaily k položkám (z Excelu):\n• Iné výdaje: Nubound Robo školenie\n• Elektro/Filtre: adaptér na nabíjačky + ventilátor + kanvica",
};

// Per-cell notes from the Excel, keyed "<section.group.item>|<monthIndex>".
// These surface as a hover on the exact P&L line they belong to.
export const ITEM_NOTES: Record<string, string> = {
  "fixne.prevadzka.najom|1": "platili sme energie 3011",
  "fixne.prevadzka.statJerry|2": "Dlh + platba",
  "fixne.apps.captions|0": "nedoplatok za december, tým pádom bol Captions 2× v januári účtovaný",
  "fixne.apps.ai|1": "Claude PRO",
  "fixne.apps.ai|2": "Claude + ChatGPT",
  "fixne.apps.ine|0": "Amazon Group Media",
  "fixne.apps.ine|2": "Higgsfield",
  "variabilne.sluzby.pravnicka|0": "Dumbrovská zmluva na polročné členstvá",
  "variabilne.sluzby.ine|2": "UniHobby presadzanie",
  "variabilne.sluzby.ine|3": "Lozias poslanie 550 Kč — neviem za čo",
  "variabilne.sluzby.ine|5": "Nubound Robo školenie",
  "variabilne.produkty.atipicke|3": "Olej na kladku (Joom)",
  "variabilne.prevadzka2.pomocky|2": "Kotúče 10 kg, 5 kg + lopta 4 kg",
  "variabilne.prevadzka2.pomocky|4": "RG Bell 3 + 9 kg, FP tričká 2×",
  "variabilne.prevadzka2.elektro|0": "Apple Pen + kryt iPad, vysávač, stojan na kotúče, kábel USB-B 3",
  "variabilne.prevadzka2.elektro|5": "Adaptér na nabíjačky + ventilátor + kanvica",
};
export const itemNote = (path: string, monthIdx: number): string | undefined => ITEM_NOTES[`${path}|${monthIdx}`];

export type Deviation = { label: string; group: string; value: number; typical: number; diff: number; pct: number };

// What actually made this month different: every line compared against its own
// average across the other months, biggest gaps first. This is what turns
// "why were April's costs so high?" into an answer instead of a question.
export function monthDeviations(monthIdx: number, topN = 6, floor = 3000): Deviation[] {
  const out: Deviation[] = [];
  const consider = (label: string, group: string, values: Vals) => {
    const others = values.filter((_, i) => i !== monthIdx);
    if (!others.length) return;
    const typical = others.reduce((a, b) => a + b, 0) / others.length;
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

// Targets for the KPI cards (Výsledky).
export const VZAS_TARGETS = {
  rocneTrzby: 2300000,
  marzaPct: 12, // medzikrok 12–15 %, dlhodobo 20 %
  hodinyJerry: 90,
  hodinyTerezka: 80,
};
