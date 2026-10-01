import { describe, expect, it } from "bun:test";

import { odhadVycerpania } from "./odhadVycerpania";

const tyzdenne = [7, 7, 7, 6, 8, 7, 7];
const DNES = "2026-10-01";

describe("odhadVycerpania", () => {
  it("objednané termíny stačia — dátum je ISTÝ, nie odhad", () => {
    const o = odhadVycerpania({
      zostava: 2, odstupy: tyzdenne, dnes: DNES,
      buduce: ["2026-10-03", "2026-10-10", "2026-10-17"],
    });
    expect(o).toMatchObject({ iste: true, od: "2026-10-10", do: "2026-10-10", treningov: 2 });
  });

  it("bez objednaných termínov počíta z rytmu a vracia rozpätie", () => {
    const o = odhadVycerpania({ zostava: 4, odstupy: tyzdenne, dnes: DNES, buduce: [] })!;
    expect(o.iste).toBe(false);
    expect(o.treningov).toBe(4);
    // 4 tréningy × 7 dní ≈ 4 týždne
    expect(o.tyzdneOd).toBeLessThanOrEqual(4);
    expect(o.tyzdneDo).toBeGreaterThanOrEqual(4);
    expect(o.od < o.do).toBe(true);
  });

  it("objednané termíny ukrajujú a zvyšok sa doráta od posledného z nich", () => {
    const s = odhadVycerpania({ zostava: 5, odstupy: tyzdenne, dnes: DNES, buduce: [] })!;
    const sTerminmi = odhadVycerpania({
      zostava: 5, odstupy: tyzdenne, dnes: DNES,
      buduce: ["2026-10-02", "2026-10-03"],
    })!;
    // dva termíny hneď v prvých dňoch odhad posunú dopredu
    expect(sTerminmi.od < s.od).toBe(true);
  });

  it("málo medzier = žiadny odhad; dva tréningy nie sú rytmus", () => {
    expect(odhadVycerpania({ zostava: 4, odstupy: [7, 7], dnes: DNES, buduce: [] })).toBeNull();
  });

  it("nič nezostáva = nič sa neodhaduje", () => {
    expect(odhadVycerpania({ zostava: 0, odstupy: tyzdenne, dnes: DNES, buduce: [] })).toBeNull();
    expect(odhadVycerpania({ zostava: -2, odstupy: tyzdenne, dnes: DNES, buduce: [] })).toBeNull();
  });

  it("90-minútové tréningy míňajú balíček rýchlejšie", () => {
    const hodinove = odhadVycerpania({ zostava: 6, odstupy: tyzdenne, dnes: DNES, buduce: [] })!;
    const dlhsie = odhadVycerpania({ zostava: 6, odstupy: tyzdenne, dnes: DNES, buduce: [], hodinNaTrening: 1.5 })!;
    expect(hodinove.treningov).toBe(6);
    expect(dlhsie.treningov).toBe(4);
    expect(dlhsie.od < hodinove.od).toBe(true);
  });

  it("rozpätie rastie odmocninou, nie násobkom", () => {
    const kolisave = [3, 5, 7, 9, 11, 14, 21];
    const jeden = odhadVycerpania({ zostava: 1, odstupy: kolisave, dnes: DNES, buduce: [] })!;
    const desat = odhadVycerpania({ zostava: 10, odstupy: kolisave, dnes: DNES, buduce: [] })!;
    const sirka = (o: { od: string; do: string }) =>
      (Date.parse(o.do) - Date.parse(o.od)) / 86400000;
    expect(sirka(desat)).toBeGreaterThan(sirka(jeden));
    // keby rástlo násobkom, bolo by to desaťnásobné; odmocnina drží pod päť
    expect(sirka(desat)).toBeLessThan(sirka(jeden) * 5);
  });

  it("minulé termíny sa nepočítajú", () => {
    const o = odhadVycerpania({
      zostava: 1, odstupy: tyzdenne, dnes: DNES,
      buduce: ["2026-09-20", "2026-10-09"],
    })!;
    expect(o).toMatchObject({ iste: true, od: "2026-10-09" });
  });
});
