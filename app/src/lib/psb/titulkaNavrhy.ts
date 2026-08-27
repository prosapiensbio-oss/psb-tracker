/**
 * Dvadsať nástrelov titulky.
 *
 * PREČO NÁSTRELY A NIE JEDNO RIEŠENIE
 *
 * Tri kolá som staval jednu skladbu a dolaďoval ju. Jerry na to po treťom
 * povedal „stále je to hrozné, skúsme to za iný koniec" — a mal pravdu:
 * doťahovaním sa nedá dostať zo zlého konceptu do dobrého. Toto je dvadsať
 * ODLIŠNÝCH skladieb, nie dvadsať odtieňov jednej. Vyberá sa z nich prstom,
 * nie slovami.
 *
 * PREČO JE V POLOVICI Z NICH FOTKA
 *
 * Jerryho výhrada bola „ploché, bez hĺbky, bez emócie, sú to len slová na
 * bielom". To nie je chyba sadzby, to je chýbajúci obraz. Hĺbku a emóciu
 * v tlačenej aj digitálnej titulke robí FOTOGRAFIA — telo, klient, štúdio.
 * A tú Jerry má: každý reel má prvý snímok. Generovaný obrázok by tú istú
 * dieru zaplátal horšie a ešte by rozbil konzistenciu.
 *
 * ČO JE „FOTO" V NÁSTRELE
 *
 * Sivé pole so slovom FOTO. Nie je to návrh obrázka — je to miesto, kam
 * obrázok príde. Nástrel ukazuje SKLADBU, nie obsah.
 */

import { type Farby, PALETA } from "./titulka";

export type Navrh = {
  cislo: number;
  nazov: string;
  /** Čo tá skladba robí — aby sa nevyberalo podľa toho, čo je pekné. */
  popis: string;
  /** Potrebuje Jerryho obrázok. */
  foto: boolean;
  /**
   * Do ktorej rodiny patrí, keď si ho Jerry vybral.
   *
   * Osem vybraných skladieb NIE JE osem rozhodnutí. Sú to tri rodiny podľa
   * toho, čo nesie obraz: slovo, číslo, fotka. A tie tri sedia na kategórie,
   * ktoré appka o príspevku už vie — Edukácia, Klientsky príbeh, Otázka.
   * Vďaka tomu sa skladba dá NAVRHNÚŤ z dát a Jerry ju len potvrdí.
   */
  rodina?: "slovo" | "cislo" | "fotka";
  /** `id` vyrába jedinečné identifikátory — na jednej stránke je štyridsať
   *  nástrelov a orezy s rovnakým id by si navzájom prepísali kresbu. */
  kresli: (f: Farby, id: (k: string) => string) => string;
};

const S = 1080, V = 1920, O = 96;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Rez = { t: string; tenky?: boolean };

/** Riadok textu. Váha sa dá miešať v jednom riadku — to robí hierarchiu. */
function T(
  kusy: Rez[] | string, x: number, y: number,
  v: { velkost: number; vaha?: number; farba: string; tracking?: number; stred?: boolean; sirkaOsi?: number },
): string {
  const k = typeof kusy === "string" ? [{ t: kusy }] : kusy;
  const vaha = v.vaha ?? 800;
  const wd = v.sirkaOsi ?? 120;
  const tsp = k.map((r) => {
    const w = r.tenky ? 300 : vaha;
    return `<tspan font-weight="${w}" style="font-variation-settings:&quot;wght&quot; ${w},&quot;wdth&quot; ${wd}">${esc(r.t)}</tspan>`;
  }).join("");
  return `<text x="${x}" y="${y}" fill="${v.farba}" font-family="Agrandir Variable, Agrandir, sans-serif"` +
    ` font-size="${v.velkost}" letter-spacing="${((v.tracking ?? 0.02) * v.velkost).toFixed(2)}"` +
    (v.stred ? ' text-anchor="middle"' : "") + ` xml:space="preserve">${tsp}</text>`;
}

const R = (x: number, y: number, w: number, h: number, farba: string, op = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${farba}"${op < 1 ? ` opacity="${op}"` : ""}/>`;

/** Miesto pre Jerryho obrázok. Nie návrh obrázka — miesto, kam príde. */
function foto(id: string, x: number, y: number, w: number, h: number, kruh = false): string {
  const tvar = kruh
    ? `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  return `<clipPath id="${id}">${tvar}</clipPath><g clip-path="url(#${id})">` +
    R(x, y, w, h, "#8C9A92") +
    `<path d="M${x} ${y}L${x + w} ${y + h}M${x + w} ${y}L${x} ${y + h}" stroke="#A6B2AB" stroke-width="2" fill="none"/>` +
    T("FOTO", x + w / 2, y + h / 2 + 12, { velkost: 34, farba: "#FFFFFF", tracking: 0.2, stred: true }) +
    "</g>";
}

/** Značka. `use` na symbol, ktorý stránka doplní raz — nie 20 kópií 80 kB. */
function napis(x: number, y: number, sirka: number, farba: string, stred = false): string {
  const vyska = sirka / 5.547;
  return `<use href="#psbNapis" x="${stred ? x - sirka / 2 : x}" y="${y}" width="${sirka}" height="${vyska}" style="color:${farba}"/>`;
}

function figura(x: number, y: number, vyska: number, farba: string): string {
  const sirka = vyska * (595.5 / 1201.9);
  return `<use href="#psbFigura" x="${x}" y="${y}" width="${sirka}" height="${vyska}" style="color:${farba}"/>`;
}

/** Štítok a vláskový akcent — spoločný začiatok väčšiny skladieb. */
function stitok(farba: string, akcent: string, y = 168, x = O): string {
  return R(x, y, 120, 3, akcent) + T("BIOMECHANIKA", x, y + 62, { velkost: 26, farba, tracking: 0.16 });
}


/**
 * Text ako orezová maska.
 *
 * Písmená sa dajú použiť ako okno do obrázka. Je to jediný spôsob, ako dostať
 * fotku a nadpis do jednej plochy tak, aby si nezavadzali — a zároveň to
 * najsilnejšie, čo sa dá s veľkým rezom Agrandiru spraviť.
 */
function klipText(id: string, riadky: string[], x: number, y: number, velkost: number, prokladanie: number): string {
  const t = riadky.map((r, i) =>
    `<text x="${x}" y="${y + i * prokladanie}" font-family="Agrandir Variable, Agrandir, sans-serif"` +
    ` font-size="${velkost}" font-weight="800" letter-spacing="${(velkost * -0.015).toFixed(1)}"` +
    ` style="font-variation-settings:&quot;wght&quot; 800,&quot;wdth&quot; 120">${esc(r)}</text>`).join("");
  return `<clipPath id="${id}">${t}</clipPath>`;
}

/**
 * Slovo VYSEKNUTÉ z plochy — nie napísané na nej.
 *
 * Maska namiesto farby: písmo nemá vlastný tón, je to diera, cez ktorú vidno
 * pozadie. Vo feede to funguje inak než biely text na farbe, hoci to na prvý
 * pohľad vyzerá podobne.
 */
function vysek(
  id: string, blok: { x: number; y: number; w: number; h: number; farba: string },
  slova: string[], tx: number, ty: number, velkost: number, prokladanie: number,
): string {
  const t = slova.map((r, i) =>
    `<text x="${tx}" y="${ty + i * prokladanie}" fill="#000000" font-family="Agrandir Variable, Agrandir, sans-serif"` +
    ` font-size="${velkost}" font-weight="800" letter-spacing="${(velkost * -0.015).toFixed(1)}"` +
    ` style="font-variation-settings:&quot;wght&quot; 800,&quot;wdth&quot; 120">${esc(r)}</text>`).join("");
  return `<mask id="${id}">${R(blok.x, blok.y, blok.w, blok.h, "#FFFFFF")}${t}</mask>` +
    `<rect x="${blok.x}" y="${blok.y}" width="${blok.w}" height="${blok.h}" fill="${blok.farba}" mask="url(#${id})"/>`;
}

/** Ten istý riadok dvakrát, orezaný nad a pod švom — dvojfarebné písmeno. */
function cezSev(
  id: string, kusy: Rez[], x: number, y: number, velkost: number,
  sev: number, hore: string, dole: string,
): string {
  const t = (farba: string, klip: string) =>
    `<g clip-path="url(#${klip})">${T(kusy, x, y, { velkost, farba, tracking: -0.015 })}</g>`;
  return `<clipPath id="${id}h"><rect x="0" y="0" width="${S}" height="${sev}"/></clipPath>` +
    `<clipPath id="${id}d"><rect x="0" y="${sev}" width="${S}" height="${V - sev}"/></clipPath>` +
    t(hore, `${id}h`) + t(dole, `${id}d`);
}

const NADPIS: Rez[][] = [
  [{ t: "Bolest zad" }],
  [{ t: "není ", tenky: true }, { t: "problém" }],
  [{ t: "zad" }],
];
const PODNADPIS = "Řízení, ne síla.";

export const NAVRHY: Navrh[] = [
  {
    cislo: 1, nazov: "Fotka na celú, text v závoji", foto: true,
    popis: "Najviac emócie. Obraz nesie titulku, text na ňom len sedí.",
    kresli: (f, id) => [
      foto(id("f2"), 0, 0, S, V),
      R(0, 1010, S, V - 1010, PALETA.tmavaZelena, 0.88),
      stitok(PALETA.mutedZelena, f.akcent, 1090),
      ...NADPIS.map((r, i) => T(r, O, 1310 + i * 110, { velkost: 104, farba: PALETA.biela })),
      T(PODNADPIS, O, 1690, { velkost: 38, vaha: 300, farba: PALETA.mutedZelena, tracking: 0.01 }),
      napis(O, 1790, 200, PALETA.mutedZelena),
    ].join(""),
  },
  {
    cislo: 2, nazov: "Fotka hore, text dole", foto: true,
    popis: "Dva pásy. Obraz a slovo sa nebijú, každý má svoje pole.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      foto(id("f3"), 0, 0, S, 1060),
      ...NADPIS.map((r, i) => T(r, O, 1250 + i * 110, { velkost: 104, farba: f.nadpis })),
      R(O, 1620, 96, 2, f.akcent),
      T(PODNADPIS, O, 1710, { velkost: 38, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(S / 2, 1810, 190, f.meta, true),
    ].join(""),
  },
  {
    cislo: 3, nazov: "Text hore, fotka dole", foto: true,
    popis: "Číta sa zhora. Obraz je dôkaz, nie kulisa.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      stitok(f.meta, f.akcent),
      ...NADPIS.map((r, i) => T(r, O, 420 + i * 110, { velkost: 104, farba: f.nadpis })),
      T(PODNADPIS, O, 830, { velkost: 38, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      foto(id("f4"), 0, 960, S, V - 960),
      napis(O, 1790, 190, PALETA.biela),
    ].join(""),
  },
  {
    cislo: 4, nazov: "Fotka v okne", foto: true,
    popis: "Obraz má rám z bieleho poľa. Najviac editoriálne, najmenej krik.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      stitok(f.meta, f.akcent),
      foto(id("f5"), O, 300, S - 2 * O, 760),
      ...NADPIS.map((r, i) => T(r, O, 1230 + i * 108, { velkost: 100, farba: f.nadpis })),
      T(PODNADPIS, O, 1620, { velkost: 36, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1790, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 5, nazov: "Fotka a akcentový blok", foto: true,
    popis: "Zelené pole odsekne obraz. Farba drží pozornosť, nie veľkosť písma.",
    kresli: (_f, id) => [
      foto(id("f6"), 0, 0, S, V),
      R(0, 1100, S, V - 1100, PALETA.akcent),
      ...NADPIS.map((r, i) => T(r, O, 1290 + i * 108, { velkost: 100, farba: PALETA.biela })),
      T(PODNADPIS, O, 1670, { velkost: 36, vaha: 300, farba: "#D8EADF", tracking: 0.01 }),
      napis(O, 1780, 190, "#D8EADF"),
    ].join(""),
  },
  {
    cislo: 6, nazov: "Fotka pod zeleným závojom", foto: true,
    popis: "Obraz stlmený do farby značky. Držané v jednom tóne, aj keď fotka nie je.",
    kresli: (_f, id) => [
      foto(id("f7"), 0, 0, S, V),
      R(0, 0, S, V, PALETA.tmavaZelena, 0.82),
      stitok(PALETA.mutedZelena, PALETA.akcent),
      ...NADPIS.map((r, i) => T(r, O, 760 + i * 112, { velkost: 106, farba: PALETA.biela })),
      R(O, 1160, 96, 2, PALETA.akcent),
      T(PODNADPIS, O, 1250, { velkost: 38, vaha: 300, farba: PALETA.mutedZelena, tracking: 0.01 }),
      napis(S / 2, 1790, 190, PALETA.mutedZelena, true),
    ].join(""),
  },
  {
    cislo: 7, nazov: "Fotka v kruhu", foto: true,
    popis: "Kruh je jediný tvar navyše. Číta sa ako portrét, nie ako banner.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      foto(id("f8"), 190, 240, 700, 700, true),
      ...NADPIS.map((r, i) => T(r, S / 2, 1150 + i * 108, { velkost: 100, farba: f.nadpis, stred: true })),
      T(PODNADPIS, S / 2, 1540, { velkost: 36, vaha: 300, farba: f.podnadpis, tracking: 0.01, stred: true }),
      napis(S / 2, 1780, 190, f.meta, true),
    ].join(""),
  },
  {
    cislo: 8, nazov: "Jedno slovo cez fotku", foto: true,
    popis: "Jedno slovo, obrovské, cez obraz. Vo feede sa to prečíta z metra.",
    kresli: (_f, id) => [
      foto(id("f9"), 0, 0, S, V),
      R(0, 0, S, V, PALETA.tmavaZelena, 0.42),
      T("BOLEST", O, 980, { velkost: 190, farba: PALETA.biela, tracking: -0.01 }),
      T("ZAD", O, 1160, { velkost: 190, farba: PALETA.akcent, tracking: -0.01 }),
      T("Není problém zad.", O, 1300, { velkost: 40, vaha: 300, farba: PALETA.biela, tracking: 0.01 }),
      napis(O, 1790, 190, PALETA.mutedZelena),
    ].join(""),
  },
  {
    cislo: 9, nazov: "Písmo ako obraz", foto: false,
    popis: "Bez obrázka, ale nie ploché — nadpis vyplní plátno od okraja po okraj.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      stitok(f.meta, f.akcent),
      T([{ t: "BOLEST" }], O, 700, { velkost: 168, farba: f.nadpis, tracking: -0.015 }),
      T([{ t: "ZAD NENÍ", tenky: true }], O, 860, { velkost: 168, farba: f.nadpis, tracking: -0.015 }),
      T([{ t: "PROBLÉM" }], O, 1020, { velkost: 168, farba: f.nadpis, tracking: -0.015 }),
      T([{ t: "ZAD" }], O, 1180, { velkost: 168, farba: f.akcent, tracking: -0.015 }),
      T(PODNADPIS, O, 1350, { velkost: 38, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1790, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 10, nazov: "Jedno slovo a drobnosti", foto: false,
    popis: "Jedno slovo nesie všetko, zvyšok je poznámka pod čiarou.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      stitok(f.meta, f.akcent),
      T("PÁNEV", O, 900, { velkost: 230, farba: f.nadpis, tracking: -0.02 }),
      R(O, 980, S - 2 * O, 1, f.meta),
      T("Bolest zad není problém zad.", O, 1060, { velkost: 40, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1790, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 11, nazov: "Číslo vedie", foto: false,
    popis: "Tvoje merania sú číslo. Číslo je obraz, ktorý netreba fotiť.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      stitok(f.meta, f.akcent),
      T("7", O, 800, { velkost: 300, farba: f.nadpis, tracking: -0.02 }),
      T("→", O + 210, 800, { velkost: 150, farba: f.akcent, tracking: 0 }),
      T("3", O + 420, 800, { velkost: 300, farba: f.akcent, tracking: -0.02 }),
      T("Ploché nohy.", O, 920, { velkost: 44, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      ...NADPIS.map((r, i) => T(r, O, 1180 + i * 100, { velkost: 92, farba: f.nadpis })),
      napis(O, 1790, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 12, nazov: "Citát", foto: false,
    popis: "Vetu povedal klient. Úvodzovka to prizná skôr, než sa začne čítať.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      T("“", O - 20, 620, { velkost: 340, farba: f.akcent, tracking: 0 }),
      T([{ t: "Na první pohled" }], O, 760, { velkost: 88, farba: f.nadpis }),
      T([{ t: "koleno." }], O, 866, { velkost: 88, farba: f.nadpis }),
      T([{ t: "Ve skutečnosti —", tenky: true }], O, 1000, { velkost: 88, farba: f.podnadpis }),
      T([{ t: "pánev." }], O, 1106, { velkost: 88, farba: f.akcent }),
      R(O, 1240, 96, 2, f.akcent),
      T("Petra, 41", O, 1320, { velkost: 34, vaha: 300, farba: f.meta, tracking: 0.02 }),
      napis(O, 1790, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 13, nazov: "Rozdelené pole", foto: false,
    popis: "Šev medzi tmavým a svetlým. Nadpis leží cez neho a mení farbu.",
    kresli: (f, id) => [
      R(0, 0, S, 940, PALETA.tmavaZelena),
      R(0, 940, S, V - 940, f.pozadie === PALETA.tmavaZelena ? PALETA.svetlaZelena : f.pozadie),
      stitok(PALETA.mutedZelena, PALETA.akcent),
      T([{ t: "Bolest zad" }], O, 800, { velkost: 104, farba: PALETA.biela }),
      T([{ t: "není ", tenky: true }, { t: "problém" }], O, 1050, { velkost: 104, farba: PALETA.tmavaZelena }),
      T([{ t: "zad" }], O, 1160, { velkost: 104, farba: PALETA.tmavaZelena }),
      T(PODNADPIS, O, 1300, { velkost: 38, vaha: 300, farba: PALETA.stredna, tracking: 0.01 }),
      napis(O, 1790, 190, PALETA.sivaZelena),
    ].join(""),
  },
  {
    cislo: 14, nazov: "Šikmý pás", foto: false,
    popis: "Jediná uhlopriečka. Rozbije pravouhlosť, nič iné nepridá.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      `<path d="M0 1020L${S} 820L${S} ${V}L0 ${V}Z" fill="${f.plocha}"/>`,
      stitok(f.meta, f.akcent),
      ...NADPIS.map((r, i) => T(r, O, 480 + i * 110, { velkost: 104, farba: f.nadpis })),
      T(PODNADPIS, O, 880, { velkost: 38, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      figura(660, 1120, 560, f.znacka),
      napis(O, 1790, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 15, nazov: "Text v tmavom bloku", foto: false,
    popis: "Blok je okno. Svetlé pole okolo neho dýcha a blok drží slovo.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      R(O, 420, S - 2 * O, 820, PALETA.tmavaZelena),
      stitok(PALETA.mutedZelena, PALETA.akcent, 500, O + 64),
      ...NADPIS.map((r, i) => T(r, O + 64, 800 + i * 104, { velkost: 96, farba: PALETA.biela })),
      T(PODNADPIS, O + 64, 1150, { velkost: 34, vaha: 300, farba: PALETA.mutedZelena, tracking: 0.01 }),
      napis(S / 2, 1780, 190, f.meta, true),
    ].join(""),
  },
  {
    cislo: 16, nazov: "Zvislý štítok", foto: false,
    popis: "Štítok stojí na hrane. Uvoľní celý horný okraj pre nadpis.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      `<g transform="translate(${O} 1180) rotate(-90)">${R(0, 0, 200, 3, f.akcent)}${T("BIOMECHANIKA", 0, 62, { velkost: 26, farba: f.meta, tracking: 0.16 })}</g>`,
      ...NADPIS.map((r, i) => T(r, O + 130, 480 + i * 110, { velkost: 102, farba: f.nadpis })),
      T(PODNADPIS, O + 130, 880, { velkost: 38, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      R(O + 130, 1300, S - O - 130 - O, 1, f.meta),
      napis(O + 130, 1790, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 17, nazov: "Pred a po", foto: true,
    popis: "Dva stĺpce, jedna vlásočnica medzi nimi. Tvoje pred/po bez slova navyše.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      foto(id("f10"), 0, 0, S / 2 - 1, 1000),
      foto(id("f11"), S / 2 + 1, 0, S / 2 - 1, 1000),
      R(S / 2 - 1, 0, 2, 1000, f.pozadie),
      T("PŘED", O, 940, { velkost: 28, farba: PALETA.biela, tracking: 0.16 }),
      T("PO", S / 2 + 60, 940, { velkost: 28, farba: PALETA.biela, tracking: 0.16 }),
      ...NADPIS.map((r, i) => T(r, O, 1180 + i * 106, { velkost: 98, farba: f.nadpis })),
      T(PODNADPIS, O, 1560, { velkost: 36, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1790, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 18, nazov: "Plné akcentové pole", foto: false,
    popis: "Celá plocha v zelenej značky. Vo feede to trhne oko najviac.",
    kresli: (_f, id) => [
      R(0, 0, S, V, PALETA.akcent),
      R(O, 168, 120, 3, PALETA.biela),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: "#D8EADF", tracking: 0.16 }),
      ...NADPIS.map((r, i) => T(r, O, 700 + i * 112, { velkost: 106, farba: PALETA.biela })),
      R(O, 1120, 96, 2, PALETA.biela),
      T(PODNADPIS, O, 1210, { velkost: 38, vaha: 300, farba: "#D8EADF", tracking: 0.01 }),
      figura(700, 1180, 520, "#5E9C7C"),
      napis(O, 1790, 190, "#D8EADF"),
    ].join(""),
  },
  {
    cislo: 19, nazov: "Vlásočnicová mriežka", foto: false,
    popis: "Mriežka priznáva, že je to sadzba. Vedecký zápisník, nie plagát.",
    kresli: (f, id) => {
      const m: string[] = [];
      for (let x = O; x <= S - O; x += (S - 2 * O) / 6) m.push(R(x, 168, 1, V - 340, f.meta, 0.5));
      for (let y = 168; y <= V - 172; y += 148) m.push(R(O, y, S - 2 * O, 1, f.meta, 0.5));
      return [
        R(0, 0, S, V, f.pozadie), ...m,
        T("BIOMECHANIKA", O, 130, { velkost: 26, farba: f.meta, tracking: 0.16 }),
        ...NADPIS.map((r, i) => T(r, O, 560 + i * 110, { velkost: 104, farba: f.nadpis })),
        T(PODNADPIS, O, 980, { velkost: 38, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
        napis(O, 1790, 190, f.meta),
      ].join("");
    },
  },
  {
    cislo: 20, nazov: "Maximálne ticho", foto: false,
    popis: "Jedno slovo hore, popis úplne dole, medzi nimi nič. Najodvážnejšie.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      T([{ t: "Bolest" }], O, 380, { velkost: 120, farba: f.nadpis }),
      T([{ t: "zad", tenky: true }], O, 500, { velkost: 120, farba: f.nadpis }),
      R(O, 1660, S - 2 * O, 1, f.meta),
      T("Není problém zad. Řízení, ne síla.", O, 1730, { velkost: 32, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(S - O - 190, 1770, 190, f.meta),
    ].join(""),
  },

  // ————— druhé kolo (21–40) —————
  //
  // Jerry vybral 2, 6, 8, 9, 11, 13 a favorita 13. Z toho sa dá čítať smer:
  // TVRDÉ BLOKY, VEĽKÉ PÍSMO, jeden akcent, fotka buď na celú alebo vôbec.
  // Neprešlo nič s rámčekom, kruhom, mriežkou ani so značkou ako ozdobou.
  // Druhé kolo tlačí presne tam a nikam inam.

  {
    cislo: 21, nazov: "Tri pásy", foto: false,
    popis: "Tmavý, svetlý, akcentový. Nadpis leží cez dva švy naraz.",
    kresli: (f) => [
      R(0, 0, S, 700, PALETA.tmavaZelena),
      R(0, 700, S, 760, f.pozadie),
      R(0, 1460, S, V - 1460, PALETA.akcent),
      T("BIOMECHANIKA", O, 240, { velkost: 26, farba: PALETA.mutedZelena, tracking: 0.16 }),
      T([{ t: "Bolest zad" }], O, 560, { velkost: 108, farba: PALETA.biela }),
      T([{ t: "není ", tenky: true }, { t: "problém" }], O, 920, { velkost: 108, farba: f.nadpis }),
      T([{ t: "zad" }], O, 1030, { velkost: 108, farba: f.nadpis }),
      T(PODNADPIS, O, 1600, { velkost: 40, vaha: 300, farba: "#D8EADF", tracking: 0.01 }),
      napis(O, 1780, 190, "#D8EADF"),
    ].join(""),
  },
  {
    cislo: 22, nazov: "Zvislý rez", foto: false,
    popis: "Rez zhora nadol namiesto zľava doprava. Uzší stĺpec drží text pohromade.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      R(0, 0, 380, V, PALETA.tmavaZelena),
      `<g transform="translate(150 1700) rotate(-90)">` +
        R(0, 0, 200, 3, PALETA.akcent) +
        T("BIOMECHANIKA", 0, 62, { velkost: 26, farba: PALETA.mutedZelena, tracking: 0.16 }) +
      "</g>",
      T([{ t: "Bolest" }], 460, 700, { velkost: 94, farba: f.nadpis }),
      T([{ t: "zad není", tenky: true }], 460, 806, { velkost: 94, farba: f.nadpis }),
      T([{ t: "problém" }], 460, 912, { velkost: 94, farba: f.nadpis }),
      T([{ t: "zad" }], 460, 1018, { velkost: 94, farba: f.akcent }),
      T(PODNADPIS, 460, 1160, { velkost: 38, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(460, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 23, rodina: "slovo", nazov: "Písmeno cez šev", foto: false,
    popis: "Šev preseká nadpis v polovici výšky písmen. Jedno slovo je dvojfarebné.",
    kresli: (f, id) => [
      R(0, 0, S, 980, PALETA.tmavaZelena),
      R(0, 980, S, V - 980, f.pozadie === PALETA.tmavaZelena ? PALETA.svetlaZelena : f.pozadie),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: PALETA.mutedZelena, tracking: 0.16 }),
      T([{ t: "BOLEST" }], O, 760, { velkost: 150, farba: PALETA.biela, tracking: -0.015 }),
      cezSev(id("v23"), [{ t: "ZAD" }], O, 1030, 150, 980, PALETA.biela, PALETA.tmavaZelena),
      T([{ t: "není problém zad", tenky: true }], O, 1180, { velkost: 54, farba: PALETA.stredna }),
      napis(O, 1780, 190, PALETA.sivaZelena),
    ].join(""),
  },
  {
    cislo: 24, nazov: "Blok len za jedným slovom", foto: false,
    popis: "Zvýraznené je jedno slovo, nie celý riadok. Zvyšok ostane pokojný.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T([{ t: "Bolest zad" }], O, 700, { velkost: 118, farba: f.nadpis }),
      R(O - 14, 730, 520, 132, PALETA.akcent),
      T([{ t: "není" }], O, 840, { velkost: 118, farba: PALETA.biela }),
      T([{ t: "problém zad", tenky: true }], O, 990, { velkost: 118, farba: f.nadpis }),
      T(PODNADPIS, O, 1120, { velkost: 40, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 25, nazov: "Posunutý blok", foto: false,
    popis: "Blok vybieha z plátna. Nadpis leží na jeho hrane a mení farbu.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      R(-120, 600, 900, 760, PALETA.tmavaZelena),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      cezSev(id("v25"), [{ t: "Bolest" }], O, 740, 108, 600, f.nadpis, PALETA.biela),
      T([{ t: "zad není", tenky: true }], O, 870, { velkost: 108, farba: PALETA.biela }),
      T([{ t: "problém" }], O, 1000, { velkost: 108, farba: PALETA.biela }),
      T([{ t: "zad" }], O, 1130, { velkost: 108, farba: PALETA.akcent }),
      T(PODNADPIS, O, 1460, { velkost: 40, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 26, rodina: "slovo", nazov: "Uhlopriečny rez", foto: false,
    popis: "To isté ako trinástka, ale šev je šikmý. Viac pohybu, menej pokoja.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      `<path d="M0 0L${S} 0L${S} 760L0 1080Z" fill="${PALETA.tmavaZelena}"/>`,
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: PALETA.mutedZelena, tracking: 0.16 }),
      T([{ t: "Bolest zad" }], O, 640, { velkost: 108, farba: PALETA.biela }),
      T([{ t: "není ", tenky: true }, { t: "problém" }], O, 1240, { velkost: 108, farba: f.nadpis }),
      T([{ t: "zad" }], O, 1350, { velkost: 108, farba: f.nadpis }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 27, nazov: "Text presahuje okraj", foto: false,
    popis: "Písmená sú orezané plátnom. Priznáva, že titulka je výrez, nie plagát.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T([{ t: "BOLEST" }], -40, 760, { velkost: 230, farba: f.nadpis, tracking: -0.03 }),
      T([{ t: "ZAD" }], -40, 970, { velkost: 230, farba: f.akcent, tracking: -0.03 }),
      T("Není problém zad.", O, 1120, { velkost: 44, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 28, nazov: "Štyri riadky, štyri veľkosti", foto: false,
    popis: "Každý riadok inak veľký. Hierarchia bez jedinej čiary navyše.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T([{ t: "Bolest", tenky: true }], O, 700, { velkost: 78, farba: f.podnadpis }),
      T([{ t: "zad" }], O, 850, { velkost: 148, farba: f.nadpis, tracking: -0.02 }),
      T([{ t: "není problém", tenky: true }], O, 950, { velkost: 66, farba: f.podnadpis }),
      T([{ t: "zad" }], O, 1130, { velkost: 190, farba: f.akcent, tracking: -0.02 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 29, nazov: "Slovo na výšku", foto: false,
    popis: "Jedno slovo otočené na výšku plátna. Najsilnejší tvar, najmenej textu.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      `<g transform="translate(880 1740) rotate(-90)">${T("PÁNEV", 0, 0, { velkost: 250, farba: f.nadpis, tracking: -0.02 })}</g>`,
      R(O, 300, 3, 700, f.akcent),
      T([{ t: "Bolest zad" }], O + 40, 380, { velkost: 76, farba: f.nadpis }),
      T([{ t: "není", tenky: true }], O + 40, 470, { velkost: 76, farba: f.nadpis }),
      T([{ t: "problém zad" }], O + 40, 560, { velkost: 76, farba: f.akcent }),
      T(PODNADPIS, O + 40, 680, { velkost: 36, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 30, rodina: "slovo", nazov: "Slovo vyseknuté z bloku", foto: false,
    popis: "Písmo nie je napísané na farbe, je to diera cez ňu. Vo feede sa to číta inak.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      vysek(id("m30"), { x: 0, y: 560, w: S, h: 620, farba: PALETA.tmavaZelena },
        ["BOLEST", "ZAD"], O, 830, 190, 200),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T([{ t: "není problém zad", tenky: true }], O, 1320, { velkost: 62, farba: f.nadpis }),
      T(PODNADPIS, O, 1420, { velkost: 38, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 31, rodina: "slovo", nazov: "Riadok po riadku inou farbou", foto: false,
    popis: "Bez deleného poľa. Farba strieda po riadkoch a robí rytmus sama.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T([{ t: "Bolest" }], O, 680, { velkost: 140, farba: f.nadpis, tracking: -0.02 }),
      T([{ t: "zad není" }], O, 830, { velkost: 140, farba: PALETA.mutedZelena, tracking: -0.02 }),
      T([{ t: "problém" }], O, 980, { velkost: 140, farba: f.akcent, tracking: -0.02 }),
      T([{ t: "zad" }], O, 1130, { velkost: 140, farba: f.nadpis, tracking: -0.02 }),
      T(PODNADPIS, O, 1280, { velkost: 40, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 32, nazov: "Zarovnané doprava", foto: false,
    popis: "Sadzba k pravému okraju. Prázdno ostane vľavo, kde ho oko čaká najmenej.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      T("BIOMECHANIKA", S - O, 230, { velkost: 26, farba: f.meta, tracking: 0.16, stred: false }).replace("<text", '<text text-anchor="end"'),
      ...[[{ t: "Bolest zad" }], [{ t: "není ", tenky: true }, { t: "problém" }], [{ t: "zad" }]].map((r, i) =>
        T(r as Rez[], S - O, 700 + i * 120, { velkost: 112, farba: f.nadpis }).replace("<text", '<text text-anchor="end"')),
      R(S - O - 96, 1130, 96, 2, f.akcent),
      T(PODNADPIS, S - O, 1220, { velkost: 40, vaha: 300, farba: f.podnadpis, tracking: 0.01 }).replace("<text", '<text text-anchor="end"'),
      napis(S - O - 190, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 33, nazov: "Škála 1 – 10", foto: false,
    popis: "Tvoja diagnostická škála ako obraz. Bodka je jediná farebná vec.",
    kresli: (f) => {
      const znacky: string[] = [];
      for (let i = 0; i < 10; i++) {
        const x = O + i * ((S - 2 * O) / 9);
        znacky.push(R(x, 700, 3, i === 6 ? 90 : 44, i === 6 ? f.akcent : f.meta));
        if (i === 6) znacky.push(`<circle cx="${x + 1.5}" cy="${680}" r="16" fill="${f.akcent}"/>`);
      }
      return [
        R(0, 0, S, V, f.pozadie),
        T("PLOCHÉ NOHY", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
        ...znacky,
        T("1", O, 880, { velkost: 32, vaha: 300, farba: f.meta, tracking: 0.02 }),
        T("10", S - O - 30, 880, { velkost: 32, vaha: 300, farba: f.meta, tracking: 0.02 }),
        ...NADPIS.map((r, i) => T(r, O, 1120 + i * 112, { velkost: 106, farba: f.nadpis })),
        napis(O, 1780, 190, f.meta),
      ].join("");
    },
  },
  {
    cislo: 34, nazov: "Dve čísla nad sebou", foto: false,
    popis: "Zmena zhora nadol. Druhé číslo je väčšie, lebo je to ono, čo sa hovorí.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      T("PŘED", O, 380, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T("7", O, 560, { velkost: 200, farba: f.podnadpis, tracking: -0.02 }),
      R(O, 620, 3, 130, f.akcent),
      T("PO 18 MĚSÍCÍCH", O, 800, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T("3", O, 1030, { velkost: 300, farba: f.akcent, tracking: -0.02 }),
      T([{ t: "Bolest zad není" }], O, 1240, { velkost: 76, farba: f.nadpis }),
      T([{ t: "problém zad", tenky: true }], O, 1330, { velkost: 76, farba: f.nadpis }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 35, rodina: "cislo", nazov: "Čas", foto: false,
    popis: "Číslo je čas, nie skóre. Odpovedá na otázku, ktorú ti kladú najčastejšie.",
    kresli: (f) => [
      R(0, 0, S, V, f.pozadie),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T("18", O, 780, { velkost: 330, farba: f.nadpis, tracking: -0.03 }),
      T([{ t: "MĚSÍCŮ", tenky: true }], O, 920, { velkost: 110, farba: f.akcent, tracking: 0.02 }),
      R(O, 1010, S - 2 * O, 2, f.meta),
      T([{ t: "Bolest zad není" }], O, 1130, { velkost: 78, farba: f.nadpis }),
      T([{ t: "problém zad", tenky: true }], O, 1222, { velkost: 78, farba: f.nadpis }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 36, rodina: "cislo", nazov: "Percento", foto: false,
    popis: "Jedno číslo cez pol plátna. Najkratšia možná titulka.",
    kresli: (f) => [
      R(0, 0, S, 1080, PALETA.tmavaZelena),
      R(0, 1080, S, V - 1080, f.pozadie),
      T("91", O, 760, { velkost: 400, farba: PALETA.biela, tracking: -0.04 }),
      T("%", O + 620, 760, { velkost: 180, farba: PALETA.akcent, tracking: 0 }),
      T("klientů dokončí program", O, 900, { velkost: 40, vaha: 300, farba: PALETA.mutedZelena, tracking: 0.01 }),
      ...NADPIS.map((r, i) => T(r, O, 1290 + i * 106, { velkost: 100, farba: f.nadpis })),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 37, nazov: "Fotka ako pás cez stred", foto: true,
    popis: "Text nad aj pod obrazom. Pás drží pohľad v strede plátna.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      T([{ t: "Bolest zad" }], O, 520, { velkost: 112, farba: f.nadpis }),
      T([{ t: "není ", tenky: true }, { t: "problém zad" }], O, 632, { velkost: 112, farba: f.nadpis }),
      foto(id("f37"), 0, 760, S, 720),
      T(PODNADPIS, O, 1620, { velkost: 40, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
  {
    cislo: 38, nazov: "Fotka a tmavý blok cez tretinu", foto: true,
    popis: "Ako dvojka, ale blok obraz prekrýva. Nie dva pásy vedľa seba, ale vrstvy.",
    kresli: (_f, id) => [
      foto(id("f38"), 0, 0, S, V),
      R(0, 1180, S, 480, PALETA.tmavaZelena),
      T("BIOMECHANIKA", O, 1090, { velkost: 26, farba: PALETA.biela, tracking: 0.16 }),
      T([{ t: "Bolest zad" }], O, 1330, { velkost: 104, farba: PALETA.biela }),
      T([{ t: "není ", tenky: true }, { t: "problém zad" }], O, 1434, { velkost: 104, farba: PALETA.biela }),
      T(PODNADPIS, O, 1560, { velkost: 36, vaha: 300, farba: PALETA.mutedZelena, tracking: 0.01 }),
      napis(O, 1780, 190, PALETA.biela),
    ].join(""),
  },
  {
    cislo: 39, rodina: "fotka", nazov: "Duotón a jediné svetlé slovo", foto: true,
    popis: "Šestka utiahnutá do konca. Jediná jasná vec na celej ploche je jedno slovo.",
    kresli: (_f, id) => [
      foto(id("f39"), 0, 0, S, V),
      R(0, 0, S, V, PALETA.tmavaZelena, 0.9),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: "#5C7A6A", tracking: 0.16 }),
      T([{ t: "Bolest zad" }], O, 820, { velkost: 120, farba: "#4E6A5C" }),
      T([{ t: "není" }], O, 950, { velkost: 120, farba: PALETA.biela }),
      T([{ t: "problém zad", tenky: true }], O, 1080, { velkost: 120, farba: "#4E6A5C" }),
      napis(O, 1780, 190, "#5C7A6A"),
    ].join(""),
  },
  {
    cislo: 40, rodina: "fotka", nazov: "Fotka vnútri písmen", foto: true,
    popis: "Obraz je vidieť len cez nadpis. Fotka a písmo v jednej ploche, bez bitky.",
    kresli: (f, id) => [
      R(0, 0, S, V, f.pozadie),
      T("BIOMECHANIKA", O, 230, { velkost: 26, farba: f.meta, tracking: 0.16 }),
      klipText(id("k40"), ["BOLEST", "ZAD"], O, 800, 210, 210),
      `<g clip-path="url(#${id("k40")})">${foto(id("f40"), 0, 500, S, 600)}</g>`,
      T([{ t: "není problém zad", tenky: true }], O, 1150, { velkost: 66, farba: f.nadpis }),
      R(O, 1250, 96, 2, f.akcent),
      T(PODNADPIS, O, 1340, { velkost: 40, vaha: 300, farba: f.podnadpis, tracking: 0.01 }),
      napis(O, 1780, 190, f.meta),
    ].join(""),
  },
];
