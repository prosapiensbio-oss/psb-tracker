import { describe, expect, test } from "bun:test";

import { guillermoZostatok, type GuillermoUdalost, type GuillermoZaznam } from "./guillermo";

const ev = (zaciatok: string, typ: string | null = "guillermo"): GuillermoUdalost => ({ typ, zaciatok });

describe("guillermoZostatok", () => {
  test("kotva + kúpené po kotve − odtrénované po kotve", () => {
    const zaznamy: GuillermoZaznam[] = [
      { datum: "2026-08-09", druh: "zostatok", hodiny: 3 },
      { datum: "2026-08-20", druh: "nakup", hodiny: 5 },
    ];
    const udalosti = [ev("2026-08-25T14:00"), ev("2026-09-01T14:00")];
    const r = guillermoZostatok(zaznamy, udalosti, "2026-09-09");
    expect(r.kotvaHodiny).toBe(3);
    expect(r.kupene).toBe(5);
    expect(r.odtrenovane).toBe(2);
    expect(r.zostatok).toBe(6); // 3 + 5 − 2
  });

  test("berie NAJNOVŠIU kotvu a ignoruje nákupy/tréningy PRED ňou", () => {
    const zaznamy: GuillermoZaznam[] = [
      { datum: "2026-06-01", druh: "zostatok", hodiny: 10 }, // stará kotva — ignoruje sa
      { datum: "2026-08-09", druh: "zostatok", hodiny: 3 }, // najnovšia
      { datum: "2026-07-29", druh: "nakup", hodiny: 3 }, // pred kotvou → neráta
    ];
    // tréning 5. 8. je PRED kotvou (9. 8.) → nezapočíta sa (je už v tej trojke)
    const r = guillermoZostatok(zaznamy, [ev("2026-08-05T12:00")], "2026-09-09");
    expect(r.kotvaDatum).toBe("2026-08-09");
    expect(r.kupene).toBe(0);
    expect(r.odtrenovane).toBe(0);
    expect(r.zostatok).toBe(3);
  });

  test("starý tréning (dávno po kotve) sa STÁLE počíta — nevypadne z okna", () => {
    // Regresia na fix z 8. 9. 2026: kým funkcia dostane VŠETKY guillermo
    // udalosti, započíta aj tú spred mesiacov.
    const zaznamy: GuillermoZaznam[] = [{ datum: "2026-01-01", druh: "zostatok", hodiny: 5 }];
    const r = guillermoZostatok(zaznamy, [ev("2026-03-15T10:00")], "2026-09-09");
    expect(r.odtrenovane).toBe(1);
    expect(r.zostatok).toBe(4);
  });

  test("budúci tréning (po dnes) sa nezapočíta; iný typ sa ignoruje", () => {
    const zaznamy: GuillermoZaznam[] = [{ datum: "2026-08-01", druh: "zostatok", hodiny: 4 }];
    const udalosti = [
      ev("2026-08-15T10:00"), // ráta sa
      ev("2026-09-20T10:00"), // po dnes → neráta
      ev("2026-08-16T10:00", "trening"), // iný typ → neráta
      ev("2026-08-17T10:00", null), // bez typu → neráta
    ];
    const r = guillermoZostatok(zaznamy, udalosti, "2026-09-09");
    expect(r.odtrenovane).toBe(1);
    expect(r.zostatok).toBe(3);
  });

  test("bez kotvy: kotvaHodiny 0 a započíta sa všetko (odKedy je sentinel)", () => {
    const zaznamy: GuillermoZaznam[] = [{ datum: "2026-05-01", druh: "nakup", hodiny: 6 }];
    const r = guillermoZostatok(zaznamy, [ev("2026-05-10T10:00")], "2026-09-09");
    expect(r.kotvaDatum).toBeNull();
    expect(r.kotvaHodiny).toBe(0);
    expect(r.kupene).toBe(6);
    expect(r.odtrenovane).toBe(1);
    expect(r.zostatok).toBe(5);
  });

  test("záporný zostatok, keď odtrénoval viac, než mal", () => {
    const zaznamy: GuillermoZaznam[] = [{ datum: "2026-08-01", druh: "zostatok", hodiny: 1 }];
    const r = guillermoZostatok(zaznamy, [ev("2026-08-05T10:00"), ev("2026-08-12T10:00"), ev("2026-08-19T10:00")], "2026-09-09");
    expect(r.zostatok).toBe(-2); // 1 − 3
  });
});
