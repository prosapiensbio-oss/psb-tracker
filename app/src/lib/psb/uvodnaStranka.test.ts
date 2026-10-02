import { describe, expect, it } from "bun:test";

import { termin, uvodnaStrankaHtml, UVODNY } from "./uvodnaStranka";

const JERRY = "+420702090289";
const TEREZKA = "+420702147704";

describe("termín po česky", () => {
  it("deň, dátum a čas z ISO", () => {
    expect(termin("2026-10-14T10:00")).toEqual({ den: "středa", datum: "14. října", cas: "10:00" });
  });

  it("čas sa berie doslovne, neprevádza sa cez Date", () => {
    // Kalendár ukladá pražský čas. Prevod cez UTC by hodinu posunul práve
    // na prelomoch letného času — teda vtedy, keď na tom záleží najviac.
    expect(termin("2026-10-25T02:30")?.cas).toBe("02:30");
    expect(termin("2026-03-29T02:30")?.cas).toBe("02:30");
  });

  it("nezmysel je null, nie dnešok", () => {
    expect(termin("")).toBeNull();
    expect(termin(null)).toBeNull();
    expect(termin("2026-13-01T10:00")).toBeNull();
    expect(termin("zajtra o desiatej")).toBeNull();
  });
});

describe("stránka pred úvodným", () => {
  const h = uvodnaStrankaHtml({ druh: "pred", trener: "Jerry", kedy: "2026-10-14T10:00", logoUrl: "/znacka.svg" });

  it("nesie termín, adresu, dĺžku aj cenu", () => {
    expect(h).toContain("14. října");
    expect(h).toContain("10:00");
    expect(h).toContain("Fanderlíkova 70");
    expect(h).toContain("60 minut");
    expect(h).toContain("1100 Kč");
  });

  it("nesie Jerryho znenie, nezmenené", () => {
    expect(h).toContain("ideálně krátké legíny, šortky nebo jiné přiléhavé oblečení");
    expect(h).toContain("Chceme Vás také upozornit, že tady máme psa.");
    expect(h).toContain("Děkuji a těším se na setkání!");
  });

  it("potvrdenie otvorí správu s číslom AJ textom", () => {
    // `&` sa v atribúte píše ako `&amp;` — prehliadač ho dekóduje späť.
    expect(h).toContain(`sms:${JERRY}?&amp;body=`);
    expect(h).toContain(encodeURIComponent("Potvrzuji termín úvodního tréninku 14. října v 10:00."));
  });

  it("beží bez JavaScriptu", () => {
    // Otvára sa z SMS, často v okne, ktoré si otvorí správa. Skript, ktorý
    // sa nenačíta, by z tlačidiel spravil mŕtve obdĺžniky.
    expect(h).not.toContain("<script");
    expect(h).not.toContain("onclick");
  });

  it("je neindexovateľná", () => {
    expect(h).toContain('<meta name="robots" content="noindex">');
  });
});

describe("zľava sa prepíše do stránky", () => {
  it("nižšia cena nechá pôvodnú prečiarknutú vedľa", () => {
    const h = uvodnaStrankaHtml({ druh: "pred", trener: "Jerry", kedy: "2026-10-14T10:00", cenaCzk: 800, logoUrl: "/l.svg" });
    expect(h).toContain("800 Kč");
    expect(h).toContain(`<s style="color:#9FBCA9;font-weight:400">${UVODNY.cenaCzk} Kč</s>`);
  });

  it("nula je „zdarma“, nie chýbajúci údaj", () => {
    const h = uvodnaStrankaHtml({ druh: "pred", trener: "Jerry", kedy: "2026-10-14T10:00", cenaCzk: 0, logoUrl: "/l.svg" });
    expect(h).toContain("zdarma");
    expect(h).not.toContain("0 Kč");
  });

  it("bez zľavy sa nič neprečiarkne", () => {
    const h = uvodnaStrankaHtml({ druh: "pred", trener: "Jerry", kedy: "2026-10-14T10:00", logoUrl: "/l.svg" });
    expect(h).not.toContain("<s ");
  });
});

describe("stránka patrí tomu trénerovi, ktorý ten tréning vedie", () => {
  it("Terezkina stránka nesie JEJ meno aj číslo", () => {
    const h = uvodnaStrankaHtml({ druh: "pred", trener: "Terezka", kedy: "2026-10-14T10:00", logoUrl: "/l.svg" });
    expect(h).toContain("Terezka");
    expect(h).toContain(TEREZKA);
    expect(h).not.toContain(JERRY);
    expect(h).not.toContain("Filip Stráňavský");
  });

  it("neznámy tréner padne na Jerryho, nie na prázdno", () => {
    const h = uvodnaStrankaHtml({ druh: "pred", trener: "Matyáš", kedy: "2026-10-14T10:00", logoUrl: "/l.svg" });
    expect(h).toContain(JERRY);
  });
});

describe("stránka po úvodnom", () => {
  const h = uvodnaStrankaHtml({ druh: "po", trener: "Jerry", kedy: "2026-10-21T10:00", logoUrl: "/l.svg" });

  it("hovorí o ďalšom tréningu a nesie všetky tri odkazy", () => {
    expect(h).toContain("PRVNÍ DALŠÍ TRÉNINK");
    expect(h).toContain("21. října");
    expect(h).toContain("informace-po-uvodni-lekci");
    expect(h).toContain("co-ocekavat-od-biomechanickeho-treninku");
    expect(h).toContain("idealni-pristup-2");
  });

  it("nepýta peniaze ani oblečenie — to už bolo", () => {
    expect(h).not.toContain("1100 Kč");
    expect(h).not.toContain("legíny");
  });
});

describe("bez termínu stránka neklame", () => {
  it("nevymyslí dátum a povie, že termín príde", () => {
    const h = uvodnaStrankaHtml({ druh: "pred", trener: "Jerry", kedy: null, logoUrl: "/l.svg" });
    expect(h).toContain("Termín Vám potvrdíme zprávou.");
    expect(h).toContain(encodeURIComponent("Potvrzuji termín."));
  });
});

describe("figúra v hlavičke", () => {
  const z = { trener: "Terezka", kedy: "2026-10-16T09:00", cenaCzk: null, logoUrl: "/l.svg" } as const;

  it("kreslí sa vpravo hore, keď je adresa zadaná", () => {
    // Jerry, 2. 10. 2026: „zmestil by sa tam logo náš panáčik napravo hore
    // do toho zeleného voľného miesta, biely."
    const h = uvodnaStrankaHtml({ ...z, druh: "po", figuraUrl: "/znacka-figura-biela.svg" });
    expect(h).toContain("znacka-figura-biela.svg");
    expect(h).toMatch(/<img[^>]*aria-hidden="true"/);
    // Nesmie ju čítačka hlásiť druhýkrát — názov značky stojí hneď vedľa.
    expect(h).toContain('alt=""');
  });

  it("bez adresy sa nekreslí nič — prázdny obrázok je rozbitá ikona", () => {
    // Hľadá sa ZNAČKA, nie slovo: „aria-hidden" stojí aj v komentári nad ňou.
    expect(uvodnaStrankaHtml({ ...z, druh: "po" })).not.toMatch(/<img[^>]*aria-hidden/);
  });

  it("je na oboch podobách stránky", () => {
    for (const druh of ["pred", "po"] as const) {
      expect(uvodnaStrankaHtml({ ...z, druh, figuraUrl: "/f.svg" })).toContain('src="/f.svg"');
    }
  });
});
