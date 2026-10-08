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
});
