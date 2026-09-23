/**
 * Kopa kariet — administratíva po jednej veci.
 *
 * Jerry, 23. 9. 2026: „tie karty by mi dali focus, že by som sa sústredil len
 * na jednu vec." Toto je zoznam tých vecí: čo dnes naozaj čaká na ruku, ako
 * rad rozhodnutí, nie ako päť obrazoviek.
 *
 * PORADIE NIE JE NÁHODNÉ
 *
 * Najprv to, čo sa pýta na fakt z hlavy a rýchlo sa zodpovie (zmeny
 * v kalendári — človek si pamätá, prečo hodina zmizla, len pár dní). Potom
 * mená, bez ktorých nesedí dochádzka. Až nakoniec peniaze, ktorých je veľa
 * a idú mechanicky. Keby boli peniaze prvé, na zvyšok by nezostala trpezlivosť.
 *
 * ODLOŽENÁ KARTA SA VRACIA
 *
 * „Neviem" nesmie znamenať „zmizlo". Odložené idú na KONIEC kopy, nie preč —
 * appka inak ticho stratí prácu a to je chyba, ktorú tu už raz rieši register.
 */

export type Karta =
  | { druh: "zmena"; id: string; nadpis: string; detail: string; kedy: string }
  | { druh: "meno"; id: string; nazov: string; trener: string; pocet: number; najblizsi: string; navrh: string }
  | { druh: "platba"; id: string; datum: string; suma: number; text: string; navrh: string };

export type ZdrojeKariet = {
  zmeny: { id: string; druh: string; klient: string | null; nazov: string | null; pred: string | null; po: string | null; kedy: string; trener: string }[];
  nezname: { nazov: string; trener: string; pocet: number; najblizsi: string }[];
  platby: { fioId: string; datum: string; suma: number; text: string; kandidati: string[] }[];
  /** Návrh klienta k názvu z kalendára — počíta ho `navrhniKlientaKandidati`. */
  navrhMena: (nazov: string) => string;
};

const denSK = (iso: string) => {
  const d = (iso || "").slice(0, 10);
  return d ? `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.` : "";
};

export function postavKarty(z: ZdrojeKariet): Karta[] {
  const zmeny: Karta[] = z.zmeny.map((x) => ({
    druh: "zmena" as const,
    id: x.id,
    nadpis: x.klient || x.nazov || "(bez mena)",
    detail: x.druh === "zrusene"
      ? `zmizol tréning z ${denSK(x.pred || x.kedy)}`
      : x.druh === "posunute"
        ? `presun z ${denSK(x.pred || "")} na ${denSK(x.po || "")}`
        : x.druh === "pridane"
          ? `pribudol tréning ${denSK(x.po || x.kedy)}`
          : "premenované",
    kedy: x.kedy,
  }));

  const mena: Karta[] = z.nezname.map((n) => ({
    druh: "meno" as const,
    id: `${n.nazov}|${n.trener}`,
    nazov: n.nazov,
    trener: n.trener,
    pocet: n.pocet,
    najblizsi: n.najblizsi,
    navrh: z.navrhMena(n.nazov),
  }));

  const platby: Karta[] = z.platby.map((p) => ({
    druh: "platba" as const,
    id: p.fioId,
    datum: p.datum,
    suma: p.suma,
    text: p.text,
    // Jednoznačný návrh sa predvyplní; pri dvoch a viacerých sa nevyberá nič
    // — to je to isté pravidlo ako všade inde, hádať sa nesmie.
    navrh: p.kandidati.length === 1 ? p.kandidati[0] : "",
  }));

  return [...zmeny, ...mena, ...platby];
}

/** Karty bez tých, ktoré sú vybavené, a s odloženými na konci. */
export function poradie(karty: Karta[], hotove: Set<string>, odlozene: string[]): Karta[] {
  const kluc = (k: Karta) => `${k.druh}|${k.id}`;
  const zive = karty.filter((k) => !hotove.has(kluc(k)));
  const jeOdlozena = (k: Karta) => odlozene.includes(kluc(k));
  return [...zive.filter((k) => !jeOdlozena(k)), ...zive.filter(jeOdlozena)];
}
