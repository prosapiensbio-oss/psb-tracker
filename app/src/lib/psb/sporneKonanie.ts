/**
 * BOL TAM, ALEBO NIE?
 *
 * Tréning, ktorý z kalendára zmizol až po tom, čo sa mal konať, môže byť
 * oboje a Kokpit to z dát nerozhodne:
 *
 *  • Klient prišiel, Jerry udalosť po čase zmazal (alebo ju presunul v sérii).
 *  • Klient v ten deň oznámil, že nepríde, a Jerry to vymazal o pár dní
 *    (Jerry, 29. 9. 2026 — toto je ten častejší prípad).
 *
 * Nepomôže ani čas zmiznutia: `zmizla_at` je okamih, keď si to všimla naša
 * snímka, nie keď udalosť zmizla. Snímka kalendára vyjde asi raz z troch
 * pokusov, takže zrušenie z ôsmej ráno môže byť zapísané ako 18:00.
 *
 * Preto sa Kokpit pýta a odpoveď si pamätá. BEZ ODPOVEDE SA TRÉNING
 * NEPOČÍTA — mlčanie nesmie klientovi pridať hodinu, za ktorú potom zaplatí.
 */

export type SporneKonanie = {
  uid: string;
  trener: string;
  /** ISO začiatok udalosti. */
  zaciatok: string;
  nazov: string;
  klient: string;
  typ: string | null;
  /** Kedy si snímka všimla, že udalosť zmizla. */
  zmizla_at: string;
};

/** Zoskupené po klientovi — jeden človek je jedna otázka, nie päť riadkov. */
export type PodlaKlienta = { klient: string; polozky: SporneKonanie[] };

export function podlaKlienta(xs: SporneKonanie[]): PodlaKlienta[] {
  const m = new Map<string, SporneKonanie[]>();
  for (const x of xs) {
    const k = x.klient || "—";
    m.set(k, [...(m.get(k) || []), x]);
  }
  return [...m.entries()]
    .map(([klient, polozky]) => ({
      klient,
      polozky: polozky.slice().sort((a, b) => b.zaciatok.localeCompare(a.zaciatok)),
    }))
    // Najviac otázok hore: kto má päť nerozhodnutých hodín, toho počet je
    // najviac mimo — a práve o jeho balíčku Kokpit klame najviac.
    .sort((a, b) => b.polozky.length - a.polozky.length || a.klient.localeCompare(b.klient));
}

/**
 * O koľko hodín sa klientov zostatok môže líšiť od pravdy.
 *
 * Nie je to chyba, je to rozsah: keď má tri nerozhodnuté tréningy, jeho
 * skutočný zostatok je niekde medzi `zostatok` a `zostatok − 3`.
 */
export function nepresnostKlienta(xs: SporneKonanie[], meno: string, normalizuj: (s: string) => string): number {
  const k = normalizuj(meno);
  return xs.filter((x) => normalizuj(x.klient) === k).length;
}
