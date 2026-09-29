import { describe, expect, it } from "bun:test";

import { mailFakturyHtml, TRENERI, krstne, mailFaktury, menoPrilohy } from "./mailFaktury";
import { FARBY_MAILU } from "./mailKlientovi";
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

describe("podpis patrí trénerovi klienta", () => {
  it("Terezkin klient dostane jej meno a jej telefón", () => {
    // Jerry, 26. 9. 2026: „niektorí klienti patria Terezke a niektorí mne."
    const m = mailFaktury(zaklad, { trener: "Terezka" });
    expect(m.telo).toContain("Terezka");
    expect(m.telo).toContain(TRENERI.Terezka.telefon);
    expect(m.telo).not.toContain("Filip");
  });

  it("bez trénera sa podpíše Jerry", () => {
    const m = mailFaktury(zaklad);
    expect(m.telo).toContain("Filip");
    expect(m.telo).toContain(TRENERI.Jerry.telefon);
  });

  it("neznámy tréner appku nezhodí", () => {
    expect(mailFaktury(zaklad, { trener: "Matyáš" }).telo).toContain("Filip");
  });
});

describe("tykanie a vykanie sa dá prepnúť", () => {
  it("človeku sa dá vykať, keď si to Jerry vyberie", () => {
    const m = mailFaktury(zaklad, { vykanie: true });
    expect(m.vykanie).toBe(true);
    expect(m.telo.startsWith("Dobrý den,")).toBe(true);
    expect(m.telo).toContain("Mgr. Filip Stráňavský");
  });

  it("firme sa dá aj tykať", () => {
    const m = mailFaktury({ ...zaklad, odberatel: { ...zaklad.odberatel, firma: "FSH Devices s.r.o." } }, { vykanie: false });
    expect(m.firme).toBe(true);
    expect(m.vykanie).toBe(false);
    expect(m.telo.startsWith("Ahoj Anna,")).toBe(true);
  });

  it("bez voľby rozhoduje, či je to firma", () => {
    expect(mailFaktury(zaklad).vykanie).toBe(false);
    expect(mailFaktury({ ...zaklad, odberatel: { ...zaklad.odberatel, firma: "FSH Devices s.r.o." } }).vykanie).toBe(true);
  });
});

describe("mailFakturyHtml — návrh 1, rovnaký šat ako výpis", () => {
  const f: Faktura = {
    ...zaklad, klient: "Martin Vaško", splatnost: "2026-10-11",
    popis: "Rehabilitačno-kondiční cvičení — balíček 6 h", cena: 7790, celkom: 7790,
  };

  it("nesie sumu, VS, splatnosť aj položku", () => {
    const h = mailFakturyHtml(f, { qrCid: "qr@psb", logoCid: "logo@psb" });
    expect(h).toContain("7 790 Kč");
    expect(h).toContain("VS 20261001");
    expect(h).toContain("splatnost 11. 10. 2026");
    expect(h).toContain("cid:qr@psb");
    expect(h).toContain("cid:logo@psb");
    expect(h).toContain("Faktura 20261001.pdf");
  });

  it("má tú istú paletu ako mail s výpisom — jeden zdroj farieb", () => {
    expect(mailFakturyHtml(f)).toContain(FARBY_MAILU.pozadie);
    expect(mailFakturyHtml(f)).toContain(FARBY_MAILU.platba);
  });

  it("tykanie oslovuje krstným menom, vykanie bez mena", () => {
    expect(mailFakturyHtml(f, { vykanie: false })).toContain("Martin, posílám fakturu");
    expect(mailFakturyHtml(f, { vykanie: true })).toContain("Dobrý den, posílám fakturu č. 20261001");
  });

  it("osobná veta prebije predvolenú", () => {
    const h = mailFakturyHtml(f, { uvod: "tady je slíbená faktura, měj se!" });
    expect(h).toContain("Martin, tady je slíbená faktura");
    expect(h).not.toContain("posílám fakturu —");
  });

  it("bez loga zostáva textová značka — mail nesmie prísť bez hlavy", () => {
    expect(mailFakturyHtml(f)).toContain("ProSapiens Biomechanic");
  });
});
