import { describe, expect, it } from "bun:test";

import { diagnozaLievika, pasmoZoSkore, popisPoplatku, smerDlhu } from "./prehladPasma";

describe("pásma dlaždíc", () => {
  it("hranice sedia na to, čo hovorí veta pod číslom", () => {
    expect(pasmoZoSkore(10)).toBe("ok");
    expect(pasmoZoSkore(6.5)).toBe("ok");
    expect(pasmoZoSkore(6.4)).toBe("pozor");
    expect(pasmoZoSkore(4)).toBe("pozor");
    expect(pasmoZoSkore(3.9)).toBe("zle");
  });

  it("bez dát sa nehádže do žiadneho pásma", () => {
    // Nula by sa nakreslila červeno a tvrdila by, že je to zlé — pritom to
    // znamená len, že sa nie je za čo počítať (cena za dopyt bez výdaja).
    expect(pasmoZoSkore(0, true)).toBe("nevie");
    expect(pasmoZoSkore(9, true)).toBe("nevie");
  });
});

describe("diagnóza lievika", () => {
  const zaklad = { dopytyMes: 3.6, cielDopytov: 10.5, naUvodny: 88, naKlienta: 77, dopytov: 40, klientov: 33 };

  it("pri zdravých prechodoch neposiela opravovať lievik", () => {
    // Ostré čísla PSB z 25. 9. 2026. Prvá verzia obrazovky na ne hlásila
    // „najslabší prechod: úvodný → klient (77 %)" a posielala prerábať
    // úvodný tréning, ktorý funguje.
    const d = diagnozaLievika(zaklad)!;
    expect(d.nadpis).toContain("chýbajú dopyty");
    expect(d.veta).toContain("Práca je pred lievikom");
    expect(d.vazne).toBe(true);
  });

  it("deravý prechod ukáže tam, kde sa ľudia strácajú", () => {
    expect(diagnozaLievika({ ...zaklad, naUvodny: 30 })!.nadpis).toContain("dopyt → úvodný");
    expect(diagnozaLievika({ ...zaklad, naKlienta: 30 })!.nadpis).toContain("úvodný tréning → klient");
  });

  it("pri rovnosti vyhráva skorší prechod", () => {
    expect(diagnozaLievika({ ...zaklad, naUvodny: 50, naKlienta: 50 })!.nadpis).toContain("dopyt → úvodný");
  });

  it("keď je dobre všetko, nekričí", () => {
    const d = diagnozaLievika({ ...zaklad, dopytyMes: 12 })!;
    expect(d.vazne).toBe(false);
  });

  it("bez jedného z podielov nehovorí nič", () => {
    expect(diagnozaLievika({ ...zaklad, naUvodny: null })).toBeNull();
    expect(diagnozaLievika({ ...zaklad, naKlienta: null })).toBeNull();
  });
});

describe("smer dlhu voči trénerovi", () => {
  const s = (x: number) => `${Math.round(x)} Kč`;
  it("kladné a záporné znamenajú opačné veci", () => {
    expect(smerDlhu("Terezka", "Terezke", 34255, s)).toBe("firma dlží Terezke 34255 Kč");
    expect(smerDlhu("Jerry", "Jerrymu", -107897, s)).toBe("Jerry má vybraté o 107897 Kč viac");
  });
  it("nula je vyrovnanie, nie dlh", () => {
    expect(smerDlhu("Jerry", "Jerrymu", 0, s)).toBe("Jerry vyrovnané");
  });
});

describe("popis poplatku z PTmindera", () => {
  it("zahodí dátumy platnosti, nechá produkt", () => {
    expect(popisPoplatku("OFF - 6h S viazanostou - from 17/09/2026 to 17/10/2026"))
      .toBe("6h S viazanostou");
  });

  it("zľavu nechá — inak sa suma 6 621,50 Kč nedá vysvetliť", () => {
    expect(popisPoplatku("OFF - 6h BEZ viazanosti - from 18/09/2026 to 13/11/2026 (Promo code 'DC15' 15% discount applied)"))
      .toBe("6h BEZ viazanosti · zľava 15 %");
  });

  it("úvodný tréning je úvodný tréning, nie dátum s časom", () => {
    expect(popisPoplatku("Uvodny trenink OFFLINE - 14/09/2026 18:00 (attended)"))
      .toBe("Úvodný tréning (offline)");
  });

  it("prázdny popis nespadne", () => {
    expect(popisPoplatku("")).toBe("—");
  });
});
