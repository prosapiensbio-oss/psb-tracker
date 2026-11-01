import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Index z migrácie 0130 na skutočnom SQLite: duplicitu automatického balíčka
 * odmietne, pravidlo „zrušený balíček vznikne znova" nezmení.
 */
const db = () => {
  const d = new Database(":memory:");
  d.exec(`CREATE TABLE balicky (id TEXT PRIMARY KEY, klient TEXT NOT NULL, platnost_od TEXT NOT NULL, poznamka TEXT, zrusene_at TEXT);
    CREATE TABLE balicky_presun (id TEXT PRIMARY KEY, klient TEXT NOT NULL, z_platnosti_do TEXT NOT NULL, autor TEXT);`);
  d.exec(readFileSync(join(import.meta.dir, "../../../migrations/0130_balicky_automaticky_unikatny.sql"), "utf8"));
  return d;
};
const vloz = (d: Database, id: string, poznamka: string | null, od = "2026-11-01", klient = "Jan") =>
  d.prepare("INSERT INTO balicky (id, klient, platnost_od, poznamka) VALUES (?,?,?,?) ON CONFLICT DO NOTHING").run(id, klient, od, poznamka).changes;

describe("migrácia 0130 — automatický balíček raz", () => {
  it("druhý automatický v ten istý deň nevznikne a zápis to pozná", () => {
    const d = db();
    expect(vloz(d, "a", "automaticky — vznikol prvým tréningom 1. 11. 2026")).toBe(1);
    expect(vloz(d, "b", "automaticky — pokračovanie předplatného od 1. 11. 2026")).toBe(0);
    expect(d.query("SELECT COUNT(*) n FROM balicky").get()).toEqual({ n: 1 });
  });
  it("zrušený vznikne znova — pravidlo sa nemení", () => {
    const d = db();
    vloz(d, "a", "automaticky — x");
    d.exec("UPDATE balicky SET zrusene_at = 't' WHERE id = 'a'");
    expect(vloz(d, "b", "automaticky — x")).toBe(1);
  });
  it("vrátenie zrušeného, kým stojí nový, hodí chybu (route ju preloží)", () => {
    const d = db();
    vloz(d, "a", "automaticky — x");
    d.exec("UPDATE balicky SET zrusene_at = 't' WHERE id = 'a'");
    vloz(d, "b", "automaticky — x");
    expect(() => d.exec("UPDATE balicky SET zrusene_at = NULL WHERE id = 'a'")).toThrow(/UNIQUE constraint failed: balicky\.klient/);
  });
  it("ručný balíček, iný deň a iný klient index nezaujímajú", () => {
    const d = db();
    vloz(d, "a", "automaticky — x");
    expect(vloz(d, "b", "ručný")).toBe(1);
    expect(vloz(d, "c", null)).toBe(1);
    expect(vloz(d, "d", "automaticky — x", "2026-11-02")).toBe(1);
    expect(vloz(d, "e", "automaticky — x", "2026-11-01", "Eva")).toBe(1);
  });
  it("presun hodín: automat raz, človek koľkokrát chce", () => {
    const d = db();
    const p = (id: string, autor: string) => d.prepare("INSERT INTO balicky_presun VALUES (?, 'Jan', '2026-10-31', ?) ON CONFLICT DO NOTHING").run(id, autor).changes;
    expect(p("a", "kokpit")).toBe(1);
    expect(p("b", "kokpit")).toBe(0);
    expect(p("c", "Jerry")).toBe(1);
    expect(p("d", "Jerry")).toBe(1);
  });
});
