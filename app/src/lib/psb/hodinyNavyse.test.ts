import { describe, expect, it } from "bun:test";

import { hodinyNavysePoMesiacoch, platbaNavyse } from "./hodinyNavyse";

describe("hodiny navyše — model A od októbra 2026", () => {
  it("týždeň cez prelom mesiaca sa delí po dňoch", () => {
    // 28. 9. – 4. 10.: 3 dni septembra, 4 dni októbra
    const m = hodinyNavysePoMesiacoch({ "2026-09-28": { jerry_hours: "14", terezka_hours: "7" } });
    expect(m["2026-09"]).toEqual({ jerry: 6, terezka: 3 });
    expect(m["2026-10"]).toEqual({ jerry: 8, terezka: 4 });
  });

  it("prázdne a nečíselné zápisy sa ignorujú", () => {
    expect(hodinyNavysePoMesiacoch({ "2026-10-05": { jerry_hours: "", jerry_note: "x" }, zle: { jerry_hours: "5" } })).toEqual({});
  });

  it("pred októbrom 2026 sa neplatí nič (minulosť sa neprepočítava)", () => {
    expect(platbaNavyse("2026-09", { jerry: 42, terezka: 0 }).jerry).toBe(0);
  });

  it("450 Kč za hodinu, strop 40 h na osobu", () => {
    expect(platbaNavyse("2026-10", { jerry: 30, terezka: 0 })).toMatchObject({ jerry: 13500, terezka: 0, skratene: false });
    expect(platbaNavyse("2026-10", { jerry: 52, terezka: 0 })).toMatchObject({ hodinyJerry: 40, jerry: 18000 });
  });

  it("spoločný strop 25 000 Kč kráti oboch pomerne", () => {
    const p = platbaNavyse("2026-11", { jerry: 40, terezka: 40 });
    expect(p.skratene).toBe(true);
    expect(p.jerry + p.terezka).toBe(25000);
    expect(p.jerry).toBe(12500);
    const q = platbaNavyse("2026-11", { jerry: 40, terezka: 20 });
    expect(q.jerry + q.terezka).toBe(25000);
    expect(q.jerry).toBe(16667);
  });
});
