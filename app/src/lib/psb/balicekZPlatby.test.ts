import { describe, expect, it } from "bun:test";

import { balicekZPlatby } from "./balicekZPlatby";

const bal = (nazov: string, cena: number, od: string) => ({ nazov, cena_czk: cena, platnost_od: od });

describe("balicekZPlatby", () => {
  it("suma sediaca s posledným balíčkom navrhne ten istý", () => {
    // Lukáš Hanus platí 6 990 Kč každý mesiac za to isté predplatné.
    const n = balicekZPlatby({
      suma: 6990, den: "2026-10-09",
      balicky: [bal("OFF - 6h S viazanostou", 6990, "2026-09-09"), bal("OFF - 6h S viazanostou", 6990, "2026-08-10")],
    });
    expect(n).toMatchObject({ nazov: "6h Předplatné", hodiny: 6, cena: 6990, platnostOd: "2026-10-09" });
    expect(n?.preco).toBe("to isté, čo si kúpil naposledy");
    // Platnosť sa dopočíta z cenníka, nie z hlavy.
    expect(n?.platnostDo).toBe("2026-11-06");
  });

  it("keď posledný balíček nesedí sumou, hľadá sa v cenníku", () => {
    const n = balicekZPlatby({
      suma: 9400, den: "2026-10-09",
      balicky: [bal("OFF - 6h S viazanostou", 6990, "2026-09-09")],
    });
    expect(n).toMatchObject({ nazov: "8h Balíček", hodiny: 8, cena: 9400 });
    expect(n?.preco).toBe("suma sedí s cenníkom");
  });

  it("klient bez histórie a suma mimo cenníka — NEHÁDA SA", () => {
    // Návrh, ktorý si vymyslí hodiny, je horší než prázdno.
    expect(balicekZPlatby({ suma: 3333, den: "2026-10-09", balicky: [] })).toBeNull();
  });

  it("zrušený balíček sa neberie ako posledný", () => {
    const n = balicekZPlatby({
      suma: 6990, den: "2026-10-09",
      balicky: [{ ...bal("OFF - 6h S viazanostou", 6990, "2026-09-09"), zrusene_at: "2026-09-10" }],
    });
    // Spadne na cenník — 6 990 je tam 6h Předplatné.
    expect(n?.preco).toBe("suma sedí s cenníkom");
  });

  it("nula a mínus nenavrhnú nič", () => {
    expect(balicekZPlatby({ suma: 0, den: "2026-10-09", balicky: [] })).toBeNull();
    expect(balicekZPlatby({ suma: -500, den: "2026-10-09", balicky: [] })).toBeNull();
  });
});
