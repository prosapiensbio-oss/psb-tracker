import { describe, expect, it } from "bun:test";

import type { Udalost } from "./klientOsCasu";
import { historiaBalickov, historiaPlatieb } from "./profilHistoria";

describe("profil: história bez toho, čo je v evidencii (28. 10. 2026)", () => {
  const os: Udalost[] = [
    { druh: "balicekOd", den: "2026-10-05", nazov: "Balíček 6 h", hodin: 6, zKokpitu: true },
    { druh: "balicekOd", den: "2026-09-15", nazov: "OFF - 18 hodín offline", hodin: 18, doDna: "2027-03-14" },
    { druh: "balicekOd", den: "2026-05-02", nazov: "OFF - 6h S viazanostou", hodin: 6, doDna: "2026-06-01" },
    { druh: "balicekDo", den: "2026-06-01", nazov: "OFF - 6h S viazanostou", hodin: 6 },
    { druh: "balicekDo", den: "2026-07-01", nazov: "prepadnuté hodiny", hodin: 2, prepadlo: 2 },
  ] as Udalost[];
  const evidencia = [
    { platnost_od: "2026-10-05", nazov: "Balíček 6 h", hodiny: 6 },
    { platnost_od: "2026-09-16", nazov: "OFF - 18 hodín offline", hodiny: 15 },
  ];
  it("balíček z Kokpitu ani naliaty z PTmindera sa druhýkrát nekreslí, starý áno", () => {
    const h = historiaBalickov(os, evidencia);
    expect(h.map((x) => `${x.druh}|${x.den}`)).toEqual([
      "balicekOd|2026-05-02", "balicekDo|2026-06-01", "balicekDo|2026-07-01",
    ]);
  });
  it("platby: v knihe Kokpitu raz, staré mimo knihy ostanú", () => {
    const p: Udalost[] = [
      { druh: "platba", den: "2026-10-09", suma: 7790, metoda: "bank", zKokpitu: true },
      { druh: "platba", den: "2026-08-23", suma: 6990, metoda: "bank" },
      { druh: "platba", den: "2026-03-01", suma: 1100, metoda: "cash" },
    ] as Udalost[];
    const h = historiaPlatieb(p, [{ datum: "2026-10-09", suma_czk: 7790 }, { datum: "2026-08-23", suma_czk: 6990 }]);
    expect(h.map((x) => x.den)).toEqual(["2026-03-01"]);
  });
});
