import { fmtCZK } from "./format";

/**
 * DOČASNÁ DOHODA O BALÍČKU (Jerry, 15. 11. 2026, Eva Doležalová).
 *
 * Terezka sa s klientkou dohodla: „bude platiť tieto 2 mesiace len za
 * 4 tréningy, potom pokračujeme ďalej". Předplatné pokračuje samo a automat
 * by v decembri založil cenníkových 6 h za 6 990 Kč. Dohoda pri klientovi
 * hovorí, aký balíček zakladať a DO KEDY — po nej sa automat vráti na cenník
 * bez toho, aby to musel niekto pamätať.
 *
 * Balíček podľa dohody má v poznámke „dočasná dohoda" a jeho cena sa
 * nepočíta do pravidla „stála iná cena dvakrát po sebe sa drží" — inak by
 * dva mesiace za 4 660 Kč spravili zo zľavy trvalú cenu.
 */
export type DohodaBalicka = { hodiny: number; cena: number; do: string; poznamka?: string };

export const ZNACKA_DOHODY = "dočasná dohoda";
export const jeZDohody = (poznamka: string | null | undefined) => (poznamka || "").toLowerCase().includes(ZNACKA_DOHODY);

export function citajDohodu(json: string | null | undefined): DohodaBalicka | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json) as Partial<DohodaBalicka>;
    const hodiny = Math.round(Number(d.hodiny) || 0);
    const cena = Math.round(Number(d.cena) || 0);
    const doDna = String(d.do || "").slice(0, 10);
    if (hodiny <= 0 || cena <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(doDna)) return null;
    return { hodiny, cena, do: doDna, ...(d.poznamka ? { poznamka: String(d.poznamka).slice(0, 300) } : {}) };
  } catch {
    return null;
  }
}

/** Platí dohoda pre balíček, ktorý začína v deň `od`? */
export function dohodaPreDen(json: string | null | undefined, od: string): DohodaBalicka | null {
  const d = citajDohodu(json);
  return d && od.slice(0, 10) <= d.do ? d : null;
}

const den = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`;

/** Veta do poznámky balíčka aj do profilu. */
export const vetaDohody = (d: DohodaBalicka) =>
  `${ZNACKA_DOHODY}: ${d.hodiny} h za ${fmtCZK(d.cena)} (do ${den(d.do)})${d.poznamka ? ` — ${d.poznamka}` : ""}`;
