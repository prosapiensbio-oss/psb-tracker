/**
 * PŘED A PO Z ÚVODNÉHO (Jerry, 28. 10. 2026) — geometria porovnania.
 *
 * Dve fotky vedľa seba na plátne 2000 × 1333: každá polovica má pomer 3 : 4,
 * teda presne fotku z telefónu na výšku, a výrez sa robí od stredu („cover").
 * Plátno skladá prehliadač (`SmsPoUvodnom`); tu je len počítanie, aby sa dalo
 * otestovať bez canvasu.
 */
export const PLATNO = { sirka: 2000, vyska: 1333, medzera: 8 } as const;

export type Vyrez = { sx: number; sy: number; sw: number; sh: number };

/** Výrez zdroja, ktorý vyplní cieľ bez deformácie (ako CSS object-fit: cover). */
export function vyrezCover(zdrojS: number, zdrojV: number, cielS: number, cielV: number): Vyrez {
  if (zdrojS <= 0 || zdrojV <= 0 || cielS <= 0 || cielV <= 0) return { sx: 0, sy: 0, sw: Math.max(0, zdrojS), sh: Math.max(0, zdrojV) };
  const pomerCiela = cielS / cielV;
  if (zdrojS / zdrojV > pomerCiela) {
    const sw = zdrojV * pomerCiela;
    return { sx: (zdrojS - sw) / 2, sy: 0, sw, sh: zdrojV };
  }
  const sh = zdrojS / pomerCiela;
  return { sx: 0, sy: (zdrojV - sh) / 2, sw: zdrojS, sh };
}

/** Kde na plátne leží ľavá (před) a pravá (po) polovica. */
export function polovice(): { x: number; y: number; s: number; v: number }[] {
  const s = (PLATNO.sirka - PLATNO.medzera) / 2;
  return [
    { x: 0, y: 0, s, v: PLATNO.vyska },
    { x: s + PLATNO.medzera, y: 0, s, v: PLATNO.vyska },
  ];
}

/** Deň úvodného z kľúča notifikácie `sms|<deň>|<meno>`; inak `null`. */
export function denZKluca(kluc: string | undefined): string | null {
  const m = /^sms\|(\d{4}-\d{2}-\d{2})\|/.exec(kluc || "");
  return m ? m[1] : null;
}
