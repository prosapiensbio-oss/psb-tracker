import { describe, expect, it } from "bun:test";

import { OBDOBIA, OBDOBIA_OBSAH, mesiaceVOkne, obdobieLabel } from "./obdobia";

const MESIACE = [
  "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
  "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
];

describe("mesiaceVOkne", () => {
  it("celé obdobie vráti všetko zoradené", () => {
    expect(mesiaceVOkne("all", [...MESIACE].reverse())).toEqual(MESIACE);
  });

  it("rok filtruje podľa predpony", () => {
    expect(mesiaceVOkne("2026", MESIACE)).toHaveLength(7);
  });

  it("posledných N sa počíta od posledného mesiaca V DÁTACH, nie od dneška", () => {
    // December 2026 v dátach nie je; okno musí končiť júlom.
    expect(mesiaceVOkne("6m", MESIACE)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
  });

  it("holé číslo znamená to isté ako s písmenom", () => {
    // Staršie karty posielali „6" namiesto „6m".
    expect(mesiaceVOkne("6", MESIACE)).toEqual(mesiaceVOkne("6m", MESIACE));
  });

  it("vlastný rozsah berie hranice z hodnoty", () => {
    expect(mesiaceVOkne("custom:2026-01|2026-03", MESIACE)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("otvorený vlastný rozsah nespadne", () => {
    expect(mesiaceVOkne("custom:|2025-02", MESIACE)).toEqual(["2025-01", "2025-02"]);
    expect(mesiaceVOkne("custom:|", MESIACE)).toEqual(MESIACE);
  });

  it("okno dlhšie než dáta vráti dáta, nie prázdno", () => {
    expect(mesiaceVOkne("12m", ["2026-07"])).toEqual(["2026-07"]);
  });

  it("duplicitné a prázdne mesiace vypadnú", () => {
    expect(mesiaceVOkne("all", ["2026-07", "", "2026-07"])).toEqual(["2026-07"]);
  });
});

describe("zoznam období", () => {
  it("karty o obsahu nemajú posledný mesiac", () => {
    // Pri 2–7 reels mesačne je rozdiel medzi 4 a 6 náhoda, nie trend.
    expect(OBDOBIA_OBSAH.some((o) => o.value === "1m")).toBe(false);
    expect(OBDOBIA.some((o) => o.value === "1m")).toBe(true);
  });

  it("popis vlastného rozsahu prežije aj s hranicami v hodnote", () => {
    expect(obdobieLabel("custom:2026-01|2026-03")).toBe("Vlastné");
    expect(obdobieLabel("6m")).toBe("Posledných 6 mes.");
  });
});
