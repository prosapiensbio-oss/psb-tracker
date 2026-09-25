/**
 * Logika prehľadových obrazoviek (Marketing → Prehľad, Peniaze → Prehľad),
 * ktorá musí byť testovateľná.
 *
 * Pravidlo repa: výpočet patrí do `lib/psb/`, obrazovka si ho volá. Vnútri
 * `.tsx` by sa nedal spustiť v testoch a pri prvej úprave by sa ticho zmenil
 * zmysel vety, ktorá vyzerá rovnako.
 */

/** Pásmo dlaždice zo skóre 1–10, ktoré vracia `hodnot()`. */
export const pasmoZoSkore = (skore: number, bezDat?: boolean): "ok" | "pozor" | "zle" | "nevie" =>
  bezDat ? "nevie" : skore >= 6.5 ? "ok" : skore >= 4 ? "pozor" : "zle";

/**
 * Podiel, pod ktorým sa prechod lievika považuje za deravý.
 *
 * Nie je to odvetvový benchmark — je to hranica, pod ktorou sa oplatí hľadať
 * príčinu. PSB má dnes 88 % a 77 %; keby bola hranica vyššia, obrazovka by
 * posielala opravovať to, čo funguje.
 */
export const ZDRAVY_PRECHOD = 60;

export type Diagnoza = {
  nadpis: string;
  veta: string;
  /** `true` = niečo treba riešiť; `false` = pochvala, kreslí sa potichu. */
  vazne: boolean;
};

/**
 * Jedna veta o tom, čo brzdí lievik.
 *
 * PREČO SA NEPOROVNÁVAJÚ STUPNE
 *
 * Stupne lievika klesajú vždy (dopytov je viac než úvodných a úvodných viac
 * než klientov), takže „najmenšie číslo" by ukázalo vždy na koniec a nikdy by
 * neporadilo nič. Porovnávať sa dajú len PODIELY medzi susednými stupňami.
 *
 * PREČO SA NAJPRV PÝTA NA VSTUP
 *
 * Keď oba prechody držia a klientov je aj tak málo, chyba nie je v lieviku —
 * je pred ním. Ukázať v takej chvíli na „najslabší prechod 77 %" znamená
 * poslať človeka prerábať úvodný tréning, ktorý funguje. Za 19 mesiacov
 * reklamy v PSB to bola vždy tá istá odpoveď: chýbal dosah, nie predaj.
 */
export function diagnozaLievika(v: {
  dopytyMes: number;
  cielDopytov: number;
  naUvodny: number | null;
  naKlienta: number | null;
  dopytov: number;
  klientov: number;
}): Diagnoza | null {
  if (v.naUvodny === null || v.naKlienta === null) return null;
  const zdravy = v.naUvodny >= ZDRAVY_PRECHOD && v.naKlienta >= ZDRAVY_PRECHOD;
  const cislo = (x: number) => x.toFixed(1).replace(".", ",");

  if (zdravy && v.dopytyMes < v.cielDopytov) {
    return {
      nadpis: "Lievik nie je problém — chýbajú dopyty",
      veta: `Z ${v.dopytov} dopytov sa stalo ${v.klientov} klientov, oba prechody držia. Aby sa miesta zaplnili, treba ${cislo(v.cielDopytov)} dopytov mesačne; chodí ${cislo(v.dopytyMes)}. Práca je pred lievikom, nie v ňom.`,
      vazne: true,
    };
  }
  if (zdravy) {
    return {
      nadpis: "Lievik aj vstup držia",
      veta: `${v.dopytov} dopytov, ${v.klientov} klientov, oba prechody nad ${ZDRAVY_PRECHOD} %. Tu teraz nie je čo opravovať.`,
      vazne: false,
    };
  }
  // Pri rovnosti vyhráva skorší prechod: keď sa ľudia strácajú už na začiatku,
  // nemá zmysel opravovať to, čo je za ním.
  return v.naUvodny <= v.naKlienta
    ? {
      nadpis: `Najslabší prechod: dopyt → úvodný tréning (${Math.round(v.naUvodny)} %)`,
      veta: "Ozvú sa a nedohodnú termín — to je otázka odpovede a rýchlosti, nie dosahu.",
      vazne: true,
    }
    : {
      nadpis: `Najslabší prechod: úvodný tréning → klient (${Math.round(v.naKlienta)} %)`,
      veta: "Prídu a nekúpia — to sa rieši na úvodnom tréningu, nie v reklame.",
      vazne: true,
    };
}

/**
 * Dlh voči trénerovi jednou vetou, aj so SMEROM.
 *
 * `cumDebt` je kumulovaný rozdiel nárok − poslané: kladné číslo znamená, že
 * firma dlží trénerovi, záporné, že si tréner vzal viac, než mu patrilo.
 * Sčítať Jerryho −107 897 s Terezkinými +34 255 nedáva nič — sú to dva opačné
 * smery. Preto sa nesčítavajú, ale popisujú.
 */
export function smerDlhu(kto: string, komu: string, cumDebt: number, suma: (x: number) => string): string {
  // Dva tvary mena, lebo veta ide raz tak a raz onak. A žiadne „vzal si" —
  // sloveso v minulom čase by sa muselo skloňovať podľa rodu a raz by to
  // appka napísala zle.
  if (Math.round(cumDebt) === 0) return `${kto} vyrovnané`;
  return cumDebt > 0
    ? `firma dlží ${komu} ${suma(cumDebt)}`
    : `${kto} má vybraté o ${suma(-cumDebt)} viac`;
}
