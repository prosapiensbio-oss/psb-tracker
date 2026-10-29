// Jedna faktúra za Dana a Moniku (4. 10. 2026): dve položky, každá s menom.
import { describe, expect, it } from "bun:test";

import { fakturaDocument } from "./fakturaHtml";
import { mailFaktury, mailFakturyHtml } from "./mailFaktury";
import { klientiFaktury, popisFaktury, type Faktura } from "./vydanaFaktura";

const f: Faktura = {
  cislo: "20261010", klient: "Dan Kouřil", vystavene: "2026-10-30", splatnost: "2026-11-13",
  popis: "6 hodín biomechanického tréningu", ks: 1, cena: 7790, celkom: 15580,
  odberatel: { firma: "DK Consulting, s.r.o.", ico: "29211441", dic: "", ulica: "", psc: "", mesto: "", stat: "", email: "" },
  dalsie: [{ klient: "Monika Schonwalderova", popis: "6 hodín biomechanického tréningu", ks: 1, cena: 7790, celkom: 7790, naDoklade: true }],
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

// Branislav platí na firmu aj za Lindu (28. 10. 2026): Linda na doklade nemá byť.
describe("ďalší klient bez popisu — na doklade bez mena", () => {
  const bezMena: Faktura = {
    ...f, klient: "Branislav Široký",
    odberatel: { ...f.odberatel, firma: "Firma s.r.o." },
    dalsie: [{ klient: "Linda Muth", popis: "", ks: 1, cena: 7790, celkom: 7790 }],
  };
  it("doklad má dva riadky s popisom hlavnej položky a Lindu nikde", () => {
    const html = fakturaDocument(bezMena);
    expect((html.match(/<tr>\s*<td>6 hodín/g) || []).length).toBe(2);
    expect(html).not.toContain("Linda Muth");
    expect(html).toContain("Za: Branislav Široký");
    expect(html).toMatch(/15\s580,00/);
  });
  it("mail Lindu nemenuje; rovnaké položky sa zlúčia", () => {
    expect(popisFaktury(bezMena)).toBe("6 hodín biomechanického tréningu (2×)");
    const m = mailFaktury(bezMena);
    expect(m.telo).not.toContain("Linda Muth");
    expect(mailFakturyHtml(bezMena)).not.toContain("Linda Muth");
  });
  it("vlastný popis meno NEPRIDÁ — rozhoduje len „meno na faktúre“ (29. 10. 2026)", () => {
    const sPopisom: Faktura = { ...bezMena, dalsie: [{ klient: "Linda Muth", popis: "Předplatné 6 h", ks: 1, cena: 7790, celkom: 7790 }] };
    const html = fakturaDocument(sPopisom);
    expect(html).toContain("Předplatné 6 h");
    expect(html).not.toContain("Linda Muth");
    expect(mailFaktury(sPopisom).telo).not.toContain("Linda Muth");
    const sMenom: Faktura = { ...sPopisom, dalsie: [{ ...sPopisom.dalsie![0], naDoklade: true }] };
    expect(fakturaDocument(sMenom)).toContain("Linda Muth");
  });
  it("Kokpit o Linde vie — platba sa rozdelí", () => {
    expect(klientiFaktury(bezMena)).toEqual(["Branislav Široký", "Linda Muth"]);
  });
});
