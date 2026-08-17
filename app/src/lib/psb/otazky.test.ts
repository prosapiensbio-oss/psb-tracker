import { describe, expect, it } from "bun:test";

import { pocetOtazok } from "./otazky";

describe("pocetOtazok", () => {
  it("pozná dve otázky v jednej správe", () => {
    // Presne táto správa dostala 17. 8. 2026 odpoveď len na druhú polovicu.
    expect(pocetOtazok("Kde v appke vidím dopyty? A čo presne píše naša stránka o Lateral Line?")).toBe(2);
    expect(pocetOtazok("Aký mám dlh? A čo Terezka?")).toBe(2);
  });

  it("jedna otázka zostáva jedna", () => {
    expect(pocetOtazok("Koľko máme aktívnych klientov?")).toBe(1);
    expect(pocetOtazok("Koľko máme klientov")).toBe(0);
  });

  it("tri otázky sú tri", () => {
    expect(pocetOtazok("Koľko? Prečo? A čo s tým?")).toBe(3);
  });

  it("prázdna správa nie je otázka", () => {
    expect(pocetOtazok("")).toBe(0);
    expect(pocetOtazok("   ")).toBe(0);
  });
});
