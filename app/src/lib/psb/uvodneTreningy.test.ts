import { describe, expect, it } from "bun:test";

import { rozborUvodnych } from "./uvodneTreningy";
import type { SessionRow } from "./types";

const s = (date: string, sessionTrainer: string, sessionType: SessionRow["sessionType"] = "UVODNE"): SessionRow => ({
  date, time: "09:00", client: "Klient", sessionTrainer, sessionName: "Úvodní", sessionType, duration: 60, price: 0,
});

describe("rozborUvodnych", () => {
  it("počíta len úvodné a rozdelí ich medzi trénerov", () => {
    const r = rozborUvodnych([
      s("2026-01-05", "Jerry"),
      s("2026-01-06", "Terezka"),
      s("2026-01-07", "Terezka"),
      s("2026-01-08", "Jerry", "OFFLINE"),
    ]);
    expect(r.celkom).toBe(3);
    expect(r.treneri).toEqual([
      { trener: "Terezka", pocet: 2, podiel: (2 / 3) * 100 },
      { trener: "Jerry", pocet: 1, podiel: (1 / 3) * 100 },
    ]);
  });

  it("prázdny mesiac z osi nevypadne", () => {
    const r = rozborUvodnych([s("2026-01-05", "Jerry"), s("2026-03-05", "Jerry")]);
    expect(r.mesiace.map((m) => m.mesiac)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(r.mesiace[1].celkom).toBe(0);
  });

  it("kĺzavé okno nespraví z jedného mesiaca celý obraz", () => {
    // Pol roka samý Jerry, potom jeden mesiac samá Terezka. Mesačne by to
    // bol skok zo 100 % na 0 %; v šesťmesačnom okne je to pokles na 5/6.
    const treningy = [
      s("2026-01-05", "Jerry"), s("2026-02-05", "Jerry"), s("2026-03-05", "Jerry"),
      s("2026-04-05", "Jerry"), s("2026-05-05", "Jerry"), s("2026-06-05", "Terezka"),
    ];
    const r = rozborUvodnych(treningy, 6);
    const posledny = r.klzave[r.klzave.length - 1];
    expect(posledny.zaklad).toBe(6);
    expect(posledny.podiel["Jerry"]).toBeCloseTo((5 / 6) * 100, 6);
    expect(posledny.podiel["Terezka"]).toBeCloseTo((1 / 6) * 100, 6);
  });

  it("okno na začiatku osi berie len to, čo už bolo", () => {
    const r = rozborUvodnych([s("2026-01-05", "Jerry"), s("2026-02-05", "Terezka")], 6);
    expect(r.klzave[0]).toEqual({ mesiac: "2026-01", podiel: { Jerry: 100, Terezka: 0 }, zaklad: 1 });
  });

  it("záskok do pomeru nevstupuje ani ako základ percent", () => {
    // Matyáš skončil 20. 9. 2026; jeho úvodné sú záskok, nie tretia strana.
    const r = rozborUvodnych([
      s("2026-01-05", "Jerry"),
      s("2026-01-06", "Terezka"),
      s("2026-01-07", "Matyáš"),
    ]);
    expect(r.celkom).toBe(2);
    expect(r.treneri.map((t) => t.trener)).toEqual(["Jerry", "Terezka"]);
    expect(r.treneri.every((t) => t.podiel === 50)).toBe(true);
    expect(r.mesiace[0].podla["Matyáš"]).toBeUndefined();
  });

  it("tréner bez úvodných v období zostáva v pomere s nulou", () => {
    const r = rozborUvodnych([s("2026-01-05", "Jerry")]);
    expect(r.treneri).toEqual([
      { trener: "Jerry", pocet: 1, podiel: 100 },
      { trener: "Terezka", pocet: 0, podiel: 0 },
    ]);
  });

  it("bez úvodných nevyrobí graf ani delenie nulou", () => {
    const r = rozborUvodnych([s("2026-01-05", "Jerry", "OFFLINE")]);
    expect(r).toEqual({ celkom: 0, treneri: [], mesiace: [], klzave: [] });
  });
});
