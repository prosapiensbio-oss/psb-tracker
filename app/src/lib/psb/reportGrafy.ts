// Grafy do reportu — SVG skladané ručne.
//
// Prečo nie knižnica: graf musí prežiť tlač do PDF. Knižnice kreslia na canvas
// alebo dopočítavajú rozmery z DOM po vykreslení — pri tlači z rámu, ktorý nikdy
// nebol viditeľný, z toho vypadne prázdne miesto. SVG s pevným viewBoxom sa
// vytlačí presne tak, ako vyzerá, a je ostré v akomkoľvek priblížení.
//
// Farby sú tie isté ako v tlačovom dokumente (reportHtml.ts) a zámerne svetlé:
// report sa posiela ďalej a niekedy sa aj vytlačí.

const Z = "#2D7D5A";        // zelená PSB
const Z2 = "#8FBFA6";       // svetlejšia — druhá séria
const TEXT = "#22302A";
const SLABA = "#6B7A72";
const LINKA = "#DCE5DF";

export type Seria = { nazov: string; farba: string; hodnoty: number[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Pekné maximum osi — 1/2/5 × mocnina desiatky, nech mriežka sedí na okrúhle čísla. */
const pekneMax = (v: number): number => {
  if (v <= 0) return 1;
  const rad = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (v <= k * rad) return k * rad;
  }
  return 10 * rad;
};

const skratka = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")} mil.`;
  if (a >= 10_000) return `${Math.round(n / 1000)} tis.`;
  if (a >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")} tis.`;
  return String(Math.round(n));
};

/**
 * Zoskupený stĺpcový graf. Jedna alebo dve série vedľa seba.
 *
 * Popisky hodnôt sú nad stĺpcami a nie na osi y: v reporte sa číta konkrétne
 * číslo („koľko bolo v júli"), nie pozícia voči mriežke.
 */
export function stlpcovyGraf(o: {
  popisky: string[];
  serie: Seria[];
  jednotka?: string;
  vyska?: number;
}): string {
  const { popisky, serie } = o;
  if (!popisky.length || !serie.length) return "";
  const jednotka = o.jednotka ?? "";
  const W = 640;
  const H = o.vyska ?? 210;
  const okrajL = 8, okrajP = 8, okrajH = serie.length > 1 ? 26 : 14, okrajD = 34;
  const plochaS = W - okrajL - okrajP;
  const plochaV = H - okrajH - okrajD;

  const max = pekneMax(Math.max(...serie.flatMap((s) => s.hodnoty), 0));
  const skupinaS = plochaS / popisky.length;
  const medzera = Math.min(14, skupinaS * 0.22);
  const stlpecS = (skupinaS - medzera) / serie.length;

  const casti: string[] = [];

  // Vodorovná mriežka — štyri linky stačia na odhad, viac už len špiní papier.
  for (let i = 0; i <= 4; i++) {
    const y = okrajH + plochaV - (plochaV * i) / 4;
    casti.push(`<line x1="${okrajL}" y1="${y.toFixed(1)}" x2="${W - okrajP}" y2="${y.toFixed(1)}" stroke="${LINKA}" stroke-width="1"/>`);
  }

  popisky.forEach((p, i) => {
    const x0 = okrajL + i * skupinaS + medzera / 2;
    serie.forEach((s, j) => {
      const v = s.hodnoty[i] ?? 0;
      const h = max ? (v / max) * plochaV : 0;
      const x = x0 + j * stlpecS;
      const y = okrajH + plochaV - h;
      const sirka = Math.max(1, stlpecS - 2);
      casti.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${sirka.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2.5" fill="${s.farba}"/>`,
      );
      if (v > 0) {
        casti.push(
          `<text x="${(x + sirka / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="${SLABA}">${esc(skratka(v))}</text>`,
        );
      }
    });
    casti.push(
      `<text x="${(okrajL + i * skupinaS + skupinaS / 2).toFixed(1)}" y="${(okrajH + plochaV + 15).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${TEXT}">${esc(p)}</text>`,
    );
  });

  // Legenda hore vľavo — len keď je sérií viac, inak by len zaberala miesto.
  if (serie.length > 1) {
    let x = okrajL;
    serie.forEach((s) => {
      casti.push(`<rect x="${x}" y="2" width="9" height="9" rx="2" fill="${s.farba}"/>`);
      casti.push(`<text x="${x + 13}" y="10.5" font-size="9.5" fill="${SLABA}">${esc(s.nazov)}</text>`);
      x += 13 + s.nazov.length * 5.4 + 16;
    });
  }
  if (jednotka) {
    casti.push(`<text x="${W - okrajP}" y="${H - 4}" text-anchor="end" font-size="8.5" fill="${SLABA}">${esc(jednotka)}</text>`);
  }

  return `<svg class="graf" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica Neue, Arial, sans-serif">${casti.join("")}</svg>`;
}

/** Vodorovné pruhy — na rozloženia, kde sú názvy dlhšie než hodnoty (segmenty, balíčky). */
export function pruhovyGraf(o: { polozky: { nazov: string; hodnota: number }[]; jednotka?: string }): string {
  const polozky = o.polozky.filter((p) => p.hodnota > 0).slice(0, 8);
  if (!polozky.length) return "";
  const W = 640;
  const riadok = 22;
  const H = polozky.length * riadok + 8;
  const menoS = 168;
  const hodnotaS = 46;
  const plochaS = W - menoS - hodnotaS - 8;
  const max = Math.max(...polozky.map((p) => p.hodnota));

  const casti = polozky.map((p, i) => {
    const y = i * riadok + 4;
    const w = max ? (p.hodnota / max) * plochaS : 0;
    return (
      `<text x="0" y="${y + 12}" font-size="9.5" fill="${TEXT}">${esc(p.nazov.length > 30 ? `${p.nazov.slice(0, 29)}…` : p.nazov)}</text>` +
      `<rect x="${menoS}" y="${y + 3}" width="${Math.max(1.5, w).toFixed(1)}" height="11" rx="2.5" fill="${Z}"/>` +
      `<text x="${menoS + Math.max(1.5, w) + 6}" y="${y + 12}" font-size="9" fill="${SLABA}">${esc(skratka(p.hodnota))}${o.jednotka ? ` ${esc(o.jednotka)}` : ""}</text>`
    );
  });

  return `<svg class="graf" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica Neue, Arial, sans-serif">${casti.join("")}</svg>`;
}

export const FARBY = { hlavna: Z, vedlajsia: Z2 };
