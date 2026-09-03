// Kedy appka povie, že nedorazil bankový výpis.
//
// Jerry, 31. 8. 2026 pri mesačnej kontrole: „doplň tú kontrolu banky, nech
// svieti po 14 dňoch." Do vtedy sa vek banky nekontroloval vôbec — hlásilo sa
// len zastaranie PTminderu.
import { describe, expect, it } from "bun:test";

import { BANKA_PRAH_DNI, zastaranaBanka } from "./kontrolaNakladov";

const D = (s: string) => new Date(`${s}T09:00:00Z`);

describe("zastaranaBanka", () => {
  it("do trinásteho dňa mlčí", () => {
    expect(zastaranaBanka("2026-08-18", D("2026-08-31"))).toBe(null);
  });

  it("na štrnásty deň sa ozve — presne tam, kde Jerry chcel", () => {
    const v = zastaranaBanka("2026-08-17", D("2026-08-31"));
    expect(v?.dni).toBe(BANKA_PRAH_DNI);
    expect(v?.tone).toBe("orange");
  });

  it("nad mesiac je červená — vtedy už P&L nemá náklady", () => {
    expect(zastaranaBanka("2026-08-02", D("2026-08-31"))?.tone).toBe("orange");
    expect(zastaranaBanka("2026-08-01", D("2026-08-31"))?.tone).toBe("red");
  });

  it("skutočný stav k 31. 8. 2026: posledný pohyb 31. 7., teda 31 dní a červená", () => {
    const v = zastaranaBanka("2026-07-31", D("2026-08-31"));
    expect(v?.dni).toBe(31);
    expect(v?.tone).toBe("red");
    expect(v?.poslednyPohyb).toBe("2026-07-31");
  });

  it("prázdna banka NIE JE zastaraná banka", () => {
    // Nula pohybov znamená, že sa vek nedá spočítať. „0 dní" by bola lož
    // a „veľmi staré" tiež — na prázdny stav upozorňuje uzávierka.
    expect(zastaranaBanka("", D("2026-08-31"))).toBe(null);
    expect(zastaranaBanka("neviem", D("2026-08-31"))).toBe(null);
  });

  it("dátum s časom sa znesie", () => {
    expect(zastaranaBanka("2026-07-31T10:22:00.000Z", D("2026-08-31"))?.dni).toBe(31);
  });

  it("pohyb z budúcnosti nespustí poplach", () => {
    expect(zastaranaBanka("2026-09-04", D("2026-08-31"))).toBe(null);
  });
});
