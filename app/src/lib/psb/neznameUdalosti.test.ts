// Udalosti, ktorých názov appka nepozná.
//
// Jerry, 3. 9. 2026: „vie vôbec rozpoznať, čo je tréning a čo je niečo iné?"
// Vie len to, čo má v mapovaní — a zvyšok ticho nezapočíta do hodín.
import { describe, expect, it } from "bun:test";

import { neznameUdalosti } from "./compute";

// Streda 2. 9. 2026; pondelok toho týždňa je 31. 8.
const DNES = new Date("2026-09-02T09:00:00Z");
const u = (zaciatok: string, typ: string | null, nazov: string, trener = "Jerry", minut = 60) => ({
  zaciatok, koniec: new Date(Date.parse(zaciatok) + minut * 60000).toISOString().slice(0, 16),
  typ, nazov, trener,
});

describe("neznameUdalosti", () => {
  it("nájde len tie bez typu a spočíta, o koľko hodín je dlaždica nižšia", () => {
    const v = neznameUdalosti([
      u("2026-09-01T10:00", "trening", "Jan Novak"),
      u("2026-09-01T11:00", null, "Lukas H"),
      u("2026-09-02T08:00", "", "Maty"),
    ], DNES);
    expect(v.length).toBe(1);
    expect(v[0].pocet).toBe(2);
    expect(v[0].hodin).toBe(2);
    expect(v[0].nazvy).toEqual(["Lukas H", "Maty"]);
  });

  it("delí sa podľa trénera — mapovanie robí ten, kto vie, čo skratka znamená", () => {
    const v = neznameUdalosti([
      u("2026-09-01T10:00", null, "Maty", "Jerry"),
      u("2026-09-01T11:00", null, "Patrik", "Terezka"),
      u("2026-09-02T11:00", null, "Veronika", "Terezka"),
    ], DNES);
    expect(v.map((x) => `${x.trener}:${x.pocet}`)).toEqual(["Terezka:2", "Jerry:1"]);
  });

  it("súkromné udalosti NIE sú neznáme — tie appka pozná a správne ich nepočíta", () => {
    expect(neznameUdalosti([u("2026-09-01T10:00", "sukromne", "zubár")], DNES)).toEqual([]);
  });

  it("mimo bežiaceho týždňa sa nehlási — následok je skreslená dlaždica ZA TENTO týždeň", () => {
    expect(neznameUdalosti([u("2026-08-25T10:00", null, "Marketa R")], DNES)).toEqual([]);
    expect(neznameUdalosti([u("2026-09-10T10:00", null, "Neskor")], DNES)).toEqual([]);
  });

  it("rovnaký názov dvakrát je jedno meno, ale dve hodiny", () => {
    const v = neznameUdalosti([
      u("2026-09-01T10:00", null, "Patrik"),
      u("2026-09-03T10:00", null, "Patrik"),
    ], DNES);
    expect(v[0].nazvy).toEqual(["Patrik"]);
    expect(v[0].pocet).toBe(2);
    expect(v[0].hodin).toBe(2);
  });

  it("udalosť bez konca sa počíta ako hodina — rovnako ako v dlaždici", () => {
    const v = neznameUdalosti([{ zaciatok: "2026-09-01T10:00", typ: null, nazov: "X", trener: "Jerry" }], DNES);
    expect(v[0].hodin).toBe(1);
  });
});
