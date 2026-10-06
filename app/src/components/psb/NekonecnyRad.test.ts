import { describe, expect, it } from "bun:test";

import { najblizsiaKopia, posunRadu, stredyRadu } from "./NekonecnyRad";

// Jerry, 6. 10. 2026: „ide to dokola — vedľa Klienta je 1 · Kalendár, ako nekonečný rad."
describe("nekonečný rad kariet", () => {
  it("prepnutie ide kratšou cestou, cez koniec ďalej", () => {
    expect(posunRadu(7, 0, 8)).toBe(1);   // z Klienta na Kalendár = o jedno ďalej
    expect(posunRadu(0, 7, 8)).toBe(-1);
    expect(posunRadu(15, 0, 8)).toBe(1);  // aj keď už pás prebehol dokola
  });
  it("stredy sa skladajú podľa šírok a opakujú sa dokola", () => {
    const s = stredyRadu(0, [100, 50, 80], 2, 10);
    // sloty o = -2..3 → karty 1, 2, 0, 1, 2, 0
    expect(s[2]).toBe(0);                       // karta 0 v strede
    expect(s[3]).toBe(100 / 2 + 10 + 50 / 2);   // karta 1 vpravo
    expect(s[1]).toBe(-(100 / 2 + 10 + 80 / 2)); // karta 2 vľavo (za poslednou je prvá)
  });
});

describe("najblizsiaKopia — zvýraznenie po posune prstami", () => {
  it("bez posunu je to karta v strede", () => {
    expect(najblizsiaKopia(10, 2, 8)).toBe(10);
  });
  it("pás posunutý o 3 doprava — zvýraznená ostáva tá istá kópia", () => {
    expect(najblizsiaKopia(13, 2, 8)).toBe(10);
  });
  it("posunutý o viac ako pol kola — zvýrazní sa ďalšia kópia", () => {
    expect(najblizsiaKopia(15, 2, 8)).toBe(18);
    expect(najblizsiaKopia(-3, 2, 8)).toBe(-6);
  });
});
