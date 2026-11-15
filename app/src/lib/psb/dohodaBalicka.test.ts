import { describe, expect, it } from "bun:test";

import { citajDohodu, dohodaPreDen, jeZDohody, vetaDohody } from "./dohodaBalicka";
import { cenyBalickovKlienta } from "./workspaceKroky";

const json = JSON.stringify({ hodiny: 4, cena: 4660, do: "2027-01-10", poznamka: "2 mesiace" });

describe("dočasná dohoda o balíčku", () => {
  it("platí do dňa vrátane, potom nie", () => {
    expect(dohodaPreDen(json, "2026-12-11")?.hodiny).toBe(4);
    expect(dohodaPreDen(json, "2027-01-10")?.cena).toBe(4660);
    expect(dohodaPreDen(json, "2027-01-11")).toBeNull();
  });
  it("neúplná alebo pokazená dohoda nič neurčuje", () => {
    expect(citajDohodu("")).toBeNull();
    expect(citajDohodu("{")).toBeNull();
    expect(citajDohodu(JSON.stringify({ hodiny: 4, cena: 0, do: "2027-01-10" }))).toBeNull();
  });
  it("balíček z dohody sa pozná podľa poznámky", () => {
    const d = citajDohodu(json)!;
    expect(jeZDohody(`automaticky · ${vetaDohody(d)}`)).toBe(true);
    expect(jeZDohody("automaticky — vznikol prvým tréningom")).toBe(false);
  });
  it("cena z dohody nie je stála iná cena — v januári ide zase cenník", () => {
    const b = (od: string, cena: number, poznamka: string | null) => ({ klient: "Eva Doležalova", platnost_od: od, cena_czk: cena, zrusene_at: null, poznamka });
    const ceny = cenyBalickovKlienta("Eva Doležalova", [b("2026-11-11", 4660, "dočasná dohoda: 4 h"), b("2026-12-11", 4660, "dočasná dohoda: 4 h"), b("2026-10-08", 6990, null)], []);
    expect(ceny.map((c) => c.cena)).toEqual([null, null, 6990]);
  });
});
