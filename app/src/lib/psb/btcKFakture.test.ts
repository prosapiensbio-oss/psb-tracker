import { describe, expect, it } from "bun:test";

import { platbaKDokladu } from "./btcKFakture";

const p = (id: number, datum: string, czk: number) => ({ id, datum, czk });

describe("platba bitcoinom k faktúre", () => {
  it("jediná platba v okne patrí dokladu, aj keď suma nesedí na korunu", () => {
    // Z peňaženky odíde o poplatok a spread viac — suma je len kontrola.
    const v = platbaKDokladu({ cislo: "A", datum: "2026-09-02", celkom: 885 }, [p(1, "2026-09-02", 1025)]);
    expect(v?.platba.id).toBe(1);
    expect(v?.isto).toBe(true);
  });

  it("mimo okna sa nepáruje", () => {
    expect(platbaKDokladu({ cislo: "A", datum: "2026-09-02", celkom: 885 }, [p(1, "2026-09-20", 885)])).toBe(null);
  });

  it("pri dvoch platbách v okne rozhodne suma", () => {
    const v = platbaKDokladu({ cislo: "A", datum: "2026-09-02", celkom: 7125 },
      [p(1, "2026-09-02", 1025), p(2, "2026-09-03", 7125)]);
    expect(v?.platba.id).toBe(2);
    expect(v?.isto).toBe(true);
  });

  it("rozdelená objednávka: dva doklady jedného dňa sa porovnajú SPOLU", () => {
    const a = { cislo: "A", datum: "2026-09-02", celkom: 600 };
    const b = { cislo: "B", datum: "2026-09-02", celkom: 425 };
    const v = platbaKDokladu(a, [p(1, "2026-09-02", 1025), p(2, "2026-09-02", 9999)], [b]);
    expect(v?.platba.id).toBe(1);
  });

  it("keď sedia dve, appka to prizná a nerozhodne za človeka", () => {
    const v = platbaKDokladu({ cislo: "A", datum: "2026-09-02", celkom: 1000 },
      [p(1, "2026-09-02", 1000), p(2, "2026-09-02", 1010)]);
    expect(v?.isto).toBe(false);
  });

  it("bez platieb v knihe mlčí", () => {
    expect(platbaKDokladu({ cislo: "A", datum: "2026-09-02", celkom: 885 }, [])).toBe(null);
  });
});
