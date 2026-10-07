import { describe, expect, it } from "bun:test";

import { balicekZPlatby } from "./balicekZPlatby";

const bal = (nazov: string, cena: number, od: string) => ({ nazov, cena_czk: cena, platnost_od: od });

describe("balicekZPlatby", () => {
  it("klient s balíčkom nedostane návrh — ďalší vznikne prvým tréningom (Papiež, 7. 10. 2026)", () => {
    const n = balicekZPlatby({
      suma: 6990, den: "2026-09-29",
      balicky: [bal("OFF - 6h S viazanostou", 6990, "2026-08-27"), bal("Předplatné 6 h", 6990, "2026-09-29")],
    });
    expect(n).toBeNull();
  });

  it("nový klient: suma sediaca s cenníkom navrhne položku a platnosť z cenníka", () => {
    const n = balicekZPlatby({ suma: 9400, den: "2026-10-09", balicky: [] });
    expect(n).toMatchObject({ nazov: "8h Balíček", hodiny: 8, cena: 9400 });
    expect(n?.preco).toBe("suma sedí s cenníkom");
    // Předplatné je MESIAC ako v PTminderi (9. 10. → 8. 11.), nie štyri týždne.
    expect(balicekZPlatby({ suma: 6990, den: "2026-10-09", balicky: [] })?.platnostDo).toBe("2026-11-08");
  });

  it("klient bez histórie a suma mimo cenníka — NEHÁDA SA", () => {
    // Návrh, ktorý si vymyslí hodiny, je horší než prázdno.
    expect(balicekZPlatby({ suma: 3333, den: "2026-10-09", balicky: [] })).toBeNull();
  });

  it("zrušený balíček sa neráta", () => {
    const n = balicekZPlatby({
      suma: 6990, den: "2026-10-09",
      balicky: [{ ...bal("OFF - 6h S viazanostou", 6990, "2026-09-09"), zrusene_at: "2026-09-10" }],
    });
    // Zrušený balíček nie je história — ako nový klient, spadne na cenník.
    expect(n?.preco).toBe("suma sedí s cenníkom");
  });

  it("nula a mínus nenavrhnú nič", () => {
    expect(balicekZPlatby({ suma: 0, den: "2026-10-09", balicky: [] })).toBeNull();
    expect(balicekZPlatby({ suma: -500, den: "2026-10-09", balicky: [] })).toBeNull();
  });
});
