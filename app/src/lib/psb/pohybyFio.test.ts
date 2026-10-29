import { describe, expect, it } from "bun:test";

import { filtrujPohyby, type PohybFio } from "./pohybyFio";

const p = (x: Partial<PohybFio>): PohybFio => ({
  datum: "2026-09-21", suma: 0, protistrana: "", poznamka: "", typ: "", kategoria: "", kluc: Math.random().toString(), klienti: "", nieKlient: false, ...x,
});

describe("náhľad pohybov Fio", () => {
  const xs = [
    p({ suma: 8890, protistrana: "Albert Matl", poznamka: "ProSapiens Úvodní Lekce Alber +6h Balíče", klienti: "Albert Matl" }),
    p({ suma: 1000, protistrana: "Neznámy", datum: "2026-10-02" }),
    p({ suma: -1500, protistrana: "Jerry vyplata", kategoria: "Výplata" }),
    p({ suma: 7790, typ: "hotovosť", protistrana: "Zošit", klienti: "Branislav Široký" }),
  ];
  it("hľadá meno bez diakritiky aj sumu s medzerou", () => {
    expect(filtrujPohyby(xs, "albert", "vsetko")).toHaveLength(1);
    expect(filtrujPohyby(xs, "8 890", "vsetko")).toHaveLength(1);
    expect(filtrujPohyby(xs, "uvodni lekce", "vsetko")).toHaveLength(1);
  });
  it("hotovosť zo zošita na účte nie je", () => {
    expect(filtrujPohyby(xs, "siroky", "vsetko")).toHaveLength(0);
  });
  it("druhy", () => {
    expect(filtrujPohyby(xs, "", "prijmy")).toHaveLength(2);
    expect(filtrujPohyby(xs, "", "nesparovane").map((x) => x.suma)).toEqual([1000]);
    expect(filtrujPohyby(xs, "", "vydavky").map((x) => x.suma)).toEqual([-1500]);
  });
});
