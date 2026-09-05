import { describe, expect, it } from "bun:test";
import { pohybKluc, platnySplit, rozdelPohyb, PRIJEM } from "./pohybSplit";

describe("pohybKluc", () => {
  it("použije ID operácie, keď je", () => {
    expect(pohybKluc({ id: "26123", datum: "2026-08-26", suma: -22990 })).toBe("fio:26123");
  });
  it("keď ID nie je, poskladá dátum|suma|protistrana ako server", () => {
    expect(pohybKluc({ id: "", datum: "2026-09-01", suma: 8999, protistrana: "Zasilkovna" }))
      .toBe("2026-09-01|8999|Zasilkovna");
  });
});

describe("platnySplit", () => {
  it("50/50 je platné", () => {
    expect(platnySplit([{ ciel: "vyplaty.terezka", pct: 50 }, { ciel: "fixne.prevadzka.vybavenie", pct: 50 }])).toBe(true);
  });
  it("súčet != 100 neplatí", () => {
    expect(platnySplit([{ ciel: "a", pct: 40 }, { ciel: "b", pct: 50 }])).toBe(false);
  });
  it("prázdny cieľ neplatí", () => {
    expect(platnySplit([{ ciel: "", pct: 100 }])).toBe(false);
  });
  it("prázdny zoznam neplatí", () => {
    expect(platnySplit([])).toBe(false);
    expect(platnySplit(undefined)).toBe(false);
  });
  it("jedna časť na 100 % je platná (priradenie príjmu/vrátenia)", () => {
    expect(platnySplit([{ ciel: PRIJEM, pct: 100 }])).toBe(true);
  });
});

describe("rozdelPohyb", () => {
  it("výdavok 50/50 zachová znamienko a súčet do haliera", () => {
    const r = rozdelPohyb(-22990, [{ ciel: "vyplaty.terezka", pct: 50 }, { ciel: "fixne.prevadzka.vybavenie", pct: 50 }]);
    expect(r).toEqual([
      { ciel: "vyplaty.terezka", ciastka: -11495 },
      { ciel: "fixne.prevadzka.vybavenie", ciastka: -11495 },
    ]);
    expect(r[0].ciastka + r[1].ciastka).toBe(-22990);
  });
  it("posledná časť dostane zvyšok — 3× 33,33 % sedí na halier", () => {
    const r = rozdelPohyb(-100, [{ ciel: "a", pct: 33.33 }, { ciel: "b", pct: 33.33 }, { ciel: "c", pct: 33.34 }]);
    expect(r[0].ciastka + r[1].ciastka + r[2].ciastka).toBe(-100);
  });
  it("kladná suma (vrátenie) ostane kladná", () => {
    const r = rozdelPohyb(1049, [{ ciel: "fixne.prevadzka.vybavenie", pct: 100 }]);
    expect(r[0].ciastka).toBe(1049);
  });
});
