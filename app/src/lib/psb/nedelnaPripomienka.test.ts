import { describe, expect, it } from "bun:test";

import { jeCasPripomienky, textPripomienky, vPrahe } from "./nedelnaPripomienka";

describe("jeCasPripomienky", () => {
  it("nedeľa na obed v lete (UTC+2)", () => {
    expect(jeCasPripomienky(new Date("2026-10-04T10:00:00Z"))).toBe(true);
  });

  it("nedeľa podvečer", () => {
    expect(jeCasPripomienky(new Date("2026-10-04T16:00:00Z"))).toBe(true);
  });

  it("nedeľa ráno nie — čísla ešte nikto nepozrel", () => {
    expect(jeCasPripomienky(new Date("2026-10-04T05:00:00Z"))).toBe(false);
  });

  it("v stredu na obed nie", () => {
    expect(jeCasPripomienky(new Date("2026-09-30T10:00:00Z"))).toBe(false);
  });

  it("v zime je Praha UTC+1", () => {
    // 6. 12. 2026 je nedeľa; 11:00 UTC = 12:00 v Prahe.
    expect(vPrahe(new Date("2026-12-06T11:00:00Z"))).toEqual({ den: 0, hodina: 12 });
    expect(jeCasPripomienky(new Date("2026-12-06T11:00:00Z"))).toBe(true);
  });
});

describe("textPripomienky", () => {
  const k = (meno: string, zostatok: number, odvodene = false) => ({ meno, trener: "Jerry", zostatok, odvodene });

  it("keď nikto nečaká, nepošle sa nič", () => {
    expect(textPripomienky([])).toBeNull();
  });

  it("mená sa vypisujú, nie počítajú — inak sa appka musí otvoriť", () => {
    const v = textPripomienky([k("Vítězslav Papiež", -2), k("Richard Matl", 0)]);
    expect(v?.titulok).toBe("Komu napísať (2)");
    expect(v?.text).toBe("Vítězslav Papiež — −2 h\nRichard Matl — dochodené");
  });

  it("dopočítaný zostatok nesie ≈", () => {
    expect(textPripomienky([k("Anna Nová", 0, true)])?.text).toBe("Anna Nová — ≈dochodené");
  });

  it("nad päť sa zvyšok zhrnie číslom", () => {
    const v = textPripomienky([1, 2, 3, 4, 5, 6, 7].map((n) => k(`Klient ${n}`, -n)));
    expect(v?.text.split("\n")).toHaveLength(6);
    expect(v?.text).toContain("a ďalší 2");
  });

  it("nerozhodnuté hodiny idú do tej istej správy ako podmienka", () => {
    const v = textPripomienky([k("Anna Nová", 0)], 3);
    expect(v?.text).toContain("3 hodiny bez odpovede");
    expect(v?.text).toContain("najprv tie");
  });
});
