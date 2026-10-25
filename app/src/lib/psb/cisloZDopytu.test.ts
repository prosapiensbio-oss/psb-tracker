import { describe, expect, it } from "bun:test";

import { navrhyCislaZDopytu } from "./cisloZDopytu";

const dopyty = [
  { meno: "Matěj Procházka", telefon: "", datum: "2026-05-24" },
  { meno: "Prochazkova", telefon: "602325108", datum: "2026-10-12" },
  { meno: "Jolana Hořovská", telefon: "604109678", datum: "2026-10-12" },
  { meno: "Jana Nováková", telefon: "777000111", datum: "2026-10-01" },
  { meno: "Tomáš Novák", telefon: "777000222", datum: "2026-10-01" },
];

describe("číslo z dopytu pri inom tvare mena (25. 10. 2026)", () => {
  it("preklep v krstnom mene", () => {
    expect(navrhyCislaZDopytu("Jolona Hořovská", dopyty).map((d) => d.telefon)).toEqual(["604109678"]);
  });
  it("dopyt len s priezviskom, v kalendári prípona za pomlčkou", () => {
    expect(navrhyCislaZDopytu("Romana Prochádzková- diagnostika", dopyty).map((d) => d.telefon)).toEqual(["602325108"]);
  });
  it("iné krstné meno sa neponúkne", () => {
    expect(navrhyCislaZDopytu("Petra Hořovská", dopyty)).toEqual([]);
  });
  it("Novák a Nováková sa nezlejú bez krstného", () => {
    expect(navrhyCislaZDopytu("Jan Novák", dopyty)).toEqual([]);
    expect(navrhyCislaZDopytu("Jana Nováková", dopyty).map((d) => d.telefon)).toEqual(["777000111"]);
  });
  it("dopyt bez telefónu nie je návrh", () => {
    expect(navrhyCislaZDopytu("Matěj Procházka", dopyty)).toEqual([]);
  });
});
