// Jeden človek platí za viacerých — Jakub Kaňovský a Anna Kadličkova (21. 10. 2026).
import { describe, expect, it } from "bun:test";

import { chybaDielov, czkZaPolozky, menaPlatiZa, platiteliaZOverridov, rozdelPodlaDlhov, vetaZaKoho, zapisPlatiZa, type PolozkaPlatby } from "./platiZa";

const JAKUB = "Jakub Kaňovský";
const ANNA = "Anna Kadličkova";

describe("zoznam mien", () => {
  it("číta zvislicu, čistí medzery a nezdvojuje", () => {
    expect(menaPlatiZa(` ${ANNA} | ${JAKUB} |  | ${ANNA.toUpperCase()}`)).toEqual([ANNA, JAKUB]);
  });
  it("berie aj pole z obrazovky", () => {
    expect(menaPlatiZa([ANNA, ""])).toEqual([ANNA]);
  });
  it("prázdny zoznam je null, nie prázdny reťazec", () => {
    expect(zapisPlatiZa([])).toBeNull();
    expect(zapisPlatiZa("  ")).toBeNull();
    expect(zapisPlatiZa([ANNA, JAKUB])).toBe(`${ANNA}|${JAKUB}`);
  });
});

describe("rozpis v korunách", () => {
  const polozky: PolozkaPlatby[] = [
    { klient: JAKUB, suma: 7401, nazov: "6h Balíček", ja: true },
    { klient: ANNA, suma: 7401, nazov: "6h Balíček", ja: false },
  ];
  it("počíta každú položku zľavou TOHO klienta, za ktorého je", () => {
    // Obaja 5 %: 2 × (7 790 − 5 %) = 2 × 7 401.
    expect(czkZaPolozky(polozky, () => 5)).toEqual({ czk: 14802, plna: 15580, zlava: 5 });
  });
  it("pri dvoch rôznych zľavách sa na stránku nepíše žiadna", () => {
    const r = czkZaPolozky(polozky, (m) => (m === JAKUB ? 30 : 5));
    expect(r.czk).toBe(Math.ceil(7790 * 0.7) + 7401);
    expect(r.zlava).toBe(0);
  });
  it("produkt mimo cenníka zľavu nedostane — v jeho sume už je", () => {
    const mimo: PolozkaPlatby[] = [{ klient: JAKUB, suma: 20093, nazov: "nezaplacený balíček", ja: true }];
    expect(czkZaPolozky(mimo, () => 5)).toEqual({ czk: 20093, plna: 20093, zlava: 0 });
  });
});

describe("veta pre stránku", () => {
  it("vymenuje len tých druhých", () => {
    expect(vetaZaKoho([
      { klient: JAKUB, suma: 1, nazov: "", ja: true },
      { klient: ANNA, suma: 1, nazov: "", ja: false },
    ])).toBe(`za: ${ANNA}`);
    expect(vetaZaKoho([{ klient: JAKUB, suma: 1, nazov: "", ja: true }])).toBe("");
  });
});

describe("rozdelenie prijatej platby", () => {
  const dlhy = [{ klient: JAKUB, dlzi: 7401 }, { klient: ANNA, dlzi: 7401 }];
  it("delí podľa dlhov a súčet sedí na korunu", () => {
    const r = rozdelPodlaDlhov(14802, dlhy);
    expect(r).toEqual([{ klient: JAKUB, suma: 7401 }, { klient: ANNA, suma: 7401 }]);
  });
  it("kurzový rozdiel do 10 % platbu rozdelí tiež", () => {
    // Bitcoinová platba sa súdi s toleranciou (15. 10. 2026) — 2 % nižšia
    // suma je kurz, nie nedoplatok.
    const r = rozdelPodlaDlhov(14506, dlhy)!;
    expect(r.reduce((a, d) => a + d.suma, 0)).toBe(14506);
    expect(r[0].suma).toBe(7253);
  });
  it("nerovnaké dlhy sa nedelia rovným dielom", () => {
    const r = rozdelPodlaDlhov(28940, [{ klient: JAKUB, dlzi: 7790 }, { klient: ANNA, dlzi: 21150 }]);
    expect(r).toEqual([{ klient: JAKUB, suma: 7790 }, { klient: ANNA, suma: 21150 }]);
  });
  it("suma mimo tolerancie sa nerozdelí vôbec", () => {
    expect(rozdelPodlaDlhov(7401, dlhy)).toBeNull();
  });
  it("keď druhý nič nedlží, nie je čo deliť", () => {
    expect(rozdelPodlaDlhov(7401, [{ klient: JAKUB, dlzi: 7401 }, { klient: ANNA, dlzi: 0 }])).toBeNull();
  });
  it("platba len za seba sa neroztrhne, hoci druhý dlží to isté", () => {
    // Jakub pošle 7 401, čakalo sa 14 802 — zaplatil za seba, nie za oboch.
    expect(rozdelPodlaDlhov(7401, dlhy)).toBeNull();
  });
});

describe("obrátený pohľad", () => {
  it("meno dlžníka → kto zaňho platí", () => {
    expect(platiteliaZOverridov({ [JAKUB]: { platiZa: ANNA }, [ANNA]: {} })).toEqual({ [ANNA]: JAKUB });
  });
  it("zápis na seba samého sa ignoruje", () => {
    expect(platiteliaZOverridov({ [JAKUB]: { platiZa: JAKUB } })).toEqual({});
  });
});

describe("ručné rozdelenie platby", () => {
  it("diely musia dať presne sumu platby", () => {
    expect(chybaDielov(14802, [{ klient: JAKUB, suma: 7401 }, { klient: ANNA, suma: 7401 }])).toBeNull();
    // Koruna tolerancie: zaokrúhlenie pri troch dieloch.
    expect(chybaDielov(14802, [{ klient: JAKUB, suma: 7401 }, { klient: ANNA, suma: 7402 }])).toBeNull();
    expect(chybaDielov(14802, [{ klient: JAKUB, suma: 7401 }, { klient: ANNA, suma: 5000 }]))
      .toBe("Diely dávajú 12401 Kč, platba je 14802 Kč.");
  });
  it("jeden diel nie je rozdelenie", () => {
    expect(chybaDielov(7401, [{ klient: JAKUB, suma: 7401 }])).toBe("Na rozdelenie treba aspoň dvoch klientov.");
  });
  it("ten istý klient dvakrát sa odmietne", () => {
    expect(chybaDielov(14802, [{ klient: JAKUB, suma: 7401 }, { klient: JAKUB.toUpperCase(), suma: 7401 }]))
      .toContain("dvakrát");
  });
  it("diel bez mena alebo s nulou sa odmietne", () => {
    expect(chybaDielov(14802, [{ klient: "", suma: 7401 }, { klient: ANNA, suma: 7401 }])).toContain("klienta");
    expect(chybaDielov(7401, [{ klient: JAKUB, suma: 7401 }, { klient: ANNA, suma: 0 }])).toContain("kladnú sumu");
  });
});
