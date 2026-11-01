import { describe, expect, it } from "bun:test";

import { fmtCZK, jeMesiac, kedyStrucne, mesiacCely } from "./format";

describe("peniaze a mesiac pre človeka", () => {
  it("koruny sú Kč s medzerou v tisícoch", () => {
    expect(fmtCZK(7790)).toBe("7\u00a0790 Kč");
    expect(fmtCZK(null)).toBe("—");
  });
  it("celý mesiac namiesto ISO tvaru", () => {
    expect(mesiacCely("2026-10")).toBe("október 2026");
    expect(mesiacCely("nezmysel")).toBe("nezmysel");
  });
});

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
    // 23. 8. 22:00 UTC je v Prahe už 24. 8. o polnoci — teda dnes (5. 10. 2026:
    // dni podľa Prahy, nie UTC).
    expect(kedyStrucne("2026-08-23T22:00:00Z", dnes)).toBe("dnes");
    expect(kedyStrucne("2026-08-23T21:00:00Z", dnes)).toBe("včera");
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
