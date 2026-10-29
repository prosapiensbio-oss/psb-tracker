import { describe, expect, it } from "bun:test";

import { dlhyNaFakturu } from "./fakturaDlhy";
import type { DlhPolozka } from "./zaplatene";

const dlhy: DlhPolozka[] = [
  { klient: "Branislav Široký", den: "2026-10-26", nazov: "Úvodní trénink", cena: 1100, doplatit: 100, zdroj: "kokpit", id: "uvB" },
  { klient: "Branislav Široký", den: "2026-10-28", nazov: "6h Balíček", cena: 7790, doplatit: 7790, zdroj: "kokpit", id: "b6" },
  { klient: "Linda Muth", den: "2026-10-26", nazov: "Úvodní trénink", cena: 1100, doplatit: 100, zdroj: "kokpit", id: "uvL" },
  { klient: "Iný Klient", den: "2026-10-01", nazov: "6h Balíček", cena: 7790, doplatit: 7790, zdroj: "kokpit", id: "x" },
];

describe("dlh, ktorý na faktúre nie je (29. 10. 2026)", () => {
  it("Branislav: 100 Kč za úvodný; balíček z faktúry sa neponúka druhý raz", () => {
    const d = dlhyNaFakturu(dlhy, ["Branislav Široký"], ["b6"]);
    expect(d.map((x) => [x.klient, x.suma])).toEqual([["Branislav Široký", 100]]);
    expect(d[0].popis).toBe("Doplatek — Úvodní trénink (26. 10. 2026)");
    expect(d[0].balicekId).toBe("uvB");
  });
  it("po pridaní Lindy pribudne aj jej dlh", () => {
    const d = dlhyNaFakturu(dlhy, ["Branislav Široký", "Linda Muth"], ["b6"]);
    expect(d.reduce((n, x) => n + x.suma, 0)).toBe(200);
  });
  it("pridaný dlh sa neponúka znova; cudzí klient nikdy", () => {
    expect(dlhyNaFakturu(dlhy, ["Branislav Široký", "Linda Muth"], ["b6", "uvB", "uvL"])).toEqual([]);
    expect(dlhyNaFakturu(dlhy, ["Branislav Široky"], ["b6"])).toHaveLength(1);
  });
});
