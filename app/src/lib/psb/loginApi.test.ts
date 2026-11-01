import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";

import { hmacHex } from "./sessionToken";
import { env, podstrcEnv } from "./testEnv";

/** `/api/login` celou cestou: skutočný kód nad skutočným SQLite. */
const SECRET = "testovacie-tajomstvo";
const SPOLOCNE = "spolocne-heslo-1";
const H_JERRY = "vlastne-heslo-jerry";
podstrcEnv();
const { loginPost } = await import("./loginApi.server");
const { currentUser, hashPassword, zabudniKonta } = await import("./auth.server");
const { LIMIT_MENO } = await import("./loginLimit.server");

function d1(db: Database) {
  const prepare = (sql: string) => {
    const st = (args: unknown[]) => ({
      first: async () => db.query(sql).get(...(args as string[])) ?? null,
      all: async () => ({ results: db.query(sql).all(...(args as string[])) }),
      run: async () => { const r = db.query(sql).run(...(args as string[])); return { meta: { changes: r.changes } }; },
      bind: (...a: unknown[]) => st(a),
    });
    return st([]);
  };
  return {
    prepare,
    batch: async (dopyty: { run: () => Promise<unknown> }[]) => { for (const d of dopyty) await d.run(); },
  };
}

async function zaklad() {
  const db = new Database(":memory:");
  db.run("CREATE TABLE users (login TEXT PRIMARY KEY, name TEXT, pass_hash TEXT, pass_salt TEXT, active INT DEFAULT 1, created_at TEXT, last_login TEXT, session_ver INT NOT NULL DEFAULT 0)");
  db.run("CREATE TABLE login_pokusy (kluc TEXT PRIMARY KEY, pocet INT NOT NULL, prve_at TEXT NOT NULL)");
  const vloz = async (login: string, name: string, heslo: string, active = 1) =>
    db.run("INSERT INTO users (login, name, pass_hash, pass_salt, active, created_at) VALUES (?,?,?,?,?,'')", [login, name, await hashPassword(heslo, "s"), "s", active]);
  await vloz("jerry", "Jerry", H_JERRY);
  await vloz("test-zmazat", "Test Zmazať", "stare-heslo", 0);
  env.DB = d1(db);
  return db;
}

const prihlas = (telo: unknown, ip = "1.1.1.1") =>
  loginPost(new Request("https://k/api/login", { method: "POST", headers: { "cf-connecting-ip": ip }, body: JSON.stringify(telo) }));
const pocet = (db: Database) => (db.query("SELECT COALESCE(SUM(pocet), 0) AS n FROM login_pokusy").get() as { n: number }).n;

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  env.PSB_SESSION_SECRET = SECRET;
  env.PSB_PASSWORD = SPOLOCNE;
  zabudniKonta();
});

describe("vlastné konto", () => {
  it("správne heslo: 200, cookie, ktorá naozaj prihlási", async () => {
    await zaklad();
    const r = await prihlas({ login: " JERRY ", password: H_JERRY });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, user: "Jerry" });
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    expect(await currentUser(new Request("https://k/api/data", { headers: { cookie } }))).toBe("Jerry");
  });
  it("zlé heslo: 401 a pokus sa započíta", async () => {
    const db = await zaklad();
    const r = await prihlas({ login: "jerry", password: "zle-heslo-123" });
    expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(pocet(db)).toBe(2);   // IP + meno a samotná IP
  });
  it("vypnuté konto ani so správnym heslom", async () => {
    await zaklad();
    expect((await prihlas({ login: "test-zmazat", password: "stare-heslo" })).status).toBe(401);
  });
  it("limit pokusov ostáva", async () => {
    await zaklad();
    for (let i = 0; i < LIMIT_MENO; i++) expect((await prihlas({ login: "jerry", password: "zle-heslo-123" })).status).toBe(401);
    const r = await prihlas({ login: "jerry", password: H_JERRY });
    expect(r.status).toBe(429);
    expect(((await r.json()) as { sprava: string }).sprava).toContain("Priveľa");
  });
});

describe("spoločné heslo je zrušené", () => {
  it("bez konta, s neznámym menom aj s menom konta: 401 bez cookie a pokus sa započíta", async () => {
    const db = await zaklad();
    for (const login of ["", "falosny", "app", "btc", "jerry", "test-zmazat"]) {
      const r = await prihlas({ login, password: SPOLOCNE });
      expect(r.status).toBe(401);
      expect(r.headers.get("set-cookie")).toBeNull();
    }
    expect(pocet(db)).toBeGreaterThan(0);
  });
  it("ani pri výpadku databázy, kde kedysi otvorilo appku", async () => {
    env.DB = { prepare: () => { throw new Error("D1 neodpovedá"); } };
    const r = await prihlas({ login: "jerry", password: SPOLOCNE });
    expect(r.status).toBe(503);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});

describe("výpadok nie je zlé heslo", () => {
  it("databáza neodpovedá: 503 so správou, nie 401", async () => {
    env.DB = { prepare: () => { throw new Error("D1 neodpovedá"); } };
    const r = await prihlas({ login: "jerry", password: H_JERRY });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { sprava: string }).sprava).toContain("Databáza");
  });
  it("databáza chýba: 503", async () => {
    expect((await prihlas({ login: "jerry", password: H_JERRY })).status).toBe(503);
  });
  it("chýba tajomstvo podpisov: 503 so správou", async () => {
    await zaklad();
    delete env.PSB_SESSION_SECRET;
    const r = await prihlas({ login: "jerry", password: H_JERRY });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { sprava: string }).sprava).toContain("Jerrymu");
  });
});

describe("prechod z bitcoinovej knihy ostáva", () => {
  it("cookie prechodu z knihy platí, kým je podpísaná tajomstvom", async () => {
    await zaklad();
    const t = await hmacHex(SECRET, "psb-authed-v1|btc");
    const cookie = `psb_session=${encodeURIComponent(`btc|${t}`)}`;
    expect(await currentUser(new Request("https://k/api/data", { headers: { cookie } }))).toBe("btc");
  });
});
