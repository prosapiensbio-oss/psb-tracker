/**
 * FILTRE ZAPÍSANÝCH POHYBOV (Jerry, 7. 10. 2026: „pohyby z banky potrebujem
 * rozdeliť filtrami Náklady, Príjmy, nezaradené, všetko").
 *
 * Kategória patrí VÝDAVKU — z nej sa skladá P&L. Príjem kategóriu nepotrebuje
 * (App.tsx ju na kladnom riadku nečíta); príjem od klienta sa vybavuje
 * v kroku Platby a balíčky. Preto „nezaradené" sú len výdavky — inak svietilo
 * 67 bez kategórie a všetko to boli platby klientov.
 */

import { jeKategoriaPrijmu } from "./kategoriePrijmov";

export type FilterPohybov = "nezaradene" | "potvrdit" | "potvrdene" | "naklady" | "vyplaty" | "sukromne" | "prijmy" | "vsetko";

export type PohybNaFilter = { suma: number; kategoria: string; typ?: string; klienti?: string; nieKlient?: boolean; potvrdene?: boolean };

export function patriDoFiltra(p: PohybNaFilter, f: FilterPohybov, maSplit = false): boolean {
  const kat = p.kategoria || "";
  const vydaj = p.suma < 0;
  switch (f) {
    case "nezaradene": return vydaj && !kat && !maSplit;
    case "potvrdit": return cakaNaPotvrdenie(p, maSplit);
    case "potvrdene": return jePotvrdeny(p, maSplit);
    // Náklady = všetko, čo odišlo, okrem výplat a súkromného — aj nezaradené,
    // lebo aj to je náklad, len ešte bez škatuľky.
    case "naklady": return vydaj && (maSplit || (!kat.startsWith("vyplaty") && kat !== "mimo"));
    case "vyplaty": return vydaj && !maSplit && kat.startsWith("vyplaty");
    case "sukromne": return vydaj && !maSplit && kat === "mimo";
    case "prijmy": return p.suma > 0;
    default: return true;
  }
}

/** Čo sa s príjmom stalo — ukazuje sa namiesto kategórie. */
export type StavPrijmu = "klient" | "zaradeny" | "nieKlient" | "rozdelene" | "caka";

export function stavPrijmu(p: PohybNaFilter, maSplit = false): StavPrijmu {
  if (maSplit) return "rozdelene";
  if (p.klienti) return "klient";
  // Predaj produktu / iný príjem — nie je to platba klienta, nečaká na nikoho.
  if (jeKategoriaPrijmu(p.kategoria)) return "zaradeny";
  if (p.nieKlient) return "nieKlient";
  return "caka";
}

/**
 * ORANŽOVÁ FAJKA (Jerry, 7. 10. 2026). Výdavok s kategóriou, ktorú dal
 * Kokpit sám (pravidlo, Jarvis), je návrh, kým ho Jerry nepotvrdí. Rozdelený
 * pohyb je ručná práca — potvrdený. Hotovosť zo zošita písal Jerry sám.
 * Nezaradený výdavok sa nepotvrdzuje: najprv potrebuje kategóriu.
 */
export function cakaNaPotvrdenie(p: PohybNaFilter, maSplit = false): boolean {
  if (p.suma >= 0 || p.potvrdene || maSplit || p.typ === "hotovosť") return false;
  return !!p.kategoria;
}

/**
 * Hotový výdavok — v uzávierke zmizne z plochy (Jerry, 7. 10. 2026: „keď
 * to zafajknem, tak to zmizne ako potvrdený náklad a takto si vyťukám
 * všetky"). Vidieť ho je pod filtrom Potvrdené.
 */
export function jePotvrdeny(p: PohybNaFilter, maSplit = false): boolean {
  return p.suma < 0 && !cakaNaPotvrdenie(p, maSplit) && !!(p.kategoria || maSplit);
}
