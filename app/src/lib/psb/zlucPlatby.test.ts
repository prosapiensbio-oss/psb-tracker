import { describe, expect, it } from "bun:test";

import { zlucPlatby } from "./klientOsCasu";

const pt = (date: string, amount: number) => ({ date, amount, method: "bank" });
const kp = (datum: string, suma: number) => ({ datum, suma, sposob: "banka" });
const ako = (xs: ReturnType<typeof zlucPlatby>) => xs.map((x) => `${x.den}:${x.suma}${x.zKokpitu ? "K" : ""}`).sort();

describe("platby z Kokpitu a PTmindera na jednej osi", () => {
  it("tá istá platba je raz — s dňom, ktorý je skorší", () => {
    // Přinosilová: PTminder 11. 8., banka 12. 8. Tréning 11. 8. nesmie dostať −1.
    expect(ako(zlucPlatby([pt("2026-08-11", 21150)], [kp("2026-08-12", 21150)]))).toEqual(["2026-08-11:21150K"]);
  });
  it("platba len v Kokpite na osi je", () => {
    expect(ako(zlucPlatby([], [kp("2026-09-16", 1100)]))).toEqual(["2026-09-16:1100K"]);
  });
  it("platba len v PTminderi ostáva", () => {
    expect(ako(zlucPlatby([pt("2025-05-15", 10990)], []))).toEqual(["2025-05-15:10990"]);
  });
  it("jedna platba v banke = dva riadky PTmindera", () => {
    // Albert Matl 21. 9.: banka 8 890, PTminder 1 100 + 7 790.
    expect(ako(zlucPlatby([pt("2026-09-21", 1100), pt("2026-09-21", 7790)], [kp("2026-09-21", 8890)]))).toEqual(["2026-09-21:8890K"]);
  });
  it("preklep v sume v PTminderi — platí suma z banky", () => {
    expect(ako(zlucPlatby([pt("2026-07-23", 6690), pt("2026-07-14", 990)], [kp("2026-07-23", 6990), kp("2026-07-14", 900)])))
      .toEqual(["2026-07-14:900K", "2026-07-23:6990K"]);
  });
  it("dve rovnaké platby v jeden mesiac sa nezlejú do jednej", () => {
    // Předplatné za tú istú sumu každý mesiac — 10 dní je hranica.
    expect(ako(zlucPlatby([pt("2026-08-10", 6990), pt("2026-09-09", 6990)], [kp("2026-08-11", 6990), kp("2026-09-10", 6990)])))
      .toEqual(["2026-08-10:6990K", "2026-09-09:6990K"]);
  });
  it("iná suma o týždeň neskôr je iná platba", () => {
    expect(ako(zlucPlatby([pt("2026-09-01", 1100)], [kp("2026-09-08", 7790)]))).toEqual(["2026-09-01:1100", "2026-09-08:7790K"]);
  });
});
