import { describe, expect, it } from "bun:test";

import { fakturaStranka } from "./fakturaStranka";
import type { Faktura } from "./vydanaFaktura";

const f: Faktura = {
  cislo: "20261014", klient: "Branislav Široký", vystavene: "2026-10-29", splatnost: "2026-11-12",
  popis: "6 hodín tréningu", ks: 1, cena: 7790, celkom: 15680,
  odberatel: { firma: "bobbys cz s.r.o.", ico: "03789217", dic: "CZ03789217", ulica: "Bohunická 652/1", psc: "619 00", mesto: "Brno", stat: "", email: "" },
  dalsie: [
    { klient: "Linda Muth", popis: "", ks: 1, cena: 7790, celkom: 7790 },
    { klient: "Branislav Široký", popis: "Doplatek — Úvodní trénink (26. 10. 2026)", ks: 1, cena: 100, celkom: 100 },
  ],
};

describe("stránka faktúry za odkazom z SMS (29. 10. 2026)", () => {
  it("suma, splatnosť, odberateľ, položky, VS a PDF — Linda nikde", () => {
    const h = fakturaStranka({ ...f, pdfUrl: "?pdf=1", dnes: "2026-10-29", qrUrl: "data:image/gif;base64,AA" });
    expect(h).toContain("15 680 Kč");
    expect(h).toContain("Splatnost 12. 11. 2026");
    expect(h).toContain("bobbys cz s.r.o.");
    expect(h).toContain("Variabilní symbol <b>20261014</b>");
    expect(h).toContain("Stáhnout fakturu (PDF)");
    expect((h.match(/6 hodín tréningu/g) || []).length).toBe(2);
    expect(h).not.toContain("Linda Muth");
    expect(h).not.toContain("<script");
  });
  it("pred splatnosťou si klient vyberie ihneď / v deň splatnosti a QR sa prepne (1. 11. 2026)", () => {
    const h = fakturaStranka({ ...f, pdfUrl: "?pdf=1", dnes: "2026-10-29", qrUrl: "data:image/gif;base64,IHNED", qrNaSplatnost: "data:image/gif;base64,NESKOR" });
    expect(h).toContain("Zaplatit ihned");
    expect(h).toContain("V den splatnosti");
    expect(h).toMatch(/id="psb-kedy-ihned"[^>]*checked/);
    expect(h).toContain("base64,IHNED");
    expect(h).toContain("base64,NESKOR");
    expect((h.match(/data-psb-qr-ulozit/g) || []).length).toBe(2);
    expect(h).not.toContain("<script");
  });
  it("bez druhého QR výber nie je", () => {
    const h = fakturaStranka({ ...f, pdfUrl: "?pdf=1", dnes: "2026-11-20", qrUrl: "data:image/gif;base64,AA" });
    expect(h).not.toContain("Zaplatit ihned");
    expect(h).toContain("Po splatnosti od 12. 11. 2026");
  });
  it("uhradená a stornovaná sa neplatí", () => {
    const u = fakturaStranka({ ...f, uhradeneAt: "2026-11-03", pdfUrl: "?pdf=1", dnes: "2026-11-04" });
    expect(u).toContain("Faktura je uhrazena");
    expect(u).not.toContain("Variabilní symbol");
    expect(fakturaStranka({ ...f, stornoAt: "2026-11-01", pdfUrl: "?pdf=1", dnes: "2026-11-04" })).toContain("Tuto fakturu neplaťte");
  });
});
