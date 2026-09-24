/**
 * Beta poradie marketingu nesmie žiadnu záložku stratiť.
 *
 * Je to len iné poradie a iné názvy skupín — `id` zostávajú, lebo na ne visia
 * odkazy z registra, od Jarvisa aj uložené adresy. Keby v novom zozname
 * niektorá chýbala, obsah by sa stal nedostupným a nikto by si to nevšimol.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const KOREN = new URL("../../", import.meta.url).pathname;
const zdroj = readFileSync(`${KOREN}components/psb/Marketing.tsx`, "utf8");

const idcka = (blok: string) => [...blok.matchAll(/\{ id: "(\w+)", label:/g)].map((m) => m[1]);

describe("marketing ako cesta (beta)", () => {
  const cesta = idcka(zdroj.slice(zdroj.indexOf("const TABY_CESTA"), zdroj.indexOf("export function Marketing")));
  const povodne = idcka(zdroj.slice(zdroj.indexOf("tabs={jeBeta()"), zdroj.indexOf("value={sub}")));

  it("obe verzie majú tie isté záložky", () => {
    expect([...cesta].sort()).toEqual([...povodne].sort());
  });

  it("cesta začína tým, čo sa deje, a končí zverejnením", () => {
    expect(cesta[0]).toBe("lievik");
    expect(cesta[cesta.length - 1]).toBe("kampan");
  });

  it("žiadna záložka sa v ceste neopakuje", () => {
    expect(new Set(cesta).size).toBe(cesta.length);
  });

  it("test vie prečítať oba zoznamy — inak by ticho prešiel nad ničím", () => {
    expect(cesta.length).toBeGreaterThan(5);
    expect(povodne.length).toBeGreaterThan(5);
  });
});
