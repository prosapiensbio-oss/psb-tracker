// Balíček z Kokpitu bez platby ide do mínusu, platba vopred počká (4. 10. 2026).
import { describe, expect, it } from "bun:test";

import { dlhKlienta, nezaplateneZKokpitu, zaplateneVPtminderi, type BalicekDlh, type PlatbaDlh } from "./dlhKlienta";
import { normName } from "./format";

const b = (od: string, cena: number, zdroj = "rucne"): BalicekDlh => ({ platnostOd: od, cena, zdroj, nazov: "OFF - 6h BEZ viazanosti" });
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
  it("platba spred balíčka bez príznaku vopred sa nepočíta", () => {
    expect(nezaplateneZKokpitu([b("2026-11-05", 7790)], [p("2026-11-01", 7790)]).length).toBe(1);
  });
  it("platba vopred pokryje balíček, ktorý vznikol až prvým tréningom", () => {
    expect(nezaplateneZKokpitu([b("2026-11-05", 7790)], [p("2026-11-01", 7790, true)])).toEqual([]);
  });
  it("balíčky z PTmindera sa do toho nemiešajú", () => {
    expect(nezaplateneZKokpitu([b("2026-09-02", 7790, "ptminder")], [])).toEqual([]);
  });
  it("dlh a nezaplatené balíčky hovoria to isté", () => {
    const bal = [b("2026-09-02", 7790), b("2026-10-28", 7790)];
    const pl = [p("2026-09-05", 7790)];
    expect(dlhKlienta(bal, pl).dlzi).toBe(7790);
    const vopred = [p("2026-08-30", 7790, true), p("2026-09-05", 7790)];
    expect(dlhKlienta(bal, vopred).dlzi).toBe(0);
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
