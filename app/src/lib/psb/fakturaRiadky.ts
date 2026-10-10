// Čo na faktúre je tovar a čo je len účtovný šum.
//
// Jerry, 10. 10. 2026: „je tam veľakrát položka nehmotné produkty a to by som
// mal rád možnosť vykrížikovať." Za september to bolo 23 riadkov z 42 — a
// dokopy stáli −338 Kč. Dvadsaťtri rozhodnutí o sume, ktorá nespraví ani
// polovicu ceny jedného noža.
//
// Alza ich všetky volá rovnako: názov začína „Nehmotný produkt". Sú dvoch
// druhov a je medzi nimi rozdiel, ktorý sa oplatí vidieť:
//
//   • DOPRAVA a zľava na dopravné — chodia v pároch a väčšinou sa vynulujú
//     (doprava 69, zľava AlzaPlus+ −69). Zmazať oboje nemení nič.
//   • ZĽAVA K POLOŽKE („Sleva 15% k položce KSPL5443") — to sú skutočné
//     peniaze, o ktoré bol tovar lacnejší. Zmazať ju znamená zdražiť nákup.
//
// Preto sa nemažú naslepo: skupina povie, koľko spolu robí, a zvlášť
// upozorní, keď je medzi nimi zľava k tovaru.

export type RiadokDokladu = { nazov: string; cena: number };

/** Účtovný riadok Alzy — doprava, zľava na dopravné, zľava k položke. */
export const jeNehmotny = (nazov: string): boolean =>
  /^\s*nehmotn[ýy]\s+produkt\b/i.test(nazov);

/** Zľava viazaná na konkrétny tovar — mazaním sa nákup zdraží. */
export const jeZlavaKPolozke = (nazov: string): boolean =>
  jeNehmotny(nazov) && /\bsleva\b[^%]*%?\s*k\s+polo[žz]ce\b/i.test(nazov);

export type RozdelenyDoklad<T extends RiadokDokladu> = {
  /** Skutočný tovar — to, nad čím sa rozhoduje. */
  tovar: T[];
  /** Doprava a zľavy, zbalené pod jeden riadok. */
  nehmotne: T[];
  /** Koľko tie zbalené riadky spolu robia (často okolo nuly). */
  nehmotneSuma: number;
  /** Je medzi nimi zľava k tovaru? Potom mazanie nie je zadarmo. */
  maZlavuKPolozke: boolean;
};

export function rozdelDoklad<T extends RiadokDokladu>(polozky: T[]): RozdelenyDoklad<T> {
  const tovar: T[] = [];
  const nehmotne: T[] = [];
  for (const p of polozky) (jeNehmotny(p.nazov) ? nehmotne : tovar).push(p);
  return {
    tovar,
    nehmotne,
    nehmotneSuma: Math.round(nehmotne.reduce((a, p) => a + p.cena, 0) * 100) / 100,
    maZlavuKPolozke: nehmotne.some((p) => jeZlavaKPolozke(p.nazov)),
  };
}

/** Veta do zbaleného riadku: „doprava a zľavy · 3 riadky · −43 Kč". */
export function popisNehmotnych(r: RozdelenyDoklad<RiadokDokladu>): string {
  const n = r.nehmotne.length;
  const slovo = n === 1 ? "riadok" : n < 5 ? "riadky" : "riadkov";
  const suma = r.nehmotneSuma;
  const kolko = Math.abs(suma) < 0.005 ? "spolu 0 Kč" : `${suma > 0 ? "+" : "−"}${Math.abs(Math.round(suma))} Kč`;
  return `doprava a zľavy · ${n} ${slovo} · ${kolko}`;
}
