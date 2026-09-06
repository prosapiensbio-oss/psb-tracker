import { describe, expect, it } from "bun:test";
import { dokladyPreBtcPlatbu, platiebPodlaDni, type DokladInfo } from "./btcSparovanie";

const d = (cislo: string, celkom: number, datum: string): DokladInfo => ({ cislo, celkom, datum, dodavatel: "Alza" });
// Suma nikdy neprejde — dokazuje, že dátumová vetva sa nepýta na sumu.
const nikdySuma = () => null;

describe("platiebPodlaDni", () => {
  it("spočíta platby po dňoch", () => {
    expect(platiebPodlaDni(["2026-08-19", "2026-08-19", "2026-08-20"])).toEqual({ "2026-08-19": 2, "2026-08-20": 1 });
  });
});

describe("dokladyPreBtcPlatbu — dátum prvé", () => {
  it("jediná platba v deň vezme VŠETKY blízke doklady, aj keď suma nesedí", () => {
    const blizke = [d("A", 5174, "2026-08-19"), d("B", 1840, "2026-08-19")];
    // platba 7128 != 7014, ale je jediná v deň → berie oba
    const out = dokladyPreBtcPlatbu("2026-08-19", 7128, blizke, { "2026-08-19": 1 }, nikdySuma);
    expect(out.sort()).toEqual(["A", "B"]);
  });

  it("doklad z blízkeho dňa, ktorý má vlastnú platbu, nechá jemu", () => {
    const blizke = [d("A", 5174, "2026-08-19"), d("C", 999, "2026-08-20")];
    // 20.8 má vlastnú platbu → doklad C sa nechá jej, 19.8 vezme len A
    const out = dokladyPreBtcPlatbu("2026-08-19", 5174, blizke, { "2026-08-19": 1, "2026-08-20": 1 }, nikdySuma);
    expect(out).toEqual(["A"]);
  });

  it("doklad z blízkeho dňa BEZ vlastnej platby si vezme (sirota)", () => {
    const blizke = [d("A", 5174, "2026-08-19"), d("C", 999, "2026-08-20")];
    const out = dokladyPreBtcPlatbu("2026-08-19", 5174, blizke, { "2026-08-19": 1 }, nikdySuma);
    expect(out.sort()).toEqual(["A", "C"]);
  });

  it("viac platieb v deň → rozlíši suma", () => {
    const blizke = [d("A", 5174, "2026-08-19"), d("B", 1840, "2026-08-19")];
    const podlaSumy = (kand: DokladInfo[], ciel: number) =>
      kand.filter((x) => Math.abs(x.celkom - ciel) < 60).map((x) => x.cislo);
    const out = dokladyPreBtcPlatbu("2026-08-19", 1840, blizke, { "2026-08-19": 2 }, podlaSumy);
    expect(out).toEqual(["B"]);
  });

  it("bez blízkych dokladov vráti prázdno", () => {
    expect(dokladyPreBtcPlatbu("2026-08-19", 7128, [], { "2026-08-19": 1 }, nikdySuma)).toEqual([]);
  });
});
