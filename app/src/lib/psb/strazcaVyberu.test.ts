import { describe, expect, test } from "bun:test";

import { cerpanieMesiaca, narokPodlaTempa, rozhodni } from "./strazcaVyberu";

const model = { fix: 27000, prah: 60, sadzba: 850 };

describe("cerpanieMesiaca", () => {
  test("výplaty celé, spoločné polovicou, len daný mesiac, vrátenie znižuje", () => {
    const c = cerpanieMesiaca([
      { date: "2026-10-01", suma: -23000, kat: "spolocne.Nájom" },
      { date: "2026-10-03", suma: -10000, kat: "vyplaty.jerry" },
      { date: "2026-10-04", suma: 2000, kat: "vyplaty.jerry" },
      { date: "2026-09-30", suma: -5000, kat: "vyplaty.jerry" },
      { date: "2026-10-05", suma: -900, kat: "fixne.apps" },
    ], "2026-10");
    expect(c).toBe(11500 + 8000);
  });
});

describe("narokPodlaTempa", () => {
  test("po prvom týždni podľa tempa hodín", () => {
    // 40 h za 15 dní → 80 h za 30 dní → 27 000 + 20 × 850
    expect(narokPodlaTempa(model, 40, 15, 30, 50000)).toEqual({ narok: 44000, podlaTempa: true, hodinyZaMesiac: 80 });
  });
  test("prvý týždeň berie minulý mesiac", () => {
    expect(narokPodlaTempa(model, 3, 2, 31, 52000)).toEqual({ narok: 52000, podlaTempa: false, hodinyZaMesiac: 0 });
  });
});

describe("rozhodni", () => {
  const n = { narok: 44000, podlaTempa: true, hodinyZaMesiac: 80 };
  test("pod nárokom mlčí", () => {
    expect(rozhodni("2026-10", 43000, n, null).poslat).toBe(false);
  });
  test("prvé prekročenie pošle, rovnaký stupeň druhýkrát nie, ďalších 5 000 áno", () => {
    const a = rozhodni("2026-10", 46000, n, null);
    expect(a.poslat).toBe(true);
    if (a.poslat) expect(a.text).toContain("o 2 000 Kč viac");
    expect(rozhodni("2026-10", 48000, n, { mesiac: "2026-10", prah: 1 }).poslat).toBe(false);
    const b = rozhodni("2026-10", 50000, n, { mesiac: "2026-10", prah: 1 });
    expect(b.poslat && b.prah).toBe(2);
  });
  test("nový mesiac začína odznova", () => {
    expect(rozhodni("2026-11", 46000, n, { mesiac: "2026-10", prah: 3 }).poslat).toBe(true);
  });
});
