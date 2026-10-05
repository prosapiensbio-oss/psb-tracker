// Jedna faktúra za Dana a Moniku (4. 10. 2026): dve položky, každá s menom.
import { describe, expect, it } from "bun:test";

import { fakturaDocument } from "./fakturaHtml";
import { mailFaktury } from "./mailFaktury";
import { klientiFaktury, popisFaktury, type Faktura } from "./vydanaFaktura";

const f: Faktura = {
  cislo: "20261010", klient: "Dan Kouřil", vystavene: "2026-10-30", splatnost: "2026-11-13",
  popis: "6 hodín biomechanického tréningu", ks: 1, cena: 7790, celkom: 15580,
  odberatel: { firma: "DK Consulting, s.r.o.", ico: "29211441", dic: "", ulica: "", psc: "", mesto: "", stat: "", email: "" },
  dalsie: [{ klient: "Monika Schonwalderova", popis: "6 hodín biomechanického tréningu", ks: 1, cena: 7790, celkom: 7790 }],
};

describe("faktúra za viacerých klientov", () => {
  it("doklad má dva riadky, každý s menom, a súčet", () => {
    const html = fakturaDocument(f);
    expect((html.match(/<tr>\s*<td>6 hodín/g) || []).length).toBe(2);
    expect(html).toContain("Monika Schonwalderova");
    expect(html).toContain("Za: Dan Kouřil, Monika Schonwalderova");
    expect(html).toMatch(/15\s580,00/);
  });
  it("mail menuje obe položky", () => {
    expect(klientiFaktury(f)).toEqual(["Dan Kouřil", "Monika Schonwalderova"]);
    expect(popisFaktury(f)).toContain("(Monika Schonwalderova)");
    expect(mailFaktury(f).telo).toContain("(Dan Kouřil)");
  });
  it("faktúra s jednou položkou vyzerá ako doteraz", () => {
    const jedna = { ...f, dalsie: undefined, celkom: 7790 };
    expect(popisFaktury(jedna)).toBe(jedna.popis);
    expect(fakturaDocument(jedna)).not.toContain("Za: Dan Kouřil,");
  });
});
