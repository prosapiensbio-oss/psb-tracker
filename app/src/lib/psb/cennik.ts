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
  /**
   * Platnosť v MESIACOCH, keď ju PTminder počíta mesiacmi (předplatné
   * „1 month", 18 h „6-month"). Prebíja `tyzdnov` — mesiac nie sú štyri
   * týždne a za pol roka by sa rozdiel nazbieral na tri dni.
   */
  mesiacov?: number;
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
  { nazov: "6h Předplatné", hodiny: 6, cena: 6990, tyzdnov: 4, mesiacov: 1, skupina: "Offline" },
  { nazov: "8h Balíček", hodiny: 8, cena: 9400, tyzdnov: 8, skupina: "Offline" },
  { nazov: "18h Balíček", hodiny: 18, cena: 21150, tyzdnov: 26, mesiacov: 6, skupina: "Offline" },
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

/**
 * Koniec platnosti podľa šablóny — tak, ako ho počíta PTminder.
 *
 * Overené 4. 10. 2026 na 236 členstvách z `ptminder_historia`: posledný deň
 * je DEŇ PRED uplynutím obdobia. 8 týždňov z 2. 9. končí 27. 10. (+55 dní),
 * 4 týždne +27, mesiac z 24. 3. končí 23. 4. a pol roka z 12. 2. končí 11. 8.
 * Do toho dňa Kokpit pripočítaval celé obdobie, takže každý balíček mu
 * platil o deň dlhšie než v PTminderi.
 */
export function platnostDo(od: string, tyzdnov: number | null, mesiacov?: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(od)) return "";
  if (mesiacov) {
    const [r, m, d] = od.split("-").map(Number);
    // Mesiac bez takého dňa (31. 1. + 1 mesiac) sa zarazí na jeho konci.
    const posledny = new Date(Date.UTC(r, m - 1 + mesiacov + 1, 0)).getUTCDate();
    const koniec = new Date(Date.UTC(r, m - 1 + mesiacov, Math.min(d, posledny)));
    return new Date(koniec.getTime() - 86400000).toISOString().slice(0, 10);
  }
  if (!tyzdnov) return "";
  return new Date(Date.parse(`${od}T00:00:00Z`) + (tyzdnov * 7 - 1) * 86400000).toISOString().slice(0, 10);
}

/** Koniec platnosti pre šablónu z cenníka. */
export const koniecPlatnosti = (od: string, s: Pick<Sablona, "tyzdnov" | "mesiacov">): string =>
  platnostDo(od, s.tyzdnov, s.mesiacov);

/**
 * Šablóna z cenníka podľa názvu balíčka, aj starého z PTmindera
 * („OFF - 6h BEZ viazanosti" → „6h Balíček").
 */
export function sablonaPodlaNazvu(nazov: string, preloz: (n: string) => string): Sablona | undefined {
  const n = preloz(nazov);
  return CENNIK.find((s) => s.nazov === n);
}
