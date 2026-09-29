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
  tempo: 4, mesiacov: 4,
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
    expect(v.text).toContain("zostávajú 3 h");
    expect(v.predmet).not.toContain("dochodený");
  });

  it("textová aj HTML podoba nesú tie isté dni", () => {
    const v = mailKlientovi(zaklad);
    // Text nesie celý dátum, os v maili krátky — v stĺpci pod sebou je rok
    // pri každom riadku len šum.
    for (const den of ["28. 9. 2026", "23. 9. 2026", "10. 8. 2026"]) expect(v.text).toContain(den);
    for (const den of ["28. 9.", "23. 9.", "10. 8."]) expect(v.html).toContain(den);
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

  it("tri čísla hore: hodiny, tempo, dĺžka vzťahu", () => {
    const v = mailKlientovi(zaklad);
    expect(v.html).toContain("19 h");
    expect(v.html).toContain("tréningov mesačne");
    expect(v.html).toContain("4 mesiace");
    // „0 h zostáva" medzi ne nepatrí — hovorí to nadpis (Jerry, 29. 9. 2026).
    expect(v.html).not.toContain("zostáva v balíčku");
  });

  it("bez tempa a dĺžky vzťahu zostane len počet hodín", () => {
    const v = mailKlientovi({ ...zaklad, tempo: undefined, mesiacov: undefined });
    expect(v.html).toContain("odtrénované spolu");
    expect(v.html).not.toContain("tréningov mesačne");
  });

  it("logo je príloha, nie odkaz na náš server", () => {
    expect(mailKlientovi(zaklad).html).not.toContain("cid:znacka");
    const v = mailKlientovi({ ...zaklad, logoCid: "logo@psb" });
    expect(v.html).toContain('src="cid:logo@psb"');
    expect(v.html).not.toContain("http");
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

describe("tempoSK", () => {
  it("píše sa na desatinu, ako v profile klienta", () => {
    // Jerry, 29. 9. 2026: „4× mesačne mi príde zbytočné" — zaokrúhlenie
    // robí z čísla dojem odhadu.
    expect(tempoSK(3.94)).toBe("3,9");
    expect(tempoSK(4)).toBe("4,0");
    expect(tempoSK(0.5)).toBe("0,5");
  });
});

describe("koniec osi", () => {
  it("poslednou bodkou je zostatok a nemá dátum", () => {
    const v = mailKlientovi({ ...zaklad, zostatok: 2 });
    // „Zostávajú 2 h" je odpoveď, nie udalosť — dátum by z nej robil tréning.
    expect(v.text.trimEnd().split("\n").find((r) => r.includes("Zostávajú 2 h"))).toBe("  Zostávajú 2 h");
    expect(v.html).toContain("Zostávajú 2 h");
  });

  it("keď appka zostatok nevie, žiadnu poslednú bodku si nevymyslí", () => {
    const v = mailKlientovi({ ...zaklad, zostatok: null });
    expect(v.text).not.toContain("Zostáv");
  });

  it("prázdne riadky v textovej podobe zostávajú", () => {
    const v = mailKlientovi({ ...zaklad, zostatok: 2 });
    expect(v.text.split("\n")[1]).toBe("");
  });
});
