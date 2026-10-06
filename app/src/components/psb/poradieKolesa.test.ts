import { describe, expect, it } from "bun:test";

import { poradieKolesa } from "./Workspace";

// Jerry, 6. 10. 2026: „názvy kariet by sa mali točiť do kruhu, nie chodiť po úsečke."
describe("poradieKolesa", () => {
  it("otvorená je v strede, susedia dokola", () => {
    expect(poradieKolesa(5, 0).map((x) => x.j)).toEqual([3, 4, 0, 1, 2]);
    expect(poradieKolesa(5, 4).map((x) => x.j)).toEqual([2, 3, 4, 0, 1]);
  });
  it("každá karta raz, otvorená má posun 0", () => {
    const r = poradieKolesa(9, 2);
    expect(new Set(r.map((x) => x.j)).size).toBe(9);
    expect(r.find((x) => x.posun === 0)!.j).toBe(2);
  });
  it("pri párnom počte je o jednu viac vpravo", () => {
    expect(poradieKolesa(4, 0).map((x) => x.posun)).toEqual([-1, 0, 1, 2]);
  });
});
