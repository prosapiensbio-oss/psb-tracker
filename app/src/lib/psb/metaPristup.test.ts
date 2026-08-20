import { describe, expect, it } from "bun:test";

import { MAX_CHYBOVOST, VOLANI_NA_FULL, stavPristupu } from "./metaPristup";

describe("stavPristupu", () => {
  it("500 volaní a čistá chybovosť = splnené", () => {
    const s = stavPristupu(VOLANI_NA_FULL, 10);
    expect(s.splna).toBe(true);
    expect(s.chyba).toBe("");
  });

  it("povie, koľko volaní chýba — nie len že to nestačí", () => {
    const s = stavPristupu(120, 0);
    expect(s.splna).toBe(false);
    expect(s.chyba).toContain("380 volaní");
  });

  it("chybovosť sa počíta a hranica je 15 %", () => {
    const s = stavPristupu(600, 100);
    expect(s.chybovost).toBe(16.7);
    expect(s.splna).toBe(false);
    expect(s.chyba).toContain(`${MAX_CHYBOVOST} %`);
  });

  it("keď chýba oboje, povie oboje", () => {
    const s = stavPristupu(100, 30);
    expect(s.chyba).toContain("400 volaní");
    expect(s.chyba).toContain("30 %");
  });

  it("bez volaní sa chybovosť netvári ako nula percent chýb", () => {
    const s = stavPristupu(0, 0);
    expect(s.chybovost).toBe(0);
    expect(s.splna).toBe(false);
  });
});
