/**
 * KEDY KLIENTOVI DÔJDE BALÍČEK — ODHAD, NIE PREDPOVEĎ.
 *
 * Jerry, 1. 10. 2026: „vidím, koľko hodín zostáva v balíčku, ale chýba mi
 * približne odhadovaná doba, kedy minie ten balík — nejaké rozpätie dátumu
 * a v zátvorke, koľko je to týždňov."
 *
 * Samotný zostatok nepovie, kedy treba zavolať. Štyri hodiny sú pri
 * človeku, čo chodí dvakrát týždenne, dva týždne — a pri tom, čo chodí raz
 * za tri týždne, tri mesiace. Práve preto má karta „Balíček dojde" dátum
 * a nie zostatok (pravidlo z 28. 9. 2026); toto je to isté na karte klienta.
 *
 * TRI VSTUPY V PORADÍ ISTOTY:
 *  1. OBJEDNANÉ TERMÍNY sú isté. Keď ich je dosť na vyčerpanie balíčka,
 *     dátum NIE JE odhad — je to deň toho posledného a vracia sa `iste`.
 *  2. RYTMUS z medzier medzi tréningami dopočíta zvyšok. Medián, nie
 *     priemer: jedna dovolenka by priemer vytiahla tak, že by odhad bol
 *     o mesiac vedľa (tá istá úvaha ako pri `rytmus` na karte).
 *  3. Keď medzier nie je aspoň päť, odhad sa NEROBÍ. Dva tréningy nie sú
 *     rytmus a vymyslený dátum je horší než žiadny.
 *
 * ROZPÄTIE RASTIE ODMOCNINOU, NIE NÁSOBKOM. Keby sa spodná a horná hranica
 * počítali ako „počet hodín × najkratšia medzera" a „× najdlhšia", vyšlo by
 * pri desiatich hodinách rozpätie pol roka a nikomu by to nepovedalo nič.
 * Súčet desiatich medzier kolíše menej než desaťnásobok jednej — preto
 * `× odmocnina(počet)`. Pri jednej hodine je rozpätie úzke, pri desiatich
 * širšie, ale stále použiteľné.
 */

export type OdhadVstup = {
  /** Koľko hodín ešte zostáva. */
  zostava: number;
  /** Dni medzi po sebe idúcimi tréningami, v akomkoľvek poradí. */
  odstupy: number[];
  /** Začiatky objednaných termínov (ISO), vzostupne. */
  buduce: string[];
  /** Dnešok ako `RRRR-MM-DD`. */
  dnes: string;
  /** Koľko hodín ukrojí jeden tréning (90 minút = 1,5). Predvolene 1. */
  hodinNaTrening?: number;
};

export type Odhad = {
  /** Skorší koniec rozpätia `RRRR-MM-DD`. */
  od: string;
  /** Neskorší koniec rozpätia. */
  do: string;
  /** Koľko týždňov od dneška po `od` a po `do`. */
  tyzdneOd: number;
  tyzdneDo: number;
  /** `true` = dátum nie je odhad, vychádza z objednaných termínov. */
  iste: boolean;
  /** Koľko tréningov ešte treba, aby sa balíček vyčerpal. */
  treningov: number;
};

const DEN = 86400000;
const den = (s: string) => String(s || "").slice(0, 10);
const posun = (d: string, dni: number) => new Date(Date.parse(`${den(d)}T00:00:00Z`) + dni * DEN).toISOString().slice(0, 10);
const rozdiel = (a: string, b: string) => Math.round((Date.parse(`${den(a)}T00:00:00Z`) - Date.parse(`${den(b)}T00:00:00Z`)) / DEN);

/** Hodnota na danom mieste zoradeného radu (0 = najmenšia, 1 = najväčšia). */
function kvantil(zoradene: number[], podiel: number): number {
  if (!zoradene.length) return 0;
  const i = Math.min(zoradene.length - 1, Math.max(0, Math.round((zoradene.length - 1) * podiel)));
  return zoradene[i];
}

export function odhadVycerpania(v: OdhadVstup): Odhad | null {
  const naTrening = v.hodinNaTrening && v.hodinNaTrening > 0 ? v.hodinNaTrening : 1;
  // Pol hodiny navyše sa nepočíta ako ďalší tréning — zaokrúhľuje sa nahor
  // až od celej potrebnej hodiny, inak by odhad pridal tréning, ktorý sa
  // z balíčka nemá z čoho zaplatiť.
  const treningov = Math.ceil((v.zostava / naTrening) - 0.001);
  if (!(treningov > 0)) return null;

  // 1. Objednané termíny v budúcnosti — tie sú isté.
  const buduce = v.buduce.map(den).filter((d) => d >= v.dnes).sort();
  if (buduce.length >= treningov) {
    const d = buduce[treningov - 1];
    const t = Math.max(0, Math.round(rozdiel(d, v.dnes) / 7));
    return { od: d, do: d, tyzdneOd: t, tyzdneDo: t, iste: true, treningov };
  }

  // 2. Zvyšok dopočíta rytmus.
  const zvysok = treningov - buduce.length;
  const odstupy = v.odstupy.filter((x) => x > 0).sort((a, b) => a - b);
  if (odstupy.length < 5) return null;
  const stred = kvantil(odstupy, 0.5);
  if (!(stred > 0)) return null;
  const sirka = Math.max(1, kvantil(odstupy, 0.75) - kvantil(odstupy, 0.25));

  // Počíta sa od posledného objednaného termínu — do neho je to isté.
  const zaciatok = buduce.length ? buduce[buduce.length - 1] : v.dnes;
  const dni = zvysok * stred;
  const rozptyl = Math.max(2, Math.round((sirka * Math.sqrt(zvysok)) / 2));

  const od = posun(zaciatok, Math.max(0, Math.round(dni - rozptyl)));
  const doDna = posun(zaciatok, Math.round(dni + rozptyl));
  return {
    od,
    do: doDna,
    tyzdneOd: Math.max(0, Math.round(rozdiel(od, v.dnes) / 7)),
    tyzdneDo: Math.max(0, Math.round(rozdiel(doDna, v.dnes) / 7)),
    iste: false,
    treningov,
  };
}
