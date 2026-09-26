import { describe, expect, it } from "bun:test";

import { dlhKlienta } from "./dlhKlienta";

const b = (cena: number | null, platnostOd: string, zdroj = "rucne", zruseneAt: string | null = null) =>
  ({ cena, platnostOd, zdroj, zruseneAt });
const p = (suma: number, datum: string, zruseneAt: string | null = null) => ({ suma, datum, zruseneAt });

describe("dlh z balíčkov", () => {
  it("nový balíček bez platby je dlh", () => {
    // Presne Jerryho prípad z 26. 9. 2026: založil balíček za 9 400 a nikde
    // nebolo vidieť, že klient ešte nezaplatil.
    const d = dlhKlienta([b(9400, "2026-09-26")], []);
    expect(d.dlzi).toBe(9400);
    expect(d.pocet).toBe(1);
  });

  it("platba dlh umaže", () => {
    expect(dlhKlienta([b(9400, "2026-09-26")], [p(9400, "2026-09-27")]).dlzi).toBe(0);
  });

  it("čiastočná platba nechá zvyšok", () => {
    expect(dlhKlienta([b(9400, "2026-09-01")], [p(5000, "2026-09-05")]).dlzi).toBe(4400);
  });

  it("preplatok nerobí záporný dlh", () => {
    expect(dlhKlienta([b(6990, "2026-09-01")], [p(20000, "2026-09-02")]).dlzi).toBe(0);
  });

  it("balíčky z PTmindera sa nepočítajú", () => {
    // Inak by každý dlhoročný klient dlžil desiatky tisíc, ktoré zaplatil
    // ešte v starom svete.
    expect(dlhKlienta([b(21300, "2024-01-10", "ptminder")], []).dlzi).toBe(0);
  });

  it("zrušený balíček ani zrušená platba sa nerátajú", () => {
    expect(dlhKlienta([b(9400, "2026-09-01"), b(7790, "2026-09-02", "rucne", "2026-09-03")], []).dlzi).toBe(9400);
    expect(dlhKlienta([b(9400, "2026-09-01")], [p(9400, "2026-09-02", "2026-09-03")]).dlzi).toBe(9400);
  });

  it("platba spred prvého balíčka sa nepočíta", () => {
    // Bankové platby sú v appke od januára, balíčky od 22. 9. Staršia platba
    // patrí k niečomu, čo v zozname nie je.
    const d = dlhKlienta([b(9400, "2026-09-26")], [p(9400, "2026-03-01")]);
    expect(d.dlzi).toBe(9400);
    expect(d.od).toBe("2026-09-26");
  });

  it("paušál bez ceny dlh nevyrobí", () => {
    expect(dlhKlienta([b(null, "2026-09-26")], []).dlzi).toBe(0);
  });

  it("bez vlastných balíčkov mlčí", () => {
    const d = dlhKlienta([], [p(5000, "2026-09-01")]);
    expect(d).toEqual({ dlzi: 0, zaBalicky: 0, zaplatene: 0, od: "", pocet: 0 });
  });
});
