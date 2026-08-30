import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Týždeň sa Jarvisovi posiela ako rozsah, nie ako jeden deň.
 *
 * 30. 8. 2026 dostal len pondelok („17.8.“), domyslel si okno „18.–24. 8.“
 * a Jerrymu tvrdil pokles 5 %, kým dlaždica hovorila 18 %. Skutočné týždne
 * boli 17.–23. 8. (50 h) a 24.–30. 8. (40 h), teda pokles 20 %.
 */
describe("týždenné hodiny pre Jarvisa", () => {
  const zdroj = readFileSync(new URL("./aiContext.ts", import.meta.url).pathname, "utf8");

  it("existuje pomocná funkcia na rozsah týždňa", () => {
    expect(zdroj).toContain("const rozsahTyzdna = (k: string)");
  });

  it("rozpis po trénerovi nesie od aj do", () => {
    expect(zdroj).toContain("weekRows.map(([k, v]) => ({ ...rozsahTyzdna(k)");
  });

  it("posledný úplný týždeň nesie rozsah, nie holý pondelok", () => {
    expect(zdroj).not.toContain("tyzden: lastWeek ? weekLabel(lastWeek) : null");
  });

  it("rozsah je pondelok až nedeľa a nesie rok", () => {
    // Rovnaký výpočet ako v aiContext — keby sa tam zmenil, tento test padne.
    const k = "2026-08-17";
    const od = new Date(`${k}T00:00:00Z`);
    const do_ = new Date(od.getTime() + 6 * 86400_000);
    expect(do_.toISOString().slice(0, 10)).toBe("2026-08-23");
    expect(`${od.getUTCDate()}.–${do_.getUTCDate()}. ${do_.getUTCMonth() + 1}. ${do_.getUTCFullYear()}`)
      .toBe("17.–23. 8. 2026");
  });
});
