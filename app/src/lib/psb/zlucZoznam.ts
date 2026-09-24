/**
 * Uloženie zoznamu do nastavení tak, aby neprepísalo cudzí zápis.
 *
 * PREČO
 *
 * Ciele aj marketingové značky žijú ako JEDEN JSON kľúč vo `vzas_settings`.
 * Obrazovka si zoznam načíta pri otvorení a pri každej úprave uloží CELÝ
 * kľúč zo svojho stavu. Kým je človek jediný, kto píše, je to v poriadku.
 * Lenže píše aj Jarvis — akciou `novy-ciel` a `mkt-znacka`, priamo do
 * databázy, bez toho aby o tom otvorená obrazovka vedela.
 *
 * Kontrola 24. 9. 2026 na tom našla stratu dát: Jarvis pridá cieľ, Jerry
 * o minútu klikne na obrazovke na úplne iný cieľ — a Jarvisov je preč.
 * Nie zastaraný, PREČ. A nikde sa to nedozvie.
 *
 * AKO TO RIEŠI
 *
 * Pred uložením sa prečíta, čo je na serveri TERAZ, a dopíšu sa položky,
 * ktoré medzitým pribudli inde. Rozlíšiť „pribudlo inde" od „človek to
 * práve zmazal" sa dá len tak, že sa vie, Z ČOHO obrazovka vychádzala:
 * čo bolo v pôvodnom zozname a na serveri už nie je, je zmazané zámerne;
 * čo je na serveri a v pôvodnom zozname nebolo, pridal niekto iný.
 */

export function zlucZoznam<T>(
  /** Zoznam, ktorý mala obrazovka načítaný, keď začala. */
  povodny: T[],
  /** Zoznam po úprave človekom. */
  novy: T[],
  /** Čo je na serveri teraz. */
  serverovy: T[],
  /** Trvalý kľúč položky (id, dátum+text…). */
  kluc: (x: T) => string,
): T[] {
  const vPovodnom = new Set(povodny.map(kluc));
  const vNovom = new Set(novy.map(kluc));
  // Pribudlo inde = je na serveri, nebolo to v tom, z čoho obrazovka vyšla,
  // a človek to práve nepridal tiež.
  const cudzie = serverovy.filter((x) => !vPovodnom.has(kluc(x)) && !vNovom.has(kluc(x)));
  return [...novy, ...cudzie];
}
