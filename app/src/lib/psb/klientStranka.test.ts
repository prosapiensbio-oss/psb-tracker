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
  it("je česká a zelená — tá istá paleta, akou chodí celá história mailom", () => {
    // Jerry, 1. 10. 2026: „sprav tú stránku česky a svetlú." Svetlá sa
    // ukázala ako nedorozumenie — 2. 10.: „prečo sa z toho zeleného návrhu
    // stal tento biely?" Čeština platí ďalej, farby sa vracajú k mailu.
    const h = klientStranka(zaklad);
    expect(h).toContain('lang="cs"');
    expect(h).toContain("background:#232b1c");
    expect(h).toContain("Zbývá ti 4 h");
    // svetlá paleta zo živého webu patrí stránke PRED úvodným, nie sem
    expect(h).not.toContain("#1A2E24");
    expect(h).not.toContain("#F6F8F6");
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

  it("vodorovná os začína tým, čo bolo naposledy", () => {
    // Jerry, 2. 10. 2026: „chcel by som, aby to začínalo najaktuálnejším dňom
    // a ako sa posúvaš doprava, tak ideš do minulosti."
    const h = klientStranka(zaklad);
    const naposledy = h.indexOf("naposledy");
    expect(naposledy).toBeGreaterThan(-1);
    // Za značkou „naposledy" stojí najnovší bod, nie najstarší.
    const poNej = h.slice(naposledy, naposledy + 400);
    expect(poNej).toContain("15. 9.");
    expect(poNej).not.toContain("9. 9.");
  });

  it("zvislý rozpis ide opačne — najstaršie hore", () => {
    const h = klientStranka(zaklad);
    const rozpis = h.slice(h.indexOf("Rozbalit celý balíček"));
    expect(rozpis.indexOf("Balíček 8 h")).toBeLessThan(rozpis.indexOf("trénink"));
  });

  it("pri dlhu je suma hore a os sa skladá", () => {
    const h = klientStranka({ ...zaklad, platba: { popis: "Balíček 8 h", suma: 9400, ucet: "1/2", sprava: "x" } });
    expect(h.indexOf("K úhradě")).toBeLessThan(h.indexOf("Poslední balíček"));
    expect(h).toContain("Poslední balíček — co se stalo");
  });

  it("bez dlhu os stojí rozbalená a nadpis je obyčajný", () => {
    const h = klientStranka(zaklad);
    expect(h).not.toContain("Poslední balíček — co se stalo");
    expect(h).toContain("Poslední balíček");
  });

  it("otázka Jak ti je sa kladie len pri dochodenom balíčku bez dlhu", () => {
    // Jerry, 2. 10. 2026: vymazať z priebehu balíčka aj z dlhu.
    const pocitovka = "<!--POCITOVKA-->";
    expect(klientStranka({ ...zaklad, zostatok: 0, pocitovka })).toContain(pocitovka);
    expect(klientStranka({ ...zaklad, zostatok: 4, pocitovka })).not.toContain(pocitovka);
    expect(klientStranka({
      ...zaklad, zostatok: 0, pocitovka,
      platba: { popis: "x", suma: 9400, ucet: "1/2", sprava: "y" },
    })).not.toContain(pocitovka);
  });

  it("celá história je úplne dole, pod pocitovkou", () => {
    const h = klientStranka({ ...zaklad, zostatok: 0, pocitovka: "<!--POCITOVKA-->" });
    expect(h.indexOf("<!--POCITOVKA-->")).toBeLessThan(h.indexOf("Chceš celou historii?"));
  });

  it("posuvník osi je skrytý — vyzeral ako ďalší prvok osi", () => {
    expect(klientStranka(zaklad)).toContain("::-webkit-scrollbar");
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

describe("platba na telefóne", () => {
  const platba = { popis: "Balíček 8 h", suma: 9400, ucet: "2702034550/2010", sprava: "Josef Pavek" };
  const zaklad2: VypisKlienta = {
    klient: "Josef Pávek", oslovenie: "Josef", trener: "Terezka",
    os: [{ den: "2026-09-09", popis: "Balíček 8 h", druh: "balicekOd", zostatok: null, dlh: null }],
    zostatok: 0, hodinSpolu: 8, odkedy: "2026-09-09", dnes: "2026-10-02",
  };

  it("QR sa dá uložiť do fotiek — odkaz do banky v Česku neexistuje", () => {
    // Jerry, 2. 10. 2026: „keby pri tom QR bola možnosť kliknúť a predvyplnilo
    // by sa to v ebankingu." SPAYD je štandard pre obsah kódu, nie pre adresu;
    // spoločná schéma na otvorenie banky neexistuje. Galériu vedia všetky.
    const h = klientStranka({ ...zaklad2, platba, qrUrl: "data:image/gif;base64,AAA" });
    expect(h).toContain('download="platba-prosapiens.gif"');
    expect(h).toContain("načíst QR z galerie");
  });

  it("bez QR sa tlačidlo na uloženie nekreslí", () => {
    expect(klientStranka({ ...zaklad2, platba })).not.toContain("Uložit QR do fotek");
  });

  it("číslo účtu je v poli, aby sa dalo skopírovať jedným podržaním", () => {
    const h = klientStranka({ ...zaklad2, platba });
    expect(h).toMatch(/<input value="2702034550\/2010" readonly/);
  });

  it("nič z toho nestojí na JavaScripte", () => {
    expect(klientStranka({ ...zaklad2, platba, qrUrl: "data:image/gif;base64,AAA" })).not.toContain("<script");
  });
});
