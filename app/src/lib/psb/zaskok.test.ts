import { describe, expect, test } from "bun:test";
import { mzdaZaskoku, vlastnikKlienta, ZASKOK } from "./zaskok";
const Z = ["Jerry", "Terezka"] as const;

describe("vlastnikKlienta — záskok nemení vlastníka", () => {
  test("Jerryho klient, za pol roka viac záskokov než Jerryho hodín → stále Jerryho", () => {
    expect(vlastnikKlienta({
      celkom: { Jerry: 40, [ZASKOK]: 5 }, nedavno: { Jerry: 2, [ZASKOK]: 5 },
      prvyDenTreneri: ["Jerry"], prvyDatum: "2025-03-01", zakladatelia: Z,
    })).toBe("Jerry");
  });

  test("Natália Pečková: 55 sedení s Matyášom v 2025, teraz Jerry → Jerryho", () => {
    expect(vlastnikKlienta({
      celkom: { [ZASKOK]: 55, Jerry: 26 }, nedavno: { Jerry: 26 },
      prvyDenTreneri: [ZASKOK], prvyDatum: "2025-01-15", zakladatelia: Z,
    })).toBe("Jerry");
  });

  test("nový klient s úvodným u Matyáša (referencia) → Matyášov, aj keď za neho neskôr zaskočí Jerry", () => {
    expect(vlastnikKlienta({
      celkom: { [ZASKOK]: 1, Jerry: 3 }, nedavno: { [ZASKOK]: 1, Jerry: 3 },
      prvyDenTreneri: [ZASKOK], prvyDatum: "2026-09-10", zakladatelia: Z,
    })).toBe(ZASKOK);
  });

  test("nový klient, ktorého prvý deň mal aj Jerry → nie je automaticky Matyášov", () => {
    expect(vlastnikKlienta({
      celkom: { [ZASKOK]: 1, Jerry: 1 }, nedavno: { [ZASKOK]: 1, Jerry: 1 },
      prvyDenTreneri: [ZASKOK, "Jerry"], prvyDatum: "2026-09-10", zakladatelia: Z,
    })).toBe("Jerry");
  });

  test("klient na pauze bez sedení za pol roka → celoživotne najčastejší zakladateľ", () => {
    expect(vlastnikKlienta({
      celkom: { Terezka: 12, [ZASKOK]: 20 }, nedavno: {},
      prvyDenTreneri: [ZASKOK], prvyDatum: "2025-02-01", zakladatelia: Z,
    })).toBe("Terezka");
  });

  test("Matyášov klient z 2025 bez Jerryho a Terezky → zostáva Matyášov", () => {
    expect(vlastnikKlienta({
      celkom: { [ZASKOK]: 23 }, nedavno: {},
      prvyDenTreneri: [ZASKOK], prvyDatum: "2025-01-15", zakladatelia: Z,
    })).toBe(ZASKOK);
  });

  test("bez sedení → —", () => {
    expect(vlastnikKlienta({ celkom: {}, nedavno: {}, prvyDenTreneri: [], prvyDatum: "", zakladatelia: Z })).toBe("—");
  });
});

describe("mzdaZaskoku", () => {
  test("hodiny × 370 po mesiacoch, ostatní tréneri sa nerátajú, úvodný ako hodina", () => {
    const s = (date: string, sessionTrainer: string, duration = 60) => ({ date, sessionTrainer, duration });
    expect(mzdaZaskoku([
      s("2026-09-02T00:00:00.000Z", ZASKOK), s("2026-09-03", ZASKOK), s("2026-09-04", ZASKOK),
      s("2026-09-05", ZASKOK), s("2026-09-06", ZASKOK), s("2026-09-07", ZASKOK), // 6 h
      s("2026-09-07", "Jerry"), s("2026-10-01", ZASKOK, 30),
    ])).toEqual({ "2026-09": 2220, "2026-10": 185 });
  });
});
