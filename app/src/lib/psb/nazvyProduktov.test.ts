import { describe, expect, it } from "bun:test";

import { membershipBucket } from "./compute";
import { jePredplatne, nazovProduktu, skupinaProduktu, moznostiProduktov, nazovVoFiltri } from "./nazvyProduktov";

describe("nazovProduktu", () => {
  it("viazanosť sa mení na Předplatné, jej absencia na Balíček", () => {
    expect(nazovProduktu("OFF - 6h S viazanostou")).toBe("6h Předplatné");
    expect(nazovProduktu("OFF - 6h BEZ viazanosti")).toBe("6h Balíček");
  });

  it("balíček bez slova o viazanosti je Balíček", () => {
    expect(nazovProduktu("OFF - 8 hodín offline")).toBe("8h Balíček");
    expect(nazovProduktu("OFF - 18 hodín offline")).toBe("18h Balíček");
    expect(nazovProduktu("OFF - 1 hodina offline")).toBe("1h Balíček");
  });

  it("online a TrueCoach si kanál nesú v názve", () => {
    expect(nazovProduktu("ON - 6h BEZ viazanosti")).toBe("6h Balíček online");
    expect(nazovProduktu("ON - 6h S viazanostou")).toBe("6h Předplatné online");
    expect(nazovProduktu("TC - 4 hodiny")).toBe("4h Balíček TrueCoach");
  });

  it("nový názov prejde nezmenený — preklad sa naň nenalepí druhýkrát", () => {
    expect(nazovProduktu("6h Balíček")).toBe("6h Balíček");
    expect(nazovProduktu("6h Předplatné")).toBe("6h Předplatné");
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
    expect(jePredplatne("6h Předplatné")).toBe(true);
    expect(jePredplatne("Predplatne 6 h")).toBe(true);
    expect(jePredplatne("OFF - 6h BEZ viazanosti")).toBe(false);
    expect(jePredplatne("6h Balíček")).toBe(false);
  });
});

describe("skupinaProduktu", () => {
  it("hrubšie delenie pre grafy", () => {
    expect(skupinaProduktu("OFF - 6h S viazanostou")).toBe("6h Předplatné");
    expect(skupinaProduktu("Doplnenie členstva")).toBe("Doplnenie");
    expect(skupinaProduktu("SILVER členství")).toBe("Staršie členstvo");
    expect(skupinaProduktu("")).toBe("Bez balíčka");
  });
});

describe("filter pod grafom balíčkov", () => {
  it("hovorí tými istými názvami ako graf, hodnota ostáva pôvodná", () => {
    const m = moznostiProduktov(["OFF - 6h S viazanostou", "ONE YEAR", "OFF - 8 hodín offline", "", "OFF - 6h S viazanostou"]);
    expect(m.map((x) => x.label)).toEqual(["6h Předplatné", "8h Balíček", "Ročné"]);
    expect(m.find((x) => x.label === "Ročné")?.value).toBe("m:ONE YEAR");
  });
  it("dva tvary toho istého názvu sú jedna možnosť a filter nájde oba", () => {
    const m = moznostiProduktov(["OFF - 6h S viazanostou", "6h Předplatné"]);
    expect(m).toHaveLength(1);
    expect(nazovVoFiltri("OFF - 6h S viazanostou")).toBe(nazovVoFiltri("6h Předplatné"));
  });
});

describe("filter balíčkov hovorí slovami grafu", () => {
  it("SPECIAL 3 a DYNAMIKA majú názov skupiny z membershipBucket", () => {
    for (const n of ["SPECIAL 3", "DYNAMIKA", "ONE YEAR"]) expect(nazovVoFiltri(n)).toBe(membershipBucket(n));
    expect(nazovVoFiltri("SPECIAL 3")).toBe("Špeciál");
    expect(nazovVoFiltri("DYNAMIKA")).toBe("Iné");
  });
});
