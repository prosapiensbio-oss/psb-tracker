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

  it("tri nadpisy podľa stavu — inak sa nemení nič", () => {
    // Jerry, 2. 10. 2026: „okrem toho sa už len upravuje nadpis — a to je
    // definované počtom a aktuálnou situáciou, pričom obsah odkazu vyzerá
    // vždy rovnako."
    expect(klientStranka({ ...zaklad, zostatok: 4 })).toContain("Zbývá ti 4 h");
    expect(klientStranka({ ...zaklad, zostatok: 0 })).toContain("Poslední hodina");
    expect(klientStranka({ ...zaklad, zostatok: -3 })).toContain("Nad rámec 3 h");
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

  it("os stojí rozbalená vždy, aj pri dlhu — stránka má jednu podobu", () => {
    const h = klientStranka({ ...zaklad, platba: { popis: "Balíček 8 h", suma: 9400, ucet: "1/2", sprava: "x" } });
    expect(h).not.toContain("Poslední balíček — co se stalo");
    expect(h.indexOf("Poslední balíček")).toBeLessThan(h.indexOf("K úhradě"));
  });

  it("bez dlhu os stojí rozbalená a nadpis je obyčajný", () => {
    const h = klientStranka(zaklad);
    expect(h).not.toContain("Poslední balíček — co se stalo");
    expect(h).toContain("Poslední balíček");
  });

  it("otázky sú na stránke vždy — jedna podoba, nech je stav akýkoľvek", () => {
    const pocitovka = "<!--POCITOVKA-->";
    for (const zostatok of [4, 0, -3]) {
      expect(klientStranka({ ...zaklad, zostatok, pocitovka })).toContain(pocitovka);
    }
    expect(klientStranka({
      ...zaklad, zostatok: -3, pocitovka,
      platba: { popis: "x", suma: 9400, ucet: "1/2", sprava: "y" },
    })).toContain(pocitovka);
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

describe("prečo balíček nezačína na plnom počte", () => {
  it("stránka to povie klientovi, nielen trénerovi", () => {
    // Jerry, 2. 10. 2026: „znovu mi tam je předplatné 6 hodin, chybí tam 5 h,
    // tá bola kedy?" Vysvetlenie bolo len na internej obrazovke.
    const h = klientStranka({
      klient: "Lukas Hanus", oslovenie: "Lukas", trener: "Jerry",
      os: [
        { den: "2026-09-09", popis: "Předplatné 6 h", druh: "balicekOd", zostatok: null, dlh: null, prevzate: 2 },
        { den: "2026-09-09", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 4, dlh: null },
      ],
      zostatok: 4, hodinSpolu: 1, odkedy: "2026-09-09", dnes: "2026-10-02",
    } as never);
    expect(h).toContain("2 h padly na starší tréninky");
  });

  it("keď balíček nič nepreberal, veta tam nie je", () => {
    expect(klientStranka(zaklad)).not.toContain("padly na starší tréninky");
  });
});
