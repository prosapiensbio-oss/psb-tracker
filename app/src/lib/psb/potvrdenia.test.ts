/**
 * Potvrdenia patria do appky, nie do okna prehliadača.
 *
 * Prehliadač vie `confirm()` a `prompt()` potichu zablokovať. `prompt()`
 * vtedy vráti null a `confirm()` „nie" — v oboch prípadoch sa nestane nič
 * a človek nemá ako zistiť prečo. Jerry to zažil 24. 9. 2026 pri mazaní
 * klienta: napísal „vymazal som __test__, funguje to", a v databáze bol
 * riadok stále tam.
 *
 * Appka to má napísané aj vo vlastnom kóde (Banka.tsx: „vlastné potvrdenie,
 * nie confirm()"). Tento test stráži, aby sa to na karty klienta nevrátilo.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

const KOREN = new URL("../../", import.meta.url).pathname;

/** Volanie, nie zmienka v komentári. */
const volaDialog = (s: string) =>
  /(^|[^.\w])(confirm|prompt)\s*\(/m.test(s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""));

describe("žiadne dialógy prehliadača v obrazovkách klienta", () => {
  const subory = ["KlientStol.tsx", "Klienti.tsx", "Workspace.tsx", "Dennik.tsx"];

  for (const f of subory) {
    it(`${f} sa nepýta cez confirm()/prompt()`, () => {
      expect(volaDialog(readFileSync(`${KOREN}components/psb/${f}`, "utf8"))).toBe(false);
    });
  }

  it("test naozaj chytá volanie, keď tam je", () => {
    // Poistka proti tomu, aby test len ticho prechádzal.
    expect(volaDialog('if (!confirm("naozaj?")) return;')).toBe(true);
    expect(volaDialog('const x = prompt("meno");')).toBe(true);
    expect(volaDialog('// confirm() sa tu nepoužíva')).toBe(false);
  });

  it("všetky obrazovky psb sú pokryté alebo vedome vynechané", () => {
    // Keby pribudla nová karta klienta, nech je vidieť, že v zozname nie je.
    const vsetky = readdirSync(`${KOREN}components/psb`).filter((f) => f.endsWith(".tsx"));
    expect(vsetky).toEqual(expect.arrayContaining(subory));
  });
});
