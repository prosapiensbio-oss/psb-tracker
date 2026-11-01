import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { jeKategoriaPrijmu, jeVratenieVydavku, PRIJEM_INE, PRIJEM_PRODUKT, prijemDoPnl } from "./kategoriePrijmov";

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
  it("príchodzí pohyb s kategóriou výdavku je vrátenie — od októbra 2026", () => {
    expect(jeVratenieVydavku("vyplaty.jerry", "2026-10")).toBe(true);
    expect(jeVratenieVydavku("spolocne.Potraviny", "2026-11")).toBe(true);
    expect(jeVratenieVydavku("spolocne.Potraviny", "2026-09")).toBe(false);
    for (const k of ["", null, "mimo", "presun", PRIJEM_PRODUKT, PRIJEM_INE]) expect(jeVratenieVydavku(k, "2026-10")).toBe(false);
  });
});

/**
 * Október 2026: Dnes a Uzávierka raz 251 062, raz 249 969. Rozdiel 1 093 sú
 * dva príjmy s kategóriou `prijem.ine` a závisel od toho, či `/api/fio` dobehlo
 * skôr než `/api/data` (`peniazeOd` ešte prázdne).
 */
describe("Iné príjmy nezávisia od poradia dopytov", () => {
  const pohyby = [{ kat: PRIJEM_INE, suma: 114 }, { kat: PRIJEM_INE, suma: 979 }, { kat: "", suma: 7790 }];
  const ine = (peniazeOd: string) => pohyby.filter((p) => prijemDoPnl(p.kat, "2026-10", peniazeOd)).reduce((a, p) => a + p.suma, 0);

  it("s `peniazeOd` je to 1 093, bez neho nula — preto sa prechod musí pustiť až po dátach", () => {
    expect(ine("2026-10")).toBe(1093);
    expect(ine("")).toBe(0);
  });

  it("prechod Fio v App.tsx čaká na `/api/data` a pustí sa znova, keď `peniazeOd` príde neskôr", () => {
    const src = readFileSync(new URL("../../components/psb/App.tsx", import.meta.url), "utf8");
    expect(/if \(!dataHotove\) return;\s+void fetch\("\/api\/fio"/.test(src)).toBe(true);
    expect(src).toContain("}, [dataHotove, data.peniazeOd, btcNakupy, btcParovanie, pohybSplits, penazVerzia]);");
  });

  it("`/api/marketing` nejde pri štarte dvakrát ani po každej obnove dát", () => {
    const src = readFileSync(new URL("../../components/psb/App.tsx", import.meta.url), "utf8");
    expect(/if \(!dataHotove\) return;\s+void fetch\("\/api\/marketing"/.test(src)).toBe(true);
    expect(src).not.toContain("}, [data.uploadLog]);");
  });
});
