import { useUzke } from "./useUzke";

/**
 * MOBILNÉ OVLÁDANIE — NAOSTRO od 9. 10. 2026 (návrh C).
 *
 * V bete sa skúšali dve podoby (A: lišta s Firmou, C: lišta s veľkým „+");
 * Jerry po vyskúšaní: „vyhráva C". Na telefóne (≤ 640 px) je teda vždy C:
 * tenký riadok hore (≡ Viac · ‹ · názov · hľadanie) a lišta dole
 * Dnes · Workspace · + · Kalendár · Jarvis. Počítač a iPad ostávajú bez zmeny.
 *
 * `null` = staré rozloženie (široká obrazovka).
 */
export type MobilRozlozenie = "C";

export function useMobilRozlozenie(): MobilRozlozenie | null {
  return useUzke() ? "C" : null;
}
