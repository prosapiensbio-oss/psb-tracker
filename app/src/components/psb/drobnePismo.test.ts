import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const koren = join(import.meta.dir, "..", "..");
const css = readFileSync(join(koren, "styles.css"), "utf8");

describe("najmenšie písmo obsahu je 12 px", () => {
  test("každá inline veľkosť pod 12 px v komponentoch má pravidlo v styles.css", () => {
    const zlozka = join(koren, "components", "psb");
    const velkosti = new Set<string>();
    for (const f of readdirSync(zlozka)) {
      if (!f.endsWith(".tsx")) continue;
      const t = readFileSync(join(zlozka, f), "utf8");
      for (const m of t.matchAll(/fontSize:\s*(?:[^,}\n]*\?\s*)?(\d+(?:\.\d+)?)/g)) {
        if (Number(m[1]) < 12) velkosti.add(m[1]);
      }
    }
    expect(velkosti.size).toBeGreaterThan(0);
    for (const v of velkosti) {
      expect(css).toContain(`[style*="font-size: ${v}px"]`);
      expect(css).toContain(`[style*="font-size:${v}px"]`);
    }
  });
});
