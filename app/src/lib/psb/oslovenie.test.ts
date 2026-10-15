import { describe, expect, it } from "bun:test";

import { oslovenieKlienta, vokativ } from "./oslovenie";

// Jerry, 15. 10. 2026: „postav to naostro aj so skloňovaním" — stránka
// kalendára oslovovala „Michal, jedním klepnutím…".
describe("oslovenie v 5. páde", () => {
  const p = (m: string, v: string) => expect(vokativ(m)).toBe(v);

  it("mužské mená klientov", () => {
    p("Michal", "Michale"); p("Jan", "Jane"); p("Martin", "Martine"); p("Jakub", "Jakube");
    p("Josef", "Josefe"); p("Jaroslav", "Jaroslave"); p("Albert", "Alberte"); p("Radim", "Radime");
    p("Radek", "Radku"); p("Jarek", "Jarku"); p("Zdeněk", "Zdeňku"); p("Luděk", "Luďku");
    p("Patrik", "Patriku"); p("Svetopluk", "Svetopluku"); p("Oleg", "Olegu");
    p("Lukáš", "Lukáši"); p("Matěj", "Matěji"); p("Ondrej", "Ondreji"); p("Alexej", "Alexeji"); p("Max", "Maxi");
    p("Petr", "Petře"); p("Richard", "Richarde"); p("Pavel", "Pavle"); p("Daniel", "Danieli");
    p("Vojta", "Vojto");
  });
  it("ženské mená klientov", () => {
    p("Jana", "Jano"); p("Terezka", "Terezko"); p("Monika", "Moniko"); p("Naďa", "Naďo"); p("Anička", "Aničko");
    p("Lucie", "Lucie"); p("Terezie", "Terezie"); p("Nikol", "Nikol"); p("Ester", "Ester");
  });
  it("mená bez diakritiky z kalendára dostanú správny tvar", () => {
    p("Tomas", "Tomáši"); p("Tomaš", "Tomáši"); p("Lukas", "Lukáši"); p("Jiri", "Jiří"); p("Peter", "Petře"); p("Marketa", "Markéto");
  });
  it("keď si nie je istá, meno nechá", () => {
    p("Lucia", "Lucia"); p("Natália", "Natália"); p("Sofia", "Sofia");
    p("Panagiotis", "Panagiotis"); p("Luky", "Luky"); p("Maty", "Maty");
    p("Prochazkova", "Prochazkova"); p("Nováková", "Nováková");
  });
  it("je idempotentná — dve vrstvy nezmenia už oslovené", () => {
    for (const m of ["Michal", "Radek", "Jana", "Lukáš", "Petr", "Tomas", "Pavel", "Zdeněk"]) {
      expect(vokativ(vokativ(m))).toBe(vokativ(m));
    }
  });
  it("zástupné mená z dopytov sa nevyslovia", () => {
    p("Bez", ""); p("Nezname", "");
    // Slovník sa nesmie pýtať prototypu objektu („constructor" by vrátil funkciu).
    expect(typeof vokativ("constructor")).toBe("string");
  });
  it("celé meno s titulom", () => {
    expect(oslovenieKlienta("Michal Knapčok")).toBe("Michale");
    expect(oslovenieKlienta("Ing. arch. Anna Nová")).toBe("Anno");
    expect(oslovenieKlienta("")).toBe("");
  });
});
