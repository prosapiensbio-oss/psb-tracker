import { describe, expect, it } from "bun:test";

import { jeSum, LIMIT_NA_RELACIU, LIMIT_NA_STRANKU, maSaPoslat } from "./hlasenieChyb";

describe("hlásenie chýb z prehliadača nezaplaví audit", () => {
  it("skutočná chyba ide", () => {
    expect(maSaPoslat("TypeError: x is undefined", new Set(), 0, 0)).toBe(true);
  });
  it("rovnaká správa raz", () => {
    expect(maSaPoslat("a", new Set(["a"]), 1, 1)).toBe(false);
  });
  it("limit na stránku a na reláciu", () => {
    expect(maSaPoslat("a", new Set(), LIMIT_NA_STRANKU, 0)).toBe(false);
    expect(maSaPoslat("a", new Set(), 0, LIMIT_NA_RELACIU)).toBe(false);
    expect(maSaPoslat("a", new Set(), LIMIT_NA_STRANKU - 1, LIMIT_NA_RELACIU - 1)).toBe(true);
  });
  it("šum sa neposiela: sieť, zrušenie, prázdno, stará verzia", () => {
    for (const s of ["ResizeObserver loop completed with undelivered notifications.", "Script error.", "TypeError: Failed to fetch", "TypeError: Load failed", "AbortError: The operation was aborted", "Importing a module script failed.", "", "   "]) {
      expect(jeSum(s)).toBe(true);
    }
    expect(jeSum("TypeError: undefined is not an object (evaluating 'z.uid.startsWith')")).toBe(false);
  });
});
