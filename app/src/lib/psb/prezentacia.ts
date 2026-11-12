/**
 * PREZENTÁCIA Z MESAČNÉHO REPORTU (Jerry, 12. 10. 2026: „chcel by som aby mi
 * to rovno vygenerovalo nejakú prezentáciu… niečo ako powerpointovú, prepínam
 * medzi slajdami, postupne sa mi tam zobrazujú jednotlivé data").
 *
 * Tu je LEN prestavba hotového reportu na slajdy — žiadny vlastný výpočet.
 * Dôvod je ten istý, prečo report nič nepočíta po svojom: keby prezentácia
 * sčítala hodiny sama, raz by ukázala iné číslo než obrazovka, z ktorej
 * vyšla, a Jerry by ju prestal používať. Každé číslo na slajde je `hlavne`,
 * `detail` alebo `odpoved` tej istej otázky, akú vidí v okne reportu.
 *
 * Poradie slajdov je príbeh mesiaca: ako to dopadlo (semafor) → čo to
 * spôsobilo (otázka po otázke) → čo to znamená (dve stĺpce) → čo urobíme
 * (návrhy reportu). Návrh, ktorý Jerry vybral z troch 12. 10. 2026.
 */

import { navrhyReportu, type OtazkaReportu, type PodkladyReportu, type Report, type RiadokDetailu, type Semafor } from "./mesacnyReport";

const kc = (n: number) => Math.round(n).toLocaleString("sk-SK").replace(/,/g, " ");

export type SlajdTitulka = {
  druh: "titulka";
  kroky: number;
  nadpis: string;
  porovnanie: string;
  cisla: { hodnota: string; popis: string }[];
};
export type SlajdSemafor = {
  druh: "semafor";
  kroky: number;
  nadpis: string;
  karty: { id: string; otazka: string; semafor: Semafor; hodnota: string; zmena: string; bezDat: boolean }[];
};
export type SlajdOtazka = {
  druh: "otazka";
  kroky: number;
  id: string;
  otazka: string;
  semafor: Semafor;
  odpoved: string;
  hodnota: string;
  jednotka: string;
  zmena: string;
  smer: "hore" | "dole" | "rovno";
  seria: number[];
  popisSerie: string[];
  detail: RiadokDetailu[];
  akcia: string;
};
export type SlajdZaver = {
  druh: "zaver";
  kroky: number;
  nadpis: string;
  dobre: string[];
  pozor: string[];
  /** Otázky, ktorým chýba zdroj — do záveru ich nemožno zarátať ani na jednu stranu. */
  bezDat: string[];
};
export type SlajdAkcie = {
  druh: "akcie";
  kroky: number;
  nadpis: string;
  akcie: { nadpis: string; text: string }[];
};
/** Návrh A: titulka a semafor v jednom. Toto je jediný prehľad celého mesiaca. */
export type SlajdPrehlad = {
  druh: "prehlad";
  kroky: number;
  kicker: string;
  nadpis: string;
  porovnanie: string;
  karty: SlajdSemafor["karty"];
};
export type SlajdVytazenost = { druh: "vytazenost"; kroky: number; nadpis: string; p: PodkladyReportu };
export type SlajdVydavky = { druh: "vydavky"; kroky: number; nadpis: string; p: PodkladyReportu };
export type SlajdRezerva = { druh: "rezerva"; kroky: number; nadpis: string; p: PodkladyReportu };
/** Otázky, ktoré sú v poriadku, spolu na jednom slajde — nič nechcú. */
export type SlajdSpolu = {
  druh: "spolu";
  kroky: number;
  nadpis: string;
  karty: { id: string; otazka: string; hodnota: string; zmena: string; odpoved: string }[];
};
export type Slajd = SlajdTitulka | SlajdSemafor | SlajdOtazka | SlajdZaver | SlajdAkcie | SlajdPrehlad | SlajdVytazenost | SlajdVydavky | SlajdRezerva | SlajdSpolu;

/** Veľké číslo otázky ako text — „231 hodín“, alebo pomlčka, keď zdroj chýba. */
export const cisloOtazky = (o: OtazkaReportu): string =>
  o.hlavne.chyba ? "—" : `${kc(o.hlavne.hodnota)}${o.hlavne.jednotka ? ` ${o.hlavne.jednotka}` : ""}`;

/** Riadok do záveru: otázka a jej odpoveď jedným číslom. */
const riadokZaveru = (o: OtazkaReportu): string => `${o.otazka} ${cisloOtazky(o)}, ${o.hlavne.zmena}`;

/**
 * Koľko krokov má slajd otázky. Posledný krok je „Urob“ — keď report pri
 * otázke nič nenavrhuje (`Bez zmeny…`), krok pre prázdny rámček nevzniká.
 */
const krokyOtazky = (o: OtazkaReportu): number => (o.akcia ? 4 : 3);

/** „Šesť otázok“ / „dve otázky“ — skloňovanie v nadpise semaforu. */
const poctOtazok = (n: number) => {
  const slovom = ["nula", "jedna", "dve", "tri", "štyri", "päť", "šesť", "sedem", "osem"][n];
  if (n === 1) return "Jedna otázka";
  const s = slovom || String(n);
  const text = n >= 2 && n <= 4 ? `${s} otázky` : `${s} otázok`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function postavPrezentaciu(r: Report): Slajd[] {
  const otazky = r.otazky || [];
  // Na titulku idú tri čísla, ktoré sa dajú povedať bez vysvetľovania.
  const cisla = otazky
    .filter((o) => !o.hlavne.chyba)
    .slice(0, 3)
    .map((o) => ({ hodnota: cisloOtazky(o), popis: o.otazka }));

  // Otázka bez zdroja nie je ani dobrá, ani zlá — „Koľko si berieme domov? —“
  // v stĺpci „čo šlo dobre“ je tvrdenie, ktoré dáta nekryjú.
  const sDatami = otazky.filter((o) => !o.hlavne.chyba);
  const dobre = sDatami.filter((o) => o.semafor === "z").map(riadokZaveru);
  const pozor = sDatami.filter((o) => o.semafor !== "z").map(riadokZaveru);
  const bezDat = otazky.filter((o) => o.hlavne.chyba).map((o) => o.otazka);
  const navrhy = navrhyReportu(r);

  const slajdy: Slajd[] = [
    {
      druh: "titulka",
      kroky: cisla.length ? 2 : 1,
      nadpis: r.druh === "kvartal" ? `Kvartálny report ${r.nadpis}` : r.nadpis,
      porovnanie: r.porovnanie,
      cisla,
    },
  ];

  if (otazky.length) {
    slajdy.push({
      druh: "semafor",
      kroky: 1 + otazky.length,
      nadpis: `${poctOtazok(otazky.length)}, jeden pohľad`,
      karty: otazky.map((o) => ({ id: o.id, otazka: o.otazka, semafor: o.semafor, hodnota: cisloOtazky(o), zmena: o.hlavne.zmena, bezDat: Boolean(o.hlavne.chyba) })),
    });
  }

  for (const o of otazky) {
    slajdy.push({
      druh: "otazka",
      kroky: krokyOtazky(o),
      id: o.id,
      otazka: o.otazka,
      semafor: o.semafor,
      odpoved: o.odpoved,
      hodnota: o.hlavne.chyba ? "—" : kc(o.hlavne.hodnota),
      jednotka: o.hlavne.jednotka,
      zmena: o.hlavne.zmena,
      smer: o.hlavne.smer,
      seria: o.hlavne.seria,
      popisSerie: o.hlavne.popisSerie,
      // Na slajd sa vojdú štyri riadky; zvyšok je v okne reportu.
      detail: o.detail.slice(0, 4),
      akcia: o.akcia,
    });
  }

  if (dobre.length || pozor.length || bezDat.length) {
    slajdy.push({
      druh: "zaver",
      kroky: 1 + (dobre.length ? 1 : 0) + (pozor.length ? 1 : 0),
      nadpis: "Čo to znamená",
      dobre,
      pozor,
      bezDat,
    });
  }

  slajdy.push({
    druh: "akcie",
    kroky: 1 + Math.max(1, navrhy.length),
    nadpis: r.druh === "kvartal" ? "Čo urobíme v ďalšom štvrťroku" : "Čo urobíme v ďalšom mesiaci",
    akcie: navrhy.map((n) => ({ nadpis: n.nadpis, text: n.text })),
  });

  return slajdy;
}

/**
 * NÁVRH A (Jerry, 12. 11. 2026: „vyhráva A"). Dnešná prezentácia opakovala tých
 * istých šesť otázok štyrikrát: semafor, slajd po slajde, záver a „Čo urobíme".
 * Tu je každé číslo raz:
 *   prehľad (titulka a semafor v jednom) → práca → vyťaženosť → peniaze →
 *   výdavky → rezerva → otázky, ktoré nie sú v poriadku → zelené spolu na
 *   jednom slajde → najviac tri veci, čo urobiť.
 * „Urob" sa pri otázke už neukazuje, je len na konci.
 */
const VAHA: Record<Semafor, number> = { c: 0, o: 1, z: 2 };
const PORADIE_AKCII = ["praca", "peniaze", "novi", "klienti", "koncentracia", "osobne"];

export function postavPrezentaciuA(r: Report): Slajd[] {
  const otazky = r.otazky || [];
  const podla = (id: string) => otazky.find((o) => o.id === id);
  const peniaze = podla("peniaze");
  const vPoriadku = otazky.filter((o) => !o.hlavne.chyba && o.semafor === "z").length;
  const pocet = otazky.length;
  const zhrnutie = vPoriadku === pocet ? "všetky otázky v poriadku" : `${vPoriadku} ${pocet === 6 || pocet === 7 ? "zo" : "z"} ${pocet} otázok v poriadku`;
  const nadpis = peniaze && !peniaze.hlavne.chyba
    ? `Zisk ${cisloOtazky(peniaze).replace(" Kč zisk", " Kč")}, ${zhrnutie}`
    : `${r.nadpis}: ${zhrnutie}`;

  const slajdOtazky = (o: OtazkaReportu): SlajdOtazka => ({
    druh: "otazka", kroky: 3, id: o.id, otazka: o.otazka, semafor: o.semafor, odpoved: o.odpoved,
    hodnota: o.hlavne.chyba ? "—" : kc(o.hlavne.hodnota), jednotka: o.hlavne.jednotka, zmena: o.hlavne.zmena,
    smer: o.hlavne.smer, seria: o.hlavne.seria, popisSerie: o.hlavne.popisSerie, detail: o.detail.slice(0, 4),
    akcia: "",
  });

  const slajdy: Slajd[] = [{
    druh: "prehlad", kroky: 1,
    kicker: `Uzávierka · ${r.druh === "kvartal" ? `kvartál ${r.nadpis}` : r.nadpis}`,
    nadpis: nadpis.charAt(0).toUpperCase() + nadpis.slice(1),
    porovnanie: r.porovnanie,
    karty: otazky.map((o) => ({ id: o.id, otazka: o.otazka, semafor: o.semafor, hodnota: cisloOtazky(o), zmena: o.hlavne.zmena, bezDat: Boolean(o.hlavne.chyba) })),
  }];

  const praca = podla("praca");
  if (praca) slajdy.push(slajdOtazky(praca));
  const p = r.podklady;
  if (p && p.treneri.length) {
    const nad = p.treneri.filter((t) => t.pct > 100);
    const pod = p.treneri.filter((t) => t.pct < 100);
    slajdy.push({
      druh: "vytazenost", kroky: 1, p,
      nadpis: nad.length
        ? `${nad.map((t) => t.kto).join(" a ")} ${nad.length === 1 ? "je" : "sú"} nad stropom${pod.length ? `, ${pod.map((t) => `${t.kto} má ${kc(t.strop - t.hodiny)} h voľných`).join(", ")}` : ""}`
        : `Obaja pod stropom: ${p.treneri.map((t) => `${t.kto} ${t.pct} %`).join(", ")}`,
    });
  }
  if (peniaze) slajdy.push(slajdOtazky(peniaze));
  if (p && (p.vydavky.najvacsie.length || p.vydavky.nestandardne.length)) {
    slajdy.push({
      druh: "vydavky", kroky: 1, p,
      nadpis: p.vydavky.nestandardne.length ? "Kam išli peniaze a čo bolo navyše" : "Kam išli peniaze — nič neštandardné",
    });
  }
  if (p && (p.rezervaMesiacov !== undefined && p.rezervaMesiacov !== null)) {
    const m = p.rezervaMesiacov;
    slajdy.push({
      druh: "rezerva", kroky: 1, p,
      nadpis: `Rezerva drží ${m.toFixed(1).replace(".", ",")} mesiaca. ${m >= 3 ? "Cieľ 3 je splnený." : "Cieľ sú 3."}`,
    });
  }

  const ostatne = otazky.filter((o) => !["praca", "peniaze"].includes(o.id));
  for (const o of ostatne.filter((o) => o.semafor !== "z" || o.hlavne.chyba)) slajdy.push(slajdOtazky(o));
  const zelene = ostatne.filter((o) => o.semafor === "z" && !o.hlavne.chyba);
  if (zelene.length) {
    slajdy.push({
      druh: "spolu", kroky: 1,
      nadpis: zelene.length === 1 ? `${zelene[0].otazka} V poriadku.` : "Ostatné je v poriadku",
      karty: zelene.map((o) => ({ id: o.id, otazka: o.otazka, hodnota: cisloOtazky(o), zmena: o.hlavne.zmena, odpoved: o.odpoved })),
    });
  }

  const navrhy = navrhyReportu(r)
    .map((n) => ({ ...n, sem: podla(n.otazka)?.semafor || "z" }))
    .sort((a, b) => VAHA[a.sem] - VAHA[b.sem] || PORADIE_AKCII.indexOf(a.otazka) - PORADIE_AKCII.indexOf(b.otazka))
    .slice(0, 3);
  // Kroky musia pokryť všetky bloky: slajd sa ukazuje na poslednom kroku a blok
  // s indexom i sa ukáže až od kroku 1 + i (prvá beta 12. 11. bola prázdna).
  slajdy.push({
    druh: "akcie", kroky: 1 + Math.max(1, navrhy.length),
    nadpis: r.druh === "kvartal" ? "Čo urobíme v ďalšom štvrťroku" : "Čo urobíme v ďalšom mesiaci",
    akcie: navrhy.map((n) => ({ nadpis: n.nadpis, text: n.text })),
  });
  return slajdy;
}

/** Spolu krokov — na ukazovateľ postupu a na „som na konci“. */
export const krokovSpolu = (s: Slajd[]) => s.reduce((a, x) => a + x.kroky, 0);

/**
 * CELÝ SLAJD NARAZ (Jerry, 18. 10. 2026: „po prepnutí na ďalší slide tam
 * budú všetky dáta hneď a zaraz"). Krok vnútri slajdu sa už nepoužíva —
 * slajd sa vždy ukáže na svojom poslednom kroku, teda so všetkým.
 * `kroky` v slajde ostávajú len ako počet blokov, ktoré sa ukážu spolu.
 */
export const plnyKrok = (s: Slajd[], i: number) => Math.max(0, (s[i]?.kroky || 1) - 1);

/** Ďalší slajd, celý. `null` = koniec. */
export function dalej(s: Slajd[], i: number, _krok?: number): { i: number; krok: number } | null {
  if (!s[i] || i + 1 >= s.length) return null;
  return { i: i + 1, krok: plnyKrok(s, i + 1) };
}

/** Predošlý slajd, celý. Z prvého sa nevracia nikam. `null` = začiatok. */
export function spat(s: Slajd[], i: number, _krok?: number): { i: number; krok: number } | null {
  if (i <= 0) return null;
  return { i: i - 1, krok: plnyKrok(s, i - 1) };
}
