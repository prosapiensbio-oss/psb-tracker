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
  { nazov: "OFF - 6h BEZ viazanosti", hodiny: 6, cena: 7790, tyzdnov: 8, skupina: "Offline" },
  { nazov: "OFF - 6h S viazanostou", hodiny: 6, cena: 6990, tyzdnov: 4, skupina: "Offline" },
  { nazov: "OFF - 8 hodín offline", hodiny: 8, cena: 9400, tyzdnov: 8, skupina: "Offline" },
  { nazov: "OFF - 18 hodín offline", hodiny: 18, cena: 21150, tyzdnov: 26, skupina: "Offline" },
  { nazov: "OFF - 1 hodina offline", hodiny: 1, cena: 1450, tyzdnov: 4, skupina: "Offline" },

  { nazov: "ON - 6h BEZ viazanosti", hodiny: 6, cena: 6590, tyzdnov: 8, skupina: "Online" },
  { nazov: "ON - 6h S viazanostou", hodiny: 6, cena: 5640, tyzdnov: 4, skupina: "Online" },
  { nazov: "ON - 1 hodina online", hodiny: 1, cena: 1390, tyzdnov: 4, skupina: "Online" },
  { nazov: "TC - 1 hodina", hodiny: 1, cena: 750, tyzdnov: 4, skupina: "Online" },
  { nazov: "TC - 4 hodiny", hodiny: 4, cena: 1790, tyzdnov: 8, skupina: "Online" },
  { nazov: "TC - 4 hodiny + call", hodiny: 4, cena: 2490, tyzdnov: 8, skupina: "Online" },

  { nazov: "ONE YEAR", hodiny: 78, cena: 90870, tyzdnov: 52, skupina: "Špeciálne" },
  { nazov: "SPECIAL 3", hodiny: 3, cena: 3990, tyzdnov: 8, skupina: "Špeciálne" },
  // Benevolencia: hodiny navyše k bežiacemu členstvu, bez ceny a bez dátumov
  // (viď prevadzka.md bod 3). Platnosť sa nepredvypĺňa — nemá ju.
  { nazov: "Doplnenie členstva", hodiny: null, cena: 0, tyzdnov: null, skupina: "Špeciálne" },
  // Paušály: hodiny sa pri nich nepočítajú a nikdy nedôjdu.
  { nazov: "ČLENSTVÍ ONE", hodiny: null, cena: null, tyzdnov: null, skupina: "Špeciálne" },
  { nazov: "ČLENSTVÍ SILVER", hodiny: null, cena: 7100, tyzdnov: null, skupina: "Špeciálne" },
  { nazov: "DYNAMIKA", hodiny: 5, cena: 2000, tyzdnov: 8, skupina: "Špeciálne" },
  { nazov: "MFR/KOREKCIA", hodiny: 5, cena: 2250, tyzdnov: 8, skupina: "Špeciálne" },
];

/** Koniec platnosti podľa šablóny — predvyplnenie, nie pravidlo. */
export function platnostDo(od: string, tyzdnov: number | null): string {
  if (!tyzdnov || !/^\d{4}-\d{2}-\d{2}$/.test(od)) return "";
  return new Date(Date.parse(`${od}T00:00:00Z`) + tyzdnov * 7 * 86400000).toISOString().slice(0, 10);
}
