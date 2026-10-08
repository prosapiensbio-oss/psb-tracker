/**
 * KATEGÓRIE PRÍJMOV (Jerry, 8. 10. 2026: „vidím, že sú tam aj príjmy, ale
 * uložiť môžem len náklady — potreboval by som kategorizátor príjmov; 200 Kč
 * stojí myofasciálna loptička, ktorú predávame").
 *
 * Príjem klienta kategóriu nepotrebuje — priradí sa mu v kroku Platby
 * a balíčky (prázdna kategória = „platba klienta"). Kategóriu dostáva len
 * príjem, ktorý platbou klienta NIE JE: predaj produktu a iný príjem.
 *
 * DO P&L (Iné príjmy) idú až od mesiaca, odkedy sú tržby z Kokpitu
 * (`peniazeOd`). Predtým bol predaj loptičky v PTminderi zapísaný ako platba
 * klienta 200 Kč (12× od 2/2025, napr. Janka Malinová 1. 9. 2026) — v tržbách
 * už je a druhýkrát sa rátať nesmie. Od prepnutia v PTminderi nie je, a
 * keby sa zapísal ako platba klienta, zaplatil by mu kus balíčka.
 */
export const PRIJEM_PRODUKT = "prijem.produkt";
export const PRIJEM_INE = "prijem.ine";
/** Myofasciálna loptička — jediný produkt, ktorý PSB predáva. */
export const CENA_LOPTICKY = 200;

export const KATEGORIE_PRIJMU: { value: string; label: string }[] = [
  { value: "", label: "Platba klienta → krok 3" },
  { value: PRIJEM_PRODUKT, label: "Predaj produktu (loptička…)" },
  { value: PRIJEM_INE, label: "Iný príjem" },
];

export const jeKategoriaPrijmu = (k: string | null | undefined) => k === PRIJEM_PRODUKT || k === PRIJEM_INE;

export const nazovPrijmu = (k: string | null | undefined) => KATEGORIE_PRIJMU.find((x) => x.value === (k || ""))?.label || "";

/** Patrí tento príjem do Iných príjmov v P&L za daný mesiac? */
export function prijemDoPnl(kategoria: string | null | undefined, mesiac: string, peniazeOd: string | null | undefined): boolean {
  return jeKategoriaPrijmu(kategoria) && !!peniazeOd && mesiac >= peniazeOd;
}
