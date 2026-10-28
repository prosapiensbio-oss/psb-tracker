import { describe, expect, it } from "bun:test";

import { denZKluca, polovice, PLATNO, vyrezCover } from "./porovnaniePredPo";

describe("porovnanie před a po (28. 10. 2026)", () => {
  it("fotka na výšku 3:4 sa do polovice zmestí celá", () => {
    const p = polovice()[0];
    const v = vyrezCover(3000, 4000, p.s, p.v);
    // Polovica má 996 × 1333 (medzera 8 px) — zo strán ubudne pár pixelov, nie viac.
    expect(v.sx).toBeLessThan(10);
    expect(v.sh).toBe(4000);
  });
  it("fotka na šírku sa oreže zo strán, nie zhora", () => {
    const p = polovice()[0];
    const v = vyrezCover(4000, 3000, p.s, p.v);
    expect(v.sy).toBe(0);
    expect(v.sx).toBeGreaterThan(0);
    expect(v.sx * 2 + v.sw).toBeCloseTo(4000);
  });
  it("dve polovice s medzerou vyplnia celé plátno", () => {
    const [a, b] = polovice();
    expect(a.x).toBe(0);
    expect(b.x + b.s).toBeCloseTo(PLATNO.sirka);
    expect(b.x - (a.x + a.s)).toBe(PLATNO.medzera);
  });
  it("deň úvodného z kľúča notifikácie", () => {
    expect(denZKluca("sms|2026-10-27|Linda Muth")).toBe("2026-10-27");
    expect(denZKluca(undefined)).toBeNull();
  });
});
