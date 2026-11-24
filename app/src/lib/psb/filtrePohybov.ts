/**
 * FILTRE ZAPÍSANÝCH POHYBOV (Jerry, 7. 10. 2026: „pohyby z banky potrebujem
 * rozdeliť filtrami Náklady, Príjmy, nezaradené, všetko").
 *
 * Kategória patrí VÝDAVKU — z nej sa skladá P&L. Príjem kategóriu nepotrebuje
 * (App.tsx ju na kladnom riadku nečíta); príjem od klienta sa vybavuje
 * v kroku Platby a balíčky. Preto „nezaradené" sú len výdavky — inak svietilo
 * 67 bez kategórie a všetko to boli platby klientov.
 */

import { jeZaradenyPrijem } from "./kategoriePrijmov";

export type FilterPohybov = "nezaradene" | "potvrdit" | "potvrdene" | "naklady" | "vyplaty" | "sukromne" | "prijmy" | "vsetko";

export type PohybNaFilter = {
  suma: number; kategoria: string; typ?: string; klienti?: string; nieKlient?: boolean; potvrdene?: boolean;
  /** Text z banky — z neho sa pozná istá výplata (`istaVyplata`). */
  protistrana?: string; poznamka?: string;
  /** Pohyb je rozpísaný podľa faktúry (Alza): náklad nesú položky, nie kategória riadku. */
  rozpisanyFakturou?: boolean;
};

/** Vlastné účty trénerov — prevod na ne je výplata toho človeka. */
const UCET_JERRY = "2323438014";
const UCET_TEREZKA = "2325740014";

/**
 * KOMU JE VÝPLATA PODĽA TEXTU Z BANKY (Jerry, 24. 11. 2026: výplaty, pri
 * ktorých je isté, komu patria, sa nemajú potvrdzovať). Isté je to len vtedy,
 * keď text hovorí slovo výplata A práve jedného človeka — menom („Jerry
 * vyplata", „Terka výplata") alebo číslom jeho účtu. Nákup kartou bez
 * poznámky (Apple, Bolt) nehovorí nič a ostáva na kontrolu.
 */
export function komuVyplata(text: string): "jerry" | "terezka" | null {
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!/vyplat/.test(t)) return null;
  const terezka = /terk|terez/.test(t) || t.includes(UCET_TEREZKA);
  const jerry = /jerry/.test(t) || t.includes(UCET_JERRY);
  if (terezka === jerry) return null;
  return terezka ? "terezka" : "jerry";
}

/**
 * Výplata, pri ktorej text z banky aj kategória hovoria o tom istom
 * človeku. Keď sa rozchádzajú (Bolt 17. 11. 2026: „Terka Výplata", ale
 * zaradené Jerrymu), čaká na kontrolu — presne na to potvrdzovanie je.
 */
export function istaVyplata(p: PohybNaFilter): boolean {
  if (p.suma >= 0 || !p.kategoria.startsWith("vyplaty.")) return false;
  const komu = komuVyplata(`${p.protistrana || ""} ${p.poznamka || ""}`);
  return !!komu && p.kategoria === `vyplaty.${komu}`;
}

export function patriDoFiltra(p: PohybNaFilter, f: FilterPohybov, maSplit = false): boolean {
  const kat = p.kategoria || "";
  const vydaj = p.suma < 0;
  switch (f) {
    case "nezaradene": return vydaj && !kat && !maSplit;
    case "potvrdit": return cakaNaPotvrdenie(p, maSplit);
    case "potvrdene": return jePotvrdeny(p, maSplit);
    // Náklady = všetko, čo odišlo, okrem výplat a súkromného — aj nezaradené,
    // lebo aj to je náklad, len ešte bez škatuľky.
    // Rezerva ani presun nie sú náklad — peniaze ostávajú firme, len na inom
    // mieste. P&L ich nečíta ani jedno (`fio.ts` PRESUN, REZERVA_FIRMY), tak
    // ich filter nesmie tvrdiť opak (prevod z 27. 10. 2026, −4 741 Kč).
    case "naklady": return vydaj && (maSplit || (!kat.startsWith("vyplaty") && kat !== "mimo" && kat !== "rezerva" && kat !== "presun"));
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
  // Predaj produktu / iný príjem / vlastná hotovosť na účet — nie je to
  // platba klienta, nečaká na nikoho.
  if (jeZaradenyPrijem(p.kategoria)) return "zaradeny";
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
  // Rezervu Kokpit spozná podľa čísla účtu — istá vec, nie návrh.
  if (p.suma >= 0 || p.potvrdene || maSplit || p.typ === "hotovosť" || p.kategoria === "rezerva") return false;
  // Istá výplata a pohyb rozpísaný podľa faktúry sa nepotvrdzujú (24. 11. 2026).
  if (p.rozpisanyFakturou || istaVyplata(p)) return false;
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
