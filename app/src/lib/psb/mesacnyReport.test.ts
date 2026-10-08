import { describe, expect, it } from "bun:test";

import { koniecKvartalu, postavReport, type MesiacReportu } from "./mesacnyReport";

const m = (mm: string, o: Partial<MesiacReportu>): MesiacReportu => ({ m: mm, hodiny: 200, aktivni: 55, novi: 5, dopyty: 6, prijmy: 200000, naklady: 150000, zisk: 50000, prirastokIg: 10, dosahReels: 450, reklama: 2000, ...o });
const mesiace = [
  m("2026-04", {}), m("2026-05", {}), m("2026-06", {}),
  m("2026-07", { hodiny: 214, dosahReels: 608 }), m("2026-08", { hodiny: 183, dosahReels: 404, reklama: 2, prirastokIg: -9 }),
  m("2026-09", { hodiny: 231, aktivni: 60, novi: 4, dopyty: 7, dosahReels: 283, reklama: 6540, prirastokIg: 34, zisk: 60000 }),
];
const extra = { odmlcani: 3, zositChyba: false, topVydaj: { nazov: "Nájom", suma: 54750 } };

describe("mesačný report", () => {
  it("september: práca zelená so zmenou oproti augustu, akcia pre odmlčaných", () => {
    const r = postavReport(mesiace, "2026-09", "mesiac", extra);
    expect(r.nadpis).toBe("September 2026");
    const [praca, peniaze, novi] = r.otazky;
    expect(praca.semafor).toBe("z");
    expect(praca.hlavne.zmena).toBe("▲ 26 % oproti augustu");
    expect(praca.hlavne.seria).toHaveLength(6);
    expect(praca.akcia).toContain("3 aktívnych klientov netrénovalo");
    expect(peniaze.semafor).toBe("z");
    expect(peniaze.akcia).toContain("Nájom");
    // Dosah reels 283 je pod 80 % priemeru → akcia o príbehoch klientov.
    expect(novi.akcia).toContain("Natoč príbeh klienta");
  });

  it("chýbajúci zošit a chýbajúce P&L sa nezamlčia", () => {
    const r = postavReport([...mesiace.slice(0, 5), m("2026-09", { prijmy: undefined, zisk: undefined, naklady: undefined })], "2026-09", "mesiac", { ...extra, zositChyba: true });
    expect(r.otazky[1].semafor).toBe("o");
    expect(r.otazky[1].akcia).toContain("zošit");
  });

  it("strata je červená", () => {
    const r = postavReport([...mesiace.slice(0, 5), m("2026-09", { zisk: -12000, prijmy: 150000, naklady: 162000 })], "2026-09", "mesiac", extra);
    expect(r.otazky[1].semafor).toBe("c");
  });

  it("kvartál Q3 proti Q2: súčty a mesiace štvrťroka v krivke", () => {
    const r = postavReport(mesiace, "2026-09", "kvartal", extra);
    expect(r.nadpis).toBe("Q3 2026");
    expect(r.otazky[0].hlavne.hodnota).toBe(628);
    expect(r.otazky[0].hlavne.seria).toEqual([214, 183, 231]);
    expect(r.porovnanie).toBe("porovnanie s Q2");
    expect(koniecKvartalu("2026-09")).toBe(true);
    expect(koniecKvartalu("2026-10")).toBe(false);
  });
});
