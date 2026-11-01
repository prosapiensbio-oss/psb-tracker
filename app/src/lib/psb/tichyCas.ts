import { terazPraha } from "./cas";

/**
 * NOTIFIKÁCIE V NOCI (rozbor 08, 1. 11. 2026).
 *
 * `push-beh` visí na plánovači `0 *\/3 * * *` a ten beží v UTC, takže aj o 1:00,
 * 4:00 (zima) a 2:00, 5:00 (leto) v Prahe. Čo sa v noci zmenilo, zvonilo na
 * zamknutom telefóne hneď.
 *
 * Pravidlo je v pražskom čase a na jednom mieste: od 21:30 do 7:00 sa
 * neposiela a do `push_poslane` sa NEZAPISUJE — položka tak odíde v najbližšom
 * dennom behu. Zápis „poslané" bez poslania by ju stratil nadobro.
 *
 * Reťazec „HH:MM" sa porovnáva priamo: je to pevný tvar z `terazPraha`.
 */
export const TICHO_OD = "21:30";
export const TICHO_DO = "07:00";

const hodinaMinuta = (teraz: Date) => terazPraha(teraz).slice(11, 16);

/** Je v Prahe čas, keď sa bežné notifikácie neposielajú? */
export const jeTichyCas = (teraz: Date = new Date()): boolean => {
  const hm = hodinaMinuta(teraz);
  return hm >= TICHO_OD || hm < TICHO_DO;
};

/**
 * RANNÁ DÁVKA MÁ BYŤ O 6:30 PRAHY CELÝ ROK.
 *
 * Cron nepozná časové pásmo: `30 4` je v lete 6:30, ale v zime 5:30 (tak to
 * bežalo od zmeny času 25. 10. 2026). Plánovač ju preto spúšťa o 4:30 aj 5:30
 * UTC a pustí len ten beh, ktorý v Prahe padne do hodiny 6 — druhý skončí
 * naprázdno. Dve dávky v jeden deň z toho vzniknúť nemôžu: 4:30 a 5:30 UTC sú
 * vždy iná pražská hodina.
 */
export const jeCasRannejDavky = (teraz: Date = new Date()): boolean => hodinaMinuta(teraz).slice(0, 2) === "06";

/**
 * Smie ranná dávka vôbec zazvoniť? Plánovač ju púšťa o 6:30, teda ešte pred
 * koncom ticha — je to jediná výnimka a zámerná. Ručné spustenie o polnoci
 * (`?push=1`) ale budí rovnako ako plánovač, preto od 6:00 do začiatku ticha.
 */
export const smieRannaDavka = (teraz: Date = new Date()): boolean => {
  const hm = hodinaMinuta(teraz);
  return hm >= "06:00" && hm < TICHO_OD;
};
