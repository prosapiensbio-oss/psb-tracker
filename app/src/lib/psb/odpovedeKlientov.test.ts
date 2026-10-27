import { describe, expect, it } from "bun:test";

import { odpovedeKlientov } from "./odpovedeKlientov";

const m = (klient: string, datum: string, extra: Record<string, unknown> = {}) =>
  ({ klient, datum, oblasti: [], posun: null, poznamka: "", zdroj: "klient", ...extra }) as never;

describe("notifikácia: klient napísal, ako sa cíti (27. 10. 2026)", () => {
  it("text aj čísla idú do detailu; staršie než 14 dní a zápis trénera nie", () => {
    const r = odpovedeKlientov([
      m("Branislav Široký", "2026-10-28", { poznamka: "Bolí ma trochu kríž", oblasti: [{ oblast: "bedra", sila: 4 }], posun: 2 }),
      m("Linda Muth", "2026-10-01", { poznamka: "staré" }),
      m("Jan Kral", "2026-10-27", { zdroj: "trener", poznamka: "trénerov zápis" }),
    ], "2026-10-28");
    expect(r).toHaveLength(1);
    expect(r[0].key).toBe("odpoved-klienta|Branislav Široký|2026-10-28");
    expect(r[0].title).toContain("napísal(a)");
    expect(r[0].detail).toContain("„Bolí ma trochu kríž“");
    expect(r[0].detail).toContain("bedra 4/10");
    expect(r[0].detail).toContain("trochu");
  });
});
