import { describe, expect, it } from "bun:test";

import { treningyDoplneni } from "./doplnenieTreningy";

// Daniela Šašinková z exportu PTmindera (8. 11. 2026).
const s = (den: string, cena: number, uvodny?: boolean) => ({ den, cena, uvodny });
const sedenia = [
  s("2026-03-15", 0), s("2026-03-17", 0), s("2026-03-24", 0), s("2026-03-26", 0), s("2026-03-31", 1175),
  s("2026-07-03", 0), s("2026-07-09", 0), s("2026-07-16", 1175),
  s("2026-09-03", 1175), s("2026-09-07", 0), s("2026-09-09", 1175), s("2026-10-01", 1175),
];

describe("tréningy z doplnenia", () => {
  it("Šašinková: každé doplnenie dostane svoje tréningy za 0 Kč", () => {
    const m = treningyDoplneni([{ den: "2026-02-21", hodin: 6 }, { den: "2026-07-04", hodin: 2 }, { den: "2026-09-12", hodin: 1 }], sedenia);
    expect(m.get("2026-09-12")?.map((x) => x.den)).toEqual(["2026-09-07"]);
    expect(m.get("2026-07-04")?.map((x) => x.den)).toEqual(["2026-07-09", "2026-07-03"]);
    expect(m.get("2026-02-21")?.map((x) => x.den)).toEqual(["2026-03-26", "2026-03-24", "2026-03-17", "2026-03-15"]);
  });
  it("známy počet hodín je strop — berú sa najbližšie", () => {
    const m = treningyDoplneni([{ den: "2026-07-04", hodin: 1 }], sedenia);
    expect(m.get("2026-07-04")?.map((x) => x.den)).toEqual(["2026-07-03"]);
  });
  it("platený tréning, úvodný a tréning ďaleko od doplnenia sa nepriradia", () => {
    const m = treningyDoplneni([{ den: "2026-09-12" }], [s("2026-09-10", 1175), s("2026-09-11", 0, true), s("2026-12-20", 0)]);
    expect(m.size).toBe(0);
  });
  it("od 1. 10. 2026 nič — vtedy má doplnenie hodiny a tréningy mu dáva os", () => {
    expect(treningyDoplneni([{ den: "2026-10-05" }], [s("2026-10-06", 0)]).size).toBe(0);
  });
});
