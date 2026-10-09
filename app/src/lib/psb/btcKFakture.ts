/**
 * KTORÁ PLATBA BITCOINOM PATRÍ K TEJTO FAKTÚRE.
 *
 * Jerry, 9. 10. 2026: „dalo by sa to párovanie tých transakcií už rovno
 * napísať na faktúry a nech to párovanie funguje podľa dátumu a sumy?"
 *
 * Appka to dovtedy robila len OPAČNE — od platby k dokladom
 * (`dokladyPreBtcPlatbu`) a až po zápise, v samostatnom kroku. Pri nahrávaní
 * tak človek nevidel, či ten doklad vôbec niekto zaplatil bitcoinom.
 *
 * Poradie kritérií je to isté, aké Jerry určil 6. 9. 2026: **DÁTUM prvý,
 * suma je kontrola.** Alza jednu objednávku roztrhne na viac dokladov v ten
 * istý deň a z peňaženky za ňu odíde jedna platba, ktorá sa o poplatok
 * a spread od faktúry líši — takže sumou sa páruje len vtedy, keď je v deň
 * platieb viac.
 */
export type PlatbaBtc = { id: number | string; datum: string; czk: number; poznamka?: string };
export type DokladPreBtc = { cislo: string; datum: string; celkom: number };

const den = (x: string) => Date.parse(`${String(x).slice(0, 10)}T00:00:00Z`);

/**
 * Platba, ktorá k dokladu sedí — alebo `null`.
 *
 * @param dni      okno okolo dňa dokladu (Alza fakturuje aj o deň-dva neskôr)
 * @param tolerancia  o koľko percent sa smie suma líšiť, keď rozhoduje
 */
export function platbaKDokladu(
  doklad: DokladPreBtc,
  platby: PlatbaBtc[],
  /** Doklady, ktoré tej istej platbe patria tiež — ich súčet sa porovnáva spolu. */
  ostatneDoklady: DokladPreBtc[] = [],
  dni = 3,
  tolerancia = 0.08,
): { platba: PlatbaBtc; isto: boolean } | null {
  const d = den(doklad.datum);
  if (!Number.isFinite(d)) return null;
  const blizke = platby.filter((p) => Number.isFinite(den(p.datum)) && Math.abs(den(p.datum) - d) <= dni * 86400000);
  if (!blizke.length) return null;

  // Jediná platba v okne — patrí jej. To je ten bežný prípad: jedna
  // objednávka, jedna platba, jeden alebo viac dokladov v ten deň.
  if (blizke.length === 1) return { platba: blizke[0], isto: true };

  /**
   * Viac platieb v okne → rozhoduje SUMA. Porovnáva sa so súčtom dokladov
   * toho istého dňa, nie s jedným dokladom: rozdelená objednávka má dva
   * doklady a jednu platbu, takže jeden doklad sám nikdy nesedí.
   */
  const spolu = doklad.celkom + ostatneDoklady
    .filter((x) => x.cislo !== doklad.cislo && String(x.datum).slice(0, 10) === String(doklad.datum).slice(0, 10))
    .reduce((a, x) => a + x.celkom, 0);
  const sedi = blizke
    .map((p) => ({ p, odchylka: Math.abs(p.czk - spolu) / Math.max(1, spolu) }))
    .filter((x) => x.odchylka <= tolerancia)
    .sort((a, b) => a.odchylka - b.odchylka);
  if (sedi.length === 1) return { platba: sedi[0].p, isto: true };
  if (sedi.length > 1) return { platba: sedi[0].p, isto: false };
  return null;
}
