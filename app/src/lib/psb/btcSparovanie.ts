// Ktoré Alza doklady patria k jednej BTC platbe.
//
// Jerry, 6. 9. 2026: „hľadá podľa dátumu, cena je len kontrola." Predtým to
// appka mala obrátene — hádala najprv podľa sumy (ktorá kvôli poplatku/spreadu
// nikdy presne nesedí) a dátum bol len hrubé okno. Realita je iná:
//
//   • Jedna objednávka = jedna BTC platba, ktorú Alza roztrhne na VIAC dokladov
//     v ten istý deň, lebo nevie dodať všetko naraz.
//   • Väčšinou je na deň jedna platba. Keď človek platí dvakrát, sú aj dve
//     platby — a vtedy (a len vtedy) rozhoduje suma.
//
// Preto: DÁTUM je prvé kritérium. Keď na deň pripadá jediná platba, patria jej
// všetky blízke doklady toho dňa. Suma slúži na rozlíšenie iba vtedy, keď je
// platieb v deň viac.

export type DokladInfo = { cislo: string; celkom: number; datum: string; dodavatel: string };

/**
 * Vráti čísla dokladov, ktoré prislúchajú danej BTC platbe.
 *
 * @param platbaDatum ISO dátum platby
 * @param czk         hodnota platby v Kč (v čase nákupu; suma je len kontrola)
 * @param blizke      NEPOUŽITÉ doklady už predfiltrované na okno okolo platby
 * @param platiebVDen koľko BTC platieb pripadá na ktorý deň (kľúč = YYYY-MM-DD)
 * @param vyberPodlaSumy  funkcia na rozlíšenie sumou (skupinaFaktur), použije sa
 *                        LEN keď je v deň viac platieb
 */
export function dokladyPreBtcPlatbu(
  platbaDatum: string,
  czk: number,
  blizke: DokladInfo[],
  platiebVDen: Record<string, number>,
  vyberPodlaSumy: (kand: DokladInfo[], ciel: number, tolerancia: number) => string[] | null,
): string[] {
  const den = platbaDatum.slice(0, 10);
  if ((platiebVDen[den] || 1) <= 1) {
    // Jediná platba v deň → berie všetky doklady z toho dňa a navyše blízke
    // doklady z dní, ktoré vlastnú platbu NEMAJÚ (tie by inak zostali siroty).
    // Doklad z iného dňa, ktorý má vlastnú platbu, sa nechá jej.
    return blizke
      .filter((d) => {
        const dDen = d.datum.slice(0, 10);
        return dDen === den || !(platiebVDen[dDen] > 0);
      })
      .map((d) => d.cislo);
  }
  // Viac platieb v deň → rozlíši suma (poplatok/spread ~2 %).
  return vyberPodlaSumy(blizke, czk, Math.max(50, czk * 0.02)) || [];
}

/** Počet BTC platieb pripadajúcich na jednotlivé dni (kľúč = YYYY-MM-DD). */
export function platiebPodlaDni(datumy: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of datumy) {
    const den = d.slice(0, 10);
    m[den] = (m[den] || 0) + 1;
  }
  return m;
}
