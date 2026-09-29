import { describe, expect, it } from "bun:test";

import { mailKlientovi, tempoSK, type VypisKlienta } from "./mailKlientovi";

const zaklad: VypisKlienta = {
  klient: "Richard Matl", oslovenie: "Richard", trener: "Jerry",
  os: [
    { den: "2026-08-10", popis: "OFF - 6h BEZ viazanosti", druh: "balicekOd" },
    { den: "2026-08-10", cas: "17:00", popis: "tréning", druh: "trening", zostatok: 6, dlh: 1 },
    { den: "2026-08-23", popis: "zaplatené 7 790 Kč", druh: "platba" },
    { den: "2026-09-23", cas: "17:00", popis: "tréning", druh: "trening", zostatok: 1, dlh: null },
    { den: "2026-09-28", cas: "17:00", popis: "tréning", druh: "trening", zostatok: null, dlh: 1 },
  ],
  zostatok: 0, hodinSpolu: 19, odkedy: "2026-06-01",
  mesacne: [{ mesiac: "2026-08", pocet: 4 }, { mesiac: "2026-09", pocet: 3 }],
};

describe("mailKlientovi", () => {
  it("keď balíček došiel, povie to hneď v predmete aj v prvej vete", () => {
    const v = mailKlientovi(zaklad);
    expect(v.predmet).toContain("dochodený");
    expect(v.text).toContain("dnes si mal poslednú hodinu");
    expect(v.html).toContain("dnes si mal poslednú hodinu");
  });

  it("keď hodiny ešte sú, povie koľko", () => {
    const v = mailKlientovi({ ...zaklad, zostatok: 3 });
    expect(v.text).toContain("zostáva 3 h");
    expect(v.predmet).not.toContain("dochodený");
  });

  it("textová aj HTML podoba nesú tie isté dni", () => {
    const v = mailKlientovi(zaklad);
    for (const den of ["28. 9. 2026", "23. 9. 2026", "10. 8. 2026"]) {
      expect(v.text).toContain(den);
      expect(v.html).toContain(den);
    }
  });

  it("os ukazuje, ako sa balíček míňal — hodiny aj mínus", () => {
    const v = mailKlientovi(zaklad);
    expect(v.html).toContain("Ako sa míňal balíček");
    expect(v.html).toContain("<b>1 h</b>");
    expect(v.html).toContain("−1");
    // Platba je bod na osi rovnako ako tréning.
    expect(v.html).toContain("zaplatené 7 790 Kč");
  });

  it("tréning pred platbou nesie hodiny AJ mínus", () => {
    // Jerry, 28. 9. 2026: „ak nezaplatil, bude tam 6 h − 1." Sú to dve rôzne
    // veci a jedna nesmie prekryť druhú.
    const v = mailKlientovi(zaklad);
    expect(v.html).toContain("<b>6 h</b>");
    expect(v.text).toContain("tréning (6 h, −1)");
  });

  it("mesiace sa píšu po slovensky a stĺpec najväčšieho je najdlhší", () => {
    const v = mailKlientovi(zaklad);
    expect(v.html).toContain("august 2026");
    expect(v.html).toContain('width="100%" style="height:12px');
  });

  it("jediný mesiac stĺpce nekreslí — graf o jednom stĺpci nič nehovorí", () => {
    const v = mailKlientovi({ ...zaklad, mesacne: [{ mesiac: "2026-09", pocet: 3 }] });
    expect(v.html).not.toContain("Koľko si chodil");
  });

  it("bez platby nie je ani QR, ani suma", () => {
    const v = mailKlientovi(zaklad);
    expect(v.html).not.toContain("Ďalší balíček");
    expect(v.html).not.toContain("cid:");
  });

  it("s platbou nesie sumu, účet, variabilný symbol aj QR", () => {
    const v = mailKlientovi({
      ...zaklad,
      platba: { popis: "OFF - 6h BEZ viazanosti", suma: 7790, ucet: "2302732185/2010", sprava: "Richard Matl" },
      qrCid: "qr@psb",
    });
    expect(v.html).toContain("7 790 Kč");
    expect(v.html).toContain("2302732185/2010");
    expect(v.html).toContain('src="cid:qr@psb"');
    expect(v.text).toContain("do poznámky uveď: Richard Matl");
  });

  it("meno klienta sa do HTML dostane bezpečne", () => {
    const v = mailKlientovi({ ...zaklad, oslovenie: "Ri<script>" });
    expect(v.html).toContain("Ri&lt;script&gt;");
    expect(v.html).not.toContain("<script>");
  });

  it("osobná veta sa pridá len keď je napísaná", () => {
    expect(mailKlientovi(zaklad).html).not.toContain("margin-top:10px\">Uvidíme");
    expect(mailKlientovi({ ...zaklad, odkaz: "Uvidíme sa v pondelok." }).text).toContain("Uvidíme sa v pondelok.");
  });
});

describe("tempo", () => {
  it("hovorí sa slovom, číslo je v zátvorke", () => {
    // „2,3 tréningu mesačne" nikto nepovie; „zhruba raz týždenne" áno.
    expect(tempoSK(4.1)).toBe("zhruba raz týždenne (4,1× mesačne)");
    expect(tempoSK(2)).toBe("zhruba každé dva týždne (2× mesačne)");
    expect(tempoSK(0.5)).toBe("menej než raz mesačne (0,5× mesačne)");
  });

  it("bez tempa sa riadok nekreslí", () => {
    expect(mailKlientovi(zaklad).html).not.toContain("Tempo:");
    expect(mailKlientovi({ ...zaklad, tempo: 4 }).html).toContain("Tempo:");
    expect(mailKlientovi({ ...zaklad, tempo: 4 }).text).toContain("Tempo: zhruba raz týždenne");
  });
});
