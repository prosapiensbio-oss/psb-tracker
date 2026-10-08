/**
 * ČITATEĽNOSŤ TLMENÉHO PÍSMA — stráži `styles.css`.
 *
 * Jerry, 8. 10. 2026 (snímka karty Faktúry): „to písmo je nevýrazné na tomto
 * pozadí a preto prekontroluj celý Kokpit, vyhľadaj tento kontrast a uprav to
 * všade." Nebola to chyba jednej obrazovky: `--c-textDim` mal vo VŠETKÝCH
 * šiestich paletách kontrast 2,7–3,5 : 1, a používa sa pri 11 px. Oprava
 * jedného miesta (Uzávierka, 8. 10. ráno) riešila následok, nie príčinu.
 *
 * Hranica 4,5 : 1 je WCAG AA pre bežné písmo. Test počíta kontrast podľa
 * WCAG 2.1 proti podkladu, na ktorom text naozaj leží — pri sklenených
 * paletách je to karta, teda biela s alfou nad pozadím.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const CSS = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

/** Podklad, na ktorom tlmené písmo naozaj leží: karta nad pozadím témy. */
const PODKLADY: Record<string, { pozadie: string; sklo: number }> = {
  dark: { pozadie: "#252b1f", sklo: 0 },
  mid: { pozadie: "#ece9de", sklo: 0 },
  light: { pozadie: "#424b38", sklo: 0 },
  sklo: { pozadie: "#1c2216", sklo: 0.06 },
  "sklo-stredny": { pozadie: "#3a4530", sklo: 0.16 },
  "sklo-svetly": { pozadie: "#f2f4e8", sklo: 0.55 },
};

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const jas = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a: string, b: string) => {
  const [x, y] = [jas(a), jas(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const nadBielou = (h: string, alfa: number) =>
  `#${rgb(h).map((v) => Math.round(v * (1 - alfa) + 255 * alfa).toString(16).padStart(2, "0")).join("")}`;

/** Hodnota premennej v bloku danej palety. */
const premenna = (tema: string, nazov: string): string => {
  const hlavicka = tema === "sklo" ? ':root,\n:root[data-psb-theme="sklo"] {' : `:root[data-psb-theme="${tema}"] {`;
  const i = CSS.indexOf(hlavicka);
  if (i < 0) throw new Error(`paleta ${tema} v styles.css nie je`);
  const blok = CSS.slice(i, CSS.indexOf("\n}", i));
  const m = blok.match(new RegExp(`--c-${nazov}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!m) throw new Error(`${tema}: --c-${nazov} nie je šesťmiestny hex`);
  return m[1];
};

describe("tlmené písmo je čitateľné v každej palete", () => {
  for (const [tema, { pozadie, sklo }] of Object.entries(PODKLADY)) {
    const podklad = nadBielou(pozadie, sklo);
    for (const nazov of ["text", "textMuted", "textDim"]) {
      it(`${tema} · --c-${nazov}`, () => {
        const k = kontrast(premenna(tema, nazov), podklad);
        expect(Math.round(k * 100) / 100).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
