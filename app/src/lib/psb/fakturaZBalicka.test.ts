import { describe, expect, it } from "bun:test";

import { fakturaZBalicka } from "./fakturaZBalicka";

describe("faktúra na balíček = dlh (Lucia Podolová, 23. 10. 2026)", () => {
  const dlh = [{ klient: "Lucie Podolova", den: "2026-10-02", nazov: "ON - 6h S viazanostou", cena: 5640, doplatit: 4290, zdroj: "kokpit", id: "b1" }] as never;
  it("čiastočne zaplatený balíček: suma = doplatok", () => {
    const f = fakturaZBalicka("Lucie Podolova", { id: "b1", nazov: "ON - 6h S viazanostou", cena: 5640 }, dlh);
    expect(f).toMatchObject({ cena: 4290, popis: "6h Předplatné online — doplatek", dlh: true, balicekId: "b1" });
  });
  it("nezaplatený celý: suma = cena, bez slova doplatok", () => {
    const f = fakturaZBalicka("X", { id: "b2", nazov: "6h Balíček", cena: 7790 }, [{ klient: "X", den: "2026-10-20", nazov: "6h Balíček", cena: 7790, doplatit: 7790, zdroj: "kokpit", id: "b2" }] as never);
    expect(f).toMatchObject({ cena: 7790, popis: "6h Balíček", dlh: true });
  });
  it("zaplatený balíček: faktúra na cenu", () => {
    expect(fakturaZBalicka("X", { id: "b3", nazov: "6h Balíček", cena: 7790 }, [])).toMatchObject({ cena: 7790, dlh: false });
  });
});
