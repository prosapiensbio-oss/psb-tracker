/**
 * Marketingový plán — cieľ, obdobie, metriky, prístup, rozpočet.
 *
 * ČO TO JE A ČO TO NIE JE
 *
 * Nie je to ďalší zoznam cieľov ani ďalšie KPI. Ciele (vzas_settings.ciele),
 * KPI s cieľovými hodnotami, kampane s rozpočtom a mapa cyklu s obsahom už
 * v appke sú a fungujú. Plán je OBAL: viaže ich na obdobie a odpovedá na
 * otázku, na ktorú sa dovtedy odpovedať nedalo — nie „ako nám ide", ale
 * „ide nám to podľa toho, čo sme si povedali".
 *
 * PREČO SI METRIKY NEDEFINUJE SÁM
 *
 * Vyberá si z tých, ktoré appka počíta na obrazovke Marketing. Vlastná
 * definícia by znamenala dve čísla o tej istej veci a skôr či neskôr by sa
 * rozišli — to je chyba, ktorú má appka v CLAUDE.md popísanú štyrikrát.
 */

import { jeMesiac } from "./format";

export type StavPlanu = "navrh" | "bezi" | "vyhodnoteny";

export type MetrikaPlanu = {
  /** Kľúč z KATALOG_METRIK. */
  kluc: string;
  /** Cieľová hodnota na obdobie. */
  cielova: number;
};

export type Plan = {
  id: string;
  nazov: string;
  od: string;
  do: string;
  ciel: string;
  preco: string;
  metriky: MetrikaPlanu[];
  pristup: string;
  rozpocet: number;
  stav: StavPlanu;
  vyhodnotenie: string;
  autor?: string;
};

export type DefMetriky = {
  kluc: string;
  nazov: string;
  /** Jednotka pre zobrazenie aj pre kontrolu zmysluplnosti cieľa. */
  jednotka: "pocet" | "pocetMes" | "pct" | "czk";
  /** true = vyššie je lepšie. Pri cene za dopyt je to naopak. */
  vyssieLepsie: boolean;
  /** Odkiaľ sa berie a čo znamená — to isté slovami ako na obrazovke. */
  popis: string;
  /** Referenčná hodnota, ktorú appka už používa. Nie je to povinný cieľ. */
  referencia?: string;
};

/**
 * Metriky, ktoré si plán môže vybrať.
 *
 * Sú to presne tie, ktoré appka počíta v Marketingu, aj s referenciami, ktoré
 * tam už svietia. Keď pribudne metrika tam, pridaj ju sem — nie naopak.
 */
export const KATALOG_METRIK: DefMetriky[] = [
  {
    kluc: "dopyty", nazov: "Dopytov mesačne", jednotka: "pocetMes", vyssieLepsie: true,
    popis: "Vstup lievika. Klientov nemôže pribudnúť viac, než koľko ľudí sa ozve.",
    referencia: "10,5 je tempo na zaplnenie 18 miest za pol roka",
  },
  {
    kluc: "konverzia", nazov: "Z dopytu klient", jednotka: "pct", vyssieLepsie: true,
    popis: "Hovorí, či je problém PRED dverami alebo ZA nimi.",
    referencia: "z odporúčaní 70 %",
  },
  {
    kluc: "cenaZaDopyt", nazov: "Cena za dopyt", jednotka: "czk", vyssieLepsie: false,
    popis: "Bez tohto čísla je rozpočet stávka, nie nákup.",
    referencia: "strop 2 200 Kč",
  },
  {
    kluc: "uvodne", nazov: "Úvodných mesačne", jednotka: "pocetMes", vyssieLepsie: true,
    popis: "Koľko ľudí naozaj prišlo na prvý tréning.",
  },
  {
    kluc: "noviKlienti", nazov: "Nových klientov", jednotka: "pocet", vyssieLepsie: true,
    popis: "Za celé obdobie. Jediné číslo, ktoré je naozaj výsledok.",
  },
  {
    kluc: "dosah", nazov: "Ø dosah príspevku", jednotka: "pocet", vyssieLepsie: true,
    popis: "Koľko ľudí príspevok uvidí. Pri PSB je to dlhodobo úzke hrdlo.",
    referencia: "za 18 mesiacov ~400",
  },
  {
    kluc: "ulozenia", nazov: "Ø uložení na príspevok", jednotka: "pocet", vyssieLepsie: true,
    popis: "Najbližší signál k zámeru, aký Instagram meria.",
    referencia: "za 18 mesiacov 1,6–2,2",
  },
  {
    kluc: "prispevkov", nazov: "Príspevkov za obdobie", jednotka: "pocet", vyssieLepsie: true,
    popis: "Vstup, nie výsledok — ale bez neho nie je čo merať.",
  },
];

export const METRIKA_MAPA = new Map(KATALOG_METRIK.map((m) => [m.kluc, m]));

/** Mesiace plánu vrátane oboch krajov. Prázdne pole pri nezmyselnom rozsahu. */
export function mesiacePlanu(od: string, do_: string): string[] {
  if (!jeMesiac(od) || !jeMesiac(do_) || do_ < od) return [];
  const out: string[] = [];
  const [r1, m1] = od.split("-").map(Number);
  const [r2, m2] = do_.split("-").map(Number);
  const koniec = r2 * 12 + (m2 - 1);
  for (let i = r1 * 12 + (m1 - 1); i <= koniec; i++) {
    out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    // Poistka proti preklepu v roku: plán na sto rokov nie je plán.
    if (out.length > 60) return [];
  }
  return out;
}

/** Koľko mesiacov plán trvá. Nula znamená neplatný rozsah. */
export const dlzkaPlanu = (p: { od: string; do: string }) => mesiacePlanu(p.od, p.do).length;

/**
 * Splnenie metriky v percentách cieľa.
 *
 * Pri metrikách, kde je nižšie lepšie (cena za dopyt), sa pomer obracia —
 * inak by lacnejší dopyt vyzeral ako neúspech.
 */
export function splnenie(def: DefMetriky, skutocnost: number | null, cielova: number): number | null {
  if (skutocnost == null || !cielova) return null;
  const p = def.vyssieLepsie ? (skutocnost / cielova) * 100 : (cielova / skutocnost) * 100;
  return Number.isFinite(p) ? Math.round(p) : null;
}

export type NalezPlanu = { text: string; tvrdy: boolean };

/**
 * Kontrola plánu pred uložením.
 *
 * Cieľom nie je otravovať, ale zachytiť plán, ktorý sa nedá vyhodnotiť —
 * bez obdobia, bez metriky alebo s rozpočtom bez metriky, ktorá by ho
 * ospravedlnila.
 */
export function skontrolujPlan(p: Plan): NalezPlanu[] {
  const n: NalezPlanu[] = [];
  const mes = mesiacePlanu(p.od, p.do);
  if (!p.nazov.trim()) n.push({ text: "Plán nemá názov — v zozname sa nedá rozoznať.", tvrdy: true });
  if (!mes.length) n.push({ text: "Obdobie nie je platné. Zadaj od a do vo tvare RRRR-MM, do nesmie byť pred od.", tvrdy: true });
  if (!p.ciel.trim()) n.push({ text: "Chýba cieľ. Plán bez cieľa sa nedá vyhodnotiť, iba odpracovať.", tvrdy: true });
  if (!p.metriky.length) n.push({ text: "Nevybral si ani jednu metriku — nebude sa čím merať, či plán vyšiel.", tvrdy: true });
  for (const m of p.metriky) {
    if (!METRIKA_MAPA.has(m.kluc)) n.push({ text: `Neznáma metrika „${m.kluc}“.`, tvrdy: true });
    else if (!(m.cielova > 0)) n.push({ text: `Metrika „${METRIKA_MAPA.get(m.kluc)?.nazov}“ nemá cieľovú hodnotu.`, tvrdy: true });
  }
  if (p.rozpocet > 0 && !p.metriky.some((m) => m.kluc === "cenaZaDopyt" || m.kluc === "dopyty")) {
    n.push({ text: "Máš rozpočet na reklamu, ale žiadnu metriku, ktorá by ukázala, čo za tie peniaze prišlo. Pridaj dopyty alebo cenu za dopyt.", tvrdy: false });
  }
  if (mes.length > 12) n.push({ text: `Plán na ${mes.length} mesiacov sa nedá riadiť — po roku sa zmenia vstupy aj kapacita.`, tvrdy: false });
  if (mes.length === 1) n.push({ text: "Jeden mesiac je krátke okno: pri troch dopytoch mesačne je rozdiel medzi úspechom a neúspechom náhoda.", tvrdy: false });
  if (!p.pristup.trim()) n.push({ text: "Nie je napísané, ČO pre ten cieľ urobíš. Bez toho je to prianie, nie plán.", tvrdy: false });
  return n;
}

export const jeStav = (v: unknown): v is StavPlanu =>
  v === "navrh" || v === "bezi" || v === "vyhodnoteny";

export const STAV_POPIS: Record<StavPlanu, string> = {
  navrh: "návrh", bezi: "beží", vyhodnoteny: "vyhodnotený",
};
