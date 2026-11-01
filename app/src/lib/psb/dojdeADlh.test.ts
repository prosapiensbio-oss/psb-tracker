import { describe, expect, it } from "bun:test";

import { normName } from "./format";
import { poznamkaHodinDlznika, rozdelDojdeADlh } from "./dojdeADlh";

const r = (meno: string, teraz: number, dojde = "") => ({ meno, teraz, uzDosiel: teraz <= 0, dojde });

describe("Balíček dojde a dlh", () => {
  it("kto dlží, z Balíček dojde odíde a stav hodín si berie so sebou", () => {
    const v = rozdelDojdeADlh([r("Kalva", -1), r("Papiež", 2, "2026-11-20"), r("Nedlží", 1, "2026-11-05")], ["Kalva", "Papiež", "Niekto mimo zoznamu"]);
    expect(v.riadky.map((x) => x.meno)).toEqual(["Nedlží"]);
    expect(v.hodinyDlznikov.size).toBe(2);
    expect(v.hodinyDlznikov.get(normName("Papiež"))).toBe("dôjde 20.11.2026");
  });
  it("text hodín: mínus, nula, bez dátumu", () => {
    expect(poznamkaHodinDlznika(r("A", -2))).toContain("2 h");
    expect(poznamkaHodinDlznika(r("A", 0))).toBe("hodiny minuté");
    expect(poznamkaHodinDlznika(r("A", 3))).toBe("3 h zostáva");
  });
  it("meno z dlhu a z kalendára sa môže líšiť v dĺžňoch", () => {
    const v = rozdelDojdeADlh([r("Marcela Hruzova", -2)], ["Marcela Hrůzová"]);
    expect(v.riadky).toHaveLength(0);
  });
  it("bez dlžníkov sa nemení nič", () => {
    const v = rozdelDojdeADlh([r("A", 0)], []);
    expect(v.riadky).toHaveLength(1);
    expect(v.hodinyDlznikov.size).toBe(0);
  });
});
