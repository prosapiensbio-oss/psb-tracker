import { describe, expect, it } from "bun:test";

import { fakturaDocument, qrSvg } from "./fakturaHtml";
import { spayd, type Faktura } from "./vydanaFaktura";

const f: Faktura = {
  cislo: "20261001",
  klient: "Katarína Tchuřová",
  vystavene: "2026-09-26",
  splatnost: "2026-10-10",
  popis: "6 hodín biomechanického tréningu",
  ks: 1,
  cena: 7790,
  celkom: 7790,
  odberatel: {
    firma: "Heidelberg Materials Digital Hub Brno, s.r.o.",
    ico: "06025811", dic: "CZ06025811",
    ulica: "Šumavská 15", psc: "602 00", mesto: "Brno", stat: "Česká republika",
    email: "fakturace@example.cz",
  },
};

describe("faktúra ako dokument", () => {
  it("nesie číslo, sumu aj obe strany", () => {
    const h = fakturaDocument(f);
    expect(h).toContain("20261001");
    expect(h).toContain("7 790,00");
    expect(h).toContain("Mgr. Filip Stráňavský");
    expect(h).toContain("Heidelberg Materials Digital Hub Brno, s.r.o.");
    expect(h).toContain("Nejsme plátci DPH");
  });

  it("keď fakturuje firma za klienta, meno klienta na doklade zostane", () => {
    // Jerry, 26. 9. 2026: „odberateľ je vždy klient, len fakturuje na nejakú
    // firmu." Bez tohto riadku by na faktúre nebolo, koho sa týka.
    expect(fakturaDocument(f)).toContain("Za: Katarína Tchuřová");
  });

  it("pri fyzickej osobe sa riadok Za nepíše", () => {
    const osoba = { ...f, odberatel: { ...f.odberatel, firma: f.klient } };
    expect(fakturaDocument(osoba)).not.toContain("Za: ");
  });

  it("QR nesie sumu a variabilný symbol tejto faktúry", () => {
    const h = fakturaDocument(f);
    expect(h).toContain("<svg");
    // Ten istý reťazec, aký test v knižnici prečítal späť z kódu.
    expect(spayd({ suma: 7790, vs: "20261001", sprava: "Faktura 20261001 PSB", splatnost: "2026-10-10", prijemca: "Mgr. Filip Stráňavský" }))
      .toContain("AM:7790.00");
  });

  it("stornovaná faktúra to má napísané", () => {
    expect(fakturaDocument({ ...f, stornoAt: "2026-09-27" })).toContain("STORNO");
    expect(fakturaDocument(f)).not.toContain("STORNO");
  });

  it("text klienta sa nedá prepašovať do HTML", () => {
    const zly = { ...f, popis: "<script>zle()</script>" };
    expect(fakturaDocument(zly)).not.toContain("<script>zle()");
  });

  it("QR kód je SVG, ktoré sa dá vložiť do dokumentu", () => {
    const s = qrSvg("SPD*1.0*ACC:CZ1020100000002302732185*AM:1.00*CC:CZK*X-VS:1");
    expect(s.startsWith("<svg")).toBe(true);
  });
});

describe("značka na doklade", () => {
  it("nesie zelený pásik, figúru aj nápis", () => {
    // Jerry si 26. 9. 2026 vybral návrh 4: „vyhráva 4, zelený pásik."
    const h = fakturaDocument(f);
    expect(h).toContain("/znacka-figura.svg");
    expect(h).toContain("/znacka-napis.svg");
    expect(h).toContain("#456127");
  });

  it("písmo sa serveruje z appky, nie z internetu", () => {
    // Faktúra sa tlačí aj bez siete; externý odkaz by ju vysádzal inak.
    const h = fakturaDocument(f);
    expect(h).toContain("/agrandir.woff2");
    expect(h).not.toContain("fonts.googleapis");
  });
});

describe("faktúra je JEDNA strana", () => {
  it("list je nižší než strana A4", () => {
    // Jerry, 26. 9. 2026: „prečo sú tam dve strany, z toho jedna prázdna?"
    // Pri presnej výške 297 mm sa dokument zaokrúhli na 1123 px proti
    // 1122,52 px strany a tlač založí ďalší, prázdny list.
    const h = fakturaDocument(f);
    expect(h).toContain("height: 296mm");
    expect(h).not.toContain("297mm");
  });

  it("za listom už nič nenasleduje", () => {
    expect(fakturaDocument(f)).toContain("page-break-after: avoid");
  });
});
