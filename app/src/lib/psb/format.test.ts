import { describe, expect, it } from "bun:test";

import { jeMesiac, kedyStrucne } from "./format";

describe("platný mesiac", () => {
  it("pustí len 01 až 12", () => {
    expect(jeMesiac("2026-01")).toBe(true);
    expect(jeMesiac("2026-12")).toBe(true);
    expect(jeMesiac("2026-13")).toBe(false);
    expect(jeMesiac("2026-00")).toBe(false);
  });

  it("odmietne nesprávny tvar", () => {
    for (const x of ["2026-1", "26-01", "2026", "", null, undefined, "2026-1a"]) {
      expect(jeMesiac(x)).toBe(false);
    }
  });
});

describe("kedy stručne", () => {
  const dnes = new Date("2026-08-24T12:00:00Z");
  it("rozlíši dnes, včera a predvčerom", () => {
    expect(kedyStrucne("2026-08-24T08:00:00Z", dnes)).toBe("dnes");
    expect(kedyStrucne("2026-08-23T22:00:00Z", dnes)).toBe("včera");
    expect(kedyStrucne("2026-08-22T01:00:00Z", dnes)).toBe("predvčerom");
  });

  it("staršie ukáže dátumom", () => {
    expect(kedyStrucne("2026-08-17T10:00:00Z", dnes)).toBe("17. 8.");
  });

  it("nečitateľný vstup nezhodí obrazovku", () => {
    expect(kedyStrucne("", dnes)).toBe("naposledy");
    expect(kedyStrucne("nezmysel", dnes)).toBe("naposledy");
  });
});
