import { describe, expect, test } from "bun:test";

import { mzdoveHodiny, narokJerryho } from "./mzdoveHodiny";

const s = (date: string, duration: number, sessionTrainer: string, sessionType = "") =>
  ({ date, duration, sessionTrainer, sessionType });

describe("mzdoveHodiny", () => {
  test("hodiny po mesiacoch a tréneroch, úvodné sa nerátajú", () => {
    const h = mzdoveHodiny([
      s("2026-09-02", 60, "Jerry"),
      s("2026-09-03", 90, "Jerry"),
      s("2026-09-03", 60, "Jerry", "UVODNE"),
      s("2026-09-04", 60, "Terezka"),
      s("2026-10-01", 60, "Jerry"),
    ]);
    expect(h["2026-09"]).toEqual({ jerry: 2.5, terezka: 1 });
    expect(h["2026-10"]).toEqual({ jerry: 1, terezka: 0 });
  });
});

describe("narokJerryho", () => {
  const hodiny = { "2025-07": { jerry: 80, terezka: 0 }, "2026-05": { jerry: 100, terezka: 0 }, "2026-10": { jerry: 30, terezka: 0 }, "2026-11": { jerry: 5, terezka: 0 } };

  test("27 000 + (hodiny − 60) × 850, od zadaného mesiaca po bežiaci", () => {
    const n = narokJerryho(hodiny, "2026-05-01", "2026-10");
    expect(n).toEqual([
      { mesiac: "2026-05", hodiny: 100, narok: 61000, beziaci: false },
      { mesiac: "2026-10", hodiny: 30, narok: 1500, beziaci: true },
    ]);
  });

  test("mesiac pred dnešným modelom nárok nemá", () => {
    expect(narokJerryho(hodiny, "2025-01-01", "2026-10").map((x) => x.mesiac)).not.toContain("2025-07");
  });
});
