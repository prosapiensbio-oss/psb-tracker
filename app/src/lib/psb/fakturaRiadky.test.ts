import { describe, expect, it } from "bun:test";

import { jeNehmotny, jeZlavaKPolozke, popisNehmotnych, rozdelDoklad } from "./fakturaRiadky";

// Názvy sú doslova tie, čo stoja v ostrých dátach (september–júl 2026).
const DOPRAVA = "Nehmotný produkt Doprava - AlzaBox";
const DOPRAVA2 = "Nehmotný produkt Doprava - Alzabox,";
const ZLAVA_DOPRAVA = "Nehmotný produkt Sleva na dopravné - AlzaPlus+";
const ZLAVA_DORUCENIE = "Nehmotný produkt Sleva na doručení s AlzaPlus+";
const ZLAVA_POLOZKA = "Nehmotný produkt Sleva 15% k položce KSPL5443";
const SHOWROOM = "Nehmotný produkt Doručení na - Showroom Brno - střed";
const TOVAR = "Kuchyňský nůž Victorinox nůž kuchyňský SANTOKU 17cm";

describe("jeNehmotny", () => {
  it("pozná všetky tvary, ktoré Alza naozaj posiela", () => {
    for (const n of [DOPRAVA, DOPRAVA2, ZLAVA_DOPRAVA, ZLAVA_DORUCENIE, ZLAVA_POLOZKA, SHOWROOM]) {
      expect(jeNehmotny(n)).toBe(true);
    }
  });
  it("tovar nechá na pokoji", () => {
    expect(jeNehmotny(TOVAR)).toBe(false);
    // Slovo „sleva" v názve tovaru z neho účtovný riadok nerobí.
    expect(jeNehmotny("Pleťové sérum Kvitok Bakuchiol 10 ml")).toBe(false);
    expect(jeNehmotny("Slevový poukaz do fitness")).toBe(false);
  });
});

describe("jeZlavaKPolozke", () => {
  it("rozlíši zľavu k tovaru od zľavy na dopravné", () => {
    expect(jeZlavaKPolozke(ZLAVA_POLOZKA)).toBe(true);
    expect(jeZlavaKPolozke("Nehmotný produkt Sleva 10% k položce AGDPCMM476b")).toBe(true);
    expect(jeZlavaKPolozke(ZLAVA_DOPRAVA)).toBe(false);
    expect(jeZlavaKPolozke(ZLAVA_DORUCENIE)).toBe(false);
    expect(jeZlavaKPolozke(DOPRAVA)).toBe(false);
  });
});

describe("rozdelDoklad", () => {
  // Doklad 4030982991 z 2. 9. 2026, presne ako je v databáze.
  const doklad = [
    { nazov: "Doplněk stravy pro psy Pro Plan FortiFlora Canine Probiotic 30 × 1 g", cena: 639 },
    { nazov: "Pleťové tonikum ROUND LAB Dokdo Toner 200 ml", cena: 289 },
    { nazov: DOPRAVA, cena: 69 },
    { nazov: ZLAVA_DOPRAVA, cena: -69 },
    { nazov: ZLAVA_POLOZKA, cena: -43 },
  ];

  it("nechá na obrazovke len tovar", () => {
    const r = rozdelDoklad(doklad);
    expect(r.tovar.map((p) => p.cena)).toEqual([639, 289]);
    expect(r.nehmotne).toHaveLength(3);
  });

  it("spočíta, čo sa zbalením schová", () => {
    expect(rozdelDoklad(doklad).nehmotneSuma).toBe(-43);
  });

  it("povie, že medzi zbalenými je zľava k tovaru", () => {
    expect(rozdelDoklad(doklad).maZlavuKPolozke).toBe(true);
    const bezZlavy = doklad.filter((p) => p.nazov !== ZLAVA_POLOZKA);
    expect(rozdelDoklad(bezZlavy).maZlavuKPolozke).toBe(false);
    // Samotná doprava so zľavou na dopravné je naozaj nula.
    expect(rozdelDoklad(bezZlavy).nehmotneSuma).toBe(0);
  });

  it("doklad bez šumu nezbalí nič", () => {
    const r = rozdelDoklad([{ nazov: TOVAR, cena: 1199 }]);
    expect(r.tovar).toHaveLength(1);
    expect(r.nehmotne).toHaveLength(0);
    expect(r.nehmotneSuma).toBe(0);
  });

  it("haliere sa nerozsypú", () => {
    const r = rozdelDoklad([{ nazov: DOPRAVA, cena: 237.99 }, { nazov: ZLAVA_DOPRAVA, cena: -240.79 }]);
    expect(r.nehmotneSuma).toBe(-2.8);
  });
});

describe("popisNehmotnych", () => {
  const z = (ceny: number[]) => rozdelDoklad(ceny.map((c) => ({ nazov: DOPRAVA, cena: c })));
  it("skloňuje a znamienkuje", () => {
    expect(popisNehmotnych(z([69]))).toBe("doprava a zľavy · 1 riadok · +69 Kč");
    expect(popisNehmotnych(z([69, -69, -43]))).toBe("doprava a zľavy · 3 riadky · −43 Kč");
    expect(popisNehmotnych(z([1, 1, 1, 1, 1]))).toBe("doprava a zľavy · 5 riadkov · +5 Kč");
  });
  it("nulu nehlási ako mínus nula", () => {
    expect(popisNehmotnych(z([69, -69]))).toBe("doprava a zľavy · 2 riadky · spolu 0 Kč");
  });
});
