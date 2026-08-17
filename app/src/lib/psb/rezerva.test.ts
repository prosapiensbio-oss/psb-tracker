import { describe, expect, it } from "bun:test";

import { spocitajRezervu } from "./rezerva";

describe("spocitajRezervu", () => {
  it("sčíta účet, hotovosť aj bitcoin", () => {
    const r = spocitajRezervu({
      btcCzk: 100_000,
      stavPenazi: { fio: 110_000, hotovost: 9_371, datum: "2026-08-08" },
      bePriem: 182_809,
    });
    expect(r.majetok).toBe(219_371);
    expect(r.uplna).toBe(true);
    expect(r.mesiace).toBeCloseTo(1.2, 1);
  });

  it("bez zapísaného stavu účtu ráta len bitcoin a povie to", () => {
    // Dlaždica v tomto stave hlási „zatiaľ len BTC" — číslo je nižšie než
    // skutočnosť a nesmie sa tváriť ako celý majetok.
    const r = spocitajRezervu({ btcCzk: 100_000, stavPenazi: null, bePriem: 200_000 });
    expect(r.majetok).toBe(100_000);
    expect(r.uplna).toBe(false);
    expect(r.mesiace).toBeCloseTo(0.5, 5);
  });

  it("bez break-evenu nevyrobí mesiace", () => {
    // Delenie nulou by dalo Infinity a dlaždica by hlásila nekonečnú rezervu.
    for (const be of [0, null]) {
      const r = spocitajRezervu({ btcCzk: 50_000, stavPenazi: null, bePriem: be });
      expect(r.mesiace).toBeNull();
    }
  });

  it("bez bitcoinu a bez stavu nevie nič — a nevydá to za nulu", () => {
    const r = spocitajRezervu({ btcCzk: null, stavPenazi: null, bePriem: 100_000 });
    expect(r.majetok).toBeNull();
    expect(r.mesiace).toBeNull();
  });

  it("keď je stav zapísaný, bitcoin ešte nenačítaný sa berie ako nula, nie ako diera", () => {
    const r = spocitajRezervu({
      btcCzk: null,
      stavPenazi: { fio: 60_000, hotovost: 1_100, datum: "2026-08-08" },
      bePriem: 100_000,
    });
    expect(r.majetok).toBe(61_100);
    expect(r.uplna).toBe(true);
  });
});
