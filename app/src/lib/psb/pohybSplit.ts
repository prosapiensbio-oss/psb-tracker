// Rozdelenie jedného bankového (alebo hotovostného) pohybu na časti.
//
// Jerry, 5. 9. 2026: nový iPhone aj Terezkin iPhone sa majú deliť „polka PSB,
// polka do našich výplat"; úvodný v hotovosti je príjem, nie náklad; a keď
// Alza vráti peniaze, ten náklad sa má znížiť. Ukázalo sa, že to nie sú tri
// veci, ale JEDNA: pohyb sa rozloží na časti a každá časť má svoj cieľ.
//
// Prečo vlastný opt-in zoznam a nie „kategória na kladnom riadku": kategórie
// hádajú aj automatické pravidlá (protistrana „Zaťková" → výplata Terezka).
// Keby kladný pohyb honoroval svoju kategóriu, každý príchodzí prevod by ticho
// menil P&L. Split je preto VÝSLOVNÝ — appka pohyb reinterpretuje len vtedy,
// keď preň Jerry sám zapíše priradenie.
//
// Cieľ časti (`ciel`) je reťazec z toho istého menného priestoru ako kategória
// pohybu: P&L kľúč (`fixne.prevadzka.najom`), `spolocne.X`, `vyplaty.jerry` /
// `.terezka` / `.delene`, `mimo` (osobné mimo P&L) alebo `prijem` (ručný
// príjem). Delí sa PERCENTOM (Jerryho voľba, 5. 9. 2026).

export const PRIJEM = "prijem";

export type SplitCiast = { ciel: string; pct: number };
export type PohybSplits = Record<string, SplitCiast[]>;

/** Kľúč pohybu — MUSÍ sa zhodovať s `dedup_key` na serveri (routes/api/fio.ts
 *  `kluc`): `fio:<ID operace>`, a keď výpis ID nenesie, `dátum|suma|protistrana`.
 *  Vďaka tomu sa split zapísaný v náhľade pred importom trafí na ten istý
 *  pohyb po importe. */
export function pohybKluc(r: { id?: string; datum: string; suma: number; protistrana?: string }): string {
  return r.id ? `fio:${r.id}` : `${r.datum}|${r.suma}|${(r.protistrana || "").slice(0, 40)}`;
}

/** Je split použiteľný? Aspoň jedna časť, každé percento v (0,100], súčet 100
 *  (s toleranciou na zaokrúhlenie). Prázdny/neúplný split sa v agregácii
 *  ignoruje — pohyb sa správa, akoby split nemal. */
export function platnySplit(parts: SplitCiast[] | undefined): parts is SplitCiast[] {
  if (!parts || parts.length === 0) return false;
  let suma = 0;
  for (const p of parts) {
    if (!p.ciel || !(p.pct > 0) || p.pct > 100) return false;
    suma += p.pct;
  }
  return Math.abs(suma - 100) < 0.01;
}

/** Rozdelí sumu pohybu podľa percent. Znamienko sa zachováva (záporná =
 *  výdavok, kladná = príjem/vrátenie). Posledná časť dostane ZVYŠOK, aby
 *  súčet častí dal presne pôvodnú sumu do haliera — inak by 3× 33,33 %
 *  nechalo pár halierov visieť mimo výkaz. */
export function rozdelPohyb(suma: number, parts: SplitCiast[]): { ciel: string; ciastka: number }[] {
  const out: { ciel: string; ciastka: number }[] = [];
  let rozdane = 0;
  parts.forEach((p, i) => {
    const ciastka = i === parts.length - 1
      ? Math.round((suma - rozdane) * 100) / 100
      : Math.round(suma * (p.pct / 100) * 100) / 100;
    rozdane += ciastka;
    out.push({ ciel: p.ciel, ciastka });
  });
  return out;
}
