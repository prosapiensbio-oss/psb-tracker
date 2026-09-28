import { describe, expect, it } from "bun:test";

import { mailKlientovi, type VypisKlienta } from "./mailKlientovi";

const zaklad: VypisKlienta = {
  klient: "Richard Matl", oslovenie: "Richard", trener: "Jerry",
  treningy: [{ den: "2026-09-28", cas: "17:00" }, { den: "2026-09-23", cas: "17:00" }],
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

  it("textová aj HTML podoba nesú tie isté tréningy", () => {
    const v = mailKlientovi(zaklad);
    for (const den of ["28. 9. 2026", "23. 9. 2026"]) {
      expect(v.text).toContain(den);
      expect(v.html).toContain(den);
    }
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
