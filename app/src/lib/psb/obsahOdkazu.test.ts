import { describe, expect, it } from "bun:test";

import { balicekPreOs, osCasuKlienta } from "./klientOsCasu";
import { ponukaVOdkaze, popisPoplatku } from "./obsahOdkazu.server";
import type { BalicekServer } from "./osKlienta.server";

describe("popis poplatku pre klienta", () => {
  it("surový text z PTmindera sa klientovi ukáže česky a s dátumom po česky", () => {
    // Hanus, 4. 10. 2026: stránka ukazovala doslova anglický text z PTmindera.
    expect(popisPoplatku("OFF - 6h S viazanostou - from 02/10/2026 to 02/11/2026")).toBe("6h Předplatné · 2. 10. – 2. 11. 2026");
    expect(popisPoplatku("OFF - 8 hodín offline - from 09/09/2026 to 04/11/2026")).toBe("8h Balíček · 9. 9. – 4. 11. 2026");
  });

  it("popis, ktorý tvar nemá, prejde cez slovník produktov", () => {
    expect(popisPoplatku("OFF - 6h BEZ viazanosti")).toBe("6h Balíček");
    expect(popisPoplatku("nezaplacený balíček")).toBe("nezaplacený balíček");
  });
});

describe("QR „nový balíček“ — cena rovnakou cestou ako automat", () => {
  const riadok = (klient: string, nazov: string, hodiny: number, od: string, doDna: string, cena: number | null, poznamka: string | null = null): BalicekServer =>
    ({ klient, nazov, hodiny, cena_czk: cena, platnost_od: od, platnost_do: doDna, zdroj: "rucne", zrusene_at: null, poznamka });
  const os = (meno: string, balicky: BalicekServer[]) => osCasuKlienta(meno, { sessions: [], payments: [], packages: [], balicky } as never, "2026-11-20");
  const ponuka = (meno: string, balicky: BalicekServer[], prepis?: { bitcoin: boolean; btcZlava: number }) =>
    ponukaVOdkaze(meno, os(meno, balicky), balicky, { historiaBalickov: [], clientOverrides: prepis ? { [meno]: prepis } : {} } as never, "2026-11-20");

  it("ukončený balíček so stiahnutou cenou nie je vzor (Radek Baláž: nie 5 875)", () => {
    const b = [
      riadok("Radek", "18h Balíček", 18, "2026-04-21", "2026-10-20", 21150),
      riadok("Radek", "18h Balíček", 5, "2026-10-21", "2026-11-13", 5875, "ukončené 13. 11. 2026 — vrátené 15 275 Kč"),
    ];
    expect(ponuka("Radek", b)).toMatchObject({ nazov: "18h Balíček", hodiny: 18, cena: 21150 });
  });

  it("kto mal len úvodný, ponuku nedostane (Hana Hrdinová: nie 1 100)", () => {
    expect(ponuka("Hana", [riadok("Hana", "Úvodní trénink", 1, "2026-08-06", "2026-08-06", 1100)])).toBeNull();
  });

  it("doplnenie a prenesené hodiny nie sú vzor, berie sa predaj pred nimi", () => {
    const b = [
      riadok("Ema", "6h Předplatné", 6, "2026-09-01", "2026-10-01", 6990),
      riadok("Ema", "Doplnenie členstva", 2, "2026-10-02", "2026-10-20", null),
      riadok("Ema", "Prenesené hodiny", 1, "2026-10-03", "2026-10-20", null),
    ];
    expect(ponuka("Ema", b)).toMatchObject({ nazov: "6h Předplatné", cena: 6990 });
  });

  it("prevzatý zostatok sám ponuku nerobí", () => {
    const b: BalicekServer[] = [{ ...riadok("Ida", "Doplnenie členstva", 1, "2026-09-20", "", null, "zostatok prevzatý z PTmindera k 2026-09-20"), zdroj: "ptminder", platnost_do: null }];
    expect(ponuka("Ida", b)).toBeNull();
  });

  it("zľava za odporúčanie sa neprenáša — cenník (Kateřina Matlová 7 011)", () => {
    const b = [riadok("Katka", "6h Balíček", 6, "2026-07-11", "2026-09-05", 7011)];
    expect(ponuka("Katka", b)).toMatchObject({ cena: 7790 });
  });

  it("zľava za bitcoin z cenníka, nie zo zaplatenej sumy (Knapčok 30 %)", () => {
    const b = [riadok("Michal", "18h Balíček", 18, "2026-04-21", "2026-10-20", 14805)];
    expect(ponuka("Michal", b, { bitcoin: true, btcZlava: 30 })).toMatchObject({ cena: 14805 });
  });

  it("produkt mimo cenníka sa neponúka (GOLD sa už nepredáva)", () => {
    expect(ponuka("Dana", [riadok("Dana", "GOLD členství", 12, "2025-01-01", "2025-03-01", 10920)])).toBeNull();
  });

  it("automat aj mapovaný riadok dajú tú istú os — ukončený príznak prežije mapovanie", () => {
    const b = [riadok("Radek", "18h Balíček", 5, "2026-10-21", "2026-11-13", 5875, "ukončené 13. 11. 2026")];
    expect(osCasuKlienta("Radek", { sessions: [], payments: [], packages: [], balicky: b.map(balicekPreOs) } as never, "2026-11-20")
      .find((u) => u.druh === "balicekOd")).toMatchObject({ ukonceny: true });
  });
});
