/**
 * Vodiace čiary — kde titulku obreže a prekryje samotný Instagram.
 *
 * PREČO TO APPKA MUSÍ UKÁZAŤ
 *
 * Titulka je 1080×1920, ale v telefóne z nej toľko nikdy nie je vidieť.
 * V profilovej mriežke sa oreže na 4:5 a v reeli spodok prekryje popis
 * s tlačidlami. Kto to nevidí pri sadzbe, zistí to až po zverejnení.
 *
 * ODKIAĽ SÚ ČÍSLA (25. 8. 2026)
 *
 * Bezpečná zóna 108 hore, 320 dole, 60 vľavo, 120 vpravo a profilová mriežka
 * 1080×1350 (4:5) sú z prehľadov rozmerov Instagramu. Zdroje sa v spodnom
 * páse rozchádzajú (320 až 430 px podľa toho, koľko riadkov má popis), preto
 * je nakreslený aj širší pás ovládania — je to odhad, nie zaručená hodnota,
 * a appka to hovorí nahlas.
 *
 * VODIDLÁ NIKDY NEIDÚ DO EXPORTU. Sú to čiary pre oko pri práci, nie
 * súčasť obrázka.
 */

export type Vodidlo = {
  id: string;
  nazov: string;
  popis: string;
  /** Obdĺžnik, ktorý sa má zvýrazniť, v súradniciach plátna 1080×1920. */
  ram: { x: number; y: number; w: number; h: number };
  /** Čiarkovaná = orientačná, plná = spoľahlivá. */
  isty: boolean;
};

export const PLATNO_W = 1080, PLATNO_H = 1920;

export const VODIDLA: Vodidlo[] = [
  {
    id: "mriezka",
    nazov: "Profilová mriežka (4:5)",
    popis: "Čo z titulky uvidí návštevník profilu. Zvyšok sa oreže.",
    ram: { x: 0, y: (PLATNO_H - 1350) / 2, w: PLATNO_W, h: 1350 },
    isty: true,
  },
  {
    id: "bezpecna",
    nazov: "Bezpečná zóna reelu",
    popis: "108 hore, 320 dole, 60 vľavo, 120 vpravo. Vnútri je všetko vidieť.",
    ram: { x: 60, y: 108, w: PLATNO_W - 60 - 120, h: PLATNO_H - 108 - 320 },
    isty: true,
  },
  {
    id: "ovladanie",
    nazov: "Pás ovládania reelu",
    popis: "Popis, meno a tlačidlá. Podľa dĺžky popisu siaha 320 až 430 px — širší odhad.",
    ram: { x: 0, y: PLATNO_H - 430, w: PLATNO_W, h: 430 },
    isty: false,
  },
];

const c = (n: number) => Math.round(n);

/**
 * Vodidlá ako SVG.
 *
 * Kreslia sa NAD titulku, aby boli vidieť aj na tmavom pozadí, ale bez
 * výplne — inak by menili farby pod sebou a Jerry by ladil sadzbu podľa
 * skresleného obrazu.
 */
export function vodidlaDoSvg(vybrate: string[]): string {
  const kus: string[] = [];
  for (const v of VODIDLA) {
    if (!vybrate.includes(v.id)) continue;
    const farba = v.isty ? "#E2914E" : "#E2914E";
    kus.push(
      `<rect x="${c(v.ram.x)}" y="${c(v.ram.y)}" width="${c(v.ram.w)}" height="${c(v.ram.h)}"` +
      ` fill="none" stroke="${farba}" stroke-width="3"` +
      (v.isty ? "" : ' stroke-dasharray="18 14"') +
      ' opacity="0.85"/>',
    );
    kus.push(
      `<text x="${c(v.ram.x) + 12}" y="${c(v.ram.y) + 34}" fill="${farba}" opacity="0.95"` +
      ` font-family="system-ui, sans-serif" font-size="24" font-weight="600">${v.nazov}</text>`,
    );
  }
  return kus.join("");
}

/** Spodná hrana bezpečnej zóny. Pod ňou v reeli začína popis a tlačidlá. */
export const BEZPECNE_DNO = PLATNO_H - 320;

/**
 * Čo z titulky vypadne pod bezpečnú zónu.
 *
 * Dlhý text vytlačí podnadpis nižšie, než kam Instagram dovidí. Ticho by to
 * znamenalo, že si Jerry na obrazovke prečíta vetu, ktorú v telefóne nikto
 * neuvidí. Vracia mená rolí, nie súradnice — do hlásenia netreba viac.
 */
export function mimoZony(
  prvky: { rola?: string; druh: string; y?: number; h?: number; riadky?: unknown[];
           rez?: { prokladanie: number }; blok?: { y: number; h: number } }[],
): string[] {
  const von: string[] = [];
  for (const p of prvky) {
    if (!p.rola || p.rola === "znacka" || p.rola === "fotka") continue;
    let dno = 0;
    if (p.druh === "text" || p.druh === "cislo") dno = (p.y ?? 0) + (p.rez?.prokladanie ?? 0);
    else if (p.riadky) dno = (p.y ?? 0) + p.riadky.length * (p.rez?.prokladanie ?? 0);
    else if (p.blok) dno = p.blok.y + p.blok.h;
    else continue;
    if (dno > BEZPECNE_DNO && !von.includes(p.rola)) von.push(p.rola);
  }
  return von;
}
