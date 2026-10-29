// Balíček z Kokpitu bez platby ide do mínusu, platba vopred počká (4. 10. 2026).
import { describe, expect, it } from "bun:test";

import { nezaplateneZKokpitu, zaplateneVPtminderi, type BalicekDlh, type PlatbaDlh } from "./dlhKlienta";
import { normName } from "./format";

const b = (od: string, cena: number, zdroj = "rucne", poznamka: string | null = null): BalicekDlh => ({ platnostOd: od, cena, zdroj, poznamka, nazov: "OFF - 6h BEZ viazanosti" });
const p = (datum: string, suma: number, vopred = false): PlatbaDlh => ({ datum, suma, vopred });

describe("nezaplateneZKokpitu", () => {
  it("balíček bez platby je nezaplatený", () => {
    expect(nezaplateneZKokpitu([b("2026-11-05", 7790)], []).map((x) => x.platnostOd)).toEqual(["2026-11-05"]);
  });
  it("platba po vzniku ho pokryje", () => {
    expect(nezaplateneZKokpitu([b("2026-11-05", 7790)], [p("2026-11-08", 7790)])).toEqual([]);
  });
  it("platby idú na najstarší balíček", () => {
    const n = nezaplateneZKokpitu([b("2026-09-02", 7790), b("2026-10-28", 7790)], [p("2026-09-05", 7790)]);
    expect(n.map((x) => x.platnostOd)).toEqual(["2026-10-28"]);
  });
  it("čiastočná platba nestačí: 7 790 na 18 h je nezaplatené", () => {
    expect(nezaplateneZKokpitu([b("2026-11-05", 21150)], [p("2026-11-06", 7790)]).length).toBe(1);
  });
  it("platba viac než tri týždne pred prvým balíčkom bez príznaku vopred sa nepočíta", () => {
    expect(nezaplateneZKokpitu([b("2026-11-05", 7790)], [p("2026-10-10", 7790)]).length).toBe(1);
  });
  // Kateřina Matlová, 21. 10. 2026: augustový balíček zaplatila 4 dni pred
  // začiatkom a ten si potom zobral jej októbrovú platbu — nový ostal v mínuse.
  it("platba pár dní pred prvým balíčkom ho zaplatí a novšia ostane novšiemu", () => {
    const n = nezaplateneZKokpitu([b("2026-08-27", 7790), b("2026-10-20", 7790)], [p("2026-08-23", 7790), p("2026-10-14", 7790)]);
    expect(n).toEqual([]);
  });
  it("platba vopred pokryje balíček, ktorý vznikol až prvým tréningom", () => {
    expect(nezaplateneZKokpitu([b("2026-11-05", 7790)], [p("2026-11-01", 7790, true)])).toEqual([]);
  });
  // Jerry, 12. 10. 2026: „zdrojom dlhu bude Kokpit a PTminder bude len
  // kontrola." Dovtedy rozhodovali len riadky nahodené rukou.
  it("balíček naliaty z PTmindera dlh ROBÍ — zdroj už nerozhoduje", () => {
    expect(nezaplateneZKokpitu([b("2026-09-02", 7790, "ptminder")], []).map((x) => x.platnostOd)).toEqual(["2026-09-02"]);
  });
  it("otvárací zostatok z naliatia dlh nerobí — nie je to predaj", () => {
    const zostatok = b("2026-09-20", 77240, "ptminder", "zostatok prevzatý z PTmindera k 2026-09-20 — pokračuje");
    expect(nezaplateneZKokpitu([zostatok], [])).toEqual([]);
  });
  it("platba vopred pokryje aj balíček, ktorý vznikne neskôr", () => {
    const bal = [b("2026-09-02", 7790), b("2026-10-28", 7790)];
    expect(nezaplateneZKokpitu(bal, [p("2026-09-05", 7790)]).map((x) => x.platnostOd)).toEqual(["2026-10-28"]);
    const vopred = [p("2026-08-30", 7790, true), p("2026-09-05", 7790)];
    expect(nezaplateneZKokpitu(bal, vopred)).toEqual([]);
  });
});

describe("poistka z PTmindera počas prechodu", () => {
  const papiez = { ...b("2026-09-29", 6990), klient: "Vitezslav Papiež" };
  const snirych = { ...b("2026-09-22", 3990), klient: "Janka šnirychova" };
  it("Šnirychová: PTminder má platbu na rovnakú sumu → zaplatené", () => {
    expect(zaplateneVPtminderi([snirych], [{ klient: "Janka Šnirychová", datum: "2026-09-30", suma: 3990 }], [], [], normName)).toEqual([]);
  });
  it("Papiež: PTminder má členstvo z toho dňa bez otvoreného poplatku → zaplatené", () => {
    expect(zaplateneVPtminderi([papiez], [], [{ klient: "Vitezslav Papiež", od: "2026-09-29" }], [], normName)).toEqual([]);
  });
  it("otvorený poplatok v PTminderi → nezaplatené", () => {
    expect(zaplateneVPtminderi([papiez], [], [{ klient: "Vitezslav Papiež", od: "2026-09-29" }], [{ klient: "Vitezslav Papiež", datum: "2026-09-29" }], normName)).toHaveLength(1);
  });
  it("PTminder o ničom nevie → nezaplatené", () => {
    expect(zaplateneVPtminderi([papiez], [], [], [], normName)).toHaveLength(1);
  });
});

describe("splátky — balíček zaplatený na dvakrát", () => {
  const meno = (x: string) => x.toLowerCase();
  const bal = (cena: number, platnostOd = "2026-07-24") =>
    [{ klient: "Peter Gažo", cena, platnostOd, doplatit: cena }] as never;

  it("Peter Gažo: 8 000 + 12 081 pokryje členstvo za 20 093", () => {
    // Skutočný prípad z 11. 10. 2026: QR v SMS znel na dvojnásobok, lebo
    // pravidlo hľadalo jedinú platbu na celú sumu a splátky nepoznalo.
    expect(zaplateneVPtminderi(bal(20093), [
      { klient: "Peter Gažo", datum: "2026-08-07", suma: 8000 },
      { klient: "Peter Gažo", datum: "2026-08-17", suma: 12081 },
    ], [], [], meno)).toHaveLength(0);
  });

  it("polovičná platba dlh NEZAHLADÍ — poistka nie je odpustenie", () => {
    expect(zaplateneVPtminderi(bal(20093), [
      { klient: "Peter Gažo", datum: "2026-08-07", suma: 8000 },
    ], [], [], meno)).toHaveLength(1);
  });

  it("tri splátky áno, štyri už nie", () => {
    const platby = (sumy: number[]) => sumy.map((suma, i) => ({ klient: "Peter Gažo", datum: `2026-08-0${i + 1}`, suma }));
    expect(zaplateneVPtminderi(bal(9000), platby([3000, 3000, 3000]), [], [], meno)).toHaveLength(0);
    // Z piatich čísel sa poskladá skoro čokoľvek — poistka by sa zmenila na zahládzanie.
    expect(zaplateneVPtminderi(bal(12000), platby([3000, 3000, 3000, 3000]), [], [], meno)).toHaveLength(1);
  });

  it("platby mimo okna sa nepočítajú", () => {
    expect(zaplateneVPtminderi(bal(20093), [
      { klient: "Peter Gažo", datum: "2026-05-01", suma: 8000 },
      { klient: "Peter Gažo", datum: "2026-12-01", suma: 12081 },
    ], [], [], meno)).toHaveLength(1);
  });

  it("tá istá dvojica splátok nepokryje dva balíčky", () => {
    const dva = [
      { klient: "Peter Gažo", cena: 20093, platnostOd: "2026-07-24", doplatit: 20093 },
      { klient: "Peter Gažo", cena: 20093, platnostOd: "2026-08-01", doplatit: 20093 },
    ] as never;
    expect(zaplateneVPtminderi(dva, [
      { klient: "Peter Gažo", datum: "2026-08-07", suma: 8000 },
      { klient: "Peter Gažo", datum: "2026-08-17", suma: 12081 },
    ], [], [], meno)).toHaveLength(1);
  });
});
