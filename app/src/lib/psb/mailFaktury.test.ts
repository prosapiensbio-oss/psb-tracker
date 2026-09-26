import { describe, expect, it } from "bun:test";

import { krstne, mailFaktury, menoPrilohy } from "./mailFaktury";
import type { Faktura } from "./vydanaFaktura";

const zaklad: Faktura = {
  cislo: "20261001", klient: "Ing. arch. Anna Nová",
  vystavene: "2026-09-26", splatnost: "2026-10-10",
  popis: "8 lekcií rehabilitačno-kondičného tréningu",
  ks: 1, cena: 9400, celkom: 9400,
  odberatel: { firma: "", ico: "", dic: "", ulica: "", psc: "", mesto: "", stat: "", email: "anna@example.cz" },
};

describe("oslovenie", () => {
  it("z titulov vyberie krstné meno", () => {
    expect(krstne("Ing. arch. Anna Nová")).toBe("Anna");
    expect(krstne("Mgr. Lucie Podolová")).toBe("Lucie");
    expect(krstne("Tomáš Krčmár")).toBe("Tomáš");
  });

  it("človeku tyká — tak, ako Jerry píše z info@", () => {
    const m = mailFaktury(zaklad);
    expect(m.firme).toBe(false);
    expect(m.telo.startsWith("Ahoj Anna,")).toBe(true);
    expect(m.telo).toContain("tenhle mail");
    expect(m.telo).not.toContain("Dobrý den");
  });

  it("firme vyká a podpíše sa celým menom", () => {
    // Doklad otvára účtovníčka, nie človek, ktorý cvičí.
    const m = mailFaktury({ ...zaklad, odberatel: { ...zaklad.odberatel, firma: "FSH Devices s.r.o." } });
    expect(m.firme).toBe(true);
    expect(m.telo.startsWith("Dobrý den,")).toBe(true);
    expect(m.telo).toContain("Mgr. Filip Stráňavský");
    expect(m.telo).not.toContain("Ahoj");
  });

  it("firma s tým istým menom ako klient je fyzická osoba", () => {
    const m = mailFaktury({ ...zaklad, odberatel: { ...zaklad.odberatel, firma: zaklad.klient } });
    expect(m.firme).toBe(false);
  });
});

describe("predmet a príloha", () => {
  it("v predmete je číslo faktúry", () => {
    expect(mailFaktury(zaklad).predmet).toBe("Faktura 20261001 — ProSapiens Biomechanic");
  });

  it("suma aj splatnosť sú v tele po česky", () => {
    const m = mailFaktury(zaklad);
    expect(m.telo).toContain("9 400,00 Kč");
    expect(m.telo).toContain("10.10.2026");
  });

  it("príloha sa volá ako doklad", () => {
    expect(menoPrilohy("20261001")).toBe("Faktura 20261001.pdf");
  });
});
