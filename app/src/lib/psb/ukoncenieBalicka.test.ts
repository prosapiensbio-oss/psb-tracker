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

import { zostatokKokpitu } from "./zostatokKokpitu";
import { jeUkonceny } from "./ukoncenieBalicka";

describe("karta po ukončení — Radek Baláž ukazoval −5 (14. 10. 2026)", () => {
  // 2. balíček vyčerpaný 8. 9., ale v PTminderi platí do 20. 10.;
  // 3. balíček ukončený 13. 10. a stiahnutý na 5 odtrénovaných hodín.
  const balicky = [
    { klient: "Radek Balaž", nazov: "OFF - 18 hodín offline", hodiny: 18, platnostOd: "2026-04-21", platnostDo: "2026-10-20" },
    { klient: "Radek Balaž", nazov: "OFF - 18 hodín offline", hodiny: 5, platnostOd: "2026-09-15", platnostDo: "2026-10-13", ukonceny: true },
  ];
  const dni = ["2026-04-21", "2026-04-23", "2026-04-30", "2026-05-11", "2026-05-13", "2026-05-18", "2026-05-20", "2026-05-21",
    "2026-05-26", "2026-05-27", "2026-06-01", "2026-06-05", "2026-06-09", "2026-06-22", "2026-08-25", "2026-08-27", "2026-08-28",
    "2026-09-08", "2026-09-10", "2026-09-15", "2026-09-17", "2026-10-01", "2026-10-06"];
  const sedenia = dni.map((d) => ({ client: "Radek Balaž", date: `${d}T00:00:00.000Z` }));

  it("ukončený balíček = nula, nie −5 zo staršieho balíčka", () => {
    const z = zostatokKokpitu(balicky, "Radek Balaž", sedenia, "2026-10-14")!;
    expect(z.zostatok).toBe(0);
    expect(z.nadRamec).toBe(0);
  });

  it("platí to aj po 20. 10., keď starší balíček dobehne", () => {
    expect(zostatokKokpitu(balicky, "Radek Balaž", sedenia, "2026-11-01")!.zostatok).toBe(0);
  });

  it("keď sa vráti a kúpi nový balíček, rozhoduje bežné pravidlo", () => {
    const novy = [...balicky, { klient: "Radek Balaž", nazov: "6h Balíček", hodiny: 6, platnostOd: "2026-12-01", platnostDo: "2027-01-25" }];
    const z = zostatokKokpitu(novy, "Radek Balaž", [...sedenia, { client: "Radek Balaž", date: "2026-12-03T00:00:00.000Z" }], "2026-12-05")!;
    expect(z.zostatok).toBe(5);
  });

  it("ukončenie sa pozná z poznámky, aj keď pred ňou stála iná", () => {
    expect(jeUkonceny({ poznamka: "ukončené 13. 10. 2026 — vrátené 15 275 Kč" })).toBe(true);
    expect(jeUkonceny({ poznamka: "15 % zľava · ukončené 13. 10. 2026 — vrátené 1 000 Kč" })).toBe(true);
    expect(jeUkonceny({ poznamka: "neukončené, len poznámka" })).toBe(false);
    expect(jeUkonceny({ poznamka: null })).toBe(false);
  });
});
