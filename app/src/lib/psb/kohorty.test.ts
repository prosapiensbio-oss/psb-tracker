import { describe, expect, it } from "bun:test";

import { kohortyKlientov, priemernePrezitie } from "./kohorty";

const DNES = new Date("2026-09-24T10:00:00Z");
const k = (name: string, prvy: string, dalsie: string[] = []) => ({
  name, firstSession: `${prvy}T00:00:00.000Z`,
  sessions: [prvy, ...dalsie].map((d) => ({ date: `${d}T00:00:00.000Z` })),
});

describe("kohorty klientov", () => {
  it("klient patrí do mesiaca svojho prvého tréningu", () => {
    const v = kohortyKlientov([k("A", "2026-01-15"), k("B", "2026-01-28"), k("C", "2026-02-02")], DNES);
    expect(v.map((x) => [x.mesiac, x.prislo])).toEqual([["2026-01", 2], ["2026-02", 1]]);
  });

  it("kto po troch mesiacoch chodí, ráta sa za živého", () => {
    const v = kohortyKlientov([k("A", "2026-01-10", ["2026-04-12"])], DNES);
    expect(v[0].ziju[3]).toBe(1);
  });

  it("kto po troch mesiacoch nechodí, sa neráta — hoci prišiel", () => {
    const v = kohortyKlientov([k("A", "2026-01-10", ["2026-01-20"])], DNES);
    expect(v[0].ziju[3]).toBe(0);
  });

  it("jeden zabudnutý tréning po roku nerobí verného klienta", () => {
    // Preto sa NEPOZERÁ na „posledný tréning je neskôr", ale na okno ±1 mesiac
    // okolo meraného bodu.
    const v = kohortyKlientov([k("A", "2026-01-10", ["2026-09-01"])], DNES);
    expect(v[0].ziju[3]).toBe(0);
    expect(v[0].ziju[6]).toBe(0);
  });

  it("kohorta, ktorá na ten bod ešte nedozrela, je prázdna — nie nulová", () => {
    // Nula by vyzerala ako odchod a ťahala priemer dole práve v najnovších
    // mesiacoch, kde je najviac ľudí.
    const v = kohortyKlientov([k("A", "2026-09-01")], DNES);
    expect(v[0].ziju[3]).toBeNull();
    expect(v[0].ziju[12]).toBeNull();
  });

  it("priemer berie len dozreté kohorty a váži ich počtom ľudí", () => {
    const koh = kohortyKlientov([
      k("A", "2026-01-10", ["2026-04-12"]),
      k("B", "2026-01-11", ["2026-04-13"]),
      k("C", "2026-02-10"),
      k("D", "2026-09-01"), // ešte nedozrela — do priemeru nesmie
    ], DNES);
    const p = priemernePrezitie(koh);
    expect(p[3]).toBeCloseTo(2 / 3, 5);
  });

  it("klient bez prvého tréningu do kohort nepatrí", () => {
    const v = kohortyKlientov([{ name: "X", sessions: [] }], DNES);
    expect(v).toEqual([]);
  });
});
