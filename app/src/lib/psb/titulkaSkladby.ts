/**
 * Skladby titulky — rozvrh ako dáta, nie ako kód.
 *
 * PREČO PRESTAVBA
 *
 * Prvá verzia mala rozvrh natvrdo v jednej funkcii. Jerry si z nástrelov
 * vybral sedem skladieb v troch rodinách — do natvrdo napísanej funkcie sa
 * nezmestia bez toho, aby sa každá zmena musela robiť sedemkrát.
 *
 * AKO TO FUNGUJE
 *
 * Skladba je funkcia, ktorá zo ZMERANÉHO obsahu poskladá zoznam prvkov
 * (plocha, čiara, text, nadpis, značka, fotka). Prvky vykreslí jeden spoločný
 * kód. Meranie je zvonku, lebo skutočné šírky vie povedať len prehliadač
 * s nainštalovaným písmom — a takto sú skladby testovateľné bez DOM.
 *
 * PREČO FUNKCIA A NIE TABUĽKA
 *
 * Polovica vybraných skladieb potrebuje pozíciu ODVODENÚ od toho, kam nadpis
 * naozaj sadol: šev cez písmená, uhlopriečka pod prvým riadkom. Tabuľka
 * s pevnými číslami by pri kratšom nadpise minula a titulka by vyzerala
 * rozbito. Funkcia to vie spočítať, tabuľka nie.
 *
 * PREČO JE NÁHĽAD TIEŽ SVG
 *
 * Prvá verzia kreslila náhľad v DOM a export v SVG — dva kódy, ktoré musia dať
 * to isté. Nedali: raz sa rozišli o zalomenie, raz o účiaru. Teraz je náhľad
 * TEN ISTÝ reťazec, len zmenšený. Rozísť sa nemajú ako.
 */

import {
  type Farby, type Kluc, type Rezim, type Slovo, trackingPx,
} from "./titulka";

export const PLATNO = { sirka: 1080, vyska: 1920, okraj: 96 } as const;

/** Rezy písma. Veľkosť sa v skladbách prepisuje, osi a tracking nie. */
export const REZ = {
  stitok: { velkost: 26, prokladanie: 26, vaha: 800, sirkaOsi: 120, tracking: 0.16 },
  nadpis: { velkost: 110, prokladanie: 110, vaha: 800, sirkaOsi: 120, tracking: 0.02 },
  podnadpis: { velkost: 40, prokladanie: 54, vaha: 300, sirkaOsi: 120, tracking: 0.01 },
} as const;

/** Rez pre slová označené hviezdičkami v nadpise. */
export const VAHA_TENKA = 300;

export type Zarovnanie = "vlavo" | "stred" | "vpravo";

/**
 * Rola prvku — čo to na titulke je.
 *
 * Bez nej sa nedá povedať „posuň nadpis": skladba vracia plochý zoznam tvarov
 * a textov, ktoré sú si na pohľad rovnaké. Rola je aj to, čo drží úpravy pri
 * živote, keď sa zmení text — posun sa priradí k ROLE, nie k poradiu prvku.
 */
export type Rola = "stitok" | "nadpis" | "podnadpis" | "znacka" | "fotka" | "cislo";

export type Prvok = { rola?: Rola } & (
  | { druh: "plocha"; x: number; y: number; w: number; h: number; farba: string; opacita?: number }
  | { druh: "tvar"; d: string; farba: string; opacita?: number }
  | { druh: "text"; text: string; x: number; y: number; rez: Kluc; farba: string; zarovnanie?: Zarovnanie }
  /** Nadpis: viac riadkov, miešané rezy, optický posun. Farba sa dá dať po riadkoch. */
  | { druh: "nadpis"; riadky: Slovo[][]; x: number; y: number; rez: Kluc; farba: string | string[]; posun?: number[]; zarovnanie?: Zarovnanie }
  /** Nadpis vyseknutý z plochy — písmo je diera, nie farba. */
  | { druh: "vysek"; riadky: Slovo[][]; x: number; y: number; rez: Kluc; blok: { x: number; y: number; w: number; h: number; farba: string } }
  | { druh: "znacka"; ktora: "napis" | "figura"; x: number; y: number; sirka: number; farba: string; zarovnanie?: Zarovnanie }
  | { druh: "fotka"; x: number; y: number; w: number; h: number; kruh?: boolean }
  /** Nadpis kreslený dvakrát, orezaný nad a pod švom — dvojfarebné písmeno. */
  | { druh: "cezSev"; riadky: Slovo[][]; x: number; y: number; rez: Kluc; sev: number; hore: string; dole: string; posun?: number[]; zarovnanie?: Zarovnanie }
  /**
   * Číslo s jednotkou na jednej účiare.
   *
   * Jeden `text` s dvoma `tspan`, nie dva texty vedľa seba — SVG posunie
   * jednotku samo. Merať šírku čísla a jednotku podľa nej umiestňovať by
   * znamenalo ďalšie meranie, ktoré sa dá pokaziť.
   */
  | { druh: "cislo"; cislo: string; jednotka: string; x: number; y: number; rez: Kluc; rezJednotky: Kluc; farba: string; farbaJednotky: string; zarovnanie?: Zarovnanie }
  /** Vloží prvky orezané tvarom písmen nadpisu. */
  | { druh: "vPismenach"; riadky: Slovo[][]; x: number; y: number; rez: Kluc; vnutro: Prvok[] }
);

/** Čo skladba potrebuje od Jerryho. Editor sa podľa toho pýta. */
export type Pole = "stitok" | "nadpis" | "podnadpis" | "cislo" | "jednotka" | "fotka";

export type Obsah = {
  f: Farby;
  stitok: string;
  /** Už zalomený nadpis. */
  nadpis: Slovo[][];
  /** Už zalomený podnadpis. */
  podnadpis: string[];
  cislo: string;
  jednotka: string;
  maFotku: boolean;
  /** Optický posun na riadok nadpisu — o koľko sa má riadok posunúť VON. */
  posun: number[];
  /**
   * Skutočný rez nadpisu.
   *
   * Skladba si veľkosť ŽELÁ, ale nediktuje ju: keď sa najdlhšie slovo pri nej
   * do stĺpca nevojde, meranie ju zmenší a skladba dostane výsledok. Bez toho
   * skladby s veľkým rezom pretekali cez okraj — „Sklapovačky." má pri 200 px
   * 1 240 px a stĺpec 888.
   */
  rezNadpisu: Kluc;
  /**
   * Skutočný rez čísla a jednotky.
   *
   * Rovnaký dôvod ako pri nadpise: „18 MĚSÍCŮ" je pri 300 a 110 px širšie než
   * stĺpec a jednotka dobieha okraj. Meranie ich zmenší spolu, aby si medzi
   * sebou nezmenili pomer.
   */
  rezCisla: { cislo: Kluc; jednotka: Kluc };
  /**
   * Účiary od prehliadača.
   *
   * Skladba „písmeno cez šev" musí vedieť, kde v riadkovom boxe sedí účiara —
   * inak sa šev netrafí do písmen, ale medzi ne, a celý nápad zmizne.
   */
  baseline: (rez: Kluc) => number;
};

export type Skladba = {
  id: string;
  /** Číslo z nástrelov — aby sa dalo ukázať prstom na tú istú vec. */
  cislo: number;
  nazov: string;
  rodina: "slovo" | "cislo" | "fotka";
  /** Kedy sa hodí — bez toho sa z rozklikaného zoznamu vyberá naslepo. */
  kedy: string;
  polia: Pole[];
  /** Veľkosť nadpisu a šírka stĺpca — treba PRED meraním, lebo z toho sa zalamuje. */
  nadpis: { rez: Kluc; sirka: number };
  zloz: (o: Obsah) => Prvok[];
};

const S = PLATNO.sirka, V = PLATNO.vyska, O = PLATNO.okraj;
const STLPEC = S - 2 * O;

/**
 * Ako vysoko sedí značka. Na každej skladbe rovnako — je to podpis.
 *
 * PREČO 1540 A NIE NIŽŠIE
 *
 * Bezpečná zóna reelu končí na 1600. Podpis pôvodne sedel na 1712 a v telefóne
 * ho prekrýval popis s tlačidlami — logo tam jednoducho nebolo vidieť. Odhalili
 * to vodiace čiary 25. 8. 2026. Pod podpisom teraz ostáva pás, ktorý je
 * zámerne prázdny: v reeli ho aj tak zakryje Instagram.
 */
export const PODPIS = { y: 1540, sirka: 190 } as const;

/**
 * Podpis — jedno miesto pre všetkých sedem skladieb.
 *
 * NA STRED. Vľavo pôsobil ako poznámka pod čiarou; je to značka, tak nech
 * stojí na osi plátna (Jerry, 25. 8.). Posunúť sa dá ako čokoľvek iné —
 * východzie je len to, čím sa začína.
 */
function podpis(farba: string): Prvok {
  return {
    rola: "znacka", druh: "znacka", ktora: "napis",
    x: (S - PODPIS.sirka) / 2, y: PODPIS.y, sirka: PODPIS.sirka,
    farba, zarovnanie: "stred",
  };
}

/**
 * Najnižšie, kam smie začať podnadpis, aby nedobehol podpis.
 *
 * Dlhý nadpis inak vytlačí podnadpis na značku. Radšej sa priblíži k nadpisu
 * než aby prekryl podpis — podpis je jediná vec, ktorá musí byť na každej
 * titulke na tom istom mieste.
 */
/**
 * Prázdny pás medzi textom a podpisom.
 *
 * Skladby zo Slova a Čísla majú pod textom veľkú plochu, ktorá je zámerne
 * pokojná — ale keď Jerry fotku má, je škoda ju tam nedať. Pás sa ponúkne len
 * vtedy, keď je dosť vysoký; nižší by z fotky spravil prúžok.
 *
 * 260 px pri šírke 1080 je pomer 4 : 1 — široký pás, aký sa v časopisoch
 * sádže bežne. Pôvodných 320 vypadlo po posunutí podpisu na 1540: trojriadkový
 * nadpis, čo je bežný prípad, nechal presne 280 px a fotka sa neponúkla vôbec.
 */
export const MIN_PAS = 260;

/** Spodok všetkého, čo skladba už nakreslila — odtiaľ začína prázdno. */
function dnoObsahu(prvky: Prvok[]): number {
  let dno = 0;
  for (const p of prvky) {
    if (p.druh === "text") dno = Math.max(dno, p.y + p.rez.prokladanie);
    else if (p.druh === "nadpis" || p.druh === "cezSev") dno = Math.max(dno, p.y + p.riadky.length * p.rez.prokladanie);
    else if (p.druh === "vysek") dno = Math.max(dno, p.blok.y + p.blok.h);
    else if (p.druh === "cislo") dno = Math.max(dno, p.y + p.rez.prokladanie);
    else if (p.druh === "vPismenach") dno = Math.max(dno, p.y + p.riadky.length * p.rez.prokladanie);
  }
  return dno;
}

/** Fotka do prázdneho pásu — len keď Jerry nejakú má a keď sa tam vojde. */
function vlozPas(p: Prvok[], o: Obsah, dno: number): void {
  if (!o.maFotku) return;
  const pas = pasFotky(dno);
  if (pas) p.push({ rola: "fotka", druh: "fotka", ...pas });
}

export function pasFotky(dno: number): { x: number; y: number; w: number; h: number } | null {
  const vrch = Math.round(dno + 70);
  const spodok = PODPIS.y - 60;
  return spodok - vrch >= MIN_PAS ? { x: 0, y: vrch, w: S, h: spodok - vrch } : null;
}

function strop(riadkov: number): number {
  return PODPIS.y - 44 - riadkov * REZ.podnadpis.prokladanie;
}

/** Najmenšia medzera, akú podnadpis od textu nad sebou dostane. */
const MIN_MEDZERA = 46;

/**
 * Kam sadne podnadpis.
 *
 * Chce sedieť `medzera` pod obsahom, ale nesmie dobehnúť podpis — a hlavne
 * nesmie vyliezť NAD obsah. Po posunutí podpisu na 1540 (25. 8.) sa presne to
 * stalo: strop klesol o 172 px a pri štvorriadkovom nadpise sa podnadpis
 * dostal nad jeho posledný riadok. Prekrytý nadpis je horšia chyba než
 * podnadpis, ktorý zabieha do pásu, čo Instagram aj tak zakryje.
 */
function podObsahom(dno: number, medzera: number, riadkov: number): number {
  return Math.max(dno + MIN_MEDZERA, Math.min(dno + medzera, strop(riadkov)));
}

const rez = (z: typeof REZ.nadpis | typeof REZ.stitok | typeof REZ.podnadpis, velkost?: number): Kluc =>
  velkost ? { ...z, velkost, prokladanie: Math.round(velkost * (z.prokladanie / z.velkost)) } : { ...z };

// ————— skladby —————

/**
 * 26 — Uhlopriečny rez.
 *
 * Prvý riadok nadpisu stojí v tmavom poli, zvyšok pod uhlopriečkou vo svetlom.
 * Medzera medzi nimi je zámer, nie chyba sadzby: to je celý nápad tej skladby.
 */
export const UHLOPRIECKA = { vlavo: 1080, vpravo: 820, prvyRiadok: 600 } as const;

const UHLOPRIECNY: Skladba = {
  id: "uhlopriecny", cislo: 26, nazov: "Uhlopriečny rez", kedy: "Prvý riadok v tmavom poli, zvyšok pod uhlopriečkou. Keď má hák dve časti — tvrdenie a vysvetlenie.", rodina: "slovo",
  polia: ["stitok", "nadpis", "podnadpis", "fotka"],
  nadpis: { rez: rez(REZ.nadpis, 104), sirka: STLPEC },
  zloz: (o) => {
    const prve = o.nadpis.slice(0, 1);
    const zvysok = o.nadpis.slice(1);
    const p: Prvok[] = [
      { druh: "plocha", x: 0, y: 0, w: S, h: V, farba: o.f.pozadie },
      // Najnižší bod uhlopriečky je vpravo. Prvý riadok nadpisu musí skončiť
      // nad ním — pri 760 mu ostávalo 16 px a stačilo o kúsok väčšie písmo,
      // aby text prerezal hranu poľa.
      { druh: "tvar", d: `M0 0L${S} 0L${S} ${UHLOPRIECKA.vpravo}L0 ${UHLOPRIECKA.vlavo}Z`, farba: o.f.tmavaPlocha },
      { druh: "plocha", x: O, y: 168, w: 120, h: 3, farba: o.f.akcent },
      { rola: "stitok", druh: "text", text: o.stitok, x: O, y: 230, rez: rez(REZ.stitok), farba: o.f.naTmavomTlmene },
      { rola: "nadpis", druh: "nadpis", riadky: prve, x: O, y: UHLOPRIECKA.prvyRiadok, rez: o.rezNadpisu, farba: o.f.naTmavom, posun: o.posun },
    ];
    if (zvysok.length) {
      p.push({ rola: "nadpis", druh: "nadpis", riadky: zvysok, x: O, y: 1240, rez: o.rezNadpisu, farba: o.f.nadpis, posun: o.posun.slice(1) });
    }
    if (o.podnadpis.length) {
      // Dno je spodok POSLEDNÉHO RIADKOVÉHO BOXU, nie posledná účiara.
      // Prvá verzia rátala účiary a čiarka nad podnadpisom sadala nad posledný
      // riadok nadpisu — vyzeralo to ako chyba sadzby, a bola.
      const dno = 1240 + zvysok.length * o.rezNadpisu.prokladanie;
      const y = podObsahom(dno, 150, o.podnadpis.length);
      p.push({ druh: "plocha", x: O, y: y - 90, w: 96, h: 2, farba: o.f.akcent });
      o.podnadpis.forEach((t, i) => p.push({
        rola: "podnadpis", druh: "text", text: t, x: O, y: y + i * REZ.podnadpis.prokladanie,
        rez: rez(REZ.podnadpis), farba: o.f.podnadpis,
      }));
    }
    vlozPas(p, o, dnoObsahu(p));
    p.push(podpis(o.f.meta));
    return p;
  },
};

/**
 * 31 — Riadok po riadku inou farbou.
 *
 * Bez deleného poľa: rytmus robí striedanie tónov po riadkoch. Farby sa
 * opakujú dokola, takže skladba znesie ľubovoľný počet riadkov — to je
 * dôvod, prečo je z vybraných najbezpečnejšia.
 */
const PO_RIADKOCH: Skladba = {
  id: "poRiadkoch", cislo: 31, nazov: "Riadok po riadku inou farbou", kedy: "Farba strieda po riadkoch. Najbezpečnejší: znesie ľubovoľný počet riadkov a nič v ňom nemá kam spadnúť.", rodina: "slovo",
  polia: ["stitok", "nadpis", "podnadpis", "fotka"],
  nadpis: { rez: { ...rez(REZ.nadpis, 140), prokladanie: 150 }, sirka: STLPEC },
  zloz: (o) => {
    const tony = [o.f.nadpis, o.f.podnadpis, o.f.akcent];
    const r = o.rezNadpisu;
    const dno = 680 + o.nadpis.length * r.prokladanie;
    const p: Prvok[] = [
      { druh: "plocha", x: 0, y: 0, w: S, h: V, farba: o.f.pozadie },
      { druh: "plocha", x: O, y: 168, w: 120, h: 3, farba: o.f.akcent },
      { rola: "stitok", druh: "text", text: o.stitok, x: O, y: 230, rez: rez(REZ.stitok), farba: o.f.meta },
      {
        rola: "nadpis", druh: "nadpis", riadky: o.nadpis, x: O, y: 680, rez: r,
        farba: o.nadpis.map((_, i) => tony[i % tony.length]), posun: o.posun,
      },
    ];
    const y = podObsahom(dno, 40, o.podnadpis.length);
    o.podnadpis.forEach((t, i) => p.push({
      rola: "podnadpis", druh: "text", text: t, x: O, y: y + i * REZ.podnadpis.prokladanie,
      rez: rez(REZ.podnadpis), farba: o.f.podnadpis,
    }));
    vlozPas(p, o, dnoObsahu(p));
    p.push(podpis(o.f.meta));
    return p;
  },
};

/**
 * 30 — Slovo vyseknuté z bloku.
 *
 * Písmo nie je napísané na farbe, je to diera, cez ktorú vidno pozadie.
 * Vo feede to funguje inak než biely text na farbe, hoci to na prvý pohľad
 * vyzerá podobne.
 *
 * Blok RASTIE s počtom riadkov. Pevná výška by pri jednoriadkovom nadpise
 * nechala pod písmenami prázdny pás a pri trojriadkovom by ich orezala.
 */
export const VYSEK = { vrch: 500, rez: 165, prokladanie: 175, lem: 110 } as const;

const VYSEKNUTY: Skladba = {
  id: "vysek", cislo: 30, nazov: "Slovo vyseknuté z bloku", kedy: "Písmo je diera cez farebný blok. Najhlasnejší — na krátke, tvrdé tvrdenie.", rodina: "slovo",
  polia: ["stitok", "nadpis", "podnadpis", "fotka"],
  nadpis: { rez: { ...rez(REZ.nadpis, VYSEK.rez), prokladanie: VYSEK.prokladanie }, sirka: STLPEC },
  zloz: (o) => {
    const r = o.rezNadpisu;
    const vyska = o.nadpis.length * r.prokladanie + 2 * VYSEK.lem;
    const dno = VYSEK.vrch + vyska;
    const p: Prvok[] = [
      { druh: "plocha", x: 0, y: 0, w: S, h: V, farba: o.f.pozadie },
      { druh: "plocha", x: O, y: 168, w: 120, h: 3, farba: o.f.akcent },
      { rola: "stitok", druh: "text", text: o.stitok, x: O, y: 230, rez: rez(REZ.stitok), farba: o.f.meta },
      {
        rola: "nadpis", druh: "vysek", riadky: o.nadpis, x: O, y: VYSEK.vrch + VYSEK.lem, rez: r,
        blok: { x: 0, y: VYSEK.vrch, w: S, h: vyska, farba: o.f.blokVyseku },
      },
    ];
    if (o.podnadpis.length) {
      const y = podObsahom(dno, 110, o.podnadpis.length);
      p.push({ druh: "plocha", x: O, y: y - 70, w: 96, h: 2, farba: o.f.akcent });
      o.podnadpis.forEach((t, i) => p.push({
        rola: "podnadpis", druh: "text", text: t, x: O, y: y + i * REZ.podnadpis.prokladanie,
        rez: rez(REZ.podnadpis), farba: o.f.podnadpis,
      }));
    }
    vlozPas(p, o, dnoObsahu(p));
    p.push(podpis(o.f.meta));
    return p;
  },
};

/**
 * 23 — Písmeno cez šev.
 *
 * Plátno je tmavé hore a svetlé dole, a šev preseká PÍSMENÁ prostredného
 * riadku, nie medzeru medzi riadkami. Preto sa nepočíta šev z rozvrhu, ale
 * ROZVRH ZO ŠVU: šev je pevne v 55 % výšky a nadpis sa posunie tak, aby doň
 * ten riadok sadol. Opačne by pri dvojriadkovom nadpise šev minul a titulka
 * by vyzerala len ako dva pásy.
 *
 * Optický stred verzálok je asi 0,35 veľkosti nad účiarou. Presnú výšku
 * verzálky by musel povedať prehliadač; tento odhad drží v celom rozsahu
 * veľkostí, ktoré tu prichádzajú do úvahy.
 */
export const SEV = { y: 1010, rez: 150, prokladanie: 150, stredVerzalky: 0.35 } as const;

/**
 * Najmenšia veľkosť, na akú sa smie nadpis stiahnuť.
 *
 * Pod ňou už skladba nie je tá skladba — tridsiatka bez veľkého rezu je len
 * tmavý obdĺžnik. Keď sa text nezmestí ani tak, appka to povie.
 */
export const NAJMENSI_PODIEL = 0.62;

const CEZ_SEV: Skladba = {
  id: "cezSev", cislo: 23, nazov: "Písmeno cez šev", kedy: "Šev preseká písmená v polovici. Najefektnejší, ale potrebuje krátky nadpis.", rodina: "slovo",
  polia: ["stitok", "nadpis", "podnadpis", "fotka"],
  nadpis: { rez: { ...rez(REZ.nadpis, SEV.rez), prokladanie: SEV.prokladanie }, sirka: STLPEC },
  zloz: (o) => {
    const r = o.rezNadpisu;
    // Riadok, cez ktorý má šev prejsť. Pri jednom riadku ten jediný, inak
    // prostredný — tam sa efekt číta najlepšie a nadpis ostane vyvážený.
    const cez = Math.floor(o.nadpis.length / 2);
    const y = SEV.y - cez * r.prokladanie - o.baseline(r) + SEV.stredVerzalky * r.velkost;
    const dno = y + o.nadpis.length * r.prokladanie;
    const p: Prvok[] = [
      { druh: "plocha", x: 0, y: 0, w: S, h: SEV.y, farba: o.f.tmavaPlocha },
      { druh: "plocha", x: 0, y: SEV.y, w: S, h: V - SEV.y, farba: o.f.svetlaPlocha },
      { druh: "plocha", x: O, y: 168, w: 120, h: 3, farba: o.f.akcent },
      { rola: "stitok", druh: "text", text: o.stitok, x: O, y: 230, rez: rez(REZ.stitok), farba: o.f.naTmavomTlmene },
      {
        rola: "nadpis", druh: "cezSev", riadky: o.nadpis, x: O, y, rez: r, sev: SEV.y,
        hore: o.f.naTmavom, dole: o.f.naSvetlom, posun: o.posun,
      },
    ];
    if (o.podnadpis.length) {
      const py = podObsahom(dno, 90, o.podnadpis.length);
      o.podnadpis.forEach((t, i) => p.push({
        rola: "podnadpis", druh: "text", text: t, x: O, y: py + i * REZ.podnadpis.prokladanie,
        rez: rez(REZ.podnadpis), farba: o.f.naSvetlomTlmene,
      }));
    }
    vlozPas(p, o, dnoObsahu(p));
    p.push(podpis(o.f.naSvetlomTlmene));
    return p;
  },
};

/**
 * 39 — Duotón a jediné svetlé slovo.
 *
 * Fotka stlmená do farby značky, jediná jasná vec na ploche je jeden riadok
 * nadpisu. Svetlý je PROSTREDNÝ riadok, rovnako ako šev preseká prostredný —
 * pri jednom riadku ten jediný. Vyberať ho ručne by znamenalo ďalšie
 * rozhodnutie pri každom príspevku.
 */
const DUOTON: Skladba = {
  id: "duoton", cislo: 39, nazov: "Duotón a jediné svetlé slovo", kedy: "Fotka stlmená do farby značky, jediné svetlé slovo. Na klientske príbehy s obyčajnou fotkou.", rodina: "fotka",
  polia: ["stitok", "nadpis", "fotka"],
  nadpis: { rez: { ...rez(REZ.nadpis, 120), prokladanie: 130 }, sirka: STLPEC },
  zloz: (o) => {
    const r = o.rezNadpisu;
    const jasny = Math.floor(o.nadpis.length / 2);
    const y = 900 - jasny * r.prokladanie;
    return [
      { rola: "fotka", druh: "fotka", x: 0, y: 0, w: S, h: V },
      { druh: "plocha", x: 0, y: 0, w: S, h: V, farba: o.f.tmavaPlocha, opacita: 0.9 },
      { druh: "plocha", x: O, y: 168, w: 120, h: 3, farba: o.f.akcent },
      { rola: "stitok", druh: "text", text: o.stitok, x: O, y: 230, rez: rez(REZ.stitok), farba: o.f.naTmavomTlmene },
      {
        rola: "nadpis", druh: "nadpis", riadky: o.nadpis, x: O, y, rez: r, posun: o.posun,
        farba: o.nadpis.map((_, i) => (i === jasny ? o.f.naTmavom : o.f.tlmenyNaFotke)),
      },
      podpis(o.f.naTmavomTlmene),
    ];
  },
};

/**
 * 40 — Fotka vnútri písmen.
 *
 * Obraz vidno len cez nadpis. Fotka aj písmo sú v jednej ploche a nezavadzajú
 * si — to je celý dôvod, prečo táto skladba existuje.
 *
 * Výrez fotky sa počíta z rozsahu nadpisu, nie z pevného obdĺžnika: keby bol
 * pevný, pri kratšom nadpise by časť písmen ostala prázdna a pri dlhšom by sa
 * spodný riadok orezal.
 */
export const V_PISMENACH = { vrch: 560, rez: 200, prokladanie: 205 } as const;

const V_PISMENACH_SKLADBA: Skladba = {
  id: "vPismenach", cislo: 40, nazov: "Fotka vnútri písmen", kedy: "Fotku vidno len cez písmená. Najefektnejšie s fotkou, ktorá má kresbu po celej ploche.", rodina: "fotka",
  polia: ["stitok", "nadpis", "podnadpis", "fotka"],
  nadpis: { rez: { ...rez(REZ.nadpis, V_PISMENACH.rez), prokladanie: V_PISMENACH.prokladanie }, sirka: STLPEC },
  zloz: (o) => {
    const r = o.rezNadpisu;
    const vyska = o.nadpis.length * r.prokladanie;
    const dno = V_PISMENACH.vrch + vyska;
    const p: Prvok[] = [
      { druh: "plocha", x: 0, y: 0, w: S, h: V, farba: o.f.pozadie },
      { druh: "plocha", x: O, y: 168, w: 120, h: 3, farba: o.f.akcent },
      { rola: "stitok", druh: "text", text: o.stitok, x: O, y: 230, rez: rez(REZ.stitok), farba: o.f.meta },
      {
        rola: "nadpis", druh: "vPismenach", riadky: o.nadpis, x: O, y: V_PISMENACH.vrch, rez: r,
        // Fotka s rezervou nad aj pod — diakritika a dolné dotiahnutia idú
        // mimo riadkových boxov a bez rezervy by ostali nevyplnené.
        vnutro: [{ rola: "fotka", druh: "fotka", x: 0, y: V_PISMENACH.vrch - 80, w: S, h: vyska + 160 }],
      },
    ];
    if (o.podnadpis.length) {
      const y = podObsahom(dno, 110, o.podnadpis.length);
      p.push({ druh: "plocha", x: O, y: y - 70, w: 96, h: 2, farba: o.f.akcent });
      o.podnadpis.forEach((t, i) => p.push({
        rola: "podnadpis", druh: "text", text: t, x: O, y: y + i * REZ.podnadpis.prokladanie,
        rez: rez(REZ.podnadpis), farba: o.f.podnadpis,
      }));
    }
    vlozPas(p, o, dnoObsahu(p));
    p.push(podpis(o.f.meta));
    return p;
  },
};

/**
 * 35/36 — Číslo.
 *
 * Tvoje meranie je obraz, ktorý netreba fotiť. „18 MĚSÍCŮ" a „91 %" boli
 * v nástreloch dva kusy, ale je to JEDNA sadzba s iným obsahom: veľké číslo,
 * jednotka menším rezom v akcente na tej istej účiare, popis, nadpis.
 */
export const CISLO = { y: 620, rez: 300, jednotka: 110 } as const;

/** Východzie rezy čísla — meranie ich smie zmenšiť, pomer medzi nimi drží. */
export function rezyCisla(mierka = 1): { cislo: Kluc; jednotka: Kluc } {
  return {
    cislo: { ...REZ.nadpis, velkost: Math.round(CISLO.rez * mierka), prokladanie: Math.round(CISLO.rez * mierka), tracking: -0.02 },
    jednotka: { ...REZ.nadpis, velkost: Math.round(CISLO.jednotka * mierka), prokladanie: Math.round(CISLO.jednotka * mierka), tracking: 0.02 },
  };
}

const CISELNA: Skladba = {
  id: "cislo", cislo: 35, nazov: "Číslo", kedy: "Veľké číslo a jednotka. Na výsledky a merania, kde je číslo silnejší obraz než fotka.", rodina: "cislo",
  polia: ["stitok", "cislo", "jednotka", "nadpis", "podnadpis", "fotka"],
  nadpis: { rez: { ...rez(REZ.nadpis, 84), prokladanie: 92 }, sirka: STLPEC },
  zloz: (o) => {
    const r = o.rezNadpisu;
    const maCislo = !!o.cislo.trim();
    // Bez čísla by ostala hore diera. Nadpis sa vtedy posunie hore na jej
    // miesto — skladba sa nemá tváriť ako rozbitá, kým Jerry číslo nedopíše.
    const yNadpis = maCislo ? 980 : CISLO.y;
    const dno = yNadpis + o.nadpis.length * r.prokladanie;
    const p: Prvok[] = [
      { druh: "plocha", x: 0, y: 0, w: S, h: V, farba: o.f.pozadie },
      { druh: "plocha", x: O, y: 168, w: 120, h: 3, farba: o.f.akcent },
      { rola: "stitok", druh: "text", text: o.stitok, x: O, y: 230, rez: rez(REZ.stitok), farba: o.f.meta },
    ];
    if (maCislo) {
      p.push({
        rola: "cislo", druh: "cislo", cislo: o.cislo, jednotka: o.jednotka,
        x: O, y: CISLO.y, rez: o.rezCisla.cislo, rezJednotky: o.rezCisla.jednotka,
        farba: o.f.nadpis, farbaJednotky: o.f.akcent,
      });
      p.push({ druh: "plocha", x: O, y: 880, w: S - 2 * O, h: 2, farba: o.f.meta, opacita: 0.45 });
    }
    p.push({ rola: "nadpis", druh: "nadpis", riadky: o.nadpis, x: O, y: yNadpis, rez: r, farba: o.f.nadpis, posun: o.posun });
    if (o.podnadpis.length) {
      const y = podObsahom(dno, 70, o.podnadpis.length);
      o.podnadpis.forEach((t, i) => p.push({
        rola: "podnadpis", druh: "text", text: t, x: O, y: y + i * REZ.podnadpis.prokladanie,
        rez: rez(REZ.podnadpis), farba: o.f.podnadpis,
      }));
    }
    vlozPas(p, o, dnoObsahu(p));
    p.push(podpis(o.f.meta));
    return p;
  },
};

export const SKLADBY: Skladba[] = [
  UHLOPRIECNY, PO_RIADKOCH, VYSEKNUTY, CEZ_SEV, CISELNA, DUOTON, V_PISMENACH_SKLADBA,
];
export const SKLADBA_MAPA = new Map(SKLADBY.map((s) => [s.id, s]));

// ————— vykreslenie —————

const xml = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const osi = (vaha: number, sirkaOsi: number) =>
  `font-variation-settings: &quot;wght&quot; ${vaha}, &quot;wdth&quot; ${sirkaOsi}`;

const RODINA_SVG = "Agrandir Variable, Agrandir, sans-serif";
const kotva: Record<Zarovnanie, string> = { vlavo: "start", stred: "middle", vpravo: "end" };

/** Účiary a vektory značky — všetko, čo vie len prehliadač. */
export type Zvonku = {
  /**
   * Účiara v riadkovom boxe pre KTORÝKOĽVEK rez.
   *
   * Prvá verzia mala tri pevné hodnoty a vyberala z nich podľa veľkosti písma.
   * Fungovalo to, kým skladby používali tri veľkosti — číselná skladba má
   * číslo aj jednotku vo vlastných, a odhad by ich posunul.
   */
  baseline: (rez: Kluc) => number;
  znacka: { napis?: { sirka: number; vyska: number; obsah: string }; figura?: { sirka: number; vyska: number; obsah: string } };
  /**
   * Vložený obrázok aj s výrezom.
   *
   * Rozmery sú tu preto, že bez nich sa nedá spočítať, ktorá časť fotky je
   * v ráme vidieť. `preserveAspectRatio="slice"` by ju vycentroval a hotovo —
   * lenže na fotke býva to podstatné inde než v strede.
   */
  obrazok?: { uri: string; sirka: number; vyska: number; vyrez: Uprava };
};

function riadkyNadpisu(
  riadky: Slovo[][], x: number, y: number, r: Kluc, farba: string | string[],
  posun: number[] | undefined, baseline: number, prazdna?: boolean,
  zarovnanie: Zarovnanie = "vlavo",
): string {
  return riadky.map((riadok, i) => {
    // Susedné slová s rovnakým rezom idú do jedného tspanu — po slovách by sa
    // reťazec rozpadol a medzislovná medzera by sa mohla stratiť.
    const behy: { vaha: number; text: string }[] = [];
    riadok.forEach((s, j) => {
      const vaha = s.tenky ? VAHA_TENKA : r.vaha;
      const t = s.text + (j < riadok.length - 1 ? " " : "");
      const posledny = behy[behy.length - 1];
      if (posledny && posledny.vaha === vaha) posledny.text += t;
      else behy.push({ vaha, text: t });
    });
    const tspany = behy
      .map((b) => `<tspan font-weight="${b.vaha}" style="${osi(b.vaha, r.sirkaOsi)}">${xml(b.text)}</tspan>`)
      .join("");
    const f = prazdna ? "#000000" : Array.isArray(farba) ? farba[i] ?? farba[0] : farba;
    // Optická predsádzka má zmysel len pri zarovnaní doľava — inde by riadok
    // ťahala mimo osi, na ktorej má visieť.
    const p = zarovnanie === "vlavo" ? (posun?.[i] || 0) : 0;
    return `<text x="${(x - p).toFixed(1)}" y="${y + i * r.prokladanie + baseline}"` +
      ` fill="${f}" font-family="${RODINA_SVG}" font-size="${r.velkost}"` +
      ` text-anchor="${kotva[zarovnanie]}"` +
      ` letter-spacing="${trackingPx(r)}" xml:space="preserve">${tspany}</text>`;
  }).join("");
}

/**
 * Prvky na SVG.
 *
 * Ten istý reťazec ide do náhľadu aj do PNG. Prečo SVG a nie canvas: `<img>`
 * so SVG používa písma nainštalované v systéme a rešpektuje variačné osi
 * Agrandiru — overené meraním. Canvas os šírky zahodí (dal 1608 px tam, kde
 * DOM dá 1721). Vedľajší efekt: písmo sa nemusí baliť do appky.
 */
export function vykresli(prvky: Prvok[], v: Zvonku, predpona = "t", chytat = false): string {
  let poc = 0;
  const id = () => `${predpona}${++poc}`;

  const kus = prvky.map((p): string => {
    const obal = (m: string) =>
      // `boundingBox` preto, lebo písmená sú tenké a trafiť ich ťahaním myšou
      // v štvrtinovom náhľade je nemožné. Chytá sa celý rám prvku.
      chytat && p.rola
        ? `<g data-rola="${p.rola}" style="pointer-events:boundingBox;cursor:grab">${m}</g>`
        : m;
    return obal(kresliPrvok(p, v, id, predpona, poc, chytat));
  });

  return kus.join("");
}

function kresliPrvok(
  p: Prvok, v: Zvonku, id: () => string, predpona: string, poc: number, chytat: boolean,
): string {
  {
    void poc;
    switch (p.druh) {
      case "plocha":
        return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.farba}"` +
          (p.opacita !== undefined ? ` opacity="${p.opacita}"` : "") + "/>";
      case "tvar":
        return `<path d="${p.d}" fill="${p.farba}"` + (p.opacita !== undefined ? ` opacity="${p.opacita}"` : "") + "/>";
      case "text": {
        if (!p.text.trim()) return "";
        const z = p.zarovnanie ?? "vlavo";
        const b = v.baseline(p.rez);
        return `<text x="${p.x}" y="${p.y + b}" fill="${p.farba}" font-family="${RODINA_SVG}"` +
          ` font-size="${p.rez.velkost}" font-weight="${p.rez.vaha}" letter-spacing="${trackingPx(p.rez)}"` +
          ` text-anchor="${kotva[z]}" style="${osi(p.rez.vaha, p.rez.sirkaOsi)}" xml:space="preserve">${xml(p.text)}</text>`;
      }
      case "nadpis":
        return riadkyNadpisu(p.riadky, p.x, p.y, p.rez, p.farba, p.posun, v.baseline(p.rez), false, p.zarovnanie);
      case "cezSev": {
        // Kreslí sa CELÝ nadpis dvakrát, nie len ten riadok, ktorý šev preseká.
        // Riadky úplne nad švom sa v dolnej kópii orežú na nič a naopak —
        // netreba teda zisťovať, ktorý riadok to je, a nedá sa to pomýliť.
        const h = id(), d = id();
        const kresba = (farba: string) => riadkyNadpisu(p.riadky, p.x, p.y, p.rez, farba, p.posun, v.baseline(p.rez), false, p.zarovnanie);
        return `<clipPath id="${h}"><rect x="0" y="0" width="${S}" height="${p.sev}"/></clipPath>` +
          `<clipPath id="${d}"><rect x="0" y="${p.sev}" width="${S}" height="${V - p.sev}"/></clipPath>` +
          `<g clip-path="url(#${h})">${kresba(p.hore)}</g>` +
          `<g clip-path="url(#${d})">${kresba(p.dole)}</g>`;
      }
      case "vysek": {
        // Maska: biela plocha, čierne písmo. Písmo je diera, nie farba.
        const m = id();
        return `<mask id="${m}">` +
          `<rect x="${p.blok.x}" y="${p.blok.y}" width="${p.blok.w}" height="${p.blok.h}" fill="#FFFFFF"/>` +
          riadkyNadpisu(p.riadky, p.x, p.y, p.rez, "#000000", undefined, v.baseline(p.rez), true) +
          "</mask>" +
          `<rect x="${p.blok.x}" y="${p.blok.y}" width="${p.blok.w}" height="${p.blok.h}" fill="${p.blok.farba}" mask="url(#${m})"/>`;
      }
      case "vPismenach": {
        const c = id();
        return `<clipPath id="${c}">` +
          riadkyNadpisu(p.riadky, p.x, p.y, p.rez, "#000000", undefined, v.baseline(p.rez), true) +
          `</clipPath><g clip-path="url(#${c})">${vykresli(p.vnutro, v, `${predpona}v${c}`, chytat)}</g>`;
      }
      case "cislo": {
        if (!p.cislo.trim()) return "";
        const b = v.baseline(p.rez);
        const kus = (t: string, r: Kluc, farba: string) =>
          `<tspan fill="${farba}" font-size="${r.velkost}" font-weight="${r.vaha}"` +
          ` letter-spacing="${trackingPx(r)}" style="${osi(r.vaha, r.sirkaOsi)}">${xml(t)}</tspan>`;
        return `<text x="${p.x}" y="${p.y + b}" font-family="${RODINA_SVG}" xml:space="preserve">` +
          kus(p.cislo.trim(), p.rez, p.farba) +
          (p.jednotka.trim() ? kus(` ${p.jednotka.trim()}`, p.rezJednotky, p.farbaJednotky) : "") +
          "</text>";
      }
      case "znacka": {
        const k = v.znacka[p.ktora];
        if (!k) return "";
        const vyska = p.sirka / (k.sirka / k.vyska);
        return `<svg x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.sirka.toFixed(1)}" height="${vyska.toFixed(1)}"` +
          ` viewBox="0 0 ${k.sirka} ${k.vyska}" preserveAspectRatio="xMidYMid meet" style="color:${p.farba}">${k.obsah}</svg>`;
      }
      case "fotka": {
        const c = id();
        const tvar = p.kruh
          ? `<circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="${Math.min(p.w, p.h) / 2}"/>`
          : `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>`;
        const vnutro = v.obrazok
          ? (() => {
              const r = umiestniObrazok(p, v.obrazok, v.obrazok.vyrez);
              return `<image href="${v.obrazok.uri}" x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}"` +
                ` width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" preserveAspectRatio="none"/>`;
            })()
          // Kým fotka nie je, kreslí sa MIESTO na ňu. Prázdno by v náhľade
          // vyzeralo ako chyba appky, nie ako nevyplnené pole.
          : `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#8C9A92"/>` +
            `<path d="M${p.x} ${p.y}L${p.x + p.w} ${p.y + p.h}M${p.x + p.w} ${p.y}L${p.x} ${p.y + p.h}" stroke="#A6B2AB" stroke-width="2" fill="none"/>`;
        return `<clipPath id="${c}">${tvar}</clipPath><g clip-path="url(#${c})">${vnutro}</g>`;
      }
    }
  }
}

/**
 * Celé plátno.
 *
 * `chytat` pridá prvkom rolu do značiek, aby sa v náhľade dali chytiť myšou.
 * Do exportu to nejde — v PNG by to bola mŕtva váha.
 */
export function svgSkladby(prvky: Prvok[], v: Zvonku, predpona?: string, chytat = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${V}" viewBox="0 0 ${S} ${V}">` +
    vykresli(prvky, v, predpona, chytat) + "</svg>";
}

// ————— návrh skladby —————

/**
 * Ktorú skladbu appka ponúkne.
 *
 * ČO SA MERALO
 *
 * Fáza nákupného cyklu sama je slabý signál. V 262 vyšlých príspevkoch je
 * Edukácia najpočetnejšia v každej fáze — až v piatej sa klientske príbehy
 * koncentrujú (9 z 23). Preto sa fáza berie len ako doplnok a hlavné slovo má
 * TEXT: meranie v ňom je vidieť, klientsky príbeh tiež.
 *
 * PREČO SA NEVYBERÁ NÁHODNE VNÚTRI RODINY
 *
 * Vo feede by sa opakovala tá istá skladba dokola. Vyberá sa preto podľa
 * kľúča príspevku — ten istý príspevok má navždy tú istú skladbu (Jerry sa
 * k nej môže o týždeň vrátiť), ale susedné príspevky dostanú rôzne.
 */
export type Rodina = "slovo" | "cislo" | "fotka";

/** Meranie v texte: „ze 7 na 3", „7 → 3", „91 %", „18 měsíců". */
const MERANIE = [
  /\b(?:z|ze|from)\s*\d{1,3}\s*(?:na|to|→|->)\s*\d{1,3}\b/i,
  /\d{1,3}\s*(?:→|->)\s*\d{1,3}/,
  /\d{1,3}\s*%/,
  /\b\d{1,3}\s*(?:měsíc|mesiac|týdn|týžd|let|rok)/i,
];

/** Klientsky príbeh: krstné meno na začiatku vety, alebo priama reč. */
const PRIBEH = [
  /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]{2,}\s+(?:měl|mela|měla|přišel|přišla|začal|začala|říká|nebyl|nebyla|prošel|prošla)/m,
  /\bklient(?:ka)?\b/i,
];

export function navrhniRodinu(v: { faza: number; text: string }): Rodina {
  const t = v.text || "";
  if (MERANIE.some((r) => r.test(t))) return "cislo";
  if (PRIBEH.some((r) => r.test(t))) return "fotka";
  // Piata fáza pýta dôkaz konkrétneho človeka — tam fotka sedí aj bez toho,
  // aby to text priznal slovami.
  if (v.faza === 5) return "fotka";
  return "slovo";
}

/** Stabilný rozptyl v rámci rodiny — susedné príspevky dostanú rôzne skladby. */
function kluc(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function navrhniSkladbu(v: { faza: number; text: string; kluc: string }): Skladba {
  const rodina = navrhniRodinu(v);
  // Rodina, ktorá ešte nie je postavená, spadne na Slovo — to je vždy
  // použiteľné a nikdy nie prázdne.
  const kandidati = SKLADBY.filter((s) => s.rodina === rodina);
  const zoznam = kandidati.length ? kandidati : SKLADBY.filter((s) => s.rodina === "slovo");
  return zoznam[kluc(v.kluc || v.text) % zoznam.length];
}

// ————— úpravy —————

/**
 * Ručné úpravy titulky.
 *
 * PREČO POSUNY A NIE PEVNÉ POZÍCIE
 *
 * Skladba počíta pozície z obsahu — nadpis o riadok dlhší posunie všetko pod
 * ním. Keby úprava ukladala súradnicu, prvá zmena textu by ju nechala visieť
 * v prázdne a Jerry by ju rovnal znova. Posun sa naopak vezie: keď sa nadpis
 * predĺži, posunutý podnadpis ide s ním.
 *
 * PREČO SA MIERKA NADPISU NERIEŠI TU
 *
 * Zmena veľkosti písma mení zalomenie, a to vie povedať len prehliadač. Mierka
 * nadpisu preto vstupuje do MERANIA, nie do hotových prvkov — inak by sa text
 * roztiahol cez okraj.
 */
export type Uprava = {
  dx: number; dy: number; k: number;
  /**
   * Od ktorého okraja prvok visí.
   *
   * Nie je to posun — je to KOTVA. Zarovnanie doprava znamená, že prvok drží
   * pravý okraj aj vtedy, keď sa zmení text a jeho šírka. Posun `dx` sa
   * pripočíta až k nej, takže sa dá kombinovať oboje.
   */
  zarovnanie?: Zarovnanie;
};
export type Upravy = Partial<Record<Rola, Uprava>>;

export const BEZ_UPRAVY: Uprava = { dx: 0, dy: 0, k: 1 };

/** Role, ktoré sa dajú zarovnať. Plochy a fotky idú cez celú šírku. */
export const ROLE_SO_ZAROVNANIM: Rola[] = ["stitok", "nadpis", "podnadpis", "znacka", "cislo"];

/** Role, ktorých veľkosť sa dá meniť geometricky (bez prepočtu zalomenia). */
export const ROLE_S_MIERKOU: Rola[] = ["znacka", "fotka", "cislo"];

/** Prichytenie na východziu pozíciu — cesta späť má byť ľahšia než cesta preč. */
export const PRICHYT = 8;

export function prichytenie(d: number): number {
  return Math.abs(d) <= PRICHYT ? 0 : Math.round(d / 8) * 8;
}

export function jeUpravene(u: Upravy | undefined): boolean {
  if (!u) return false;
  // Zarovnanie je úprava rovnako ako posun. Bez tejto podmienky by prepnutie
  // „doprava" bez posunutia neurobilo nič — `pouziUpravy` by sa vrátilo hneď.
  // Aj „vľavo" je odteraz úprava: pri prvkoch, ktoré východzie stoja inde
  // (podpis na strede, nadpis v zvislom reze), je to skutočná zmena.
  return Object.values(u).some((x) =>
    x && (x.dx !== 0 || x.dy !== 0 || x.k !== 1 || !!x.zarovnanie));
}

/** Posunie a zväčší prvky podľa rolí. Skladba o úpravách nevie. */
/**
 * Kam sa prvok posunie, keď má visieť od iného okraja.
 *
 * Text a značka majú kotvu (`text-anchor`, resp. vlastnú šírku), takže stačí
 * presunúť bod, od ktorého visia. Prvok si šírku nesie sám alebo ju vie SVG —
 * merať ju tu by znamenalo tretie meranie, ktoré sa dá pokaziť.
 */
function osZarovnania(z: Zarovnanie | undefined, sirka?: number): number | null {
  // Kým bol podpis vľavo, „vľavo" mohlo znamenať „nechaj tak". Odkedy je
  // východzie na strede (Jerry, 25. 8.), musí byť aj vľavo skutočný pokyn —
  // inak by sa značka po prepnutí doľava nepohla.
  if (!z) return null;
  if (z === "vlavo") return PLATNO.okraj;
  if (z === "stred") return sirka === undefined ? S / 2 : (S - sirka) / 2;
  return sirka === undefined ? S - PLATNO.okraj : S - PLATNO.okraj - sirka;
}

export function pouziUpravy(prvky: Prvok[], upravy: Upravy | undefined): Prvok[] {
  if (!upravy || !jeUpravene(upravy)) return prvky;
  return prvky.map((p) => {
    const u = p.rola ? upravy[p.rola] : undefined;
    if (!u) return p;
    const { dx, dy, k, zarovnanie } = { ...BEZ_UPRAVY, ...u };
    switch (p.druh) {
      case "fotka":
        // RÁM FOTKY SA NEHÝBE. Pri týchto skladbách je rámom celé plátno
        // (duotón) alebo tvar písmen (fotka v písmenách) — posunúť ho znamená
        // spraviť dieru. Posun a mierka fotky preto menia VÝREZ, teda ktorá
        // časť obrázka je v ráme vidieť, a to sa rieši pri kreslení.
        return p;
      case "plocha":
        // Zväčšuje sa OD STREDU, inak by prvok pri zväčšovaní ušiel doprava
        // dole a Jerry by ho doťahoval späť.
        return { ...p, x: p.x + dx - (p.w * (k - 1)) / 2, y: p.y + dy - (p.h * (k - 1)) / 2, w: p.w * k, h: p.h * k };
      case "text":
      case "nadpis":
      case "cezSev":
        return { ...p, x: (osZarovnania(zarovnanie) ?? p.x) + dx, y: p.y + dy, zarovnanie: zarovnanie ?? p.zarovnanie };
      case "znacka": {
        // Mierka mení šírku, takže sa stred musí prepočítať aj vtedy, keď sa
        // zarovnanie nemení — inak by zväčšená značka ušla doprava.
        const sirka = p.sirka * k;
        const os = osZarovnania(zarovnanie ?? p.zarovnanie, sirka);
        return { ...p, y: p.y + dy, sirka, x: (os ?? p.x) + dx, zarovnanie: zarovnanie ?? p.zarovnanie };
      }
      case "cislo":
        return {
          ...p, x: (osZarovnania(zarovnanie) ?? p.x) + dx, y: p.y + dy, zarovnanie,
          rez: { ...p.rez, velkost: Math.round(p.rez.velkost * k) },
          rezJednotky: { ...p.rezJednotky, velkost: Math.round(p.rezJednotky.velkost * k) },
        };
      case "vysek":
      case "vPismenach": {
        // Výsek a fotka v písmenách sú tvarom písmen, nie textom — zarovnať sa
        // dajú rovnako, len sa musí posunúť aj blok, resp. vnútro.
        const x = (osZarovnania(zarovnanie) ?? p.x) + dx;
        if (p.druh === "vysek") {
          return { ...p, x, y: p.y + dy, blok: { ...p.blok, x: p.blok.x + dx, y: p.blok.y + dy } };
        }
        return { ...p, x, y: p.y + dy, vnutro: pouziUpravy(p.vnutro, upravy) };
      }
      default:
        return p;
    }
  });
}

/** Ktoré role skladba naozaj kreslí — editor ponúka len tie. */
export function roleSkladby(prvky: Prvok[]): Rola[] {
  const von: Rola[] = [];
  const prejdi = (zoznam: Prvok[]) => {
    for (const p of zoznam) {
      if (p.rola && !von.includes(p.rola)) von.push(p.rola);
      // Fotka vo štyridsiatke sedí VNÚTRI písmen, nie vedľa nich. Bez zostupu
      // by ju editor neponúkol a nedala by sa v ráme posunúť.
      if (p.druh === "vPismenach") prejdi(p.vnutro);
    }
  };
  prejdi(prvky);
  return von;
}

export const NAZOV_ROLY: Record<Rola, string> = {
  stitok: "štítok",
  nadpis: "nadpis",
  podnadpis: "podnadpis",
  znacka: "značka",
  fotka: "fotka",
  cislo: "číslo",
};

/** Ten istý názov v akuzatíve — „vrátiť značka" po slovensky nie je. */
export const ROLU: Record<Rola, string> = {
  stitok: "štítok",
  nadpis: "nadpis",
  podnadpis: "podnadpis",
  znacka: "značku",
  fotka: "fotku",
  cislo: "číslo",
};

// ————— uloženie —————

/**
 * Nastavenie titulky, ktoré prežije zavretie okna.
 *
 * FOTKA TU NIE JE. Je to súbor z Jerryho počítača a ako `data:` URI by nafúkla
 * každú odpoveď plánovača o stovky kilobajtov, aj keď o titulku vôbec nejde.
 * Pri návrate sa teda vráti všetko okrem nej — a okno to povie, nech to nie je
 * prekvapenie.
 */
export type Nastavenie = {
  skladba: string;
  rezim: Rezim;
  stitok: string;
  nadpis: string;
  podnadpis: string;
  cislo: string;
  jednotka: string;
  upravy: Upravy;
};

/**
 * Prečíta uložené nastavenie.
 *
 * Nikdy nehádže: pokazený alebo starý JSON znamená, že sa titulka otvorí ako
 * nová — nie že okno spadne. Neznáma skladba (premenovaná, odstránená) sa
 * zahodí a nechá sa navrhnúť znova.
 */
export function citaj(json: string): Partial<Nastavenie> | null {
  if (!json || !json.trim()) return null;
  try {
    const p: unknown = JSON.parse(json);
    if (!p || typeof p !== "object") return null;
    const o = p as Record<string, unknown>;
    const von: Partial<Nastavenie> = {};
    if (typeof o.skladba === "string" && SKLADBA_MAPA.has(o.skladba)) von.skladba = o.skladba;
    if (o.rezim === "svetly" || o.rezim === "tmavy") von.rezim = o.rezim;
    for (const k of ["stitok", "nadpis", "podnadpis", "cislo", "jednotka"] as const) {
      if (typeof o[k] === "string") von[k] = o[k] as string;
    }
    if (o.upravy && typeof o.upravy === "object") {
      const u: Upravy = {};
      for (const [rola, v] of Object.entries(o.upravy as Record<string, unknown>)) {
        if (!(rola in NAZOV_ROLY) || !v || typeof v !== "object") continue;
        const x = v as Record<string, unknown>;
        u[rola as Rola] = {
          dx: Number(x.dx) || 0,
          dy: Number(x.dy) || 0,
          k: Number.isFinite(Number(x.k)) && Number(x.k) > 0 ? Number(x.k) : 1,
        };
      }
      von.upravy = u;
    }
    return von;
  } catch {
    return null;
  }
}

export function zapis(n: Nastavenie): string {
  return JSON.stringify(n);
}

/**
 * Kam v ráme sadne obrázok.
 *
 * PREČO SA TO POČÍTA A NIE NECHÁVA NA SVG
 *
 * `preserveAspectRatio="slice"` vyplní rám a odreže presah — ale VŽDY od
 * stredu. Na fotke pritom býva to podstatné inde: klient stojí vľavo, hlava je
 * hore. Bez výrezu by sa musela fotka orezávať mimo appky a vkladať znova.
 *
 * PREČO SA POSUN ORÍZNE
 *
 * Odsunutý obrázok by nechal na kraji rámu prázdno a titulka by vyzerala
 * pokazene. Posun sa preto obmedzí presne na to, o koľko obrázok z rámu
 * prečnieva — ďalej sa jednoducho nedá.
 */
export function umiestniObrazok(
  ram: { x: number; y: number; w: number; h: number },
  obrazok: { sirka: number; vyska: number },
  vyrez: Uprava,
): { x: number; y: number; w: number; h: number } {
  const iw = Math.max(1, obrazok.sirka), ih = Math.max(1, obrazok.vyska);
  // Priblíženie nesmie klesnúť pod 1 — pod ním by obrázok rám nevyplnil.
  const k = Math.max(1, vyrez.k || 1);
  const mierka = Math.max(ram.w / iw, ram.h / ih) * k;
  const w = iw * mierka, h = ih * mierka;
  const maxX = (w - ram.w) / 2, maxY = (h - ram.h) / 2;
  const orez = (d: number, max: number) => Math.max(-max, Math.min(max, d || 0));
  return {
    x: ram.x + (ram.w - w) / 2 + orez(vyrez.dx, maxX),
    y: ram.y + (ram.h - h) / 2 + orez(vyrez.dy, maxY),
    w, h,
  };
}
