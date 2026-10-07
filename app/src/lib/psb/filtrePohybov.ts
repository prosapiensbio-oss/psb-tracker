/**
 * FILTRE ZAPÍSANÝCH POHYBOV (Jerry, 7. 10. 2026: „pohyby z banky potrebujem
 * rozdeliť filtrami Náklady, Príjmy, nezaradené, všetko").
 *
 * Kategória patrí VÝDAVKU — z nej sa skladá P&L. Príjem kategóriu nepotrebuje
 * (App.tsx ju na kladnom riadku nečíta); príjem od klienta sa vybavuje
 * v kroku Platby a balíčky. Preto „nezaradené" sú len výdavky — inak svietilo
 * 67 bez kategórie a všetko to boli platby klientov.
 */

export type FilterPohybov = "nezaradene" | "naklady" | "vyplaty" | "sukromne" | "prijmy" | "vsetko";

export type PohybNaFilter = { suma: number; kategoria: string; klienti?: string; nieKlient?: boolean };

export function patriDoFiltra(p: PohybNaFilter, f: FilterPohybov, maSplit = false): boolean {
  const kat = p.kategoria || "";
  const vydaj = p.suma < 0;
  switch (f) {
    case "nezaradene": return vydaj && !kat && !maSplit;
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
export type StavPrijmu = "klient" | "nieKlient" | "rozdelene" | "caka";

export function stavPrijmu(p: PohybNaFilter, maSplit = false): StavPrijmu {
  if (maSplit) return "rozdelene";
  if (p.klienti) return "klient";
  if (p.nieKlient) return "nieKlient";
  return "caka";
}
