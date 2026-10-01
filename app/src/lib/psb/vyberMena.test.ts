import { describe, expect, it } from "bun:test";

import { najdiMena } from "./vyberMena";

const MENA = [
  "Marcela Hruzova", "Maria Strnadová", "Marina Krasavceva", "Martin Vaško",
  "Martin Spok", "Tomaš Mareš", "Lukáš Kríž", "Anna Kadličkova", "Žofia Nová",
];

describe("hľadanie mena v rolete", () => {
  it("bez textu vráti začiatok zoznamu, nie prázdno", () => {
    expect(najdiMena(MENA, "", 3)).toEqual(["Marcela Hruzova", "Maria Strnadová", "Marina Krasavceva"]);
  });

  it("nerozlišuje veľkosť písmen ani diakritiku", () => {
    expect(najdiMena(MENA, "ZOFIA")).toEqual(["Žofia Nová"]);
    expect(najdiMena(MENA, "vasko")).toEqual(["Martin Vaško"]);
  });

  it("hľadá aj v priezvisku", () => {
    expect(najdiMena(MENA, "hruz")).toEqual(["Marcela Hruzova"]);
    expect(najdiMena(MENA, "kriz")).toEqual(["Lukáš Kríž"]);
  });

  it("dve slová musia sedieť obe", () => {
    expect(najdiMena(MENA, "martin v")).toEqual(["Martin Vaško"]);
    expect(najdiMena(MENA, "martin x")).toEqual([]);
  });

  it("kto začína hľadaným, je hore", () => {
    // „mare" sedí na Mareša cez priezvisko; keby bol niekto „Mare…" krstným,
    // patrí nad neho.
    const v = najdiMena([...MENA, "Marek Dlouhý"], "mare");
    expect(v[0]).toBe("Marek Dlouhý");
    expect(v).toContain("Tomaš Mareš");
  });

  it("strop drží roletu krátku", () => {
    expect(najdiMena(MENA, "ma").length).toBeLessThanOrEqual(8);
    expect(najdiMena(MENA, "ma", 2)).toHaveLength(2);
  });
});
