import { describe, expect, it } from "bun:test";

import { NARADIE, rychleVolby } from "./kategorieRychle";
import { VYPLATY_JERRY, VYPLATY_TEREZKA } from "./fio";

describe("rychleVolby", () => {
  it("výplata sú dve tlačidlá s menami, nie prepínač", () => {
    const v = rychleVolby();
    expect(v[0]).toEqual({ kat: VYPLATY_JERRY, text: "Jerry" });
    expect(v[1]).toEqual({ kat: VYPLATY_TEREZKA, text: "Terezka" });
    // Žiadne tlačidlo nesmie znamenať raz jedno a raz druhé.
    expect(v.map((x) => x.text)).not.toContain("výplata");
  });

  it("dáva päť skratiek", () => {
    expect(rychleVolby()).toHaveLength(5);
    expect(rychleVolby().map((x) => x.kat)).toContain(NARADIE);
  });

  it("náradie je náklad PSB, nie peniaze trénera", () => {
    expect(NARADIE).toBe("variabilne.prevadzka2.pomocky");
    expect(NARADIE.startsWith("spolocne.")).toBe(false);
    expect(NARADIE.startsWith("vyplaty")).toBe(false);
  });

  it("žiadne dve skratky nevedú do tej istej kategórie", () => {
    const katy = rychleVolby().map((x) => x.kat);
    expect(new Set(katy).size).toBe(katy.length);
  });
});
