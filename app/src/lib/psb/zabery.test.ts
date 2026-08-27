import { describe, expect, it } from "bun:test";

import { FAZY } from "./mapaCyklu";
import { ZABERY, ZABER_MAPA, zaberDoZadania, zaberyPreFazu } from "./zabery";

describe("katalóg úvodných záberov", () => {
  it("má jedinečné id a každé je použiteľné v mape", () => {
    expect(new Set(ZABERY.map((z) => z.id)).size).toBe(ZABERY.length);
    for (const z of ZABERY) expect(ZABER_MAPA.get(z.id)).toBe(z);
  });

  it("každá fáza má aspoň jeden vhodný záber — inak by ponuka bola prázdna", () => {
    for (const f of FAZY) expect(zaberyPreFazu(f.id).length).toBeGreaterThan(0);
  });

  it("žiadny záber neodkazuje na neexistujúcu fázu", () => {
    const platne = new Set<number>(FAZY.map((f) => f.id));
    for (const z of ZABERY) for (const f of z.fazy) expect(platne.has(f)).toBe(true);
  });

  it("každý záber povie, čo robí AJ ako sa točí", () => {
    for (const z of ZABERY) {
      expect(z.coRobi.length).toBeGreaterThan(30);
      expect(z.akoNaTo.length).toBeGreaterThan(40);
      expect(z.prePSB.length).toBeGreaterThan(20);
    }
  });

  it("odkazy sú len na youtube — vymyslená adresa je horšia než žiadna", () => {
    for (const z of ZABERY) {
      if (z.zdroj) expect(z.zdroj.url.startsWith("https://www.youtube.com/watch?v=")).toBe(true);
    }
  });
});

describe("záber v zadaní pre Project", () => {
  it("nesie názov aj postup natáčania", () => {
    const t = zaberDoZadania("oblúk");
    expect(t).toContain("ÚVODNÝ ZÁBER");
    expect(t).toContain("Oblúk okolo človeka");
    expect(t).toContain("AKO SA TOČÍ");
  });

  it("neznáme alebo prázdne id nevyrobí prázdnu hlavičku", () => {
    expect(zaberDoZadania("")).toBe("");
    expect(zaberDoZadania("vymyslene")).toBe("");
  });
});

/**
 * Katalóg sa rozšíril zo 7 na 13 záberov, lebo Jarvisovi sa štyri točili
 * dokola. Rozšírenie je až vtedy hotové, keď každý nový pohyb vie appka aj
 * nakresliť a pomenovať — inak sa záber ponúkne a obrazovka spadne.
 */
describe("rozšírený katalóg", () => {
  it("každá fáza má z čoho vyberať", () => {
    for (const f of [1, 2, 3, 4, 5]) {
      expect(zaberyPreFazu(f).length).toBeGreaterThan(0);
    }
  });

  it("žiadny pohyb nemá len jeden záber vo svojej fáze bez alternatívy", () => {
    // Pravidlo „dva rovnaké pohyby za sebou nie" potrebuje aspoň dva rôzne
    // pohyby na fázu, inak sa nedá splniť.
    for (const f of [1, 2, 3, 4, 5]) {
      const pohyby = new Set(zaberyPreFazu(f).map((z) => z.pohyb));
      expect(pohyby.size).toBeGreaterThan(1);
    }
  });

  it("každý záber povie, ako sa točí a načo je PSB", () => {
    for (const z of ZABERY) {
      expect(z.akoNaTo.length).toBeGreaterThan(60);
      expect(z.prePSB.length).toBeGreaterThan(30);
    }
  });
});
