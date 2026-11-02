/**
 * SPOLOČNÁ KNIŽNICA STRIŽNE (2. 11. 2026): hudba a filmové vložky medzi Jerryho a Terezkiným Macom.
 * Súbory ležia v R2 pod strizna/kniznica/<cesta>. Porovnáva sa cesta a veľkosť; dátum nerozhoduje.
 * Povolené sú len tieto priečinky a prípony, aby sa token Strižne nedal použiť ako všeobecné úložisko.
 */
export const PREFIX_KNIZNICE = "strizna/kniznica/";
/** Workers berú telo do 100 MB; skladba ani vložka sa k tomu neblíži. */
export const MAX_SUBOR_KNIZNICE = 95 * 1024 * 1024;

const PRIPONY = /\.(mp3|wav|m4a|aac|mp4|mov|jpg|jpeg|png|json)$/i;

/** Relatívna cesta v knižnici alebo null: hudba/… či vlozky/…, bez bodkových častí a bez `..`. */
export function cestaKniznice(surova: string): string | null {
  if (surova.length > 300 || surova.includes("\\") || surova.includes("\0")) return null;
  const casti = surova.split("/");
  if (casti.length < 2 || (casti[0] !== "hudba" && casti[0] !== "vlozky")) return null;
  if (casti.some((c) => !c || c.startsWith("."))) return null;
  return PRIPONY.test(surova) ? surova : null;
}
