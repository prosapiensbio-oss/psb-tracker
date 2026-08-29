import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { ritualy } from "./rituals";

/**
 * Týždenná únava je zápis JEDNÉHO človeka o sebe.
 *
 * Do 29. 8. 2026 stačilo, aby hodnotenie napísal ktokoľvek z dvojice, a
 * pripomienka zhasla obom — Terezka svoj týždeň nemala kde nájsť. Tieto
 * testy držia, že cudzí zápis ten môj neodškrtne.
 */
const PIATOK = new Date("2026-08-28T09:00:00Z");
const STREDA = new Date("2026-08-26T09:00:00Z");
const TW = "2026-08-24";

const tyzdenne = (dnes: Date, zaznam: Record<string, string>) =>
  ritualy(dnes, { [TW]: zaznam }, {}, { chybaju: [] }).filter((r) => r.druh === "tyzden");

describe("pripomienka týždennej únavy", () => {
  it("v piatok pýta oboch, keď nikto nezapísal", () => {
    const r = tyzdenne(PIATOK, {});
    expect(r.map((x) => x.trener).sort()).toEqual(["Jerry", "Terezka"]);
    expect(r.every((x) => x.splatne)).toBe(true);
  });

  it("Jerryho zápis NEZHASÍ Terezkinu pripomienku", () => {
    const r = tyzdenne(PIATOK, { jerry_score: "7" });
    const jerry = r.find((x) => x.trener === "Jerry")!;
    const terezka = r.find((x) => x.trener === "Terezka")!;
    expect(jerry.splatne).toBe(false);
    expect(jerry.hotove).toBe(true);
    expect(terezka.splatne).toBe(true);
  });

  it("poznámka bez hodnotenia nestačí — to je presne týždeň 24. 8. 2026", () => {
    const r = tyzdenne(PIATOK, { jerry_score: "7", terezka_note: "psík mal zdravotné problémy" });
    expect(r.find((x) => x.trener === "Terezka")!.splatne).toBe(true);
  });

  it("pred piatkom sa nepýta", () => {
    expect(tyzdenne(STREDA, {}).some((x) => x.splatne)).toBe(false);
  });

  it("klik vedie na konkrétny týždeň v Tréningy → Prehľad", () => {
    for (const r of tyzdenne(PIATOK, {})) {
      expect(r.ciel).toEqual({ tab: "treningy", sub: "prehled", tyzden: TW });
    }
  });

  it("každý má vlastný kľúč, takže odklepnutie jedného neumlčí druhého", () => {
    const r = tyzdenne(PIATOK, {});
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
  });
});

/**
 * Klik má viesť až k písaniu, nie k tabuľke.
 *
 * Register skladá cieľ do reťazca „tab|sub|t:PONDELOK" a Tréningy podľa tvaru
 * rozlišujú „zvýrazni riadok" (štítok „24.8.") od „ROZBAĽ ho" (RRRR-MM-DD).
 * Keď Dashboard posielal štítok, tabuľka sa len prefiltrovala a políčko na
 * náročnosť zostalo zabalené.
 */
describe("cieľ prekliku otvára riadok týždňa", () => {
  const dash = readFileSync(new URL("../../components/psb/Dashboard.tsx", import.meta.url).pathname, "utf8");
  const treningy = readFileSync(new URL("../../components/psb/Treningy.tsx", import.meta.url).pathname, "utf8");

  it("Dashboard posiela pondelok, nie štítok riadku", () => {
    expect(dash).toContain('{ week: zapisCiel[2].slice(2), nonce: Date.now() }');
    expect(dash).not.toContain("week: weekLabel(zapisCiel[2].slice(2))");
  });

  it("Tréningy na tvar RRRR-MM-DD riadok rozbalia", () => {
    expect(treningy).toContain("setOpenWeek(focus.week)");
    expect(treningy).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(focus\.week\)/);
  });
});
