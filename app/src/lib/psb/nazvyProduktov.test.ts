import { describe, expect, it } from "bun:test";

import { jePredplatne, nazovProduktu, skupinaProduktu } from "./nazvyProduktov";

describe("nazovProduktu", () => {
  it("viazanosť sa mení na Předplatné, jej absencia na Balíček", () => {
    expect(nazovProduktu("OFF - 6h S viazanostou")).toBe("Předplatné 6 h");
    expect(nazovProduktu("OFF - 6h BEZ viazanosti")).toBe("Balíček 6 h");
  });

  it("balíček bez slova o viazanosti je Balíček", () => {
    expect(nazovProduktu("OFF - 8 hodín offline")).toBe("Balíček 8 h");
    expect(nazovProduktu("OFF - 18 hodín offline")).toBe("Balíček 18 h");
    expect(nazovProduktu("OFF - 1 hodina offline")).toBe("Balíček 1 h");
  });

  it("online a TrueCoach si kanál nesú v názve", () => {
    expect(nazovProduktu("ON - 6h BEZ viazanosti")).toBe("Balíček 6 h online");
    expect(nazovProduktu("ON - 6h S viazanostou")).toBe("Předplatné 6 h online");
    expect(nazovProduktu("TC - 4 hodiny")).toBe("Balíček 4 h TrueCoach");
  });

  it("nový názov prejde nezmenený — preklad sa naň nenalepí druhýkrát", () => {
    expect(nazovProduktu("Balíček 6 h")).toBe("Balíček 6 h");
    expect(nazovProduktu("Předplatné 6 h")).toBe("Předplatné 6 h");
  });

  it("staré stupne a doplnenie zostávajú, ako boli", () => {
    // Z roku 2025, už sa nepredávajú — prekladať ich by bolo prepisovanie
    // histórie na niečo, čo si klient nikdy nekúpil.
    for (const s of ["SILVER členství", "ČLENSTVÍ ONE", "ONE YEAR", "Doplnenie členstva", "DYNAMIKA"]) {
      expect(nazovProduktu(s)).toBe(s);
    }
  });

  it("prázdny názov nespadne", () => {
    expect(nazovProduktu("")).toBe("");
  });
});

describe("jePredplatne", () => {
  it("pozná starú aj novú podobu", () => {
    expect(jePredplatne("OFF - 6h S viazanostou")).toBe(true);
    expect(jePredplatne("Předplatné 6 h")).toBe(true);
    expect(jePredplatne("Predplatne 6 h")).toBe(true);
    expect(jePredplatne("OFF - 6h BEZ viazanosti")).toBe(false);
    expect(jePredplatne("Balíček 6 h")).toBe(false);
  });
});

describe("skupinaProduktu", () => {
  it("hrubšie delenie pre grafy", () => {
    expect(skupinaProduktu("OFF - 6h S viazanostou")).toBe("Předplatné 6 h");
    expect(skupinaProduktu("Doplnenie členstva")).toBe("Doplnenie");
    expect(skupinaProduktu("SILVER členství")).toBe("Staršie členstvo");
    expect(skupinaProduktu("")).toBe("Bez balíčka");
  });
});
