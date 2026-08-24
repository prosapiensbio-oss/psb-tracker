import { describe, expect, it } from "bun:test";

import { jeMesiac } from "./format";

describe("platný mesiac", () => {
  it("pustí len 01 až 12", () => {
    expect(jeMesiac("2026-01")).toBe(true);
    expect(jeMesiac("2026-12")).toBe(true);
    expect(jeMesiac("2026-13")).toBe(false);
    expect(jeMesiac("2026-00")).toBe(false);
  });

  it("odmietne nesprávny tvar", () => {
    for (const x of ["2026-1", "26-01", "2026", "", null, undefined, "2026-1a"]) {
      expect(jeMesiac(x)).toBe(false);
    }
  });
});
