import { describe, expect, it } from "bun:test";

import { dni, dopyty, klienti, platby, tvar, vydavky } from "./sklonovanie";

describe("skloňovanie podľa počtu", () => {
  it("dni", () => {
    expect([0, 1, 2, 4, 5, 11, 22].map(dni)).toEqual(["0 dní", "1 deň", "2 dni", "4 dni", "5 dní", "11 dní", "22 dní"]);
  });
  it("výdavky, dopyty, platby, klienti", () => {
    expect(vydavky(3)).toBe("3 výdavky");
    expect(vydavky(1)).toBe("1 výdavok");
    expect(vydavky(87)).toBe("87 výdavkov");
    expect(dopyty(3)).toBe("3 dopyty");
    expect(platby(5)).toBe("5 platieb");
    expect(platby(2)).toBe("2 platby");
    expect(klienti(1)).toBe("1 klient");
  });
  it("záporné číslo sa skloňuje ako kladné, desatinné ako 2. pád", () => {
    expect(tvar(-2, "a", "b", "c")).toBe("b");
    expect(tvar(1.5, "a", "b", "c")).toBe("c");
  });
});
