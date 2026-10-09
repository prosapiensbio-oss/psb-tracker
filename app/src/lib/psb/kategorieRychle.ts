import { VYPLATY_JERRY } from "./fio";

/**
 * RÝCHLE VOĽBY PRI POLOŽKE FAKTÚRY.
 *
 * To, čo sa na Alze kupuje najčastejšie mimo nákladov firmy. Jerry, 9. 10.
 * 2026: „páči sa mi, že je tam tá predvoľba Ahsoka, výplata Jerry — a dal by
 * som aj domácnosť, čo by bolo spoločné."
 *
 * Je to JEDEN zoznam pre náhľad aj pre zoznam mesiaca: dva by sa rozišli
 * a človek by mal na dvoch miestach dve rôzne ponuky toho istého.
 */
export const RYCHLE: { kat: string; text: string }[] = [
  { kat: VYPLATY_JERRY, text: "výplata Jerry" },
  { kat: "spolocne.Ahsoka", text: "Ahsoka" },
  { kat: "spolocne.Domácnosť", text: "domácnosť" },
];
