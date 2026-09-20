import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Každá dlaždica v karte reklamy musí mať svoj zoznam riadkov.
 *
 * 20. 9. 2026: dlaždica „Cena za dopyt" pribudla, zoznam `cenadopyt` k nej
 * nie. `zoznamy[kluc]` bolo `undefined`, `z.riadky.length` vyhodilo výnimku
 * a koreňová hranica zhasla CELÝ Kokpit — Jerry videl „This page didn't load"
 * na všetkom, nielen na tejto karte. TypeScript to nechytí: index do
 * `Record<string, …>` je podľa neho vždy platný.
 */
describe("Reklama — dlaždice a ich zoznamy", () => {
  const zdroj = readFileSync(new URL("./Reklama.tsx", import.meta.url), "utf8");

  it("každý kľúč z stat(...) je definovaný v zoznamy", () => {
    const pouzite = [...zdroj.matchAll(/\bstat\(\s*"([a-z]+)"/g)].map((m) => m[1]);
    const blok = /const zoznamy[\s\S]*?\n  \};/.exec(zdroj)?.[0] || "";
    const definovane = new Set([...blok.matchAll(/^\s{4}([a-z]+):\s*\{$/gm)].map((m) => m[1]));
    expect(pouzite.length).toBeGreaterThan(3);
    expect(pouzite.filter((k) => !definovane.has(k))).toEqual([]);
  });
});
