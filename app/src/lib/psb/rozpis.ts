// Čo je za číslom vo VZAS.
//
// P&L ukazuje súčty. Keď v marci vyskočí „Vybavenie 48 000", tabuľka nepovie,
// či to bola jedna činka alebo dvadsať drobností — a jediná cesta k odpovedi
// viedla cez Údaje → Zapísané pohyby a ručné filtrovanie. Číslo, ktoré sa nedá
// rozkliknúť, sa buď berie na vieru, alebo sa neberie vôbec.
//
// Register plní App.tsx pri tom istom prechode, ktorým počíta súčty do modelu
// — takže rozpis a súčet nemôžu ukázať dve rôzne veci. Kde súčet spadol z
// faktúry (bankový pohyb sa spároval s dokladom a nahradil sa jeho položkami),
// tam sú v rozpise položky faktúry, nie ten jeden bankový riadok.

export type PohybZaBunku = {
  datum: string;
  popis: string;
  /** Kladné číslo = náklad, rovnako ako v P&L. */
  suma: number;
  zdroj: "banka" | "faktura";
  /** Číslo dokladu, keď riadok pochádza z faktúry. */
  doklad?: string;
};

const kluc = (mesiac: string, kategoria: string) => `${mesiac}|${kategoria}`;

let ROZPIS: Record<string, PohybZaBunku[]> = {};

/**
 * Verzia skladu — rovnako ako `vzasVerzia` a `marketingVerzia`.
 *
 * Sklad sa plní MIMO Reactu (App.tsx po načítaní banky a faktúr), takže
 * komponent s výsledkom v `useMemo` by si nechal starý rozpis. Dnes to drží
 * len to, že jediný čitateľ (Vzas) číta v renderi — nezapísané pravidlo,
 * ktoré poruší prvý pridaný `useMemo` (revízia 18. 8. 2026).
 */
let VERZIA = 0;
export const rozpisVerzia = () => VERZIA;

/** Vracia `true`, keď sa sklad naozaj zmenil — ako ostatné settery. */
export function nastavRozpis(r: Record<string, PohybZaBunku[]>): boolean {
  for (const v of Object.values(r)) v.sort((a, b) => a.datum.localeCompare(b.datum));
  const zmena = JSON.stringify(Object.keys(r).sort()) !== JSON.stringify(Object.keys(ROZPIS).sort())
    || JSON.stringify(r) !== JSON.stringify(ROZPIS);
  ROZPIS = r;
  if (zmena) VERZIA++;
  return zmena;
}

export function rozpisPre(mesiac: string, kategoria: string): PohybZaBunku[] {
  return ROZPIS[kluc(mesiac, kategoria)] || [];
}

export const maRozpis = (mesiac: string, kategoria: string) => (ROZPIS[kluc(mesiac, kategoria)]?.length ?? 0) > 0;

/** Pomocník pre plnenie — pridá jeden riadok pod (mesiac, kategória). */
export function pridajDoRozpisu(
  cieľ: Record<string, PohybZaBunku[]>,
  mesiac: string,
  kategoria: string,
  riadok: PohybZaBunku,
): void {
  (cieľ[kluc(mesiac, kategoria)] ||= []).push(riadok);
}
