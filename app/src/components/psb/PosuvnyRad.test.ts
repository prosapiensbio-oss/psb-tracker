import { describe, expect, it } from "bun:test";

import { krajeRadu, posunDoDohladu } from "./PosuvnyRad";

describe("posuvný rad — náznak, že niečo je za okrajom", () => {
  it("na začiatku len vpravo, na konci len vľavo, uprostred oboje", () => {
    expect(krajeRadu(0, 300, 800)).toEqual({ vlavo: false, vpravo: true });
    expect(krajeRadu(500, 300, 800)).toEqual({ vlavo: true, vpravo: false });
    expect(krajeRadu(200, 300, 800)).toEqual({ vlavo: true, vpravo: true });
  });
  it("rad, ktorý sa zmestí, nemá náznak žiadny", () => {
    expect(krajeRadu(0, 800, 800)).toEqual({ vlavo: false, vpravo: false });
  });
  it("zlomok pixela pri zoome nie je ďalší obsah", () => {
    expect(krajeRadu(499.5, 300, 800)).toEqual({ vlavo: true, vpravo: false });
  });
});

describe("rad stojí, kým je karta vidno (preskok na Uzávierku)", () => {
  it("položka vo výhľade: rad sa nehne ani o pixel", () => {
    expect(posunDoDohladu(0, 400, 100, 200)).toBe(0);
    expect(posunDoDohladu(150, 400, 300, 400)).toBe(150);
  });
  it("prvá položka pri začiatku radu nepotrebuje okraj", () => {
    expect(posunDoDohladu(0, 400, 0, 90)).toBe(0);
  });
  it("za pravým okrajom: príde presne po okraj, nie do stredu", () => {
    expect(posunDoDohladu(0, 400, 450, 560)).toBe(188);
  });
  it("za ľavým okrajom: príde po okraj, nikdy pod nulu", () => {
    expect(posunDoDohladu(300, 400, 150, 250)).toBe(122);
    expect(posunDoDohladu(300, 400, 10, 90)).toBe(0);
  });
  it("výsledok je stabilný: druhé volanie už nič nepohne", () => {
    const a = posunDoDohladu(0, 400, 450, 560);
    expect(posunDoDohladu(a, 400, 450, 560)).toBe(a);
    const b = posunDoDohladu(300, 400, 150, 250);
    expect(posunDoDohladu(b, 400, 150, 250)).toBe(b);
  });
});
