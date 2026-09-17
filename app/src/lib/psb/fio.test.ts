import { describe, expect, test } from "bun:test";
import { fioKluc, ocislujDuplicity, parseFio, type FioRiadok } from "./fio";

// Presný tvar exportu „Pohyby na všech účtech" (13. 9. 2026) — bez ID operace.
const POHYBY = [
  '"Zdrojový účet";"Datum";"Objem";"Měna";"Protiúčet";"Kód banky";"Zpráva pro příjemce";"Poznámka";"Typ"',
  '"2302732185";"01.09.2026";"6590";"CZK";"108189335";"2250";"6 online lekcií PSB";"Hrůzová Marcela";"Okamžitá příchozí platba"',
  '"2302732185";"01.09.2026";"-1500";"CZK";"2323438014";"3030";"Jerry vyplata";"Jerry vyplata";"Bezhotovostní platba"',
  '"2302732185";"01.09.2026";"-1500";"CZK";"2323438014";"3030";"Jerry vyplata";"Jerry vyplata";"Okamžitá odchozí platba"',
  '"2302732185";"07.09.2026";"-1500";"CZK";"2323438014";"3030";"Jerry vyplata";"Jerry vyplata";"Okamžitá odchozí platba"',
  '"2302732185";"07.09.2026";"-1500";"CZK";"2323438014";"3030";"Jerry vyplata";"Jerry vyplata";"Okamžitá odchozí platba"',
  '"2302732185";"07.09.2026";"-2000";"CZK";"2323438014";"3030";"Jerry vyplata";"Jerry vyplata";"Okamžitá odchozí platba"',
  '"2302732185";"02.09.2026";"-2265,49";"CZK";"";"";"Nákup: PTMINDER, AUCKLAND, NZ, dne 1.9.2026, částka  90.97 EUR";"Nákup: PTMINDER, AUCKLAND, NZ, dne 1.9.2026, částka  90.97 EUR";"Karetní transakce"',
].join("\r\n");

const riadky = () => {
  const p = parseFio("﻿" + POHYBY);
  if (!p.ok) throw new Error("parse zlyhal");
  return p.riadky;
};

describe("Pohyby na všech účtech — export bez ID operace", () => {
  test("prečíta všetky riadky vrátane BOM a CRLF", () => {
    expect(riadky().length).toBe(7);
  });

  test("dve rovnaké výplaty v jeden deň dostanú RÔZNE kľúče — žiadna sa nestratí", () => {
    const k = riadky().map(fioKluc);
    expect(new Set(k).size).toBe(k.length);
    const jv = riadky().filter((r) => r.protistrana === "Jerry vyplata");
    expect(jv.length).toBe(5);
    expect(jv.reduce((a, r) => a + r.suma, 0)).toBe(-8000);
  });

  test("prvý výskyt má kľúč PRESNE ako predtým (22 starých riadkov v DB)", () => {
    const jv = riadky().filter((r) => r.datum === "2026-09-01" && r.suma === -1500);
    expect(fioKluc(jv[0])).toBe("2026-09-01|-1500|Jerry vyplata");
    expect(fioKluc(jv[1])).toBe("2026-09-01|-1500|Jerry vyplata#2");
  });

  test("rovnaká suma v iný deň sa čísluje zvlášť, iná suma v ten deň sa nečísluje", () => {
    const d7 = riadky().filter((r) => r.datum === "2026-09-07");
    expect(d7.map(fioKluc)).toEqual([
      "2026-09-07|-1500|Jerry vyplata",
      "2026-09-07|-1500|Jerry vyplata#2",
      "2026-09-07|-2000|Jerry vyplata",
    ]);
  });

  test("znovu nahratý ten istý súbor dá tie isté kľúče — neduplikuje sa", () => {
    expect(riadky().map(fioKluc)).toEqual(riadky().map(fioKluc));
  });

  test("dlhší export, ktorý obdobie prekrýva, dá pre spoločné dni tie isté kľúče", () => {
    const dlhsi = POHYBY + "\r\n" +
      '"2302732185";"13.09.2026";"-2000";"CZK";"2323438014";"3030";"Jerry vyplata";"Jerry vyplata";"Okamžitá odchozí platba"';
    const p = parseFio(dlhsi);
    if (!p.ok) throw new Error("parse zlyhal");
    const spolocne = p.riadky.filter((r) => r.datum !== "2026-09-13").map(fioKluc);
    expect(spolocne).toEqual(riadky().map(fioKluc));
  });
});

describe("ocislujDuplicity", () => {
  const r = (x: Partial<FioRiadok>): FioRiadok =>
    ({ id: "", datum: "2026-06-10", suma: -1000, protistrana: "Jerry vyplata", poznamka: "", typ: "", kategoria: "", ...x });

  test("riadky s ID sa nečíslujú — ID ich odlíši samo", () => {
    const out = ocislujDuplicity([r({ id: "111" }), r({ id: "222" })]);
    expect(out.map(fioKluc)).toEqual(["fio:111", "fio:222"]);
  });

  test("tri rovnaké bez ID → bez čísla, #2, #3", () => {
    expect(ocislujDuplicity([r({}), r({}), r({})]).map(fioKluc)).toEqual([
      "2026-06-10|-1000|Jerry vyplata",
      "2026-06-10|-1000|Jerry vyplata#2",
      "2026-06-10|-1000|Jerry vyplata#3",
    ]);
  });
});
