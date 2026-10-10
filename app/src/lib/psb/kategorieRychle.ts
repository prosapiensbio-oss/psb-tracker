import { VYPLATY_JERRY, VYPLATY_TEREZKA } from "./fio";

/**
 * RÝCHLE VOĽBY PRI POLOŽKE FAKTÚRY.
 *
 * To, čo sa na Alze kupuje najčastejšie. Jerry, 9. 10. 2026: „páči sa mi, že
 * je tam tá predvoľba Ahsoka, výplata Jerry — a dal by som aj domácnosť, čo by
 * bolo spoločné." 10. 10. 2026 pribudlo NÁRADIE — pomôcky na cvičenie
 * (`variabilne.prevadzka2.pomocky`). To je jediná z piatich, ktorá je
 * skutočný náklad PSB; ostatné sú peniaze trénerov alebo domácnosti.
 *
 * VÝPLATA SÚ DVE TLAČIDLÁ S MENAMI, nie prepínač. Prvá verzia mala jedno
 * tlačidlo „výplata" a nad zoznamom prepínač, čia je; Jerry, 10. 10. 2026:
 * „tá výplata je nešťastné riešenie, nahraď to iba Jerry / Terezka a bude sa
 * to zapisovať do výplaty podľa výberu." Mal pravdu — prepínač je stav, ktorý
 * si treba pamätať, a tlačidlo, ktoré zapíše raz sem a raz tam, podľa niečoho
 * mimo neho. Dve tlačidlá s menami sú kratšie než „výplata Terezka" a klik
 * znamená vždy to isté.
 *
 * Je to JEDEN zoznam pre náhľad aj pre zoznam mesiaca: dva by sa rozišli
 * a človek by mal na dvoch miestach dve rôzne ponuky toho istého.
 */
export const NARADIE = "variabilne.prevadzka2.pomocky";

export const rychleVolby = (): { kat: string; text: string }[] => [
  { kat: VYPLATY_JERRY, text: "Jerry" },
  { kat: VYPLATY_TEREZKA, text: "Terezka" },
  { kat: "spolocne.Ahsoka", text: "Ahsoka" },
  { kat: "spolocne.Domácnosť", text: "domácnosť" },
  { kat: NARADIE, text: "náradie" },
];

/** Pôvodná trojica — kým sa rozšírená ponuka skúša v bete (10. 10. 2026). */
export const RYCHLE: { kat: string; text: string }[] = [
  { kat: VYPLATY_JERRY, text: "výplata Jerry" },
  { kat: "spolocne.Ahsoka", text: "Ahsoka" },
  { kat: "spolocne.Domácnosť", text: "domácnosť" },
];
