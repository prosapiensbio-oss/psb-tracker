import { describe, expect, it } from "bun:test";

import { stavHotovostiHotovy } from "./rituals";

describe("stav hotovosti ku koncu mesiaca — jedna definícia (9. 10. 2026)", () => {
  it("stav zo začiatku mesiaca uzávierku NEsplní", () => {
    expect(stavHotovostiHotovy("2026-09-07", "2026-09")).toBe(false);
  });
  it("stav k poslednému dňu mesiaca ju splní — tak ho od 8. 10. ponúka karta", () => {
    expect(stavHotovostiHotovy("2026-09-30", "2026-09")).toBe(true);
    expect(stavHotovostiHotovy("2026-02-28", "2026-02")).toBe(true);
  });
  it("neskorší stav ju splní tiež", () => {
    expect(stavHotovostiHotovy("2026-10-03", "2026-09")).toBe(true);
  });
  it("bez dátumu nie", () => {
    expect(stavHotovostiHotovy(undefined, "2026-09")).toBe(false);
  });
});
