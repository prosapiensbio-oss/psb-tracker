import { describe, expect, it } from "bun:test";

import { odkedyKalendar, porovnajMesiace } from "./porovnanieMesiacov";

const u = (zaciatok: string, typ: string | null = "trening", zmizlaAt: string | null = null) =>
  ({ zaciatok, typ, klient: "X", zmizlaAt });
const s = (date: string) => ({ date });

describe("mesačné porovnanie", () => {
  it("spočíta tréningy z oboch strán", () => {
    const r = porovnajMesiace(
      [u("2026-09-01T08:00"), u("2026-09-02T08:00"), u("2026-08-15T08:00")],
      [s("2026-09-01"), s("2026-09-02"), s("2026-08-15")],
    );
    expect(r.map((x) => x.mesiac)).toEqual(["2026-09", "2026-08"]);
    expect(r[0]).toMatchObject({ kalendar: 2, export: 2, rozdiel: 0, sedi: true });
  });

  it("zmiznutá udalosť sa neráta", () => {
    const r = porovnajMesiace([u("2026-09-01T08:00"), u("2026-09-02T08:00", "trening", "2026-09-03")], [s("2026-09-01")]);
    expect(r[0].kalendar).toBe(1);
  });

  it("nezaradené sa počítajú zvlášť, nie do súčtu", () => {
    // Nové meno v kalendári nie je tréning, kým ho človek nezaradí — ale
    // práve v ňom býva rozdiel, tak nech je vidieť.
    const r = porovnajMesiace([u("2026-09-01T08:00"), u("2026-09-02T08:00", null)], [s("2026-09-01")]);
    expect(r[0]).toMatchObject({ kalendar: 1, nezaradene: 1 });
  });

  it("iné typy sa nerátajú ako tréning", () => {
    const r = porovnajMesiace([u("2026-09-01T08:00", "dovolenka"), u("2026-09-02T08:00", "guillermo")], [s("2026-09-01")]);
    expect(r[0].kalendar).toBe(0);
  });

  it("malý rozdiel je zhoda, veľký nie", () => {
    // Pri 40 tréningoch je strop 2; pri 100 je 5.
    const stovka = Array.from({ length: 100 }, (_, i) => s(`2026-09-${String((i % 28) + 1).padStart(2, "0")}`));
    const kal = Array.from({ length: 96 }, (_, i) => u(`2026-09-${String((i % 28) + 1).padStart(2, "0")}T08:00`));
    expect(porovnajMesiace(kal, stovka)[0].sedi).toBe(true);
    expect(porovnajMesiace(kal.slice(0, 80), stovka)[0].sedi).toBe(false);
  });

  it("mesiace pred kalendárom sa nepýtajú", () => {
    const r = porovnajMesiace([u("2026-09-01T08:00")], [s("2025-01-05"), s("2026-09-01")], "2026-08");
    expect(r.map((x) => x.mesiac)).toEqual(["2026-09"]);
  });

  it("odkedy kalendár siaha", () => {
    expect(odkedyKalendar([u("2026-09-01T08:00"), u("2025-11-02T08:00")])).toBe("2025-11");
    expect(odkedyKalendar([])).toBe("");
  });
});
