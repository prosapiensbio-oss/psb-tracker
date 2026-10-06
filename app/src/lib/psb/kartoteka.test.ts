import { describe, expect, it } from "bun:test";

import { fotenia, jeDenFotenia, jeFotkaTela, jePohlad, klucFotky, porovnania, POROVNANIE, suhlasFotky, VIDEO, type Fotka } from "./kartoteka";

const f = (o: Partial<Fotka> & { id: string; den: string }): Fotka => ({ klient: "Anna Nová", pohlad: "ine", ...o });

describe("deň fotenia", () => {
  it("len skutočný deň, nie budúci", () => {
    expect(jeDenFotenia("2026-10-05", "2026-10-05")).toBe(true);
    expect(jeDenFotenia("2026-10-06", "2026-10-05")).toBe(false);
    expect(jeDenFotenia("2026-02-30", "2026-10-05")).toBe(false);
    expect(jeDenFotenia("5.10.2026", "2026-10-05")).toBe(false);
  });
});

describe("fotenia", () => {
  it("od najnovšieho, v rámci dňa zboku–spredu–zozadu–iné, poznámka k dňu", () => {
    const fs = [
      f({ id: "1", den: "2026-06-01", pohlad: "zadok" }),
      f({ id: "2", den: "2026-06-01", pohlad: "bok" }),
      f({ id: "3", den: "2026-10-01", pohlad: "predok" }),
    ];
    const o = fotenia(fs, { "2026-06-01": "prepadnuté kolená" });
    expect(o.map((x) => x.den)).toEqual(["2026-10-01", "2026-06-01"]);
    expect(o[1].fotky.map((x) => x.id)).toEqual(["2", "1"]);
    expect(o[1].poznamka).toBe("prepadnuté kolená");
  });
  it("poznámka bez fotiek je tiež fotenie (fotky sa ešte nahrávajú)", () => {
    expect(fotenia([], { "2026-10-05": "x" }).map((x) => x.den)).toEqual(["2026-10-05"]);
  });
});

describe("porovnanie prvej a poslednej", () => {
  it("len rovnaký pohľad z dvoch rôznych dní, „iné“ nie", () => {
    const fs = [
      f({ id: "a", den: "2026-06-01", pohlad: "bok" }),
      f({ id: "b", den: "2026-08-01", pohlad: "bok" }),
      f({ id: "c", den: "2026-10-01", pohlad: "bok" }),
      f({ id: "d", den: "2026-06-01", pohlad: "predok" }),
      f({ id: "e", den: "2026-06-01", pohlad: "predok" }),
      f({ id: "g", den: "2026-06-01", pohlad: "ine" }),
      f({ id: "h", den: "2026-10-01", pohlad: "ine" }),
    ];
    const p = porovnania(fs);
    expect(p.map((x) => [x.pohlad, x.prva.id, x.posledna.id])).toEqual([["bok", "a", "c"]]);
  });
});

describe("súhlas a kľúč", () => {
  it("súhlas len z novej anamnézy s fotkami", () => {
    expect(suhlasFotky({ gdpr: { dano: true, fotky: true } })).toBe(true);
    expect(suhlasFotky({ gdpr: { dano: true, zdravotneUdaje: false, fotky: false } })).toBe(false);
    expect(suhlasFotky(null)).toBe(false);
  });
  it("pohľady a kľúč bez mena klienta", () => {
    expect(jePohlad("bok")).toBe(true);
    expect(jePohlad("hore")).toBe(false);
    expect(klucFotky("f1", "2026-10-05")).toBe("fotky/2026/f1.bin");
  });
});

// Jerry, 6. 10. 2026: „napoj editor na kartotéku klienta, nech sa to ukladá."
describe("výstupy editora v kartotéke", () => {
  it("porovnanie aj video sú platné druhy, ale nie fotky tela", () => {
    expect(jePohlad(POROVNANIE)).toBe(true);
    expect(jePohlad(VIDEO)).toBe(true);
    expect(jeFotkaTela({ pohlad: VIDEO })).toBe(false);
    expect(jeFotkaTela({ pohlad: POROVNANIE })).toBe(false);
    expect(jeFotkaTela({ pohlad: "bok" })).toBe(true);
  });
  it("neporovnávajú sa samy so sebou", () => {
    const fs = [
      f({ id: "p1", den: "2026-06-01", pohlad: POROVNANIE }), f({ id: "p2", den: "2026-10-01", pohlad: POROVNANIE }),
      f({ id: "v1", den: "2026-06-01", pohlad: VIDEO }), f({ id: "v2", den: "2026-10-01", pohlad: VIDEO }),
    ];
    expect(porovnania(fs)).toEqual([]);
  });
});
