import { describe, expect, it } from "bun:test";

import { dnesPraha, terazPraha } from "./cas";

describe("terazPraha", () => {
  it("v lete je Praha dve hodiny pred UTC", () => {
    // 2. 10. 2026 13:02 UTC = 15:02 v Prahe. Presne ten prípad, keď appka
    // ponúkala ako „ďalší" tréning o 14:00, ktorý už bol.
    expect(terazPraha(new Date("2026-10-02T13:02:00Z"))).toBe("2026-10-02T15:02");
  });

  it("v zime o jednu", () => {
    expect(terazPraha(new Date("2026-12-02T13:02:00Z"))).toBe("2026-12-02T14:02");
  });

  it("deň sa môže líšiť od UTC", () => {
    // 22:30 UTC je v Prahe už po polnoci ďalšieho dňa.
    expect(dnesPraha(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
  });

  it("tvar je presne ten, s akým sa porovnáva kalendár", () => {
    expect(terazPraha()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
