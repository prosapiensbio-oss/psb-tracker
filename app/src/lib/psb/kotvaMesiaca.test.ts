import { describe, expect, test } from "bun:test";
import { cenaZaSedenie, cenaZaSedenieVDnoch, kotvaDat, nextMonthKeys, priemerZUplnychObdobi } from "./compute";
import { jeZrusenieKlientom } from "./kalendarZmeny";
import { priemerDochadzky, skupinaKlienta } from "./profil";
import { EMPTY_DATA } from "./types";
import { ukoncenyBalicekKlienta } from "./zostatokKokpitu";

const sed = (...d: string[]) => ({ sessions: d.map((date) => ({ date })) });

describe("kotva: skončený mesiac je plný", () => {
  test("1. 11.: posledný tréning 30. 10. a sobota bez záznamu → plný je október", () => {
    expect(kotvaDat(sed("2026-10-30"), "2026-11-01")).toEqual({ den: "2026-10-30", mesiac: "2026-10", plny: "2026-10", ciastocny: false });
  });
  test("bežiaci mesiac je rozrobený", () => {
    expect(kotvaDat(sed("2026-10-30"), "2026-10-30").plny).toBe("2026-09");
    expect(kotvaDat(sed("2026-11-02"), "2026-11-02").plny).toBe("2026-10");
  });
  test("zdroj, ktorý stojí od začiatku mesiaca, plný mesiac neurobí", () => {
    expect(kotvaDat(sed("2026-08-05"), "2026-09-15").plny).toBe("2026-07");
  });
  test("posledný deň mesiaca platí vždy", () => {
    expect(kotvaDat(sed("2026-08-31"), "2026-08-31").plny).toBe("2026-08");
  });
});

describe("predikcia je za mesiac po bežiacom", () => {
  test("1. 11. je „budúci mesiac“ december, nie november", () => {
    expect(nextMonthKeys(2, "2026-11-01")).toEqual(["2026-12", "2027-01"]);
  });
  test("31. deň nepreskočí mesiac", () => {
    expect(nextMonthKeys(2, "2026-10-31")).toEqual(["2026-11", "2026-12"]);
  });
});

describe("Ø cena sedenia", () => {
  const data = {
    ...EMPTY_DATA,
    sessions: [
      { date: "2026-10-01", client: "A" }, { date: "2026-10-02", client: "A" }, { date: "2026-10-03", client: "B" }, { date: "2026-09-03", client: "B" },
    ],
    payments: [{ date: "2026-10-01", client: "A", amount: 3000 }, { date: "2026-10-05", client: "B", amount: 600 }, { date: "2026-10-05", client: "", amount: 999 }],
  } as never;
  test("mesiac aj okno v dňoch sú tá istá funkcia, spolu ÷ spolu", () => {
    expect(cenaZaSedenie(data, (m) => m === "2026-10")).toEqual({ czk: 1200, sedeni: 3, cash: 3600 });
    expect(cenaZaSedenieVDnoch(data, (d) => d >= "2026-10-01")).toEqual({ czk: 1200, sedeni: 3, cash: 3600 });
  });
  test("výber klientov mení menovateľ aj čitateľ", () => {
    expect(cenaZaSedenie(data, (m) => m === "2026-10", new Set(["a"])).czk).toBe(1500);
  });
});

describe("Ø hodín na obdobie", () => {
  test("rozrobené posledné a prázdne obdobia sa nepočítajú", () => {
    expect(priemerZUplnychObdobi([20, 0, 30, 5], true)).toEqual({ avg: 25, n: 2 });
    expect(priemerZUplnychObdobi([20, 30], false)).toEqual({ avg: 25, n: 2 });
  });
});

describe("Ø dochádzka a zoznam", () => {
  const stary = "2025-01-01";
  test("neaktívni a krátka história priemer nekazia", () => {
    const r = priemerDochadzky([
      { firstSession: stary, attendance: 0.8, status: "Aktívny" },
      { firstSession: stary, attendance: 0.6, status: "Sporadický" },
      { firstSession: stary, attendance: 0.05, status: "Neaktívny" },
      { firstSession: "2026-10-28", attendance: 0.17, status: "Aktívny" },
    ], new Date("2026-11-01T12:00:00Z"));
    expect(r.n).toBe(2);
    expect(r.podiel).toBeCloseTo(0.7);
  });
  test("kto netrénoval, je v „čakajú“, aj s dohodnutým úvodným", () => {
    expect(skupinaKlienta(undefined)).toBe("cakaju");
    expect(skupinaKlienta({ status: "Neaktívny", sessionCount: 0 })).toBe("cakaju");
    expect(skupinaKlienta({ status: "Neaktívny", sessionCount: 3 })).toBe("neaktivni");
    expect(skupinaKlienta({ status: "Pauza", sessionCount: 3 })).toBe("aktivni");
  });
  test("zrušenie klientom: chyba v zápise a presun sa nerátajú, bez odpovede áno", () => {
    expect(jeZrusenieKlientom({ druh: "zrusene", poznamka: "chyba v zápise" })).toBe(false);
    expect(jeZrusenieKlientom({ druh: "zrusene", poznamka: "presunuli sme na 3. 11." })).toBe(false);
    expect(jeZrusenieKlientom({ druh: "zrusene", poznamka: "choroba" })).toBe(true);
    expect(jeZrusenieKlientom({ druh: "zrusene", poznamka: null })).toBe(true);
    expect(jeZrusenieKlientom({ druh: "posunute", poznamka: null })).toBe(false);
  });
});

describe("ukončený klient", () => {
  const b = (o: object) => ({ klient: "Radek", nazov: "x", hodiny: 5, platnostOd: "2026-09-15", platnostDo: null, zruseneAt: null, ...o }) as never;
  test("ukončený bez nového balíčka je ukončený", () => {
    expect(ukoncenyBalicekKlienta([b({ ukonceny: true })], "Radek", "2026-11-01")).not.toBeNull();
  });
  test("nový balíček to ruší", () => {
    expect(ukoncenyBalicekKlienta([b({ ukonceny: true }), b({ platnostOd: "2026-10-20" })], "Radek", "2026-11-01")).toBeNull();
  });
  test("ukončený prevzatý zostatok nie je koniec spolupráce", () => {
    expect(ukoncenyBalicekKlienta([b({ ukonceny: true, kotva: true })], "Radek", "2026-11-01")).toBeNull();
  });
});
