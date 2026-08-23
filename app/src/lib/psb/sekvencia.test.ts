import { describe, expect, it } from "bun:test";

import { FAZY } from "./mapaCyklu";
import {
  DLZKA_PODLA_FAZY, dlzkaDoZadania, pocetZaberov, skontrolujSekvenciu, type Krok,
} from "./sekvencia";

const k = (zaber: string, sekund = 3): Krok => ({ zaber, co: "x", veta: "y", sekund });

describe("odporúčaná dĺžka", () => {
  it("existuje pre každú fázu a rastie s pripravenosťou diváka", () => {
    for (const f of FAZY) expect(DLZKA_PODLA_FAZY[f.id]).toBeTruthy();
    for (let i = 2; i <= 5; i++) {
      expect(DLZKA_PODLA_FAZY[i].max).toBeGreaterThanOrEqual(DLZKA_PODLA_FAZY[i - 1].max);
    }
  });

  it("fáza 1 sa zmestí pod medián sledovania PSB (12,7 s)", () => {
    expect(DLZKA_PODLA_FAZY[1].min).toBeLessThan(12.7);
  });

  it("každá dĺžka nesie dôvod, nie len číslo", () => {
    for (const f of FAZY) expect(DLZKA_PODLA_FAZY[f.id].preco.length).toBeGreaterThan(30);
  });

  it("zadanie pre Project nesie sekundy, počet záberov aj vlastné číslo PSB", () => {
    const t = dlzkaDoZadania(1);
    expect(t).toContain("8–15 sekúnd");
    expect(t).toContain("záberov");
    expect(t).toContain("12,7");
    expect(dlzkaDoZadania(0)).toBe("");
  });
});

describe("počet záberov z dĺžky", () => {
  it("dvadsať sekúnd vyjde na 4 až 10 záberov", () => {
    expect(pocetZaberov(20)).toEqual({ min: 4, max: 10 });
  });
  it("aj veľmi krátke video má aspoň dva zábery", () => {
    expect(pocetZaberov(3).min).toBeGreaterThanOrEqual(2);
  });
});

describe("kontrola sekvencie", () => {
  it("dva rovnaké pohyby za sebou sú TVRDÝ nález", () => {
    const n = skontrolujSekvenciu([k("najazd"), k("najazd")], 20);
    expect(n.some((x) => x.tvrdy && /nájazd/.test(x.text))).toBe(true);
  });

  it("dva statické zábery po sebe hlási ako preskočený strih", () => {
    const n = skontrolujSekvenciu([k("statický"), k("statický")], 20);
    expect(n.some((x) => x.tvrdy)).toBe(true);
  });

  it("striedané pohyby prejdú bez tvrdého nálezu", () => {
    const n = skontrolujSekvenciu([k("najazd"), k("oblúk"), k("statický")], 20);
    expect(n.filter((x) => x.tvrdy)).toHaveLength(0);
  });

  it("príliš dlhý záber je len upozornenie, nie chyba", () => {
    const n = skontrolujSekvenciu([k("najazd", 9)], 20);
    expect(n).toHaveLength(1);
    expect(n[0].tvrdy).toBe(false);
  });

  it("prekročenie cieľovej dĺžky sa ohlási", () => {
    const n = skontrolujSekvenciu([k("najazd", 20), k("oblúk", 20)], 20);
    expect(n.some((x) => x.index === -1 && /Sekvencia trvá/.test(x.text))).toBe(true);
  });

  it("jednotvárna sekvencia sa ohlási, aj keď sú pohyby platné", () => {
    // tri statické zábery: tvrdý nález za dvojice + upozornenie na jednotvárnosť
    const n = skontrolujSekvenciu([k("statický"), k("statický"), k("statický")], 20);
    expect(n.some((x) => x.index === -1 && /jeden druh pohybu/.test(x.text))).toBe(true);
  });

  it("prázdna sekvencia nič nehlási — nezačatá práca nie je chyba", () => {
    expect(skontrolujSekvenciu([], 20)).toEqual([]);
  });

  it("neznámy záber kontrolu nezhodí", () => {
    expect(() => skontrolujSekvenciu([k("vymyslene"), k("najazd")], 20)).not.toThrow();
  });
});
