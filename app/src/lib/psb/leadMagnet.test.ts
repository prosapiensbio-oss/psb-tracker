/**
 * Lead magnet nie je dopyt — stráž, aby sa to nerozišlo.
 *
 * Jerry, 24. 9. 2026: „keď má lead magnet, to nie je úplne dopyt, ktorý
 * potrebujem evidovať — evidujme hlavne tie, ktoré sú o úvodnom."
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const KOREN = new URL("../../../", import.meta.url).pathname;

describe("lead magnet sa oddeľuje na jednom mieste", () => {
  it("db.server.ts vyhadzuje magnety z `leads` a dáva ich do `magnety`", () => {
    // Keby sa filtrovalo až v pätnástich výpočtoch, na šestnásty sa zabudne.
    const s = readFileSync(`${KOREN}src/lib/psb/db.server.ts`, "utf8");
    expect(s).toContain('!== "magnet"');
    expect(s).toContain("magnety:");
  });

  it("formulár z webu magnet označí pri zápise", () => {
    const s = readFileSync(`${KOREN}src/routes/api/lead-web.ts`, "utf8");
    expect(s).toContain("jeMagnet");
    expect(s).toContain('"magnet" : "dopyt"');
  });

  it("stĺpec `druh` má migráciu s predvolenou hodnotou `dopyt`", () => {
    // Bez DEFAULT by staré riadky mali NULL a vypadli by z oboch zoznamov.
    const s = readFileSync(`${KOREN}migrations/0072_lead_druh.sql`, "utf8");
    expect(s).toContain("NOT NULL DEFAULT 'dopyt'");
  });

  it("typ Lead pozná druh", () => {
    const s = readFileSync(`${KOREN}src/lib/psb/types.ts`, "utf8");
    expect(s).toContain('druh: "dopyt" | "magnet"');
  });
});
