import { describe, expect, it } from "bun:test";

import { jeKontrolaPenazi } from "./kontrolaPenazi";

describe("kontrola peňazí ide do Workspace (Jerry, 27. 10. 2026)", () => {
  it("náklady, dvojité zápisy, pravidlá a príjmy áno; výpis z banky a bitcoin nie", () => {
    expect(jeKontrolaPenazi("naklad|vyskocil|apps|2026-09")).toBe(true);
    expect(jeKontrolaPenazi("pravidlo|najom pradlacka|spolocne.najom")).toBe(true);
    expect(jeKontrolaPenazi("dvojity|najom|2026-08")).toBe(true);
    expect(jeKontrolaPenazi("prijmy|2026-09")).toBe(true);
    expect(jeKontrolaPenazi("nezhody|2026-01|4")).toBe(true);
    expect(jeKontrolaPenazi("banka|zastarana")).toBe(false);
    expect(jeKontrolaPenazi("btc|nesedi|x")).toBe(false);
  });
});
