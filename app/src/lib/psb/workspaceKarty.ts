/**
 * Workspace — administratíva po KATEGÓRIÁCH, nie po položkách.
 *
 * Prvá verzia dávala jednu kartu na jednu vec: Martin Vaško, potom Peťa B,
 * potom platba z banky. Jerry to vyskúšal 23. 9. 2026 a povedal presne, čo
 * mu chýba: „na tých kartách som si predstavoval celé kategórie, nie že
 * klienti jeden po druhom, ale zmeny kalendára v jednom."
 *
 * Má pravdu a je to rozdiel v tom, čo znamená FOCUS. Nie „teraz riešim
 * Martina", ale „teraz robím zmeny v kalendári" — jeden DRUH práce naraz,
 * v ňom to ide rýchlo, lebo hlava sa neprepína. Pri jednej položke na kartu
 * sa navyše z troch zmien stali tri karty a kopa vyzerala nekonečná.
 *
 * KOMU KARTA PATRÍ
 *
 * Prihlásený Jerry vidí svoje, Terezka svoje. Zmeny v kalendári a názvy majú
 * trénera priamo v sebe. Peniaze trénera nemajú a sú Jerryho — rovnako ako
 * mesačné kontroly a stav hotovosti (pravidlo z 31. 8. 2026: „tieto kontroly
 * mám na starosti ja, nech Terezku nerozptyľujú").
 */

export type Zmena = { id: string; druh: string; klient: string | null; nazov: string | null; pred: string | null; po: string | null; kedy: string; trener: string };
export type NeznamyNazov = { nazov: string; trener: string; pocet: number; najblizsi: string; navrh: string };
export type NepriradenaPlatba = { fioId: string; datum: string; suma: number; text: string; navrh: string };

export type Karta =
  | { druh: "zmeny"; nadpis: string; podnadpis: string; polozky: Zmena[] }
  | { druh: "mena"; nadpis: string; podnadpis: string; polozky: NeznamyNazov[] }
  | { druh: "platby"; nadpis: string; podnadpis: string; polozky: NepriradenaPlatba[] }
  /**
   * Karta bez fronty — pracovný stôl jedného klienta.
   *
   * Ostatné karty sú zoznamy toho, čo čaká. Táto nie: vyhľadá sa v nej
   * človek a robí sa na ňom. Preto nemá počet a nikdy nezmizne — kopa sa
   * bez nej môže vyprázdniť, ona zostáva ako miesto, kam sa chodí.
   */
  | { druh: "klient"; nadpis: string; podnadpis: string; polozky: never[] };

export type ZdrojeKariet = {
  zmeny: Zmena[];
  nezname: { nazov: string; trener: string; pocet: number; najblizsi: string }[];
  platby: { fioId: string; datum: string; suma: number; text: string; kandidati: string[] }[];
  navrhMena: (nazov: string) => string;
  /** „jerry" | „terezka" | null (nevie sa / spoločné prihlásenie). */
  ktoSom: string | null;
};

/**
 * Meno trénera z prihlásenia, v tvare, v akom stojí v dátach.
 *
 * POROVNÁVA SA BEZ OHĽADU NA VEĽKOSŤ PÍSMEN. Session nesie `users.name`, teda
 * „Jerry" s veľkým J — a prvá verzia porovnávala s „jerry". Nesedelo to nikdy,
 * takže filter ticho prepúšťal všetko a Jerry videl aj Terezkine veci.
 * Presne ten druh tichej chyby, pri ktorej nič nespadne a nič sa neukáže zle
 * — len to robí niečo iné, než má.
 */
export const trenerZPrihlasenia = (ktoSom: string | null): "Jerry" | "Terezka" | null => {
  const m = (ktoSom || "").trim().toLowerCase();
  return m === "jerry" ? "Jerry" : m === "terezka" ? "Terezka" : null;
};

const denSK = (iso: string) => {
  const d = (iso || "").slice(0, 10);
  return d ? `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.` : "";
};

export const popisZmeny = (x: Zmena): string =>
  x.druh === "zrusene" ? `zmizol tréning z ${denSK(x.pred || x.kedy)}`
    : x.druh === "posunute" ? `presun z ${denSK(x.pred || "")} na ${denSK(x.po || "")}`
      : x.druh === "pridane" ? `pribudol tréning ${denSK(x.po || x.kedy)}`
        : "premenované";

const pocet = (n: number, jeden: string, malo: string, vela: string) =>
  n === 1 ? jeden : n < 5 ? malo : vela;

export function postavKarty(z: ZdrojeKariet): Karta[] {
  const ja = trenerZPrihlasenia(z.ktoSom);
  const moje = <T extends { trener: string }>(xs: T[]) => (ja ? xs.filter((x) => x.trener === ja) : xs);

  const zmeny = moje(z.zmeny);
  const mena: NeznamyNazov[] = moje(z.nezname).map((n) => ({ ...n, navrh: z.navrhMena(n.nazov) }));
  // Peniaze nemajú trénera a sú Jerryho. Terezke by boli len šumom.
  const platby: NepriradenaPlatba[] = ja === "Terezka" ? [] : z.platby.map((p) => ({
    fioId: p.fioId, datum: p.datum, suma: p.suma, text: p.text,
    // Jednoznačný návrh sa predvyplní; pri dvoch a viacerých nie — hádať sa
    // nesmie, to je pravidlo platné všade v appke.
    navrh: p.kandidati.length === 1 ? p.kandidati[0] : "",
  }));

  const karty: Karta[] = [];
  if (zmeny.length) karty.push({
    druh: "zmeny",
    nadpis: "Zmeny v kalendári",
    podnadpis: `${zmeny.length} ${pocet(zmeny.length, "zmena čaká", "zmeny čakajú", "zmien čaká")} na dôvod`,
    polozky: zmeny,
  });
  if (mena.length) karty.push({
    druh: "mena",
    nadpis: "Nové názvy v kalendári",
    podnadpis: `${mena.length} ${pocet(mena.length, "názov, ktorý", "názvy, ktoré", "názvov, ktoré")} appka nepozná`,
    polozky: mena,
  });
  if (platby.length) karty.push({
    druh: "platby",
    nadpis: "Platby z banky",
    podnadpis: `${platby.length} ${pocet(platby.length, "príjem bez klienta", "príjmy bez klienta", "príjmov bez klienta")}`,
    polozky: platby,
  });
  karty.push({
    druh: "klient",
    nadpis: "Klient",
    podnadpis: "vyhľadaj človeka a rob na ňom — tréningy, peniaze, balíčky",
    polozky: [],
  });
  return karty;
}

export function klucPolozky(druh: Karta["druh"], p: Zmena | NeznamyNazov | NepriradenaPlatba): string {
  if (druh === "zmeny") return `zmeny|${(p as Zmena).id}`;
  if (druh === "mena") return `mena|${(p as NeznamyNazov).nazov}|${(p as NeznamyNazov).trener}`;
  return `platby|${(p as NepriradenaPlatba).fioId}`;
}
