/**
 * SPÄŤ A DOPREDU PO KOKPITE.
 *
 * Jerry, 8. 10. 2026: „keď sa začínam pohybovať po Kokpite, potrebujem
 * niekedy uskočiť na jednu podstránku a potom sa z nej vrátiť späť — a
 * vlastne to musí nanovo vyhľadať, pretože späť tam nikde nie je."
 *
 * Adresa to neunesie: appka si do nej píše `replaceState` práve preto, aby
 * tlačidlo späť v prehliadači nevyhadzovalo človeka z appky po jednom
 * podzáložkovom kroku — a hlavne v nej nie je, KTORÉHO klienta má otvoreného.
 * Preto vlastná stopa: zoznam miest a prst, ktorý v ňom ukazuje.
 *
 * Správa sa ako prehliadač. Krok späť prst posunie, miesto zo zoznamu
 * nevyhodí (dá sa ísť dopredu); nový pohyb po kroku späť zahodí všetko
 * pred prstom — vetva, z ktorej sa odbočilo, prestáva existovať.
 */
export type Stopa<T> = { kroky: T[]; prst: number };

/** Koľko miest si pamätáme. Viac nemá zmysel, menej by rezalo cestu späť. */
export const DLZKA = 60;

export const zacni = <T>(miesto: T): Stopa<T> => ({ kroky: [miesto], prst: 0 });

/**
 * Nové miesto do stopy. Rovnaké miesto dvakrát za sebou sa nezapisuje —
 * prekreslenie appky nie je pohyb.
 */
export function pridaj<T>(s: Stopa<T>, miesto: T, rovnake: (a: T, b: T) => boolean): Stopa<T> {
  if (s.kroky.length && rovnake(s.kroky[s.prst], miesto)) return s;
  const kroky = [...s.kroky.slice(0, s.prst + 1), miesto].slice(-DLZKA);
  return { kroky, prst: kroky.length - 1 };
}

export const mozeSpat = <T>(s: Stopa<T>): boolean => s.prst > 0;
export const mozeDopredu = <T>(s: Stopa<T>): boolean => s.prst < s.kroky.length - 1;

/** Posun prsta. Vráti null, keď sa tým smerom ísť nedá. */
export function posun<T>(s: Stopa<T>, smer: -1 | 1): Stopa<T> | null {
  const prst = s.prst + smer;
  if (prst < 0 || prst >= s.kroky.length) return null;
  return { kroky: s.kroky, prst };
}

export const tu = <T>(s: Stopa<T>): T => s.kroky[s.prst];
