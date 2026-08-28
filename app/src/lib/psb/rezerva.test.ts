import { describe, expect, it, test } from "bun:test";

import { CIEL_MESIACOV, breakEvenPriemer, breakEvenRad, chybaDoCiela, poslednyUzavretyIdx, spocitajRezervu } from "./rezerva";
import { VZAS_MONTHS } from "./vzas";

describe("spocitajRezervu", () => {
  it("sčíta účet, hotovosť aj bitcoin", () => {
    const r = spocitajRezervu({
      btcCzk: 100_000,
      ucet: { suma: 110_000, datum: "2026-07-31" }, hotovost: { suma: 9_371, datum: "2026-08-08" },
      bePriem: 182_809,
    });
    expect(r.majetok).toBe(219_371);
    expect(r.uplna).toBe(true);
    expect(r.mesiace).toBeCloseTo(1.2, 1);
  });

  it("bez zapísaného stavu účtu ráta len bitcoin a povie to", () => {
    // Dlaždica v tomto stave hlási „zatiaľ len BTC" — číslo je nižšie než
    // skutočnosť a nesmie sa tváriť ako celý majetok.
    const r = spocitajRezervu({ btcCzk: 100_000, ucet: null, hotovost: null, bePriem: 200_000 });
    expect(r.majetok).toBe(100_000);
    expect(r.uplna).toBe(false);
    expect(r.mesiace).toBeCloseTo(0.5, 5);
  });

  it("bez break-evenu nevyrobí mesiace", () => {
    // Delenie nulou by dalo Infinity a dlaždica by hlásila nekonečnú rezervu.
    for (const be of [0, null]) {
      const r = spocitajRezervu({ btcCzk: 50_000, ucet: null, hotovost: null, bePriem: be });
      expect(r.mesiace).toBeNull();
    }
  });

  it("bez bitcoinu a bez stavu nevie nič — a nevydá to za nulu", () => {
    const r = spocitajRezervu({ btcCzk: null, ucet: null, hotovost: null, bePriem: 100_000 });
    expect(r.majetok).toBeNull();
    expect(r.mesiace).toBeNull();
  });

  it("keď je stav zapísaný, bitcoin ešte nenačítaný sa berie ako nula, nie ako diera", () => {
    const r = spocitajRezervu({
      btcCzk: null,
      ucet: { suma: 60_000, datum: "2026-08-08" }, hotovost: { suma: 1_100, datum: "2026-08-08" },
      bePriem: 100_000,
    });
    expect(r.majetok).toBe(61_100);
    expect(r.uplna).toBe(true);
  });
});

describe("jeden break-even pre celú appku", () => {
  test("breakEvenPriemer číta z breakEvenRad — žiadna vlastná kópia vzorca", () => {
    // Do 18. 8. 2026 žil vzorec v šiestich kópiách. Tento test drží zmluvu:
    // hodnota z priemeru musí sedieť s radom, z ktorého kreslia grafy.
    const rad = breakEvenRad();
    const b = breakEvenPriemer();
    expect(b.mesiac).not.toBe(null);
    const i = VZAS_MONTHS.indexOf(b.mesiac as string);
    expect(b.be).toBeCloseTo(rad[i], 6);
    const od = Math.max(0, i - 5);
    const idx = Array.from({ length: i - od + 1 }, (_, k) => od + k);
    expect(b.bePriem).toBeCloseTo(idx.reduce((a, k) => a + rad[k], 0) / idx.length, 6);
  });

  test("kotva je posledný UZAVRETÝ mesiac — nikdy bežiaci", () => {
    const i = poslednyUzavretyIdx();
    const beziaci = new Date().toISOString().slice(0, 7);
    expect(VZAS_MONTHS[i] < beziaci || i === 0).toBe(true);
  });
});

describe("chybaDoCiela", () => {
  it("ráta rozdiel do troch mesiacov z priemerného break-evenu", () => {
    // Skutočné čísla z 18. 8. 2026: 3 × 178 522 − 221 858 = 313 708.
    // Jarvis na tú istú otázku odpovedal raz 113 500 a raz 313 700 —
    // odteraz číslo nedostáva na počítanie, ale hotové.
    expect(chybaDoCiela({ majetok: 221858, bePriem: 178522 })).toBe(313708);
  });

  it("nad cieľom je nula, nie záporné číslo", () => {
    // Záporná „chýbajúca“ suma sa dá prečítať ako dlh.
    expect(chybaDoCiela({ majetok: 600000, bePriem: 178522 })).toBe(0);
  });

  it("bez majetku alebo break-evenu nevymýšľa", () => {
    expect(chybaDoCiela({ majetok: null, bePriem: 178522 })).toBeNull();
    expect(chybaDoCiela({ majetok: 221858, bePriem: null })).toBeNull();
    expect(chybaDoCiela({ majetok: 221858, bePriem: 0 })).toBeNull();
  });

  it("cieľ je jedno číslo pre dlaždicu aj Jarvisa", () => {
    expect(CIEL_MESIACOV).toBe(3);
  });
});

describe("konsolidácia zostatku (27. 8. 2026)", () => {
  it("účet z výpisu a hotovosť z ručného zápisu sa sčítajú s BTC", () => {
    const r = spocitajRezervu({
      btcCzk: 100_000,
      ucet: { suma: 38_223, datum: "2026-07-31" },
      hotovost: { suma: 1_100, datum: "2026-08-08" },
      bePriem: 178_522,
    });
    expect(r.majetok).toBe(139_323);
    expect(r.uplna).toBe(true);
    // Dátum stavu = najstarší vstup: rezerva je len taká čerstvá ako on.
    expect(r.datumStavu).toBe("2026-07-31");
  });

  it("chýbajúca hotovosť neznamená NaN, ale neúplnú rezervu", () => {
    const r = spocitajRezervu({ btcCzk: 100_000, ucet: { suma: 38_223, datum: "2026-07-31" }, hotovost: null, bePriem: 178_522 });
    expect(r.majetok).toBe(138_223);
    expect(Number.isFinite(r.majetok)).toBe(true);
    expect(r.uplna).toBe(false);
  });
});
