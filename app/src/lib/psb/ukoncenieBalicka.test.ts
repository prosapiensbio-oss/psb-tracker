import { describe, expect, it } from "bun:test";

import { chybaUkoncenia, navrhUkoncenia, poznamkaUkoncenia, poznamkaVratenia } from "./ukoncenieBalicka";
import { dlhyKlientov } from "./zaplatene";

describe("ukončenie balíčka — Radek Baláž, 13. 10. 2026", () => {
  it("18 h za 21 150, odtrénované 4 → vráti sa 14 × 1 175 = 16 450", () => {
    const n = navrhUkoncenia({ hodiny: 18, cena: 21150, odtrenovane: 4 })!;
    expect(n.hodinovka).toBe(1175);
    expect(n.nevycerpane).toBe(14);
    expect(n.vratit).toBe(16450);
    expect(n.novaCena).toBe(4700);
  });

  it("odtrénované sa drží v hraniciach balíčka", () => {
    expect(navrhUkoncenia({ hodiny: 6, cena: 7790, odtrenovane: 9 })!.vratit).toBe(0);
    expect(navrhUkoncenia({ hodiny: 6, cena: 7790, odtrenovane: -2 })!.vratit).toBe(7790);
  });

  it("paušál ani doplnenie sa ukončiť s vrátením nedá", () => {
    expect(navrhUkoncenia({ hodiny: null, cena: 7790, odtrenovane: 0 })).toBeNull();
    expect(navrhUkoncenia({ hodiny: 4, cena: 0, odtrenovane: 0 })).toBeNull();
  });

  it("kontrola zápisu odmietne nezmysel", () => {
    const ok = { hodiny: 18, cena: 21150, odtrenovane: 4, vratit: 16450, den: "2026-10-13", platnostOd: "2026-09-15" };
    expect(chybaUkoncenia(ok)).toBeNull();
    expect(chybaUkoncenia({ ...ok, vratit: 0 })).toMatch(/kladná/);
    expect(chybaUkoncenia({ ...ok, vratit: 30000 })).toMatch(/najviac/);
    expect(chybaUkoncenia({ ...ok, odtrenovane: 19 })).toMatch(/0 až 18/);
    expect(chybaUkoncenia({ ...ok, den: "2026-09-01" })).toMatch(/pred začiatkom/);
    expect(chybaUkoncenia({ ...ok, den: "" })).toMatch(/deň/);
  });

  it("poznámka nesie pôvodnú veľkosť aj výpočet", () => {
    const t = poznamkaUkoncenia({ den: "2026-10-13", hodiny: 18, cena: 21150, odtrenovane: 4, vratit: 16450 });
    expect(t).toContain("ukončené 13. 10. 2026");
    expect(t).toContain("16 450 Kč za 14 nevyčerpaných h");
    expect(t).toContain("1 175 Kč/h");
    expect(t).toContain("pôvodne 18 h za 21 150 Kč");
    expect(poznamkaVratenia(14)).toBe("vrátenie za 14 nevyčerpaných h — balíček ukončený");
  });

  it("po ukončení je dlh presne nula: balíček 4 700 = 21 150 − 16 450", () => {
    const { polozky } = dlhyKlientov({
      poplatky: [],
      platby: [
        { klient: "Radek Balaž", datum: "2026-09-15", suma: 21150 },
        { klient: "Radek Balaž", datum: "2026-10-13", suma: -16450 },
      ],
      balicky: [{ klient: "Radek Balaž", nazov: "18h Balíček", cena: 4700, platnostOd: "2026-09-15", zdroj: "ptminder" }],
      ptPlatby: [],
      ptHistoria: [],
    });
    expect(polozky).toHaveLength(0);
  });

  it("bez ukončenia by vrátenie vyrobilo dlh — preto sa balíček sťahuje v tej istej dávke", () => {
    const { polozky } = dlhyKlientov({
      poplatky: [],
      platby: [
        { klient: "Radek Balaž", datum: "2026-09-15", suma: 21150 },
        { klient: "Radek Balaž", datum: "2026-10-13", suma: -16450 },
      ],
      balicky: [{ klient: "Radek Balaž", nazov: "18h Balíček", cena: 21150, platnostOd: "2026-09-15", zdroj: "ptminder" }],
      ptPlatby: [],
      ptHistoria: [],
    });
    expect(polozky[0]?.doplatit).toBe(16450);
  });
});
