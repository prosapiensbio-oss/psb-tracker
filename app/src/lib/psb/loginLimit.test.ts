import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { LIMIT_IP, LIMIT_MENO, OKNO_MS, vymazPokusy, zapisZlyhanie, zostavaBlok } from "./loginLimit.server";

function d1(db: Database) {
  const st = (sql: string, args: unknown[] = []) => ({
    sql, args,
    bind: (...a: unknown[]) => st(sql, a),
    all: async () => ({ results: db.query(sql).all(...(args as string[])) }),
    run: async () => { db.query(sql).run(...(args as string[])); return {}; },
  });
  return {
    prepare: (sql: string) => st(sql),
    batch: async (l: ReturnType<typeof st>[]) => { for (const s of l) await s.run(); },
  } as never;
}
function zaklad() {
  const db = new Database(":memory:");
  const m = readFileSync(new URL("../../../migrations/0129_session_ver_login_pokusy.sql", import.meta.url).pathname, "utf8");
  db.run(m.slice(m.indexOf("CREATE TABLE")));
  return db;
}
const T0 = Date.parse("2026-11-01T10:00:00Z");

describe("limit pokusov", () => {
  it("10 zlyhaní na IP + meno zablokuje, deviate ešte nie", async () => {
    const DB = d1(zaklad());
    for (let i = 0; i < LIMIT_MENO - 1; i++) await zapisZlyhanie(DB, "1.1.1.1", "jerry", T0);
    expect(await zostavaBlok(DB, "1.1.1.1", "jerry", T0)).toBe(0);
    await zapisZlyhanie(DB, "1.1.1.1", "jerry", T0);
    expect(await zostavaBlok(DB, "1.1.1.1", "jerry", T0)).toBe(OKNO_MS);
  });
  it("blok sa týka len tejto IP a tohto mena", async () => {
    const DB = d1(zaklad());
    for (let i = 0; i < LIMIT_MENO; i++) await zapisZlyhanie(DB, "1.1.1.1", "jerry", T0);
    expect(await zostavaBlok(DB, "2.2.2.2", "jerry", T0)).toBe(0);
    expect(await zostavaBlok(DB, "1.1.1.1", "terezka", T0)).toBe(0);
  });
  it("menenie mena limit neobíde (zdieľané heslo od mena nezávisí)", async () => {
    const DB = d1(zaklad());
    for (let i = 0; i < LIMIT_IP; i++) await zapisZlyhanie(DB, "1.1.1.1", `m${i}`, T0);
    expect(await zostavaBlok(DB, "1.1.1.1", "ine-meno", T0)).toBeGreaterThan(0);
  });
  it("po 15 minútach blok skončí a počet začne odznova", async () => {
    const db = zaklad();
    const DB = d1(db);
    for (let i = 0; i < LIMIT_MENO; i++) await zapisZlyhanie(DB, "1.1.1.1", "jerry", T0);
    expect(await zostavaBlok(DB, "1.1.1.1", "jerry", T0 + OKNO_MS - 1000)).toBe(1000);
    expect(await zostavaBlok(DB, "1.1.1.1", "jerry", T0 + OKNO_MS)).toBe(0);
    await zapisZlyhanie(DB, "1.1.1.1", "jerry", T0 + OKNO_MS + 1);
    const r = db.query("SELECT MAX(pocet) p FROM login_pokusy").get() as { p: number };
    expect(r.p).toBe(1);
  });
  it("úspech vymaže počet pre meno", async () => {
    const DB = d1(zaklad());
    for (let i = 0; i < LIMIT_MENO; i++) await zapisZlyhanie(DB, "1.1.1.1", "jerry", T0);
    await vymazPokusy(DB, "1.1.1.1", "jerry");
    expect(await zostavaBlok(DB, "1.1.1.1", "jerry", T0)).toBe(0);
  });
  it("v tabuľke nie je ani IP, ani napísané meno", async () => {
    const db = zaklad();
    await zapisZlyhanie(d1(db), "1.1.1.1", "omylom-heslo", T0);
    const text = JSON.stringify(db.query("SELECT * FROM login_pokusy").all());
    expect(text).not.toContain("1.1.1.1");
    expect(text).not.toContain("omylom-heslo");
  });
  it("staré riadky sa upracú", async () => {
    const db = zaklad();
    await zapisZlyhanie(d1(db), "1.1.1.1", "stare", T0);
    await zapisZlyhanie(d1(db), "2.2.2.2", "nove", T0 + 25 * 3600_000);
    expect((db.query("SELECT COUNT(*) n FROM login_pokusy").get() as { n: number }).n).toBe(2);
  });
  it("chýbajúca tabuľka ani výpadok nezablokujú prihlásenie", async () => {
    const bezTabulky = d1(new Database(":memory:"));
    expect(await zostavaBlok(bezTabulky, "1.1.1.1", "jerry", T0)).toBe(0);
    await zapisZlyhanie(bezTabulky, "1.1.1.1", "jerry", T0);
    await vymazPokusy(bezTabulky, "1.1.1.1", "jerry");
    const zla = { prepare: () => { throw new Error("D1"); } } as never;
    expect(await zostavaBlok(zla, "1.1.1.1", "jerry", T0)).toBe(0);
    await zapisZlyhanie(zla, "1.1.1.1", "jerry", T0);
    expect(await zostavaBlok(undefined, "1.1.1.1", "jerry", T0)).toBe(0);
  });
});
