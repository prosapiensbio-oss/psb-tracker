import { describe, expect, it } from "bun:test";

import { NARADIE, RYCHLE, rychleVolby } from "./kategorieRychle";
import { VYPLATY_JERRY, VYPLATY_TEREZKA } from "./fio";

describe("rychleVolby", () => {
  it("dáva štyri skratky a výplata je prvá", () => {
    const v = rychleVolby();
    expect(v).toHaveLength(4);
    expect(v[0].kat).toBe(VYPLATY_JERRY);
    expect(v.map((x) => x.kat)).toContain(NARADIE);
  });

  it("prepínač mení iba výplatu, zvyšok zostáva", () => {
    const j = rychleVolby("jerry");
    const t = rychleVolby("terezka");
    expect(t[0].kat).toBe(VYPLATY_TEREZKA);
    expect(t[0].text).toBe("výplata Terezka");
    // Ahsoka, domácnosť a náradie sa prepnutím nesmú pohnúť.
    expect(t.slice(1)).toEqual(j.slice(1));
  });

  it("náradie je náklad PSB, nie Jerryho peniaze", () => {
    expect(NARADIE).toBe("variabilne.prevadzka2.pomocky");
    expect(NARADIE.startsWith("spolocne.")).toBe(false);
    expect(NARADIE.startsWith("vyplaty")).toBe(false);
  });

  it("naostro zostáva pôvodná trojica bez náradia", () => {
    expect(RYCHLE).toHaveLength(3);
    expect(RYCHLE.map((x) => x.kat)).not.toContain(NARADIE);
    expect(RYCHLE[0].kat).toBe(VYPLATY_JERRY);
  });

  it("žiadne dve skratky nevedú do tej istej kategórie", () => {
    for (const komu of ["jerry", "terezka"] as const) {
      const katy = rychleVolby(komu).map((x) => x.kat);
      expect(new Set(katy).size).toBe(katy.length);
    }
  });
});
