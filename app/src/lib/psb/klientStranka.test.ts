import { describe, expect, it } from "bun:test";

import { klientStranka } from "./klientStranka";
import type { VypisKlienta } from "./mailKlientovi";

const zaklad: VypisKlienta = {
  klient: "Marketa Resnerová", oslovenie: "Marketa", trener: "Terezka",
  os: [
    { den: "2026-09-09", popis: "Balíček 8 h", druh: "balicekOd", zostatok: null, dlh: null },
    { den: "2026-09-15", cas: "08:30", popis: "tréning", druh: "trening", zostatok: 7, dlh: null },
  ],
  zostatok: 4, hodinSpolu: 106, odkedy: "2025-01-07", dnes: "2026-10-01",
};

describe("klientStranka", () => {
  it("je česká a svetlá — klient nie je používateľ Kokpitu", () => {
    const h = klientStranka(zaklad);
    expect(h).toContain('lang="cs"');
    expect(h).toContain("background:#FFFFFF");
    expect(h).toContain("Zbývá ti 4 h");
    // tmavá paleta z mailu sa sem nesmie dostať
    expect(h).not.toContain("#232b1c");
    expect(h).not.toContain("#f2f0e4");
  });

  it("dochodený balíček a hodiny nad rámec sú iné vety než zostatok", () => {
    expect(klientStranka({ ...zaklad, zostatok: 0 })).toContain("dochozený");
    expect(klientStranka({ ...zaklad, zostatok: -2 })).toContain("2 h nad rámec");
  });

  it("QR a suma sa kreslia LEN keď klient dlží", () => {
    expect(klientStranka(zaklad)).not.toContain("K úhradě");
    const h = klientStranka({
      ...zaklad,
      platba: { popis: "OFF - 8 hodín offline", suma: 9400, ucet: "123/0300", sprava: "Daniela Šašinkova" },
      qrUrl: "data:image/png;base64,AAA",
    });
    expect(h).toContain("K úhradě");
    expect(h).toContain("9 400 Kč");
    expect(h).toContain("data:image/png;base64,AAA");
    // meno do správy pre príjemcu — podľa neho sa platba páruje
    expect(h).toContain("Daniela Šašinkova");
  });

  it("nulový dlh platobný blok nekreslí — QR na nulu je výzva na omyl", () => {
    const h = klientStranka({ ...zaklad, platba: { popis: "x", suma: 0, ucet: "1", sprava: "y" } });
    expect(h).not.toContain("K úhradě");
  });

  it("CTA na celú históriu je FORM, nie odkaz — odkaz by raz odoslal robot", () => {
    const h = klientStranka(zaklad);
    expect(h).toContain('<input type="hidden" name="akcia" value="historia">');
    expect(h).toContain('method="post"');
    expect(h).toContain("Poslat na e-mail");
  });

  it("po odoslaní histórie sa tlačidlo zmení na potvrdenie", () => {
    const h = klientStranka({ ...zaklad, historiaPoslana: true });
    expect(h).toContain("celou historii na e-mail");
    expect(h).not.toContain('name="akcia" value="historia"');
  });

  it("slovenské názvy z PTmindera sa na českej stránke prekladajú", () => {
    const h = klientStranka({
      ...zaklad,
      os: [
        { den: "2026-09-20", popis: "Doplnenie členstva", druh: "balicekOd", zostatok: null, dlh: null },
        { den: "2026-09-26", popis: "zaplatené 4 700 Kč", druh: "platba", zostatok: null, dlh: null },
      ],
    });
    expect(h).toContain("Doplnění hodin");
    expect(h).not.toContain("Doplnenie");
    expect(h).toContain("zaplaceno");
    expect(h).not.toContain("zaplatené");
  });

  it("preklad platí aj v platobnom bloku", () => {
    const h = klientStranka({ ...zaklad, platba: { popis: "Doplnenie členstva", suma: 9400, ucet: "1/2", sprava: "x" } });
    expect(h).toContain("Doplnění hodin");
    expect(h).not.toContain("Doplnenie");
  });

  it("QR sa kreslí len s adresou obrázka", () => {
    const p = { popis: "Balíček 8 h", suma: 9400, ucet: "1/2", sprava: "x" };
    expect(klientStranka({ ...zaklad, platba: p, qrUrl: "data:image/gif;base64,AAA" })).toContain('alt="QR platba"');
    expect(klientStranka({ ...zaklad, platba: p })).not.toContain("QR platba");
  });

  it("cudzí text sa neprepašuje do HTML", () => {
    const h = klientStranka({ ...zaklad, trener: 'Zly<script>zle()</script>' });
    expect(h).not.toContain("<script>zle()");
    expect(h).toContain("&lt;script&gt;");
  });

  it("bez JavaScriptu — otvára sa z SMS, skript sa nemusí načítať", () => {
    expect(klientStranka(zaklad)).not.toContain("<script");
  });
});
