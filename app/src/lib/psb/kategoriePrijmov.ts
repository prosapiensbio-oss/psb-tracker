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

/**
 * HOTOVOSŤ VLOŽENÁ NA ÚČET (Jerry, 15. 11. 2026: „potreboval by som pridať
 * kategóriu… hotovosť sme si dali na účet"). Kategória už existovala —
 * `presun` vo fio.ts, pravidlo „vklad do bankomatu" ju dáva samo —, ale
 * výber pri PRÍJME ju neponúkal. Vklad sa tak ukázal ako „Platba klienta"
 * a 13. 11. skončil ako „Iný príjem", teda by sa do P&L započítal druhýkrát
 * (tie peniaze už sú v zošite). Hodnota je tá istá ako `PRESUN` vo fio.ts;
 * do P&L nejde (`prijemDoPnl` ju zámerne nepozná) a pravidlo sa z nej učiť
 * smie. V zošite sa neponúka — tam hotovosť na účet ODCHÁDZA, nie prichádza.
 */
export const PRESUN_HOTOVOSTI = "presun";
export const KATEGORIE_PRIJMU_BANKA: { value: string; label: string }[] = [
  ...KATEGORIE_PRIJMU,
  { value: PRESUN_HOTOVOSTI, label: "Hotovosť vložená na účet" },
];
/** Príjem z banky, ktorý už má zaradenie a na klienta nečaká. */
export const jeZaradenyPrijem = (k: string | null | undefined) => jeKategoriaPrijmu(k) || k === PRESUN_HOTOVOSTI;

export const nazovPrijmu = (k: string | null | undefined) => KATEGORIE_PRIJMU.find((x) => x.value === (k || ""))?.label || "";

/** Patrí tento príjem do Iných príjmov v P&L za daný mesiac? */
export function prijemDoPnl(kategoria: string | null | undefined, mesiac: string, peniazeOd: string | null | undefined): boolean {
  return jeKategoriaPrijmu(kategoria) && !!peniazeOd && mesiac >= peniazeOd;
}

/**
 * VRÁTENIE VÝDAVKU (Jerry, 28. 10. 2026). Príchodzí pohyb, ktorému Jerry dal
 * kategóriu VÝDAVKU, je vrátenie toho výdavku: 16. 10. odišlo 12 500 „Jerry
 * chata“ (vyplaty.jerry) a 20. 10. prišlo späť 11 000 „Chata vratenie“
 * s tou istou kategóriou. Výplata za chatu je 1 500, nie 12 500.
 *
 * Strážca výberov a Peniaze manažér to tak počítali odjakživa (sčítajú sumu
 * so znamienkom), obrazovka Kokpitu príchodzie pohyby preskakovala — J&T
 * Výplaty tak tvrdili o 11 000 viac a dlh bol o toľko horší. Platí od
 * októbra 2026: staršie mesiace sú uzavreté a nemenia sa (jediný starší
 * prípad je +377 Kč za Potraviny 29. 9.).
 */
export const VRATENIE_OD = "2026-10";
export function jeVratenieVydavku(kategoria: string | null | undefined, mesiac: string): boolean {
  return !!kategoria && !jeKategoriaPrijmu(kategoria) && kategoria !== "mimo" && kategoria !== "presun" && kategoria !== "rezerva" && mesiac >= VRATENIE_OD;
}
