import { describe, expect, it } from "bun:test";

import { PROMPTY_KONTROL, promptKontroly, promptSKontextom } from "./kontrolnePrompty";

describe("promptSKontextom", () => {
  const ctx = { mesiac: "2026-09", nalezy: ["7 príjmov z banky bez klienta (54 810 Kč)"], minule: null };

  it("nesie mesiac aj to, čo appka našla sama", () => {
    const t = promptSKontextom("peniaze", ctx) || "";
    expect(t).toContain("KONTROLOVANÝ MESIAC: 2026-09");
    expect(t).toContain("7 príjmov z banky bez klienta");
    expect(t).toContain("začni tu, nie od nuly");
  });

  it("obsahuje aj pôvodný prompt a protokol — kontext ho dopĺňa, nenahrádza", () => {
    const t = promptSKontextom("peniaze", ctx) || "";
    expect(t.startsWith(promptKontroly("peniaze") || "x")).toBe(true);
  });

  it("bez nálezov povie, že sa má hľadať inde", () => {
    const t = promptSKontextom("peniaze", { mesiac: "2026-09", nalezy: [], minule: null }) || "";
    expect(t).toContain("hľadaj to, na čo sa nepýta");
  });

  it("minulý nález pripomenie aj s dátumom", () => {
    const t = promptSKontextom("marketing", { mesiac: "2026-09", minule: { kedy: "2026-08-14", zistenie: "lievik ukazoval 124 %" } }) || "";
    expect(t).toContain("MINULÁ KONTROLA (2026-08-14)");
    expect(t).toContain("124 %");
    expect(t).toContain("nehľadaj druhýkrát");
  });

  it("neznáma oblasť nevyrobí prázdny prompt", () => {
    expect(promptSKontextom("nieco", ctx)).toBeNull();
  });

  it("každá oblasť kontroly má prompt", () => {
    for (const id of ["peniaze", "klienti", "marketing", "jarvis"]) {
      expect(PROMPTY_KONTROL[id], id).toBeDefined();
      expect((promptKontroly(id) || "").length).toBeGreaterThan(200);
    }
  });
});
