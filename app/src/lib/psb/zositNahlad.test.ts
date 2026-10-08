import { describe, expect, it } from "bun:test";

import { oznacZosit } from "./zositNahlad";

const db = [
  { date: "2026-06-12", amount_czk: -1500, counterparty: "Terezka", category: "vyplaty.terezka" },
  { date: "2026-06-12", amount_czk: -1500, counterparty: "Terezka", category: "vyplaty.terezka" },
  { date: "2026-07-03", amount_czk: 1100, counterparty: "Novák úvodní", category: "mimo" },
  { date: "2026-08-20", amount_czk: -350, counterparty: "Káva Ahsoka", category: "spolocne.Ahsoka" },
];

describe("náhľad zošita proti Kokpitu", () => {
  it("staré riadky spozná a ukáže ich kategóriu (jún–august, Jerry 8. 10. 2026)", () => {
    const o = oznacZosit([
      { datum: "2026-06-12", popis: "Terka", suma: -1500 },
      { datum: "2026-06-12", popis: "Terka", suma: -1500 },
      { datum: "2026-06-12", popis: "Terka", suma: -1500 },
    ], db);
    expect(o.map((r) => r.uzMame)).toEqual([true, true, false]);
    expect(o[0].kategoria).toBe("vyplaty.terezka");
  });

  it("rukopis s posunutým dňom sa spáruje len pri rovnakom prvom slove", () => {
    expect(oznacZosit([{ datum: "2026-08-21", popis: "kava", suma: -350 }], db)[0].uzMame).toBe(true);
    expect(oznacZosit([{ datum: "2026-08-21", popis: "Lidl", suma: -350 }], db)[0].uzMame).toBe(false);
  });

  it("nový výdavok dostane návrh z pravidiel, príjem nie", () => {
    const pravidla = [{ vzor: "lidl", kategoria: "spolocne.Potraviny" }];
    const o = oznacZosit([
      { datum: "2026-09-10", popis: "Lidl nákup", suma: -420 },
      { datum: "2026-09-11", popis: "Lidl vratka", suma: 60 },
    ], [], pravidla);
    expect(o[0]).toMatchObject({ uzMame: false, kategoria: "spolocne.Potraviny" });
    expect(o[1].kategoria).toBe("");
  });

  it("príjem 200 Kč sa navrhne ako predaj loptičky", () => {
    expect(oznacZosit([{ datum: "2026-09-01", popis: "Janka Malinová", suma: 200 }], [])[0].kategoria).toBe("prijem.produkt");
    expect(oznacZosit([{ datum: "2026-09-02", popis: "Naďa", suma: 9400 }], [])[0].kategoria).toBe("");
  });
});

describe("presun na účet je vlastný zápis a vie o vklade", () => {
  const vklady = [{ date: "2026-09-18", amount_czk: 23000, counterparty: "Vklad do bankomatu: FIO BANKA, JOŠTOVA 4" }];

  it("riadok zostáva zapnutý a dostane kategóriu presun", () => {
    const [r] = oznacZosit([{ datum: "2026-09-18", popis: "presun na účet", suma: -23000 }], [], [], vklady);
    expect(r.uzMame).toBe(false);
    expect(r.kategoria).toBe("presun");
    expect(r.parovanie?.datum).toBe("2026-09-18");
    expect(r.parovanie?.popis).toContain("JOŠTOVA");
  });

  it("sedí aj o dva dni vedľa a bez ohľadu na znamienko", () => {
    const [r] = oznacZosit([{ datum: "2026-09-20", popis: "na účet", suma: 23000 }], [], [], vklady);
    expect(r.parovanie).toBeTruthy();
  });

  it("iná suma sa nespáruje — peniaze sa nehádajú", () => {
    const [r] = oznacZosit([{ datum: "2026-09-18", popis: "presun na účet", suma: -22000 }], [], [], vklady);
    expect(r.parovanie).toBeUndefined();
    expect(r.kategoria).not.toBe("presun");
  });

  it("jeden vklad pokryje jeden riadok, nie dva", () => {
    const rs = oznacZosit([
      { datum: "2026-09-18", popis: "presun na účet", suma: -23000 },
      { datum: "2026-09-19", popis: "presun na účet", suma: -23000 },
    ], [], [], vklady);
    expect(rs.map((x) => !!x.parovanie)).toEqual([true, false]);
  });
});
