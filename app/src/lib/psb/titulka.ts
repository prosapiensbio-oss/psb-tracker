/**
 * Titulka príspevku — sadzba, nie generovanie.
 *
 * PREČO SA NEGENERUJE OBRÁZKOM
 *
 * Titulky PSB nie sú ilustrácie, ale sadzba: nadpis, tónové plochy, značka,
 * pomer plôch. Generátor obrázkov v tomto zlyháva na dvoch veciach naraz —
 * diakritika (každé í, ě, ř je miesto na chybu) a konzistencia v čase (ten
 * istý prompt o mesiac dá inú hrúbku a iné okraje). Preto sa titulka SÁDŽE
 * z toho, čo appka už má.
 *
 * ODKIAĽ SÚ HODNOTY
 *
 * Z Jerryho PSD („repotažne videa titulka.psd"): plátno 1080×1920, Agrandir
 * Variable vo váhe 800 a 300 pri šírke 120, veľkosť 110, prokladanie 110,
 * tracking 20/1000 em. Farby sú z novej palety, nie z toho PSD.
 *
 * ČO SA ZMENILO PO PRVEJ VERZII (Jerry, 25. 8. 2026: „extrémne nudná")
 *
 * Prvá verzia bola PRÁZDNA, nie minimalistická. Tri konkrétne diery:
 *
 * 1. Jedno nastavenie písma na celú titulku. Švajčiarska škola brala hierarchiu
 *    z rodín, ktoré mali VÁHU AJ ŠÍRKU (Univers) — Agrandir Variable má obe osi
 *    a používal sa z nich jediný bod. Teraz vie nadpis miešať rezy v jednom
 *    riadku: `*takto*` označené slovo ide tenkým.
 * 2. Mechanický okraj. Všetko zarovnané na 96 px podľa čísla, nie podľa oka —
 *    guľaté O a S vyzerajú pri takom zarovnaní zatiahnuté dnu. Optické
 *    zarovnanie je presne to, čo delí hotovú sadzbu od nedokončenej.
 * 3. Žiadny obraz značky. Schémy boli grafové haraburdie, ktoré mohlo patriť
 *    hocijakej poradenskej firme. Značka PSB je pritom sieť uzlov na kráčajúcej
 *    postave — a Jerryho príspevky hovoria doslova to isté („Na první pohled
 *    koleno. Ve skutečnosti — pánev."). Titulka teraz stavia na tomto.
 */

export type Rezim = "svetly" | "tmavy";

/** Paleta PSB „Zelená". Jedno miesto — obrazovka aj export čítajú toto. */
export const PALETA = {
  tmavaZelena: "#1A2E24",
  akcent: "#2D7D5A",
  stredna: "#3D6B52",
  sivaZelena: "#5C7A6A",
  svetlaZelena: "#EBF5EE",
  velmiSvetla: "#F4F9F6",
  biela: "#FFFFFF",
  mutedZelena: "#A8C4B0",
} as const;

/** Zmiešanie dvoch farieb palety — tmavý režim nemá vlastný tón plochy. */
export function zmes(a: string, b: string, podiel: number): string {
  const roz = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = roz(a); const [r2, g2, b2] = roz(b);
  const k = (x: number, y: number) => Math.round(x + (y - x) * podiel).toString(16).padStart(2, "0");
  return `#${k(r1, r2)}${k(g1, g2)}${k(b1, b2)}`.toUpperCase();
}

export type Farby = {
  pozadie: string;
  /** Tónová plocha pod značkou — hĺbka bez novej farby. */
  plocha: string;
  nadpis: string; podnadpis: string;
  /** Vláskové čiary. */
  akcent: string;
  /** Štítok nad nadpisom. */
  meta: string;
  /** Značka. */
  znacka: string;
  /**
   * Tmavá plocha a texty na nej.
   *
   * Tmavý blok je tmavý v OBOCH režimoch — je to plocha, nie pozadie. Keby
   * sa v tmavom režime prepínal na svetlú, prestal by to byť ten istý nápad.
   */
  tmavaPlocha: string;
  naTmavom: string;
  naTmavomTlmene: string;
  /**
   * Svetlá plocha — druhá polovica dvojtónových skladieb.
   *
   * Skladba „písmeno cez šev" je tmavá hore a svetlá dole BEZ OHĽADU na režim.
   * Keby sa v tmavom režime obe polovice stmavili, šev by zmizol a s ním celý
   * nápad tej skladby. V tmavom režime je preto svetlá plocha tlmená zeleň,
   * nie biela — jasná biela by z tmavej titulky spravila svetlú.
   */
  svetlaPlocha: string;
  naSvetlom: string;
  naSvetlomTlmene: string;
  /**
   * Blok, z ktorého sa vysekáva písmo.
   *
   * Výsek je diera, cez ktorú vidno POZADIE — potrebuje teda blok, ktorý
   * s pozadím kontrastuje. V svetlom režime tmavý, v tmavom svetlý. Použiť
   * v oboch tmavý by v tmavom režime dalo dieru, ktorú nikto neuvidí.
   */
  blokVyseku: string;
  /** Tlmený text na stmavenej fotke — musí ustúpiť, nie zmiznúť. */
  tlmenyNaFotke: string;
};

/**
 * Sedem tónov z ôsmich farieb palety — nie dva.
 *
 * Jerry po prvej verzii: „sú to dve farby na tej titulke". Mal pravdu, a
 * odpoveď nie je pridať cudziu farbu, ale používať tú vlastnú v celom rozsahu:
 * pozadie, tónová plocha, hrany siete, uzly, značka, text, akcent.
 *
 * Akcentová zeleň drží na tmavom pozadí kontrast 3,1 : 1 — dosť na čiaru,
 * málo na text v 26 px. V tmavom režime je preto štítok v tlmenej zeleni.
 */
export function farby(rezim: Rezim): Farby {
  return rezim === "tmavy"
    ? {
        pozadie: PALETA.tmavaZelena,
        // Tmavý režim nemá v palete vlastný tón plochy — odvodí sa zmiešaním.
        plocha: zmes(PALETA.tmavaZelena, PALETA.stredna, 0.34),
        nadpis: PALETA.biela, podnadpis: PALETA.mutedZelena,
        akcent: PALETA.akcent, meta: PALETA.mutedZelena,
        // Značka je podpis, nie text na čítanie — smie byť tichšia než
        // podnadpis. Keď mala ten istý tón, tmavá titulka bola plochá.
        znacka: PALETA.sivaZelena,
        // V tmavom režime je pozadie samo tmavé, takže blok musí byť ešte
        // tmavší, inak by nebolo vidieť, že tam vôbec je.
        tmavaPlocha: "#0E1A14", naTmavom: PALETA.biela, naTmavomTlmene: PALETA.mutedZelena,
        svetlaPlocha: PALETA.mutedZelena, naSvetlom: PALETA.tmavaZelena, naSvetlomTlmene: PALETA.stredna,
        blokVyseku: PALETA.mutedZelena, tlmenyNaFotke: "#4E6A5C",
      }
    : {
        pozadie: PALETA.velmiSvetla,
        plocha: PALETA.svetlaZelena,
        nadpis: PALETA.tmavaZelena, podnadpis: PALETA.stredna,
        akcent: PALETA.akcent, meta: PALETA.sivaZelena,
        znacka: PALETA.stredna,
        tmavaPlocha: PALETA.tmavaZelena, naTmavom: PALETA.biela, naTmavomTlmene: PALETA.mutedZelena,
        svetlaPlocha: PALETA.velmiSvetla, naSvetlom: PALETA.tmavaZelena, naSvetlomTlmene: PALETA.stredna,
        blokVyseku: PALETA.tmavaZelena, tlmenyNaFotke: "#4E6A5C",
      };
}

export const RODINA = '"Agrandir Variable", "Agrandir", system-ui, sans-serif';

export type Kluc = {
  velkost: number; prokladanie: number; vaha: number; sirkaOsi: number; tracking: number;
};

/**
 * CSS pre jeden druh textu.
 *
 * Variačné osi idú cez `font-variation-settings`, nie cez `font-stretch` —
 * canvasové API šírkovú os ignoruje (overené: canvas dal 1608 px pre reťazec,
 * ktorý má pri wdth 120 mať 1721). Preto sa titulka nikdy nekreslí cez
 * `ctx.fillText`, ale cez SVG, ktoré osi rešpektuje.
 */
export function styl(k: Kluc) {
  return {
    fontFamily: RODINA,
    fontSize: `${k.velkost}px`,
    lineHeight: `${k.prokladanie}px`,
    letterSpacing: `${(k.tracking * k.velkost).toFixed(2)}px`,
    fontVariationSettings: `"wght" ${k.vaha}, "wdth" ${k.sirkaOsi}`,
    fontWeight: k.vaha,
  } as const;
}

/** Tracking v pixeloch — SVG `letter-spacing` neberie em rovnako spoľahlivo. */
export function trackingPx(k: Kluc): number {
  return Math.round(k.tracking * k.velkost * 100) / 100;
}

// ————— nadpis s miešaným rezom —————

export type Kus = { text: string; tenky: boolean };

/**
 * `*takto*` označené slová idú tenkým rezom.
 *
 * Prečo značkovanie a nie automatika: ktoré slovo je to dôležité, vie len ten,
 * kto text napísal. Appka, ktorá by to hádala, by raz za čas zvýraznila
 * spojku — a to je horšie než nezvýrazniť nič.
 */
export function kusy(t: string): Kus[] {
  const von: Kus[] = [];
  for (const cast of String(t || "").split(/(\*[^*]+\*)/)) {
    if (!cast) continue;
    const tenky = cast.startsWith("*") && cast.endsWith("*") && cast.length > 2;
    von.push({ text: tenky ? cast.slice(1, -1) : cast, tenky });
  }
  return von;
}

export type Slovo = { text: string; tenky: boolean };

/** Kusy na slová — zalamovať sa dá len po slovách, rez si každé nesie so sebou. */
export function slova(k: Kus[]): Slovo[][] {
  const odseky: Slovo[][] = [[]];
  for (const kus of k) {
    const casti = kus.text.split(/(\n)/);
    for (const c of casti) {
      if (c === "\n") { odseky.push([]); continue; }
      for (const w of c.split(/\s+/).filter(Boolean)) {
        const riadok = odseky[odseky.length - 1];
        const posledne = riadok[riadok.length - 1];
        // Hranica hviezdičky NIE JE hranica slova. Jarvis napísal
        // „Záda *stejná*." a bodka za zatvorenou hviezdičkou sa stala
        // samostatným slovom — spadla na vlastný riadok a vyzeralo to ako
        // chyba sadzby (25. 8. 2026). Interpunkcia sa preto lepí na
        // predchádzajúce slovo; v hrubom reze je bodka od bodky
        // v tenkom na nerozoznanie.
        if (posledne && /^[.,;:!?…)»"']+$/.test(w)) {
          posledne.text += w;
          continue;
        }
        riadok.push({ text: w, tenky: kus.tenky });
      }
    }
  }
  return odseky.filter((o, i) => o.length || i === 0);
}

/**
 * Zalomenie na šírku stĺpca so zmiešanými rezmi.
 *
 * Meranie sa vstrekuje zvonku, lebo skutočné šírky vie povedať len prehliadač
 * s nainštalovaným písmom — a zároveň to robí funkciu testovateľnou bez DOM.
 */
export function zalamKusy(
  text: string, maxSirka: number, meraj: (t: string, tenky: boolean) => number,
): Slovo[][] {
  const von: Slovo[][] = [];
  for (const odsek of slova(kusy(text))) {
    if (!odsek.length) { von.push([]); continue; }
    let riadok: Slovo[] = [];
    for (const w of odsek) {
      const skus = [...riadok, w];
      if (riadok.length && sirkaRiadku(skus, meraj) > maxSirka) {
        von.push(riadok); riadok = [w];
      } else {
        riadok = skus;
      }
    }
    if (riadok.length) von.push(riadok);
  }
  while (von.length && !von[von.length - 1].length) von.pop();
  return von;
}

export function sirkaRiadku(r: Slovo[], meraj: (t: string, tenky: boolean) => number): number {
  let w = 0;
  r.forEach((s, i) => {
    w += meraj(s.text, s.tenky);
    if (i < r.length - 1) w += meraj(" ", s.tenky);
  });
  return w;
}

export function textRiadku(r: Slovo[]): string {
  return r.map((s) => s.text).join(" ");
}

/** Jednoduché zalomenie bez rezov — podnadpis, štítok. */
export function zalam(text: string, maxSirka: number, meraj: (s: string) => number): string[] {
  const von: string[] = [];
  for (const odsek of String(text || "").split("\n")) {
    const slovka = odsek.trim().split(/\s+/).filter(Boolean);
    if (!slovka.length) { von.push(""); continue; }
    let r = "";
    for (const w of slovka) {
      const skus = r ? `${r} ${w}` : w;
      if (r && meraj(skus) > maxSirka) { von.push(r); r = w; } else { r = skus; }
    }
    if (r) von.push(r);
  }
  while (von.length && !von[von.length - 1]) von.pop();
  return von;
}

export const MAX_RIADKOV_NADPIS = 4;

export function priDlhy(riadkov: number): boolean {
  return riadkov > MAX_RIADKOV_NADPIS;
}

/**
 * Návrh nadpisu z toho, čo o príspevku vieme.
 *
 * Poradie zdrojov je poradie konkrétnosti: prvá veta captionu je to, čo Jerry
 * naozaj napísal pre čitateľa; koncept je opis pre neho samého. Nikdy sa
 * nevymýšľa nový text — appka len ponúkne, čo už existuje.
 */
export function navrhNadpisu(zdroj: { hotovyText?: string; scenar?: string; koncept?: string }): string {
  const riadky = (t?: string) => String(t || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const zCaptionu = spoj(rozdelNaVety(riadky(zdroj.hotovyText)[0] || ""));
  if (zCaptionu) return zCaptionu;
  const zoScenara = spoj(riadky(zdroj.scenar).flatMap(rozdelNaVety));
  if (zoScenara) return zoScenara;
  return String(zdroj.koncept || "").split(/[.:]/)[0].trim().slice(0, MAX_ZNAKOV);
}

const MIN_ZNAKOV = 22;
const MAX_ZNAKOV = 70;

function rozdelNaVety(t: string): string[] {
  return t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
}

/** Spája kúsky, kým nie sú dosť dlhé na nadpis a ešte sa zmestia. */
function spoj(kusky: string[]): string {
  let s = "";
  for (const k of kusky) {
    const skus = s ? `${s} ${k}` : k;
    if (s && (skus.length > MAX_ZNAKOV || s.length >= MIN_ZNAKOV)) break;
    s = skus;
  }
  if (s.length > MAX_ZNAKOV) return "";
  return s.replace(/[.:]$/, "");
}
