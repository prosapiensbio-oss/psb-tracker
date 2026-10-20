import { describe, expect, it } from "bun:test";
import { citajUlozeny, mesiacZGooglu, normVyraz, smerZaujmu, textNapadu, vyrazyZTextu, zHistorickych, zNapadov } from "./objemHladania";

const mesiace = (zac: [number, number], n: number[]) =>
  n.map((v, i) => {
    const d = new Date(Date.UTC(zac[0], zac[1] - 1 + i, 1));
    return { month: ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"][d.getUTCMonth()], year: String(d.getUTCFullYear()), monthlySearches: String(v) };
  });

describe("objem hľadania", () => {
  it("mesiac z Googlu – meno aj číslo enumu", () => {
    expect(mesiacZGooglu({ month: "OCTOBER", year: "2025" })).toBe("2025-10");
    expect(mesiacZGooglu({ month: 2, year: 2026 })).toBe("2026-01");
    expect(mesiacZGooglu({ month: "UNKNOWN", year: "2025" })).toBe("");
  });

  it("historické metriky: poradie sledovaných, chýbajúci = 0, blízke varianty, Kč z mikier", () => {
    const data = {
      results: [
        { text: "bolest zad", closeVariants: ["bolesť zad"], keywordMetrics: { avgMonthlySearches: "5400", competition: "LOW", lowTopOfPageBidMicros: "4500000", highTopOfPageBidMicros: "18250000", monthlySearchVolumes: mesiace([2025, 9], [5000, 6000]) } },
        { text: "plochá noha", keywordMetrics: { avgMonthlySearches: "880", competition: "MEDIUM" } },
      ],
    };
    const o = zHistorickych(data, ["Plochá noha", "bolesť zad", "nič"]);
    expect(o.map((x) => [x.vyraz, x.mesacne])).toEqual([["Plochá noha", 880], ["bolesť zad", 5400], ["nič", 0]]);
    expect(o[1]).toMatchObject({ konkurencia: "nizka", cpcOd: 4.5, cpcDo: 18.25, trend: [{ mesiac: "2025-09", n: 5000 }, { mesiac: "2025-10", n: 6000 }] });
  });

  it("nápady bez sledovaných, nulových a duplicít, od najhľadanejšieho", () => {
    const data = { results: [
      { text: "bolest zad", keywordIdeaMetrics: { avgMonthlySearches: "5400" } },
      { text: "bolest beder", keywordIdeaMetrics: { avgMonthlySearches: "720" } },
      { text: "Bolest Beder", keywordIdeaMetrics: { avgMonthlySearches: "720" } },
      { text: "bolest lopatky", keywordIdeaMetrics: { avgMonthlySearches: "1300" } },
      { text: "nikto", keywordIdeaMetrics: { avgMonthlySearches: "0" } },
    ] };
    expect(zNapadov(data, ["bolest zad"]).map((x) => x.vyraz)).toEqual(["bolest lopatky", "bolest beder"]);
  });

  it("smer záujmu: rok proti roku, malé čísla a krátka rada = null", () => {
    const rok = mesiace([2024, 7], [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 150, 150, 150]);
    const t = rok.map((x) => ({ mesiac: mesiacZGooglu(x), n: Number(x.monthlySearches) }));
    expect(smerZaujmu(t)).toEqual({ zmena: 50, text: "+50 % oproti minulému roku" });
    expect(smerZaujmu(t.map((x) => ({ ...x, n: 1 })))).toBeNull();
    expect(smerZaujmu(t.slice(0, 4))).toBeNull();
  });

  it("výrazy z textu, normalizácia, text nápadu, uložený tvar", () => {
    expect(vyrazyZTextu("bolest zad\nBolest  zad, plochá noha\n\n")).toEqual(["bolest zad", "plochá noha"]);
    expect(normVyraz(" Bolesť  Zád ")).toBe("bolest zad");
    expect(textNapadu({ vyraz: "bolest zad", mesacne: 5400 }, "brno")).toContain("asi 5400× mesačne (Brno)");
    expect(citajUlozeny("{zle")).toBeNull();
    expect(citajUlozeny(JSON.stringify({ zistene: "2026-10-20", vyrazy: [] }))).toMatchObject({ region: "cz", napady: [] });
  });
});
