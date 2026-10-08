import { describe, expect, it } from "bun:test";

import { jeKategoriaPrijmu, PRIJEM_PRODUKT, prijemDoPnl } from "./kategoriePrijmov";

describe("kategórie príjmov", () => {
  it("loptička ide do P&L až od mesiaca tržieb z Kokpitu — predtým je v PTminderi", () => {
    expect(prijemDoPnl(PRIJEM_PRODUKT, "2026-09", "2026-10")).toBe(false);
    expect(prijemDoPnl(PRIJEM_PRODUKT, "2026-10", "2026-10")).toBe(true);
    expect(prijemDoPnl(PRIJEM_PRODUKT, "2026-11", null)).toBe(false);
  });
  it("platba klienta a výdavkové kategórie nie sú kategórie príjmu", () => {
    expect(jeKategoriaPrijmu("")).toBe(false);
    expect(jeKategoriaPrijmu("mimo")).toBe(false);
    expect(prijemDoPnl("", "2026-10", "2026-10")).toBe(false);
  });
});
