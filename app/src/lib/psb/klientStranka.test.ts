import { describe, expect, it } from "bun:test";

import { klientStranka, SADZBA } from "./klientStranka";
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
    // Jerry, 8. 10. 2026: „Nad rámec nahradiť Nezaplatené a dať to červeným."
    const minus = klientStranka({ ...zaklad, zostatok: -3 });
    expect(minus).toContain("Nezaplaceno 3 h");
    expect(minus).not.toContain("Nad rámec");
    // Nadpis nesie farbu mínusu, nie bielu.
    expect(minus.slice(minus.indexOf("<h1"), minus.indexOf("Nezaplaceno"))).toContain(SADZBA.minus);
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

  it("žiadne listovanie do strany — odpočet stojí pod sebou", () => {
    // Jerry, 8. 10. 2026: „posuvník doprava jednotlivých hodín daj preč
    // a nechaj iba pre klientov odpočítavanie hodín."
    const h = klientStranka(zaklad);
    expect(h).not.toContain("posouvej doprava");
    expect(h).not.toContain("overflow-x:auto");
    // A ani druhé rozbaľovanie — rozpis JE tá os.
    expect(h).not.toContain("Rozbalit celý balíček");
  });

  it("odpočet ide najstaršie hore — ako sa číta príbeh", () => {
    const h = klientStranka(zaklad);
    // Len samotný blok osi: slovo „trénink" je aj v nadpise stránky.
    const os = h.slice(h.indexOf("Poslední balíček"));
    expect(os.indexOf("Balíček 8 h")).toBeLessThan(os.indexOf("trénink"));
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

  it("otázky kreslí stránka, keď ich dostane — rozhoduje route", () => {
    // Jerry, 2. 10. 2026: „v Zostávajú hodiny by som dal preč Jak ti je."
    // Rozhodnutie je v `v.$token.tsx` (prázdny reťazec pri zostatku > 0),
    // stránka len vykreslí, čo dostane — inak by to pravidlo bolo na dvoch
    // miestach a raz by sa rozišlo.
    const pocitovka = "<!--POCITOVKA-->";
    expect(klientStranka({ ...zaklad, zostatok: -3, pocitovka })).toContain(pocitovka);
    expect(klientStranka({ ...zaklad, zostatok: 4, pocitovka: "" })).not.toContain(pocitovka);
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

  it("Uložit QR otvorí zdieľanie (iPhone → Uložit obrázek), a obsluha je platný JavaScript", () => {
    const h = klientStranka({ ...zaklad2, platba, qrUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" });
    const m = /download="platba-prosapiens\.gif" onclick="([^"]+)"/.exec(h);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("navigator.share");
    // Atribút sa musí dať preložiť ako telo funkcie — preklep by tlačidlo ticho rozbil.
    expect(() => new Function(m![1].replace(/&#39;/g, "'"))).not.toThrow();
  });

  it("nič z toho nestojí na JavaScripte", () => {
    expect(klientStranka({ ...zaklad2, platba, qrUrl: "data:image/gif;base64,AAA" })).not.toContain("<script");
  });
});

describe("prečo balíček nezačína na plnom počte", () => {
  // Do 3. 10. 2026 to hovorila veta „2 h padly na starší tréninky". Odkedy
  // tréning nesie mínus AJ hodinu, hovorila to isté druhýkrát a Jerry ju dal
  // preč: „týmto zápiskom je tá veta zbytočná."
  const prevzal = {
    klient: "Lukas Hanus", oslovenie: "Lukas", trener: "Jerry",
    os: [
      { den: "2026-08-25", cas: "10:30", popis: "tréning", druh: "trening", zostatok: 6, dlh: 1 },
      { den: "2026-09-09", popis: "Předplatné 6 h", druh: "balicekOd", zostatok: null, dlh: null, prevzate: 1, prevzateDni: ["2026-08-25"] },
      { den: "2026-09-09", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 5, dlh: null },
    ],
    zostatok: 5, hodinSpolu: 2, odkedy: "2026-08-01", dnes: "2026-10-03",
  } as never;

  it("povedia to čísla, nie veta navyše", () => {
    const h = klientStranka(prevzal);
    expect(h).toContain("−1</span> <span>6 h</span>");
    expect(h).not.toContain("padly na");
  });
});

describe("ponuka ďalšieho balíčka", () => {
  const zaklad3: VypisKlienta = {
    klient: "Lukas Hanus", oslovenie: "Lukas", trener: "Jerry",
    os: [{ den: "2026-09-09", popis: "6h Předplatné", druh: "balicekOd", zostatok: null, dlh: null }],
    zostatok: 0, hodinSpolu: 6, odkedy: "2026-03-01", dnes: "2026-10-02",
  };
  const novy = (odpocet: number) => ({ popis: "6h Předplatné", suma: 6990, ucet: "1/2", sprava: "Lukas Hanus", odpocet, novy: true });

  it("pri dochodenom na nulu je to NOVÝ BALÍČEK, nie dlh", () => {
    // Odvodzovať to z `odpocet > 0` nešlo: kto dochodil presne na nulu, má
    // odpočet nula a stále si kupuje ďalší balíček.
    const h = klientStranka({ ...zaklad3, platba: novy(0) });
    expect(h).toContain("Nový balíček");
    expect(h).not.toContain("K úhradě");
  });

  it("nad rámec povie, koľko hodín sa z neho hneď odpíše", () => {
    expect(klientStranka({ ...zaklad3, zostatok: -3, platba: novy(3) })).toContain("3 h se hned odečte");
  });

  it("otvorený dlh zostáva K úhradě", () => {
    const h = klientStranka({ ...zaklad3, platba: { popis: "nezaplacený balíček", suma: 9400, ucet: "1/2", sprava: "x" } });
    expect(h).toContain("K úhradě");
    expect(h).not.toContain("Nový balíček");
  });
});

describe("nadpis osi hovorí, koľko histórie klient vidí", () => {
  const z = {
    klient: "Lukas Hanus", oslovenie: "Lukas", trener: "Jerry",
    os: [
      { den: "2026-09-09", popis: "6h Balíček", druh: "balicekOd" as const, zostatok: null, dlh: null },
      { den: "2026-09-12", cas: "16:00", popis: "tréning", druh: "trening" as const, zostatok: 5, dlh: null },
    ],
    zostatok: 5, hodinSpolu: 1, odkedy: "2026-02-01", dnes: "2026-10-03",
  };

  it("jeden balíček sa volá balíček, dva sa volajú dva", () => {
    expect(klientStranka({ ...z, balickov: 1 })).toContain("Poslední balíček");
    const dva = klientStranka({ ...z, balickov: 2 });
    expect(dva).toContain("Poslední dva balíčky");
    expect(dva).not.toContain("Rozbalit vše pod sebou");
  });

  it("celá história sa tak aj volá", () => {
    expect(klientStranka({ ...z, balickov: 0 })).toContain("Celá historie");
  });

  it("bez údaja ostáva pri poslednom balíčku", () => {
    expect(klientStranka(z)).toContain("Poslední balíček");
  });
});

describe("odpočet hodín sa nepretrhne", () => {
  // Jerryho reťaz z 3. 10. 2026: balíček 10. 8. prevzal tréningy 24. a 26. 7.,
  // takže tie nesú hodiny 6 a 5 a rad pokračuje 4, 3, 2, 1.
  const z = {
    klient: "Lukas Hanus", oslovenie: "Lukas", trener: "Jerry",
    os: [
      { den: "2026-07-24", cas: "09:00", popis: "tréning", druh: "trening" as const, zostatok: 6, dlh: 1 },
      { den: "2026-07-26", cas: "10:00", popis: "tréning", druh: "trening" as const, zostatok: 5, dlh: 2 },
      { den: "2026-08-10", popis: "6h Předplatné", druh: "balicekOd" as const, zostatok: null, dlh: null, prevzate: 2, prevzateDni: ["2026-07-24", "2026-07-26"] },
      { den: "2026-08-10", cas: "11:00", popis: "tréning", druh: "trening" as const, zostatok: 4, dlh: null },
      { den: "2026-08-25", cas: "10:30", popis: "tréning", druh: "trening" as const, zostatok: null, dlh: 1 },
    ],
    zostatok: -1, hodinSpolu: 4, odkedy: "2026-02-01", dnes: "2026-10-03",
  };
  const h = klientStranka(z);

  it("prevzatý tréning ukáže hodinu, nie mínus", () => {
    // 6 h aj 5 h musia byť na osi — a hodina stojí vedľa mínusu, nie namiesto.
    expect(h).toContain("6 h</span>");
    expect(h).toContain("5 h</span>");
    expect(h).toContain("−1</span> <span>6 h</span>");
  });

  it("prevzatý tréning nesie OBE čísla — mínus aj hodinu", () => {
    // Jerry, 3. 10. 2026: „−1 6h, −2 5h, −3 4h — takto by to malo byť."
    const h2 = klientStranka(z);
    expect(h2).toContain("−1</span> <span>6 h</span>");
    expect(h2).toContain("−2</span> <span>5 h</span>");
  });

  it("tréning bez balíčka ukáže, koľkou hodinou sa stane po zaplatení", () => {
    const h3 = klientStranka({
      ...z,
      os: [{ den: "2026-09-25", cas: "16:00", popis: "tréning", druh: "trening" as const, zostatok: null, dlh: 1, buduca: 6 }],
    });
    // Mínus je stav, budúca hodina je predpoveď — preto je tlmená.
    expect(h3).toContain("−1</span>");
    expect(h3).toContain("6 h</span>");
  });

  it("mínus zostáva tam, kde hodina naozaj nie je", () => {
    const sam = klientStranka({ ...z, os: [z.os[4]] });
    expect(sam).toContain("−1</span>");
    expect(sam).not.toContain("6 h</span>");
  });
});

describe("ľavý stĺpec je odpočet hodín a nič iné", () => {
  it("balíček ani platba číslo nemajú — nesie ho ich názov", () => {
    // Jerry, 3. 10. 2026: „tu je zbytočné 6h, pretože to je předplatné."
    const h = klientStranka({
      klient: "Kto Vie", oslovenie: "Kto", trener: "Jerry",
      os: [
        { den: "2026-09-09", popis: "6h Předplatné", druh: "balicekOd", zostatok: null, dlh: null },
        { den: "2026-09-09", popis: "zaplaceno 6 990 Kč", druh: "platba", zostatok: null, dlh: null },
        { den: "2026-09-12", cas: "16:00", popis: "tréning", druh: "trening", zostatok: 6, dlh: null },
      ],
      zostatok: 5, hodinSpolu: 1, odkedy: "2026-09-09", dnes: "2026-10-03",
    } as never);
    // Názov balíčka zostáva, číslo vedľa neho nie.
    expect(h).toContain("6h Předplatné");
    expect(h).not.toContain(">6 h</div>");
    expect(h).toContain("<span>6 h</span>");
  });
});

describe("platba bitcoinom", () => {
  const z = {
    klient: "Michal Knapčok", oslovenie: "Michal", trener: "Jerry",
    os: [{ den: "2026-10-01", cas: "16:00", popis: "tréning", druh: "trening" as const, zostatok: 1, dlh: null }],
    zostatok: 0, hodinSpolu: 1, odkedy: "2026-01-01", dnes: "2026-10-05",
    platba: { popis: "6h Balíček", suma: 6990, ucet: "2302732185/2010", sprava: "Michal Knapčok", novy: true },
    lightning: {
      sats: "54 120", czk: 4893, plnaCena: 6990, zlava: 30,
      kurz: "9 041 000", kurzKedy: "14:12", adresa: "prosapiens_bio@blink.sv",
      bolt11: "lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdp",
    },
  };

  it("ukáže satoshi, cenu po zľave aj kurz — a bankový účet NIE", () => {
    const h = klientStranka(z as never);
    expect(h).toContain("54 120 sats");
    expect(h).toContain("sleva 30 %");
    expect(h).toContain("9 041 000 Kč/BTC");
    expect(h).toContain("prosapiens_bio@blink.sv");
    // Bankový blok sa nesmie objaviť — klient by zaplatil dvakrát.
    expect(h).not.toContain("Číslo účtu");
    expect(h).not.toContain("2302732185/2010");
  });

  it("bez faktúry zostane adresa a suma sa zadáva ručne", () => {
    const h = klientStranka({ ...z, lightning: { ...z.lightning, bolt11: undefined } } as never);
    expect(h).toContain("Pošli na adresu");
    expect(h).toContain("zadej v peněžence sám");
    expect(h).not.toContain("omezenou platnost");
  });
});
