/**
 * Kedy appka dosiahne na Full Access k Marketing API.
 *
 * Meta v máji 2026 premenovala úrovne na Limited a Full. Od 19. 8. 2026 je
 * Full potrebný UŽ LEN na pravý boost príspevku (`source_instagram_media_id`
 * — reklama zdedí lajky a komentáre); bežné kreatívy prechádzajú od
 * publikovania aplikácie a propagácia beží záložnou kópiou obsahu. Graph
 * na chýbajúci Full vracia `(#3) Application does not have the capability`.
 *
 * Podmienky sú dve a obe sa dajú merať: 500+ volaní za 15 dní a chybovosť
 * pod 15 %. Appka ich preto počíta sama — inak by sa o prístup dalo požiadať
 * len odhadom a odmietnutie by nič nevysvetlilo.
 */

export const VOLANI_NA_FULL = 500;
export const MAX_CHYBOVOST = 15;
export const OKNO_DNI = 15;

export type StavPristupu = {
  volani: number;
  chyb: number;
  chybovost: number;
  splna: boolean;
  /** Čo chýba, vetou. Prázdne, keď je všetko splnené. */
  chyba: string;
};

export function stavPristupu(volani: number, chyb: number): StavPristupu {
  const chybovost = volani ? Math.round((chyb / volani) * 1000) / 10 : 0;
  const maloVolani = volani < VOLANI_NA_FULL;
  const velaChyb = chybovost >= MAX_CHYBOVOST;
  return {
    volani, chyb, chybovost,
    splna: !maloVolani && !velaChyb,
    chyba: maloVolani && velaChyb
      ? `Chýba ${VOLANI_NA_FULL - volani} volaní a chybovosť ${String(chybovost).replace(".", ",")} % je nad hranicou ${MAX_CHYBOVOST} %.`
      : maloVolani
        ? `Chýba ${VOLANI_NA_FULL - volani} volaní z ${VOLANI_NA_FULL} za ${OKNO_DNI} dní.`
        : velaChyb
          ? `Volaní je dosť, ale chybovosť ${String(chybovost).replace(".", ",")} % je nad hranicou ${MAX_CHYBOVOST} %.`
          : "",
  };
}
