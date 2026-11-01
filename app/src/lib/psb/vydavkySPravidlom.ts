/**
 * VÝDAVKY SO ZNÁMYM PRAVIDLOM — výber pre hromadné potvrdenie v Kontrole peňazí.
 *
 * 87 z 88 vecí v Kontrole peňazí boli výdavky, ktorým kategóriu dalo naučené
 * pravidlo; každý čakal na vlastnú fajku a odznak tak nehovoril, kde je práca.
 * Potvrdzuje stále človek (Jerry si výdavky kontroluje raz týždenne) — jedným
 * klikom, po pohľade na kategórie a súčty. Nič sa nepotvrdí samo.
 *
 * „Známe pravidlo" je zhoda s NAUČENÝM pravidlom: kategória riadku je tá, ktorú
 * by mu pravidlo dalo dnes. Výdavok bez pravidla (zabudovaný odhad, Jarvis) aj
 * výdavok, ktorý sa s pravidlom rozchádza, ostáva na ručné pozretie.
 */

import { kategoriaZPravidiel } from "./fio";
import { cakaNaPotvrdenie, type PohybNaFilter } from "./filtrePohybov";

export type PohybSPravidlom = PohybNaFilter & { datum: string; protistrana: string; poznamka: string; kluc: string };

/** Ten istý text, z ktorého pravidlo zaraďuje pri stiahnutí (`pohybyZOdpovede`). */
const textPohybu = (p: { protistrana: string; poznamka: string; typ?: string }) =>
  `${p.protistrana} ${p.poznamka} ${p.typ || ""}`;

export function vydavkySoZnamymPravidlom<T extends PohybSPravidlom>(
  pohyby: T[],
  pravidla: { vzor: string; kategoria: string }[],
  /** Rozdelený pohyb je ručná práca a potvrdený už je. */
  maSplit: (p: T) => boolean = () => false,
  /** Uzavretý mesiac sa nemení. */
  zamknute: Set<string> = new Set(),
): T[] {
  return pohyby.filter((p) => {
    if (zamknute.has(String(p.datum).slice(0, 7))) return false;
    if (!cakaNaPotvrdenie(p, maSplit(p))) return false;
    return kategoriaZPravidiel(textPohybu(p), pravidla) === p.kategoria;
  });
}

export type SkupinaKategorie = { kategoria: string; pocet: number; suma: number; kto: string[] };

/** Do okna s potvrdením: po kategóriách, najväčšia suma prvá. */
export function suhrnPodlaKategorie(pohyby: { kategoria: string; suma: number; protistrana: string }[]): SkupinaKategorie[] {
  const m = new Map<string, SkupinaKategorie>();
  for (const p of pohyby) {
    const s = m.get(p.kategoria) || { kategoria: p.kategoria, pocet: 0, suma: 0, kto: [] };
    s.pocet++;
    s.suma += p.suma;
    const meno = p.protistrana.trim();
    if (meno && !s.kto.includes(meno)) s.kto.push(meno);
    m.set(p.kategoria, s);
  }
  return [...m.values()].sort((a, b) => a.suma - b.suma);
}

/** D1 púšťa do jedného dopytu najviac 100 viazaných hodnôt. */
export function poKusoch<T>(xs: T[], velkost = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += velkost) out.push(xs.slice(i, i + velkost));
  return out;
}
