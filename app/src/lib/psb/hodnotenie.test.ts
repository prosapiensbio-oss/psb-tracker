import { describe, expect, it } from "bun:test";

import { CENA_ZA_DOPYT, DOPYTOV_MESACNE, KONVERZIA_DOPYTU, hodnot } from "./hodnotenie";

describe("hodnot", () => {
  it("kotvu vráti presne, nie približne", () => {
    expect(hodnot(1000, CENA_ZA_DOPYT).skore).toBe(7);
    expect(hodnot(2200, CENA_ZA_DOPYT).skore).toBe(4);
  });

  it("medzi kotvami interpoluje", () => {
    // Presne v polovici medzi 1000 Kč (7) a 2200 Kč (4).
    expect(hodnot(1600, CENA_ZA_DOPYT).skore).toBe(5.5);
  });

  it("za kotvami nespadne ani nevystrelí", () => {
    expect(hodnot(10, CENA_ZA_DOPYT).skore).toBe(10);
    expect(hodnot(999_999, CENA_ZA_DOPYT).skore).toBe(1);
  });

  it("chýbajúce dáta nie sú jednotka", () => {
    // Kampaň, ktorá ešte nebeží, nesmie vyzerať ako kampaň, čo zlyhala.
    expect(hodnot(null, CENA_ZA_DOPYT)).toMatchObject({ skore: 0, bezDat: true });
    expect(hodnot(undefined, CENA_ZA_DOPYT).bezDat).toBe(true);
    expect(hodnot(Number.POSITIVE_INFINITY, CENA_ZA_DOPYT).bezDat).toBe(true);
  });

  it("rastúca stupnica ide opačným smerom než klesajúca", () => {
    expect(hodnot(10.5, DOPYTOV_MESACNE).skore).toBe(10);
    expect(hodnot(0, DOPYTOV_MESACNE).skore).toBe(1);
    expect(hodnot(70, KONVERZIA_DOPYTU).skore).toBe(10);
  });

  it("slovo sedí so skóre", () => {
    expect(hodnot(250, CENA_ZA_DOPYT).slovo).toBe("výborné");
    expect(hodnot(1000, CENA_ZA_DOPYT).slovo).toBe("dobré");
    expect(hodnot(2200, CENA_ZA_DOPYT).slovo).toBe("slabé");
    expect(hodnot(9000, CENA_ZA_DOPYT).slovo).toBe("zle");
  });

  it("skutočné čísla z prvého sťahovania Mety", () => {
    // 525 registrácií za 2 395 Kč = 4,6 Kč. Aj keď to neboli dopyty na
    // tréning, cena sama o sebe je desiatka — a tak to má obrazovka ukázať.
    expect(hodnot(2395 / 525, CENA_ZA_DOPYT).skore).toBe(10);
    // Naopak 31 452 Kč a nula dopytov na tréning: hodnotí sa ako jednotka,
    // lebo delenie nulou sem nesmie prísť ako „nemám dáta".
    expect(hodnot(null, CENA_ZA_DOPYT).bezDat).toBe(true);
  });
});
