/**
 * Cenník PSB — pevné formáty balíčkov a členstiev.
 *
 * Jerry, 23. 9. 2026: „my máme pevne dané formáty balíčkov, takže tam má byť
 * zoznam, z ktorého si vyberiem a ktorý mi to predvyplní."
 *
 * Zdrojom je `prevadzka.md` oddiel 1 (cenník platný od januára 2026), overený
 * proti tomu, čo naozaj stojí v exporte `packages`. Ceny sú KATALÓGOVÉ —
 * klient môže mať zľavu (Jarek, barter, bitcoin), preto sa po výbere dajú
 * prepísať. Predvyplnenie je pomoc, nie tvrdenie.
 *
 * ČO V ZOZNAME NIE JE: TC (tri druhy), ČLENSTVÍ ONE a SILVER, DYNAMIKA
 * a MFR/KOREKCIA. Jerry ich 23. 9. 2026 vyradil — sú to staré alebo
 * jednorazové produkty, ktoré sa už nepredávajú, a v roletke len predlžujú
 * zoznam. V starých dátach zostávajú; do ponuky na nový predaj nepatria.
 *
 * `tyzdnov` je bežná platnosť. Používa sa len na predvyplnenie dátumu „do";
 * skutočný koniec zapisuje človek, lebo PSB dáva výnimky bežne.
 */

export type Sablona = {
  nazov: string;
  hodiny: number | null;
  cena: number | null;
  /** Bežná platnosť v týždňoch. null = bez konca alebo sa nedá predvyplniť. */
  tyzdnov: number | null;
  skupina: "Offline" | "Online" | "Špeciálne";
};

export const CENNIK: Sablona[] = [
  /**
   * NÁZVY SÚ „BALÍČEK" A „PŘEDPLATNÉ" (Jerry, 29. 9. 2026).
   *
   * „BEZ viazanosti" a „S viazanostou" bol pohľad zvnútra — hovorilo to
   * o tom, čo klient podpísal, nie o tom, čo si kúpil. Staré názvy chodia
   * ďalej z PTmindera a `nazovProduktu` ich prekladá na tieto; nové predaje
   * ich nesú rovno, takže sa slovník časom zjednotí sám.
   */
  { nazov: "6h Balíček", hodiny: 6, cena: 7790, tyzdnov: 8, skupina: "Offline" },
  { nazov: "6h Předplatné", hodiny: 6, cena: 6990, tyzdnov: 4, skupina: "Offline" },
  { nazov: "8h Balíček", hodiny: 8, cena: 9400, tyzdnov: 8, skupina: "Offline" },
  { nazov: "18h Balíček", hodiny: 18, cena: 21150, tyzdnov: 26, skupina: "Offline" },
  { nazov: "1h Balíček", hodiny: 1, cena: 1450, tyzdnov: 4, skupina: "Offline" },

  { nazov: "6h Balíček online", hodiny: 6, cena: 6590, tyzdnov: 8, skupina: "Online" },
  { nazov: "6h Předplatné online", hodiny: 6, cena: 5640, tyzdnov: 4, skupina: "Online" },
  { nazov: "1h Balíček online", hodiny: 1, cena: 1390, tyzdnov: 4, skupina: "Online" },

  { nazov: "ONE YEAR", hodiny: 78, cena: 90870, tyzdnov: 52, skupina: "Špeciálne" },
  { nazov: "SPECIAL 3", hodiny: 3, cena: 3990, tyzdnov: 8, skupina: "Špeciálne" },
  // Benevolencia: hodiny navyše k bežiacemu členstvu, bez ceny a bez dátumov
  // (viď prevadzka.md bod 3). Platnosť sa nepredvypĺňa — nemá ju.
  { nazov: "Doplnenie členstva", hodiny: null, cena: 0, tyzdnov: null, skupina: "Špeciálne" },
];

/** Koniec platnosti podľa šablóny — predvyplnenie, nie pravidlo. */
export function platnostDo(od: string, tyzdnov: number | null): string {
  if (!tyzdnov || !/^\d{4}-\d{2}-\d{2}$/.test(od)) return "";
  return new Date(Date.parse(`${od}T00:00:00Z`) + tyzdnov * 7 * 86400000).toISOString().slice(0, 10);
}
