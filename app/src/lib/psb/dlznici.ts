/**
 * KTO DLŽÍ PENIAZE — NA JEDNOM MIESTE.
 *
 * Jerry, 28. 9. 2026: „a ďalšiu kartu, kde sú všetci ľudia, ktorí dlhujú
 * peniaze… ide mi o to, aby na jednom mieste boli balíčky a na ďalšom
 * peniaze."
 *
 * Dlh má DVA zdroje a ani jeden sám o sebe nie je celá odpoveď:
 *
 *   • `poplatky` — otvorené poplatky z PTmindera. Čo je v exporte, je
 *     nezaplatené; `loadData` z nich navyše odratáva platby zapísané
 *     v Kokpite, takže tu už stojí len to, čo naozaj zostáva.
 *   • balíčky nahodené v Kokpite, na ktoré ešte neprišla
 *     platba. Pohľadávka vzniká vytvorením balíčka (Jerry, 26. 9. 2026).
 *
 * Sčítať sa MUSIA, lebo hovoria o inom období: PTminder o starom svete,
 * Kokpit o tom, čo sa predalo od 22. 9. Klient môže dlžiť v oboch naraz
 * a dve karty vedľa seba by z jedného človeka spravili dvoch.
 */

import type { DlhPolozka } from "./zaplatene";
import { normName } from "./format";
import { dnesPraha } from "./cas";

export type Poplatok = { datum: string; klient: string; popis: string; suma: number };

export type Dlznik = {
  meno: string;
  trener: string;
  /** Spolu, čo dlží — z oboch zdrojov. */
  spolu: number;
  /** Z otvorených poplatkov PTmindera. */
  zPoplatkov: number;
  /** Z balíčkov nahodených v Kokpite, na ktoré neprišla platba. */
  zBalickov: number;
  /** Jednotlivé nezaplatené predaje — nech je vidieť, za čo to je. */
  polozky: { datum: string; popis: string; suma: number }[];
  /** Najstarší nezaplatený deň. */
  najstarsi: string;
  /** Dní od najstaršieho nezaplateného predaja; −1 = nedá sa povedať. */
  dni: number;
};

/**
 * DLH JEDNÉHO KLIENTA — to isté, čo ráta karta dlžníkov, len pre jedného.
 *
 * Jerry, 1. 10. 2026 nad stránkou pre klienta: „prečo tam nie je QR na
 * platbu?" Stránka vtedy počítala dlh inak než karta dlžníkov. Od 5. 10. 2026
 * obe len sčítavajú jeden zoznam `data.dlhy` (jedno pravidlo „zaplatený",
 * `zaplatene.ts`) — rozísť sa už nemajú ako.
 */
export function dlhJednehoKlienta(dlhy: DlhPolozka[] | undefined, meno: string): { dlzi: number; pocet: number; popis: string } {
  const k = normName(meno);
  const moje = (dlhy || []).filter((d) => normName(d.klient) === k);
  const dlzi = Math.max(0, Math.round(moje.reduce((a, d) => a + d.doplatit, 0)));
  // Popis hovorí, za ČO to je — suma bez dôvodu je výzva na nedorozumenie.
  const popis = moje.length === 1 && moje[0].zdroj === "ptminder"
    ? moje[0].nazov
    : moje.length === 1 ? "nezaplacený balíček" : `nezaplacené balíčky (${moje.length})`;
  return { dlzi, pocet: moje.length, popis };
}

/** Kto dlží — zoskupené po klientoch, najvyšší dlh hore. */
export function dlznici(
  dlhy: DlhPolozka[] | undefined,
  /** Ku ktorému trénerovi klient patrí; chýbajúci zostáva bez mena trénera. */
  treneri: Record<string, string> = {},
  dnes: string = dnesPraha(),
): Dlznik[] {
  const podla = new Map<string, Dlznik>();
  for (const x of dlhy || []) {
    const k = normName(x.klient);
    let d = podla.get(k);
    if (!d) {
      const meno = Object.keys(treneri).find((m) => normName(m) === k) || x.klient;
      d = { meno, trener: treneri[meno] || "", spolu: 0, zPoplatkov: 0, zBalickov: 0, polozky: [], najstarsi: "", dni: -1 };
      podla.set(k, d);
    }
    if (x.zdroj === "ptminder") d.zPoplatkov += x.doplatit; else d.zBalickov += x.doplatit;
    d.polozky.push({ datum: x.den, popis: x.nazov, suma: x.doplatit });
  }
  const out = [...podla.values()];
  for (const d of out) {
    d.spolu = Math.round(d.zPoplatkov + d.zBalickov);
    d.polozky.sort((a, b) => a.datum.localeCompare(b.datum));
    d.najstarsi = d.polozky[0]?.datum || "";
    d.dni = d.najstarsi ? Math.round((Date.parse(dnes) - Date.parse(d.najstarsi)) / 86400000) : -1;
  }
  // Najvyšší dlh hore — pri rovnakej sume rozhoduje, ako dlho visí.
  return out
    .filter((d) => d.spolu > 0)
    .sort((a, b) => b.spolu - a.spolu || b.dni - a.dni || a.meno.localeCompare(b.meno));
}
