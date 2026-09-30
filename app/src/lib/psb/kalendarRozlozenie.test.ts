import { describe, expect, it } from "bun:test";

import { menoDoBloku, rozlozUdalosti } from "./kalendarRozlozenie";

const m = (x: { stlpec: number; zo: number }) => `${x.stlpec}/${x.zo}`;

describe("hodiny v rovnakom čase idú vedľa seba", () => {
  it("čo sa neprekrýva, drží celú šírku", () => {
    const r = rozlozUdalosti([{ od: 540, do: 600 }, { od: 600, do: 660 }]);
    expect(r.map(m)).toEqual(["0/1", "0/1"]);
  });

  it("dve naraz sa rozdelia na polovicu", () => {
    const r = rozlozUdalosti([{ od: 540, do: 600 }, { od: 540, do: 600 }]);
    expect(r.map(m)).toEqual(["0/2", "1/2"]);
  });

  it("reťaz A–B–C je JEDNA skupina, nie schody", () => {
    // A 9:00–10:00, B 9:30–10:30, C 10:00–11:00: A a C sa navzájom
    // neprekrývajú, ale cez B patria k sebe — inak by C skočilo do šírky
    // celého stĺpca a prekrylo B. Šírka je preto rovnaká pre všetky tri,
    // a C si sadne do stĺpca po A: tretí stĺpec by len zúžil, čo sa zúžiť
    // nemusí.
    const r = rozlozUdalosti([{ od: 540, do: 600 }, { od: 570, do: 630 }, { od: 600, do: 660 }]);
    expect(r.map((x) => x.zo)).toEqual([2, 2, 2]);
    expect(r[0].stlpec).toBe(r[2].stlpec);
    expect(r[1].stlpec).not.toBe(r[0].stlpec);
  });

  it("stĺpec sa po skončení hodiny uvoľní", () => {
    const r = rozlozUdalosti([{ od: 540, do: 660 }, { od: 540, do: 600 }, { od: 600, do: 660 }]);
    expect(r.map((x) => x.zo)).toEqual([2, 2, 2]);
    expect(r[1].stlpec).toBe(r[2].stlpec);
  });

  it("poradie na vstupe sa zachová", () => {
    const r = rozlozUdalosti([{ od: 600, do: 660 }, { od: 540, do: 600 }]);
    expect(r).toHaveLength(2);
    expect(r.map(m)).toEqual(["0/1", "0/1"]);
  });

  it("nulová dĺžka nezhltne stĺpec navždy", () => {
    const r = rozlozUdalosti([{ od: 540, do: 540 }, { od: 541, do: 600 }]);
    expect(r.map((x) => x.zo)).toEqual([1, 1]);
  });
});

describe("meno do úzkeho bloku", () => {
  it("na monitore sa neskracuje nič", () => {
    expect(menoDoBloku("Monika Čechova", false, 1)).toBe("Monika Čechova");
    expect(menoDoBloku("Monika Čechova", false, 3)).toBe("Monika Čechova");
  });

  it("na telefóne sa priezvisko skráti", () => {
    expect(menoDoBloku("Monika Čechova", true, 1)).toBe("Monika Č.");
  });

  it("pri prekryve zostanú iniciály", () => {
    expect(menoDoBloku("Monika Schonwalderová", true, 2)).toBe("MS");
  });

  it("jednoslovný názov sa nerozbije", () => {
    expect(menoDoBloku("Box", true, 1)).toBe("Box");
    expect(menoDoBloku("Guillermo", true, 2)).toBe("Gui");
  });

  it("prázdny názov nespadne", () => {
    expect(menoDoBloku("", true, 2)).toBe("");
  });
});
