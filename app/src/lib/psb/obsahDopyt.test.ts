import { describe, expect, it } from "bun:test";

import { MALO_DAT, obsahPredDopytmi } from "./obsahDopyt";

// Pomôcka: príspevok danej kategórie v daný deň.
const p = (datum: string, kategoria: string) => ({ datum, kategoria });
const d = (date: string) => ({ date });

describe("obsahPredDopytmi", () => {
  it("kategória, ktorá vyšla tesne pred dopytom, sa započíta", () => {
    const v = obsahPredDopytmi([d("2026-01-10")], [p("2026-01-05", "Príbeh")]);
    expect(v.riadky[0]).toMatchObject({ kategoria: "Príbeh", dopytov: 1, podielDopytov: 100 });
  });

  it("príspevok v ten istý deň sa neráta — nemohol dopyt spôsobiť", () => {
    const v = obsahPredDopytmi([d("2026-01-10")], [p("2026-01-10", "Príbeh")]);
    expect(v.riadky[0].dopytov).toBe(0);
  });

  it("príspevok starší než okno vypadne", () => {
    const v = obsahPredDopytmi([d("2026-01-20")], [p("2026-01-01", "Príbeh")], 14);
    expect(v.riadky[0].dopytov).toBe(0);
  });

  it("hranica okna platí presne", () => {
    // 14 dní pred 20. 1. je 6. 1. — ten sa ešte ráta, 5. 1. už nie.
    expect(obsahPredDopytmi([d("2026-01-20")], [p("2026-01-06", "X")], 14).riadky[0].dopytov).toBe(1);
    expect(obsahPredDopytmi([d("2026-01-20")], [p("2026-01-05", "X")], 14).riadky[0].dopytov).toBe(0);
  });

  it("kategória, ktorá vychádza NEUSTÁLE, nedostane zásluhu", () => {
    // Toto je celý zmysel základu: „Edukácia" vyšla každý druhý deň, takže je
    // pred každým dopytom — aj pred každým iným dňom. Rozdiel musí byť ~0.
    const prispevky = [];
    for (let i = 1; i <= 28; i += 2) prispevky.push(p(`2026-01-${String(i).padStart(2, "0")}`, "Edukácia"));
    const v = obsahPredDopytmi([d("2026-01-20"), d("2026-01-25")], prispevky);
    const edu = v.riadky.find((r) => r.kategoria === "Edukácia")!;
    expect(edu.podielDopytov).toBe(100);
    expect(Math.abs(edu.rozdiel)).toBeLessThan(20);
  });

  it("kategória, ktorá vyšla len pred dopytmi, vyskočí nahor", () => {
    const prispevky = [
      // Edukácia stále dokola — základ vysoký.
      ...Array.from({ length: 14 }, (_, i) => p(`2026-01-${String(i * 2 + 1).padStart(2, "0")}`, "Edukácia")),
      // Príbeh raz, tesne pred oboma dopytmi.
      p("2026-01-18", "Príbeh"),
    ];
    const v = obsahPredDopytmi([d("2026-01-20"), d("2026-01-22")], prispevky);
    expect(v.riadky[0].kategoria).toBe("Príbeh");
    expect(v.riadky[0].rozdiel).toBeGreaterThan(0);
  });

  it("radí sa podľa rozdielu, nie podľa počtu dopytov", () => {
    const prispevky = [
      ...Array.from({ length: 20 }, (_, i) => p(`2026-01-${String(i + 1).padStart(2, "0")}`, "Edukácia")),
      p("2026-01-19", "Príbeh"),
    ];
    const v = obsahPredDopytmi([d("2026-01-20")], prispevky);
    // Edukácia má rovnako 1 dopyt, ale aj obrovský základ.
    expect(v.riadky[0].kategoria).toBe("Príbeh");
  });

  it("obdobie sa oreže na prienik oboch zdrojov", () => {
    // Dopyty z roku 2025, príspevky z 2026 — nemajú sa kde stretnúť.
    const v = obsahPredDopytmi([d("2025-03-01")], [p("2026-01-05", "X")]);
    expect(v.riadky).toEqual([]);
  });

  it("prázdny vstup nespadne", () => {
    expect(obsahPredDopytmi([], []).riadky).toEqual([]);
    expect(obsahPredDopytmi([d("2026-01-01")], []).riadky).toEqual([]);
    expect(obsahPredDopytmi([], [p("2026-01-01", "X")]).riadky).toEqual([]);
  });

  it("príspevky bez kategórie sa ignorujú, nie zaradia pod prázdny reťazec", () => {
    const v = obsahPredDopytmi([d("2026-01-10")], [p("2026-01-05", ""), p("2026-01-05", "X")]);
    expect(v.riadky.map((r) => r.kategoria)).toEqual(["X"]);
  });

  it("malá vzorka je označená", () => {
    const v = obsahPredDopytmi([d("2026-01-10")], [p("2026-01-05", "X")]);
    expect(MALO_DAT(v.riadky[0])).toBe(true);
  });
});
