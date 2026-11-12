/**
 * VÝDAVKY V UZÁVIERKE (Jerry, 12. 11. 2026: „chýba mi tam sledovanie výdavkov,
 * kde boli najväčšie, čo boli také neštandardné výdavky").
 *
 * Najväčšie sú každý mesiac tie isté (nájom, Jarek, štát) a samy nič nepovedia.
 * Preto druhý zoznam: čo bolo NAVYŠE proti priemeru posledných mesiacov. Čísla
 * prichádzajú hotové z výpisu (tie isté sumy ako P&L po kategóriách), tu sa len
 * triedia; nič sa nepočíta inak než v Evidencii.
 */

export type KategoriaVydavku = {
  kat: string;
  nazov: string;
  /** Suma za obdobie reportu (kladné číslo). */
  suma: number;
  /** Priemer rovnako dlhého obdobia z mesiacov pred ním. */
  priemer: number;
  /** V koľkých z porovnávaných mesiacov sa v kategórii vôbec platilo. */
  mesiacov: number;
  /** Najväčší jednotlivý pohyb obdobia v kategórii — na „za čo to bolo". */
  najvacsi?: { popis: string; suma: number };
};

export type NestandardnyVydavok = KategoriaVydavku & { nasobok: number | null; dovod: string };
export type RozborVydavkov = { najvacsie: KategoriaVydavku[]; nestandardne: NestandardnyVydavok[] };

/** Pod touto sumou sa výdavok za neštandardný nepovažuje — šum by prebil podstatné. */
export const PRAH_KC = 1000;
/** O koľko nad priemerom už je výdavok neštandardný. */
export const PRAH_NASOBOK = 1.3;

/** Čo do výdavkov firmy nepatrí: výplaty, domácnosť, súkromné, presuny a odkladanie. */
export const jeVydavokFirmy = (kat: string) =>
  !/^(vyplaty|spolocne|prijem)/.test(kat) && !["mimo", "rezerva", "presun"].includes(kat);

const kc = (n: number) => Math.round(n).toLocaleString("sk-SK").replace(/,/g, " ");

export function rozborVydavkov(kategorie: KategoriaVydavku[], limit = { najvacsie: 6, nestandardne: 5 }): RozborVydavkov {
  const firmy = kategorie.filter((k) => jeVydavokFirmy(k.kat) && k.suma > 0);
  const najvacsie = [...firmy].sort((a, b) => b.suma - a.suma).slice(0, limit.najvacsie);
  const nestandardne = firmy
    .filter((k) => k.suma >= PRAH_KC && (k.mesiacov === 0 || k.priemer <= 0 || k.suma >= PRAH_NASOBOK * k.priemer))
    .map((k): NestandardnyVydavok => {
      const prvy = k.mesiacov === 0 || k.priemer <= 0;
      const nasobok = prvy ? null : Math.round((k.suma / k.priemer) * 10) / 10;
      return { ...k, nasobok, dovod: prvy ? "za posledné mesiace prvýkrát" : `priemer ${kc(k.priemer)} Kč` };
    })
    .sort((a, b) => (b.suma - b.priemer) - (a.suma - a.priemer))
    .slice(0, limit.nestandardne);
  return { najvacsie, nestandardne };
}
