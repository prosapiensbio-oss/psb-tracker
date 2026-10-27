import { describe, expect, test } from "bun:test";

import { cerpanieMesiaca, narokPodlaTempa, rozhodni, rozhodniZalohu, stropZalohy, zalohyMesiaca } from "./strazcaVyberu";

const model = { fix: 27000, prah: 60, sadzba: 850 };

describe("cerpanieMesiaca", () => {
  test("výplaty celé, spoločné polovicou, len daný mesiac, vrátenie znižuje", () => {
    const c = cerpanieMesiaca([
      { date: "2026-10-01", suma: -23000, kat: "spolocne.Nájom" },
      { date: "2026-10-03", suma: -10000, kat: "vyplaty.jerry" },
      { date: "2026-10-04", suma: 2000, kat: "vyplaty.jerry" },
      { date: "2026-09-30", suma: -5000, kat: "vyplaty.jerry" },
      { date: "2026-10-05", suma: -900, kat: "fixne.apps" },
      { date: "2026-10-06", suma: -1000, kat: "vyplaty" },
      { date: "2026-10-07", suma: 3000, kat: "vyplaty.jerry" },
    ], "2026-10");
    expect(c).toBe(11500 + 8000 + 500 - 3000);
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

describe("zálohy po prechode na výplatu 3. (model A)", () => {
  test("strop klesá: nov 30k, dec 20k, jan 10k, potom 0; pred novembrom neplatí", () => {
    expect(stropZalohy("2026-10")).toBeNull();
    expect(stropZalohy("2026-11")).toBe(30000);
    expect(stropZalohy("2026-12")).toBe(20000);
    expect(stropZalohy("2027-01")).toBe(10000);
    expect(stropZalohy("2027-02")).toBe(0);
  });
  test("výplata 1.–5. a spoločné sa do zálohy nerátajú", () => {
    const p = [
      { date: "2026-11-03", suma: -30000, kat: "vyplaty.jerry" },
      { date: "2026-11-12", suma: -10000, kat: "vyplaty.jerry" },
      { date: "2026-11-20", suma: -8000, kat: "spolocne.potraviny" },
    ];
    expect(zalohyMesiaca(p, "2026-11")).toBe(10000);
  });
  test("ozve sa až nad strop a potom po 5 000 Kč", () => {
    expect(rozhodniZalohu("2026-11", 29000, 30000, null).poslat).toBe(false);
    const r = rozhodniZalohu("2026-11", 31000, 30000, null);
    expect(r.poslat).toBe(true);
    expect(rozhodniZalohu("2026-11", 33000, 30000, { mesiac: "2026-11", prah: 1 }).poslat).toBe(false);
  });
});
