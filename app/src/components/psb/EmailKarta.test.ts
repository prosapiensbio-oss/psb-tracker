import { describe, expect, it } from "bun:test";

import { pocetNovychEmailov } from "./EmailKarta";

describe("číslo pri nápise Email", () => {
  it("počíta len nové mimo koša Ostatní; nenačítané je null", () => {
    expect(pocetNovychEmailov(null)).toBeNull();
    expect(pocetNovychEmailov([
      { stav: "nove", kategoria: "novy" },
      { stav: "nove", kategoria: "klient" },
      { stav: "nove", kategoria: "ostatne" },
      { stav: "precitane", kategoria: "novy" },
      { stav: "vybavene", kategoria: "klient" },
    ])).toBe(2);
  });
});
