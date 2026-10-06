import { describe, expect, it } from "bun:test";

import { posunKolesa } from "./KolotocKariet";

// Jerry, 6. 10. 2026: valec kariet sa točí kratšou cestou a cez koniec ďalej.
describe("posunKolesa", () => {
  it("o jednu ďalej a späť", () => {
    expect(posunKolesa(2, 3, 9)).toBe(1);
    expect(posunKolesa(2, 1, 9)).toBe(-1);
  });
  it("z poslednej na prvú ide dopredu, nie cez celý zoznam späť", () => {
    expect(posunKolesa(8, 0, 9)).toBe(1);
    expect(posunKolesa(0, 8, 9)).toBe(-1);
  });
  it("funguje aj pri polohe, ktorá už pretočila zoznam viackrát", () => {
    expect(posunKolesa(17, 0, 9)).toBe(1);   // 17 ≡ 8
    expect(posunKolesa(-1, 3, 9)).toBe(4);
  });
});
