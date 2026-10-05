import { describe, expect, it } from "bun:test";

import { smieSaZapamatat, sposobZRiadku } from "./platbyEvidencia";

describe("pravidlo sa učí len z priezviska (5. 10. 2026)", () => {
  it("samotné krstné meno pravidlo nevyrobí", () => {
    // Zošit: „Jarek" 56 000 Kč bol Jarek Broskva, nie Jarek Heinrich.
    expect(smieSaZapamatat("jarek", "Jarek Heinrich")).toBe(false);
  });
  it("priezvisko v odosielateľovi áno, aj prechýlené", () => {
    expect(smieSaZapamatat("ing.heinrich ja", "Jarek Heinrich")).toBe(true);
    expect(smieSaZapamatat("mirejovsky jiri", "Jiři Miřejovský")).toBe(true);
  });
});

describe("spôsob platby podľa riadku", () => {
  it("zápis zo zošita je hotovosť, prevod banka", () => {
    expect(sposobZRiadku({ typ: "hotovosť" })).toBe("hotovost");
    expect(sposobZRiadku({ typ: "Okamžitá příchozí platba" })).toBe("banka");
    expect(sposobZRiadku({ typ: null })).toBe("banka");
  });
});
