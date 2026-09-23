import { describe, expect, it } from "bun:test";

import { CENNIK, platnostDo } from "./cennik";

describe("cenník", () => {
  it("názvy sú presne tie, čo stoja v exporte PTmindera", () => {
    // Keby sa líšili, vznikol by pri nahodení druhý „typ" balíčka a
    // porovnanie s PTminderom by ho hlásilo ako rozdiel navždy.
    const vExporte = ["OFF - 6h BEZ viazanosti", "OFF - 6h S viazanostou", "OFF - 18 hodín offline", "OFF - 8 hodín offline", "Doplnenie členstva", "SPECIAL 3", "ONE YEAR"];
    for (const n of vExporte) expect(CENNIK.some((s) => s.nazov === n)).toBe(true);
  });

  it("doplnenie členstva nemá pevný počet hodín ani platnosť", () => {
    const d = CENNIK.find((s) => s.nazov === "Doplnenie členstva")!;
    expect(d.hodiny).toBeNull();
    expect(d.tyzdnov).toBeNull();
  });

  it("vyradené produkty v ponuke nie sú", () => {
    // Jerry, 23. 9. 2026: TC, ČLENSTVÍ ONE/SILVER, DYNAMIKA a MFR sa už
    // nepredávajú a v roletke len predlžujú zoznam.
    for (const n of ["TC - 1 hodina", "TC - 4 hodiny", "TC - 4 hodiny + call", "ČLENSTVÍ ONE", "ČLENSTVÍ SILVER", "DYNAMIKA", "MFR/KOREKCIA"]) {
      expect(CENNIK.some((s) => s.nazov === n)).toBe(false);
    }
  });

  it("žiadne dva rovnaké názvy", () => {
    expect(new Set(CENNIK.map((s) => s.nazov)).size).toBe(CENNIK.length);
  });
});

describe("platnostDo", () => {
  it("osem týždňov od 1. 9.", () => {
    expect(platnostDo("2026-09-01", 8)).toBe("2026-10-27");
  });
  it("bez týždňov nepredvypĺňa nič — doplnenie členstva platnosť nemá", () => {
    expect(platnostDo("2026-09-01", null)).toBe("");
  });
  it("nezmyselný dátum nevyrobí nezmyselný koniec", () => {
    expect(platnostDo("", 8)).toBe("");
  });
});
