import { describe, expect, it } from "bun:test";

import { zostatokKokpitu, type BalicekPreZostatok } from "./zostatokKokpitu";

const b = (od: string, doDna: string | null, hodiny: number | null, nazov = "OFF - 6h", extra: Partial<BalicekPreZostatok> = {}): BalicekPreZostatok =>
  ({ klient: "Vitezslav Papiež", nazov, hodiny, platnostOd: od, platnostDo: doDna, ...extra });
const s = (d: string, duration = 60) => ({ client: "Vitezslav Papiež", date: `${d}T00:00:00.000Z`, duration });

describe("zostatokKokpitu", () => {
  it("nový balíček zapísaný len v Kokpite karta vidí (Vítězslav, 29. 9.)", () => {
    const z = zostatokKokpitu(
      [b("2026-08-27", "2026-09-26", 6, "OFF - 6h S viazanostou"), b("2026-09-29", "2026-10-28", 6, "Předplatné 6 h")],
      "Vitezslav Papiež", [s("2026-09-15"), s("2026-09-29")], "2026-09-29",
    );
    expect(z).toMatchObject({ zostatok: 5, spolu: 6, minute: 1, nazov: "Předplatné 6 h" });
  });

  it("bez aktívneho balíčka je to null, nie nula", () => {
    expect(zostatokKokpitu([b("2026-08-27", "2026-09-26", 6)], "Vitezslav Papiež", [], "2026-10-02")).toBeNull();
  });

  it("dva prekrývajúce sa balíčky sa sčítajú a odpočítava sa od staršieho", () => {
    const z = zostatokKokpitu([b("2026-08-06", "2026-09-30", 8), b("2026-09-15", "2026-11-09", 8)], "Vitezslav Papiež",
      [s("2026-08-10"), s("2026-09-01"), s("2026-09-20")], "2026-09-29");
    expect(z).toMatchObject({ spolu: 16, minute: 3, zostatok: 13 });
  });

  it("90 minút je 1,5 h; tréning zadarmo sa neodpočíta", () => {
    const z = zostatokKokpitu([b("2026-10-01", null, 6)], "Vitezslav Papiež", [s("2026-10-02", 90), s("2026-10-05")], "2026-10-06",
      new Set(["vitezslav papiez|2026-10-05"]));
    expect(z?.minute).toBe(1.5);
    expect(z?.zostatok).toBe(4.5);
  });

  it("kotva: tréning z dňa naliatia sa neodpočíta — PTminder ho v zostatku má", () => {
    const z = zostatokKokpitu([b("2026-09-20", null, 50, "ONE YEAR", { kotva: true })], "Vitezslav Papiež",
      [s("2026-09-20"), s("2026-09-22")], "2026-09-29");
    expect(z).toMatchObject({ minute: 1, zostatok: 49 });
  });

  it("nad rámec balíčka sa nestráca — je v nadRamec", () => {
    const z = zostatokKokpitu([b("2026-10-01", null, 1)], "Vitezslav Papiež", [s("2026-10-02"), s("2026-10-05")], "2026-10-06");
    expect(z).toMatchObject({ zostatok: 0, nadRamec: 1 });
  });

  it("paušál hodiny nepočíta", () => {
    expect(zostatokKokpitu([b("2026-09-01", null, null, "DIAMOND")], "Vitezslav Papiež", [s("2026-09-02")], "2026-09-29")?.pausal).toBe(true);
  });

  it("zrušený balíček sa neráta", () => {
    expect(zostatokKokpitu([b("2026-09-01", null, 6, "X", { zruseneAt: "2026-09-29" })], "Vitezslav Papiež", [], "2026-09-29")).toBeNull();
  });
});
