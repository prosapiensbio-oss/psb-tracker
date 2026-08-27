import { describe, expect, it } from "bun:test";

import { CIEL, jeObrazok } from "./titulkaFoto";

const subor = (typ: string) => ({ type: typ, name: "x", size: 1 }) as File;

describe("fotka do titulky", () => {
  it("prijme, čo prehliadač naozaj vykreslí", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/avif"]) {
      expect(jeObrazok(subor(t))).toBe(true);
    }
  });

  it("odmietne, čo obrázok nie je", () => {
    // Bez toho by sa pretiahnutý PDF ticho zmenil na prázdnu fotku.
    for (const t of ["application/pdf", "video/mp4", "text/plain", ""]) {
      expect(jeObrazok(subor(t))).toBe(false);
    }
  });

  it("cieľ je plátno titulky, nie viac", () => {
    // Fotka z telefónu má 12 Mpx; vnútri SVG sa nesie ako data: URI, takže
    // väčší obrázok by z exportu spravil megabajty bez toho, aby bol vidieť.
    expect(CIEL.sirka).toBe(1080);
    expect(CIEL.vyska).toBe(1920);
    expect(CIEL.kvalita).toBeLessThan(1);
    expect(CIEL.kvalita).toBeGreaterThan(0.7);
  });
});
