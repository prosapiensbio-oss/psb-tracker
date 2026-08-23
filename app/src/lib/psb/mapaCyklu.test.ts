import { describe, expect, it } from "bun:test";

import { FAZY, jeFaza, mriezka, nazovFazy, osMapy, popisMesiaca, tempoFaz } from "./mapaCyklu";

const kus = (mesiac: string, faza: number, hook = "h") => ({
  datum: `${mesiac}-05`, mesiac, faza, hook, dosah: 100, ulozenia: 1,
});

describe("os mapy", () => {
  it("končí až ZA kotvou — bez budúcich stĺpcov sa plánovať nedá", () => {
    const os = osMapy("2026-08", 12, 4);
    expect(os).toHaveLength(16);
    expect(os[0]).toBe("2025-09");
    expect(os[11]).toBe("2026-08");
    expect(os[15]).toBe("2026-12");
  });

  it("prechádza cez zlom roka správne", () => {
    expect(osMapy("2026-01", 3, 2)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
  });

  it("na nezmyselný vstup vráti prázdno, nie vymyslené mesiace", () => {
    expect(osMapy("", 12, 4)).toEqual([]);
    expect(osMapy("2026-8", 12, 4)).toEqual([]);
  });
});

describe("mriežka", () => {
  it("vyrobí VŠETKY bunky — prázdna bunka je informácia", () => {
    const os = osMapy("2026-03", 2, 1);
    const m = mriezka(os, [], []);
    expect(m.size).toBe(os.length * FAZY.length);
    expect(m.get("2026-03|4")?.vyslo).toEqual([]);
  });

  it("rozdelí zverejnené a naplánované do správnych buniek", () => {
    const os = osMapy("2026-03", 2, 1);
    const m = mriezka(os, [kus("2026-02", 5)], [
      { id: "a", faza: 5, mesiac: "2026-04", koncept: "k", kto: "", text: "t", zdroj: "jarvis", stav: "novy" },
    ]);
    expect(m.get("2026-02|5")?.vyslo).toHaveLength(1);
    expect(m.get("2026-04|5")?.plan).toHaveLength(1);
    expect(m.get("2026-02|5")?.plan).toHaveLength(0);
  });

  it("ticho zahodí to, čo je mimo osi — inak by sa počty na obrazovke nezhodli", () => {
    const m = mriezka(["2026-03"], [kus("2020-01", 1)], []);
    expect([...m.values()].every((b) => b.vyslo.length === 0)).toBe(true);
  });
});

describe("tempo fáz", () => {
  it("počíta len posledných N mesiacov PO kotvu, nie budúcnosť", () => {
    const os = osMapy("2026-08", 12, 4);
    const t = tempoFaz(os, [
      kus("2026-08", 1), kus("2026-07", 1), kus("2026-01", 1), // 01 je mimo okna
      kus("2026-11", 1), // budúcnosť — nesmie sa počítať
    ], "2026-08", 6);
    expect(t.get(1)).toBe(2);
  });

  it("fáza bez obsahu má nulu, nie chýbajúci kľúč", () => {
    const t = tempoFaz(osMapy("2026-08", 12, 4), [], "2026-08", 6);
    for (const f of FAZY) expect(t.get(f.id)).toBe(0);
  });
});

describe("drobnosti", () => {
  it("nezaradené má názov, nikde nesvieti holá nula", () => {
    expect(nazovFazy(0)).toBe("Nezaradené");
    expect(nazovFazy(3)).toBe("Hľadá riešenie");
    expect(nazovFazy(9)).toBe("Nezaradené");
  });

  it("jeFaza pustí 0 až 5 a nič iné", () => {
    expect(jeFaza(0)).toBe(true);
    expect(jeFaza(5)).toBe(true);
    expect(jeFaza(6)).toBe(false);
    expect(jeFaza(-1)).toBe(false);
    expect(jeFaza(2.5)).toBe(false);
    expect(jeFaza("3")).toBe(false);
  });

  it("rok v hlavičke ukazuje len január", () => {
    expect(popisMesiaca("2026-01")).toEqual({ mesiac: "1.", rok: "2026" });
    expect(popisMesiaca("2026-07")).toEqual({ mesiac: "7.", rok: "" });
  });

  it("päť fáz má jedinečné id a farbu", () => {
    expect(new Set(FAZY.map((f) => f.id)).size).toBe(5);
    expect(new Set(FAZY.map((f) => f.farba)).size).toBe(5);
  });
});
