/**
 * „Niečo som zapísal" — jedno oznámenie pre celú appku.
 *
 * PROBLÉM
 *
 * App.tsx si drží kópie vecí, ktoré NIE SÚ v `/api/data`: peňažné sumy
 * z Fio a faktúr, kalendár a jeho nevysvetlené zmeny, týždenné a mesačné
 * zápisy, zámky mesiacov, porovnania s PTminderom. Číta si ich raz pri
 * štarte — a obrazovka, ktorá do nich zapíše, App nemá ako upozorniť.
 *
 * Kontrola 24. 9. 2026 na tom našla trinásť miest. Vždy ten istý tvar:
 * zápis do databázy prejde, príde „Uložené", a pripomienka na Dnes svieti
 * ďalej alebo číslo v P&L zostane staré až do obnovenia stránky. Najhoršie
 * na tom je, že to postihlo DVE NAJČASTEJŠIE veci v appke — zápis týždennej
 * únavy a odpovede na otázky mesiaca. Človek ich urobí a appka mu ich
 * pripomína ďalej.
 *
 * `actions.refresh()` na to nestačí: sťahuje iba `/api/data`.
 *
 * PREČO NIE PROP
 *
 * Zapisovateľov je vyše desať a niektorí sú zanorení tri komponenty hlboko
 * (Vzas → BankaUlozene, Udaje → Banka). Pretiahnuť ku každému funkciu zhora
 * znamená desať ciest, z ktorých sa na jedenástu zabudne — a presne tak
 * vznikli chyby, ktoré toto rieši.
 *
 * PRAVIDLO: kto zapísal, oznámi oblasť. App si to vypočuje a prečíta znova
 * to, čoho sa to týka.
 */

/** Čoho sa zápis dotkol. */
export type Oblast =
  /** Fio, faktúry, platby, balíčky, stav hotovosti, zámok mesiaca → P&L a uzávierka. */
  | "peniaze"
  /** Udalosti, mapovanie mien, vysvetlené zmeny → register, dochádzka, predikcia. */
  | "kalendar"
  /** Týždenná únava a mesačné poznámky → rituály a kroky uzávierky. */
  | "zapisy"
  /** Klienti a ich polia → `/api/data`, teda skoro celá appka. */
  | "klienti"
  /** Nápady, sloty v mape cyklu, marketingové plány. */
  | "marketing";

type Poslucháč = () => void;
const poslucháči = new Map<Oblast, Set<Poslucháč>>();

/** Zapísal som niečo v tejto oblasti. */
export const oznam = (oblast: Oblast): void => {
  for (const f of [...(poslucháči.get(oblast) || [])]) {
    try { f(); } catch { /* jeden pokazený poslucháč nesmie zhodiť ostatných */ }
  }
};

/** App sa prihlási na odber; vracia odhlásenie. */
export const pocuvaj = (oblast: Oblast, f: Poslucháč): (() => void) => {
  const set = poslucháči.get(oblast) || new Set<Poslucháč>();
  poslucháči.set(oblast, set);
  set.add(f);
  return () => { set.delete(f); };
};
