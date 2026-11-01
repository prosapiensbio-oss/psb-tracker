import { describe, expect, test } from "bun:test";

import { poKusoch, suhrnPodlaKategorie, vydavkySoZnamymPravidlom } from "./vydavkySPravidlom";

const p = (x: Partial<Parameters<typeof vydavkySoZnamymPravidlom>[0][number]> & { kluc: string }) => ({
  datum: "2026-10-05", suma: -100, protistrana: "ANTHROPIC", poznamka: "", kategoria: "fixne.apps.ai", potvrdene: false, ...x,
});
const PRAVIDLA = [{ vzor: "anthropic", kategoria: "fixne.apps.ai" }, { vzor: "wolt", kategoria: "spolocne.Potraviny" }];

describe("výber na hromadné potvrdenie", () => {
  test("berie len výdavok, ktorému kategóriu dalo naučené pravidlo", () => {
    const v = vydavkySoZnamymPravidlom([p({ kluc: "a" })], PRAVIDLA);
    expect(v.map((x) => x.kluc)).toEqual(["a"]);
  });
  test("výdavok bez pravidla ostáva na ručné", () => {
    expect(vydavkySoZnamymPravidlom([p({ kluc: "a", protistrana: "Neznámy obchod", kategoria: "variabilne.sluzby.ine" })], PRAVIDLA)).toEqual([]);
  });
  test("kategória v rozpore s pravidlom ostáva na ručné", () => {
    expect(vydavkySoZnamymPravidlom([p({ kluc: "a", kategoria: "mimo" })], PRAVIDLA)).toEqual([]);
  });
  test("nezaradený, potvrdený, príjem, hotovosť a rezerva sa neberú", () => {
    const v = vydavkySoZnamymPravidlom([
      p({ kluc: "bez", kategoria: "" }),
      p({ kluc: "potvrdeny", potvrdene: true }),
      p({ kluc: "prijem", suma: 100 }),
      p({ kluc: "zosit", typ: "hotovosť" }),
      p({ kluc: "rez", kategoria: "rezerva" }),
    ], [...PRAVIDLA, { vzor: "anthropic", kategoria: "rezerva" }]);
    expect(v).toEqual([]);
  });
  test("rozdelený pohyb a uzavretý mesiac sa neberú", () => {
    const riadky = [p({ kluc: "split" }), p({ kluc: "sept", datum: "2026-09-30" }), p({ kluc: "ok" })];
    const v = vydavkySoZnamymPravidlom(riadky, PRAVIDLA, (x) => x.kluc === "split", new Set(["2026-09"]));
    expect(v.map((x) => x.kluc)).toEqual(["ok"]);
  });
  test("pravidlo sedí aj na text v poznámke — rovnako ako pri stiahnutí", () => {
    const v = vydavkySoZnamymPravidlom([p({ kluc: "a", protistrana: "1234/3030", poznamka: "Nákup WOLT Brno", kategoria: "spolocne.Potraviny" })], PRAVIDLA);
    expect(v.length).toBe(1);
  });
  test("prvé pravidlo v poradí vyhráva — druhé s inou kategóriou riadok nezachráni", () => {
    const v = vydavkySoZnamymPravidlom([p({ kluc: "a", protistrana: "ANTHROPIC WOLT", kategoria: "spolocne.Potraviny" })], PRAVIDLA);
    expect(v).toEqual([]);
  });
});

describe("súhrn do okna", () => {
  test("sčíta po kategóriách, mená bez opakovania, najväčšia suma prvá", () => {
    const s = suhrnPodlaKategorie([
      { kategoria: "a", suma: -10, protistrana: "X" },
      { kategoria: "b", suma: -100, protistrana: "Y" },
      { kategoria: "a", suma: -20, protistrana: "X" },
    ]);
    expect(s).toEqual([
      { kategoria: "b", pocet: 1, suma: -100, kto: ["Y"] },
      { kategoria: "a", pocet: 2, suma: -30, kto: ["X"] },
    ]);
  });
});

describe("po kúskoch kvôli limitu D1", () => {
  test("250 kľúčov = tri dopyty, nič sa nestratí", () => {
    const k = poKusoch(Array.from({ length: 250 }, (_, i) => i));
    expect(k.map((x) => x.length)).toEqual([90, 90, 70]);
    expect(k.flat().length).toBe(250);
  });
});
