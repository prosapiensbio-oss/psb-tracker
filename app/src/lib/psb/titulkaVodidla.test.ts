import { describe, expect, it } from "bun:test";

import { BEZPECNE_DNO, mimoZony, PLATNO_H, PLATNO_W, VODIDLA, vodidlaDoSvg } from "./titulkaVodidla";

describe("vodiace čiary", () => {
  it("každé vodidlo drží vnútri plátna", () => {
    for (const v of VODIDLA) {
      expect(v.ram.x).toBeGreaterThanOrEqual(0);
      expect(v.ram.y).toBeGreaterThanOrEqual(0);
      expect(v.ram.x + v.ram.w).toBeLessThanOrEqual(PLATNO_W);
      expect(v.ram.y + v.ram.h).toBeLessThanOrEqual(PLATNO_H);
    }
  });

  it("profilová mriežka je 4 : 5 a je vycentrovaná", () => {
    const m = VODIDLA.find((v) => v.id === "mriezka")!;
    expect(m.ram.w / m.ram.h).toBeCloseTo(4 / 5, 3);
    expect(m.ram.y).toBe((PLATNO_H - m.ram.h) / 2);
  });

  it("odhad je čiarkovaný, istota plná", () => {
    // Spodný pás sa medzi zdrojmi rozchádza (320 až 430 px), takže sa nesmie
    // tváriť ako zaručený rozmer.
    expect(VODIDLA.find((v) => v.id === "ovladanie")!.isty).toBe(false);
    expect(vodidlaDoSvg(["ovladanie"])).toContain("stroke-dasharray");
    expect(vodidlaDoSvg(["mriezka"])).not.toContain("stroke-dasharray");
  });

  it("nekreslí výplň — nesmie meniť farby pod sebou", () => {
    expect(vodidlaDoSvg(VODIDLA.map((v) => v.id))).not.toMatch(/<rect[^>]*fill="(?!none)/);
  });

  it("kreslí len to, čo je zapnuté", () => {
    expect(vodidlaDoSvg([])).toBe("");
    expect([...vodidlaDoSvg(["mriezka", "bezpecna"]).matchAll(/<rect/g)].length).toBe(2);
  });
});

describe("čo vypadne z bezpečnej zóny", () => {
  it("ohlási podnadpis, ktorý spadol pod hranu", () => {
    const p = [{ rola: "podnadpis", druh: "text", y: BEZPECNE_DNO + 10, rez: { prokladanie: 54 } }];
    expect(mimoZony(p)).toEqual(["podnadpis"]);
  });

  it("mlčí, keď je všetko vnútri", () => {
    const p = [{ rola: "podnadpis", druh: "text", y: 900, rez: { prokladanie: 54 } }];
    expect(mimoZony(p)).toEqual([]);
  });

  it("značku a fotku nepočíta", () => {
    // Podpis je pod hranou zámerne až od chvíle, keď tam nie je; fotka je
    // obraz, ktorý smie ísť kamkoľvek.
    const p = [
      { rola: "znacka", druh: "znacka", y: 1900, rez: { prokladanie: 40 } },
      { rola: "fotka", druh: "fotka", y: 1900, h: 100 },
    ];
    expect(mimoZony(p)).toEqual([]);
  });

  it("každú rolu ohlási raz, aj keď má viac riadkov", () => {
    const p = [
      { rola: "podnadpis", druh: "text", y: BEZPECNE_DNO + 10, rez: { prokladanie: 54 } },
      { rola: "podnadpis", druh: "text", y: BEZPECNE_DNO + 64, rez: { prokladanie: 54 } },
    ];
    expect(mimoZony(p)).toEqual(["podnadpis"]);
  });
});
