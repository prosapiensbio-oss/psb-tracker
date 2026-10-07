import { describe, expect, it } from "bun:test";

import { jePlatenyBalicek, podobnyBalicek } from "./duplicitaBalicka";

describe("druhý balíček k tomu istému", () => {
  const papiez = [
    { nazov: "OFF - 6h S viazanostou", platnost_od: "2026-08-27", cena_czk: 6990, zrusene_at: null },
    { nazov: "Předplatné 6 h", platnost_od: "2026-09-29", cena_czk: 6990, zrusene_at: null },
  ];

  it("Papiež: ďalší balíček s tým istým dňom sa chytí", () => {
    expect(podobnyBalicek(papiez, "2026-09-29")?.nazov).toBe("Předplatné 6 h");
    expect(podobnyBalicek(papiez, "2026-10-06")?.nazov).toBe("Předplatné 6 h");
  });

  it("riadny ďalší balíček o mesiac neskôr prejde", () => {
    expect(podobnyBalicek(papiez, "2026-10-27")).toBeNull();
  });

  it("zrušený, doplnenie a hodiny za nulu sa nerátajú", () => {
    expect(podobnyBalicek([{ ...papiez[1], zrusene_at: "2026-10-01" }], "2026-09-29")).toBeNull();
    expect(podobnyBalicek([{ nazov: "Doplnenie členstva", platnost_od: "2026-09-29", cena_czk: 0 }], "2026-09-30")).toBeNull();
    expect(jePlatenyBalicek("Doplnenie členstva", 6990)).toBe(false);
    expect(jePlatenyBalicek("6h Předplatné", 0)).toBe(false);
    expect(jePlatenyBalicek("6h Předplatné", 6990)).toBe(true);
  });
});
