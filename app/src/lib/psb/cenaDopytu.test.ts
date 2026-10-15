import { describe, expect, it } from "bun:test";

import { cenaDopytuZReklamy } from "./cenaDopytu";

// Jerry, 15. 10. 2026: dlaždica ukazovala 9 072 Kč, lebo delila výdavok
// za 12 mesiacov (aj staré boosty) tromi septembrovými dopytmi.
describe("cena za dopyt z reklamy", () => {
  const kampane = [
    { mesiac: "2026-07", spend: 4796 }, // boosty pred meraním — do ceny nepatria
    { mesiac: "2026-09", spend: 6540 },
    { mesiac: "2026-10", spend: 4260 },
  ];
  const leads = [
    { date: "2026-09-20", name: "Hana Marko", source: "reklama", kampan: "", druh: "dopyt" },
    { date: "2026-09-20", name: "Petr Baťa", source: "reklama", kampan: "uvodni-trenink-brno-2026-09", druh: "dopyt" },
    { date: "2026-09-22", name: "Ĺudmila J.", source: "reklama", kampan: "uvodni-trenink-brno-2026-09", druh: "magnet" },
    { date: "2026-10-12", name: "Prochazkova", source: "reklama", kampan: "uvodni-trenink-brno-2026-09", druh: "dopyt" },
    { date: "2026-10-13", name: "Prochazkova", source: "web", kampan: "uvodni-trenink-brno-2026-09", druh: "dopyt" },
    { date: "2026-08-10", name: "Starý", source: "reklama", kampan: "", druh: "dopyt" },
    { date: "2026-09-25", name: "Odporúčanie", source: "doporuceni", kampan: "", druh: "dopyt" },
  ];

  it("počíta od septembra 2026 — výdavok aj dopyty z toho istého okna", () => {
    const c = cenaDopytuZReklamy(kampane, leads);
    expect(c.spend).toBe(10800);
    expect(c.dopyty.map((l) => l.name)).toEqual(["Hana Marko", "Petr Baťa", "Prochazkova"]);
    expect(c.cena).toBe(3600);
    expect(c.bezUtm).toBe(1);
  });
  it("stiahnutie materiálu nie je dopyt a ten istý človek sa ráta raz", () => {
    const c = cenaDopytuZReklamy(kampane, leads);
    expect(c.dopyty.some((l) => l.druh === "magnet")).toBe(false);
    expect(c.dopyty.filter((l) => l.name === "Prochazkova").length).toBe(1);
  });
  it("bez dopytu je pomlčka, nie nula", () => {
    expect(cenaDopytuZReklamy(kampane, []).cena).toBe(null);
  });
});
