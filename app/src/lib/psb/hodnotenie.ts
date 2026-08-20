import { C } from "./theme";
/**
 * Hranice, podľa ktorých obrazovka rozhoduje, či je číslo dobré alebo zlé.
 *
 * ČÍSLO 1–10 SA NIKDE NEZOBRAZUJE
 *
 * Chvíľu áno — 12. 8. bolo pri každej metrike skóre v odznaku. Jerry ho
 * zrušil ako mätúce a mal pravdu: k „6,2" si musíš pamätať, čo znamená, a to
 * je práca navyše za nič. Zostala z toho len farba čísla a veta pod ním.
 *
 * Vnútri to skóre ale ďalej žije, lebo tá veta sa musí odniekiaľ vybrať.
 * Rozdiel je v tom, že pásmo si drží appka a Jerry číta rovno záver.
 *
 * PREČO SÚ HRANICE VYPÍSANÉ A NIE VZORCOM
 *
 * Aby sa dali spochybniť. Keď Jerry povie „2 200 Kč za dopyt už nie je
 * priemer, to je zle", opraví sa jedno číslo v jednom zozname.
 *
 * NIE SÚ z odvetvových benchmarkov. Sú z jeho vlastných čísel: strop na dopyt
 * u Terezky (~2 200 Kč), pri mixe (~5 700 Kč) a cieľ pod 1 000 Kč
 * z marketingového plánu.
 */

/** Bod na stupnici: hodnota metriky → koľko je to z desiatich. */
export type Kotva = [hodnota: number, skore: number];

export type Hodnotenie = {
  skore: number;
  /** Slovo, ktoré sa dá prečítať bez pozerania na číslo. */
  slovo: "zle" | "slabé" | "priemer" | "dobré" | "výborné";
  /** `true`, keď sa metrika nedá vyhodnotiť (chýbajú dáta). Skóre je vtedy 0. */
  bezDat?: boolean;
};

export const SLOVA: Record<Hodnotenie["slovo"], string> = {
  zle: "zle",
  slabé: "slabé",
  priemer: "priemer",
  dobré: "dobré",
  výborné: "výborné",
};

function slovoKu(s: number): Hodnotenie["slovo"] {
  if (s >= 8.5) return "výborné";
  if (s >= 6.5) return "dobré";
  if (s >= 4.5) return "priemer";
  if (s >= 2.5) return "slabé";
  return "zle";
}

/**
 * Lineárna interpolácia medzi kotvami.
 *
 * Kotvy sa zadávajú v poradí, v akom rastie hodnota metriky. Skóre pri nich
 * môže klesať (cena za dopyt: čím vyššia, tým horšie) aj rásť (konverzia) —
 * funkcia sa nestará, ktorým smerom to ide.
 *
 * `null` alebo `undefined` znamená „nemám dáta", nie nulu. Kampaň bez dopytov
 * je jednotka; kampaň, ktorá ešte nebeží, nie je hodnotená vôbec.
 */
export function hodnot(hodnota: number | null | undefined, kotvy: Kotva[]): Hodnotenie {
  if (hodnota == null || !Number.isFinite(hodnota) || kotvy.length === 0) {
    return { skore: 0, slovo: "priemer", bezDat: true };
  }
  const k = [...kotvy].sort((a, b) => a[0] - b[0]);
  let s: number;
  if (hodnota <= k[0][0]) s = k[0][1];
  else if (hodnota >= k[k.length - 1][0]) s = k[k.length - 1][1];
  else {
    let i = 0;
    while (i < k.length - 1 && hodnota > k[i + 1][0]) i++;
    const [x0, y0] = k[i];
    const [x1, y1] = k[i + 1];
    // x1 === x0 by znamenalo dve kotvy na tej istej hodnote — potom platí prvá.
    s = x1 === x0 ? y0 : y0 + ((hodnota - x0) / (x1 - x0)) * (y1 - y0);
  }
  const skore = Math.min(10, Math.max(1, Math.round(s * 10) / 10));
  return { skore, slovo: slovoKu(skore) };
}

/**
 * Cena za jeden dopyt v korunách.
 *
 * Desiatka je 250 Kč — pod tým sa reklama vypláca aj u Terezkiných klientov
 * s tenkou maržou. Sedmička je 1 000 Kč, čo si plán stanovil ako rozumný cieľ.
 * Štvorka je 2 200 Kč: strop, nad ktorým sa klient od Terezky nezaplatí.
 * Dvojka je 5 700 Kč, strop pri realistickom mixe. Nad tým už len jednotka.
 */
export const CENA_ZA_DOPYT: Kotva[] = [
  [250, 10],
  [1000, 7],
  [2200, 4],
  [5700, 2],
  [10000, 1],
];

/**
 * Koľko dopytov chodí za mesiac.
 *
 * Plán hovorí, že na zaplnenie 18 miest za pol roka treba ~10,5 dopytu
 * mesačne. To je desiatka. Organicky ich chodí ~5 — to je štvorka, teda
 * presne polovica cesty. Nula je jednotka.
 */
export const DOPYTOV_MESACNE: Kotva[] = [
  [0, 1],
  [5, 4],
  [8, 7],
  [10.5, 10],
];

/**
 * Podiel dopytov, z ktorých sa stal klient (5+ sedení), v percentách.
 *
 * Meria sa na tom, čo appka reálne videla: 43 % celkovo, 42 % z Instagramu,
 * 70 % z odporúčaní. Sedemdesiat percent je preto desiatka — je to doložené,
 * nie vysnívané. Štyridsať je šestka, dvadsať trojka.
 */
export const KONVERZIA_DOPYTU: Kotva[] = [
  [0, 1],
  [20, 3],
  [40, 6],
  [55, 8],
  [70, 10],
];


/**
 * Farba podľa skóre — bez čísla, len signál.
 *
 * Žila v Kampane.tsx, ktoré 18. 8. 2026 nahradila jedna karta o reklame.
 * Patrí sem: je to zobrazenie hodnotenia, nie vlastnosť kampane.
 */
export function farbaCeny(skore: number): string {
  if (skore >= 8.5) return C.green;
  if (skore >= 6.5) return C.accentLight;
  if (skore >= 4.5) return C.textMuted;
  if (skore >= 2.5) return C.orange;
  return C.red;
}
