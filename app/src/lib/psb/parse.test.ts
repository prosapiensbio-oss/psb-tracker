import { describe, expect, test } from "bun:test";

import { datumNarodenia, parseAnamneza } from "./parse";

/**
 * Anamnéza je Google Forms a ľudia si do nej píšu sami. Preto sa z nej berie
 * len to, čo sa dá overiť — a nezrozumiteľný tvar sa radšej zahodí než uhádne.
 */
describe("dátum narodenia z anamnézy", () => {
  test("prijme tvary, v ktorých to ľudia píšu", () => {
    expect(datumNarodenia("12.3.1984")).toBe("1984-03-12");
    expect(datumNarodenia("1984-03-12")).toBe("1984-03-12");
    expect(datumNarodenia("12/03/1984")).toBe("1984-03-12");
    expect(datumNarodenia(" 5. 9. 1990 ")).toBe("1990-09-05");
  });

  test("nezrozumiteľný tvar zahodí, neuhádne", () => {
    expect(datumNarodenia("marec 84")).toBe("");
    expect(datumNarodenia("")).toBe("");
    expect(datumNarodenia("32.13.1984")).toBe("");
  });

  test("rok v budúcnosti je preklep, nie dátum", () => {
    // Naďa Khamaziuk mala v exporte rok 2036 a appka ju kvôli tomu považovala
    // za dieťa. Zlý rok narodenia je horší než žiadny.
    expect(datumNarodenia("1.1.2036")).toBe("");
    expect(datumNarodenia("1.1.1899")).toBe("");
  });
});

describe("parseAnamneza", () => {
  const csv = (riadky: string[][]) => riadky.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");

  test("vytiahne meno, zdroj aj narodeniny", () => {
    const v = parseAnamneza(csv([
      ["Meno", "Příjmení", "Datum narození", "Jak jste se o nás dozvěděli?"],
      ["Jana", "Nováková", "12.3.1984", "Instagram"],
    ]));
    expect(v).toHaveLength(1);
    expect(v[0].meno).toBe("Jana Nováková");
    expect(v[0].narodeniny).toBe("1984-03-12");
    expect(v[0].zdroj).toBeTruthy();
  });

  test("bez stĺpca s narodeninami funguje ako doteraz", () => {
    const v = parseAnamneza(csv([
      ["Meno", "Příjmení", "Jak jste se o nás dozvěděli?"],
      ["Jana", "Nováková", "Instagram"],
    ]));
    expect(v[0].narodeniny).toBe("");
    expect(v[0].zdroj).toBeTruthy();
  });

  test("riadok s narodeninami a bez zdroja sa nezahodí", () => {
    // Zdroj a narodeniny sú dve nezávislé polia; jedno bez druhého má cenu.
    const v = parseAnamneza(csv([
      ["Meno", "Příjmení", "Datum narození", "Jak jste se o nás dozvěděli?"],
      ["Jana", "Nováková", "12.3.1984", ""],
    ]));
    expect(v).toHaveLength(1);
    expect(v[0].narodeniny).toBe("1984-03-12");
  });

  test("riadok bez mena sa preskočí", () => {
    const v = parseAnamneza(csv([
      ["Meno", "Příjmení", "Jak jste se o nás dozvěděli?"],
      ["", "", "Instagram"],
    ]));
    expect(v).toEqual([]);
  });
});
