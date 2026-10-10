import { VYPLATY_JERRY, VYPLATY_TEREZKA } from "./fio";

/**
 * RÝCHLE VOĽBY PRI POLOŽKE FAKTÚRY.
 *
 * To, čo sa na Alze kupuje najčastejšie. Jerry, 9. 10. 2026: „páči sa mi, že
 * je tam tá predvoľba Ahsoka, výplata Jerry — a dal by som aj domácnosť, čo by
 * bolo spoločné." 10. 10. 2026 pribudlo NÁRADIE — pomôcky na cvičenie
 * (`variabilne.prevadzka2.pomocky`). To je jediná zo štyroch, ktorá je
 * skutočný náklad PSB; ostatné tri sú Jerryho peniaze.
 *
 * Je to JEDEN zoznam pre náhľad aj pre zoznam mesiaca: dva by sa rozišli
 * a človek by mal na dvoch miestach dve rôzne ponuky toho istého.
 */
export type KomuVyplata = "jerry" | "terezka";

export const NARADIE = "variabilne.prevadzka2.pomocky";

/**
 * Prečo je výplata PREPÍNAČ a nie piate tlačidlo.
 *
 * Päť tlačidiel plus rozbaľovačka sa do riadku na položke nezmestí a na
 * telefóne už vôbec. Výplata je navyše jedna vec — líši sa len tým, čia je —
 * a drvivá väčšina nákupov na Alze je Jerryho. Prepínač preto stojí nad
 * zoznamom, je vidieť, na kom stojí, a tlačidlo nesie meno, nie skratku:
 * „výplata Terezka" sa nedá prehliadnuť tak ako prepnutý stav kdesi bokom.
 */
export const rychleVolby = (komu: KomuVyplata = "jerry"): { kat: string; text: string }[] => [
  komu === "terezka"
    ? { kat: VYPLATY_TEREZKA, text: "výplata Terezka" }
    : { kat: VYPLATY_JERRY, text: "výplata Jerry" },
  { kat: "spolocne.Ahsoka", text: "Ahsoka" },
  { kat: "spolocne.Domácnosť", text: "domácnosť" },
  { kat: NARADIE, text: "náradie" },
];

/** Pôvodná trojica — kým sa štvrtá skúša v bete (10. 10. 2026). */
export const RYCHLE = rychleVolby("jerry").filter((v) => v.kat !== NARADIE);
