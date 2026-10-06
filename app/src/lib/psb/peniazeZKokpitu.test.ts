import { describe, expect, it } from "bun:test";

import { mozePrepnut, spojPlatby } from "./peniazeZKokpitu";

const pt = (date: string, amount: number) => ({ date: `${date}T00:00:00.000Z`, client: "A", amount, method: "bank" });

describe("spojPlatby", () => {
  const ptminder = [pt("2026-09-20", 1000), pt("2026-10-02", 2000)];
  const vlastne = [
    { klient: "A", datum: "2026-09-20", suma: 1000, sposob: "banka" },
    { klient: "B", datum: "2026-10-03", suma: 7790, sposob: "hotovost" },
    { klient: "C", datum: "2026-10-04", suma: 500, sposob: "bitcoin" },
    { klient: "D", datum: "2026-10-05", suma: 900, sposob: "banka", zruseneAt: "2026-10-06" },
  ];

  it("bez zvoleného mesiaca je to export bez zmeny", () => {
    expect(spojPlatby(ptminder, vlastne, "")).toBe(ptminder);
  });

  it("pred mesiacom PTminder, od neho Kokpit — bez zrušených", () => {
    const s = spojPlatby(ptminder, vlastne, "2026-10");
    expect(s.map((p) => [p.client, p.amount, p.method])).toEqual([
      ["A", 1000, "bank"], ["B", 7790, "cash"], ["C", 500, "other"],
    ]);
  });
});

describe("mozePrepnut", () => {
  it("sedí a nič nečaká → áno", () => {
    expect(mozePrepnut("2026-10", [{ mesiac: "2026-10", kokpit: 17190, ptminder: 17190 }], []).ok).toBe(true);
  });
  it("tolerancia 200 Kč alebo 1 %", () => {
    expect(mozePrepnut("2026-10", [{ mesiac: "2026-10", kokpit: 99000, ptminder: 100000 }], []).ok).toBe(true);
    expect(mozePrepnut("2026-10", [{ mesiac: "2026-10", kokpit: 98000, ptminder: 100000 }], []).ok).toBe(false);
  });
  it("nepriradený príjem bráni a dôvod povie koľko", () => {
    const r = mozePrepnut("2026-10", [{ mesiac: "2026-10", kokpit: 100, ptminder: 100 }], [{ datum: "2026-10-04", suma: 33580 }]);
    expect(r.ok).toBe(false);
    expect(r.dovody[0]).toContain("33580");
  });
  it("mesiac bez PTminder platieb sa nesúdi — samotný nestačí", () => {
    expect(mozePrepnut("2026-11", [{ mesiac: "2026-11", kokpit: 500, ptminder: 0 }], []).ok).toBe(false);
  });
});
