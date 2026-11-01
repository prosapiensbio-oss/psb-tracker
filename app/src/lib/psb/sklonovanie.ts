/**
 * SKLOŇOVANIE PODĽA POČTU (rozbor Kokpitu, 1. 11. 2026).
 *
 * „4 dní", „3 výdavkov", „3 dopytov" — jedno miesto, ktoré vie, že po 1 ide
 * jednotné číslo, po 2–4 množné a po ostatných (aj po nule) 2. pád. Platí pre
 * počet v 1. páde; po „z" a „od" je 2. pád vždy („z 3 dopytov"), tam túto
 * funkciu netreba.
 */

export function tvar(n: number, jeden: string, dva: string, pat: string): string {
  const a = Math.abs(Math.trunc(n));
  if (a === 1 && Number.isInteger(n)) return jeden;
  if (a >= 2 && a <= 4 && Number.isInteger(n)) return dva;
  // Desatinné číslo („1,5 dňa") tu nemáme; 2. pád je najbližší správny tvar.
  return pat;
}

/** Chýbajúci počet sa píše ako nula — „undefined dní" nikomu nepomôže. */
const slovo = (jeden: string, dva: string, pat: string) => (n: number | null | undefined): string => {
  const x = n ?? 0;
  return `${x} ${tvar(x, jeden, dva, pat)}`;
};

export const dni = slovo("deň", "dni", "dní");
export const mesiace = slovo("mesiac", "mesiace", "mesiacov");
export const tyzdne = slovo("týždeň", "týždne", "týždňov");
export const dopyty = slovo("dopyt", "dopyty", "dopytov");
export const vydavky = slovo("výdavok", "výdavky", "výdavkov");
export const prijmy = slovo("príjem", "príjmy", "príjmov");
export const platby = slovo("platba", "platby", "platieb");
export const klienti = slovo("klient", "klienti", "klientov");
export const pohyby = slovo("pohyb", "pohyby", "pohybov");
export const riadky = slovo("riadok", "riadky", "riadkov");
export const polozky = slovo("položka", "položky", "položiek");
export const balicky = slovo("balíček", "balíčky", "balíčkov");
export const ludia = slovo("človek", "ľudia", "ľudí");
export const treningy = slovo("tréning", "tréningy", "tréningov");
export const sedenia = slovo("sedenie", "sedenia", "sedení");
export const hodiny = slovo("hodina", "hodiny", "hodín");
export const veci = slovo("vec", "veci", "vecí");
export const problemy = slovo("problém", "problémy", "problémov");
export const kampane = slovo("kampaň", "kampane", "kampaní");
export const zmeny = slovo("zmena", "zmeny", "zmien");
export const udalosti = slovo("udalosť", "udalosti", "udalostí");
