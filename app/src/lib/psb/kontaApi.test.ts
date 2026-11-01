import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";

import { smieKonta, rolaKonta } from "./kontaPrava";
import { hmacHex, tokenSession } from "./sessionToken";
import { env, podstrcEnv } from "./testEnv";

/** `/api/users` celou cestou: skutočný kód nad skutočným SQLite, každá rola. */
const SECRET = "testovacie-tajomstvo";
const STRIZNA = "s".repeat(32);
podstrcEnv();
const { kontaGet, kontaPost } = await import("./kontaApi.server");
const { currentUser, hashPassword, overPouzivatela, zabudniKonta } = await import("./auth.server");

function d1(db: Database) {
  return {
    prepare(sql: string) {
      const st = (args: unknown[]) => ({
        first: async () => db.query(sql).get(...(args as string[])) ?? null,
        all: async () => ({ results: db.query(sql).all(...(args as string[])) }),
        run: async () => { const r = db.query(sql).run(...(args as string[])); return { meta: { changes: r.changes } }; },
        bind: (...a: unknown[]) => st(a),
      });
      return st([]);
    },
  };
}

const H_JERRY = "pôvodné-heslo-jerry";
const H_TEREZKA = "pôvodné-heslo-terezka";
async function zaklad(sVerziou = true) {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE users (login TEXT PRIMARY KEY, name TEXT, pass_hash TEXT, pass_salt TEXT, active INT DEFAULT 1, created_at TEXT, last_login TEXT ${sVerziou ? ", session_ver INT NOT NULL DEFAULT 0" : ""})`);
  db.run("CREATE TABLE vzas_audit (id TEXT, at TEXT, actor TEXT, action TEXT, payment_id TEXT, month TEXT, old_value TEXT, new_value TEXT, reason TEXT)");
  const vloz = async (login: string, name: string, heslo: string, active = 1) =>
    db.run("INSERT INTO users (login, name, pass_hash, pass_salt, active, created_at) VALUES (?,?,?,?,?,'')", [login, name, await hashPassword(heslo, "s"), "s", active, ]);
  await vloz("jerry", "Jerry", H_JERRY);
  await vloz("terezka", "Terezka", H_TEREZKA);
  await vloz("test-zmazat", "Test Zmazať", "stare-heslo", 0);
  env.DB = d1(db);
  return db;
}

const cookieV0 = async (meno = "") => {
  const t = await hmacHex(SECRET, meno ? `psb-authed-v1|${meno}` : "psb-authed-v1");
  return meno ? `${meno}|${t}` : t;
};
const cookieV = async (meno: string, v: number) => `${meno}|${await tokenSession(SECRET, meno, v)}`;
const hlavicky = (cookie?: string, ine: Record<string, string> = {}) => ({
  ...(cookie ? { cookie: `psb_session=${encodeURIComponent(cookie)}` } : {}), ...ine,
});
const post = (telo: unknown, cookie?: string, ine: Record<string, string> = {}) =>
  kontaPost(new Request("https://k/api/users", { method: "POST", headers: hlavicky(cookie, ine), body: JSON.stringify(telo) }));
const kto = (cookie: string) => currentUser(new Request("https://k/api/data", { headers: hlavicky(cookie) }));
const hash = (db: Database, login: string) => (db.query("SELECT pass_hash FROM users WHERE login = ?").get(login) as { pass_hash: string }).pass_hash;
const riadok = (db: Database, login: string) => db.query("SELECT * FROM users WHERE login = ?").get(login) as Record<string, unknown> | null;
const audity = (db: Database) => db.query("SELECT actor, action, payment_id, old_value, new_value FROM vzas_audit").all() as Record<string, string | null>[];
const heslaPlati = async (db: Database, login: string, heslo: string) => (await overPouzivatela(d1(db) as never, login, heslo)) !== null;
/** Hodnota novej cookie z odpovede. */
const novaCookie = (r: Response) => {
  const c = r.headers.get("set-cookie");
  return c ? decodeURIComponent(c.split(";")[0].split("=").slice(1).join("=")) : null;
};
const NOVE = "úplne-nové-heslo-1";

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  env.PSB_SESSION_SECRET = SECRET;
  env.STRIZNA_TOKEN = STRIZNA;
  zabudniKonta();
});

describe("Terezka (tréner)", () => {
  it("zmení si vlastné heslo a neodhlási sa", async () => {
    const db = await zaklad();
    const stara = await cookieV0("Terezka");
    const r = await post({ login: "terezka", password: NOVE }, stara);
    expect(r.status).toBe(200);
    expect(await heslaPlati(db, "terezka", NOVE)).toBe(true);
    expect(await heslaPlati(db, "terezka", H_TEREZKA)).toBe(false);
    expect(riadok(db, "terezka")!.session_ver).toBe(1);
    // Nová cookie platí, stará v0 z iného zariadenia už nie.
    expect(await kto(novaCookie(r)!)).toBe("Terezka");
    expect(await kto(stara)).toBeNull();
  });
  it("heslo Jerryho neprepíše — ani heslo, ani meno, ani tvarom loginu", async () => {
    const db = await zaklad();
    const pred = hash(db, "jerry");
    const c = await cookieV0("Terezka");
    for (const telo of [
      { login: "jerry", password: NOVE },
      { login: "JERRY", password: NOVE },
      { login: " jerry ", password: NOVE, name: "Jerry" },
    ]) {
      const r = await post(telo, c);
      expect(r.status).toBe(403);
      expect(novaCookie(r)).toBeNull();
    }
    expect(hash(db, "jerry")).toBe(pred);
    expect(audity(db)).toEqual([]);
  });
  it("nezaloží konto, nevypne, neodhlási všade — ani seba", async () => {
    const db = await zaklad();
    const c = await cookieV0("Terezka");
    expect((await post({ login: "novy", name: "Nový", password: NOVE }, c)).status).toBe(403);
    expect((await post({ login: "jerry", active: false }, c)).status).toBe(403);
    expect((await post({ login: "terezka", active: false }, c)).status).toBe(403);
    expect((await post({ login: "jerry", akcia: "odhlas-vsade" }, c)).status).toBe(403);
    expect((await post({ login: "terezka", akcia: "odhlas-vsade" }, c)).status).toBe(403);
    expect(riadok(db, "novy")).toBeNull();
    expect(riadok(db, "jerry")!.active).toBe(1);
    expect(riadok(db, "jerry")!.session_ver).toBe(0);
  });
  it("nepremenuje sa na Jerryho: meno by po prihlásení otvorilo jeho identitu", async () => {
    const db = await zaklad();
    const r = await post({ login: "terezka", name: "Jerry", password: NOVE }, await cookieV0("Terezka"));
    expect(r.status).toBe(200);
    expect(riadok(db, "terezka")!.name).toBe("Terezka");
  });
});

describe("Jerry (správca)", () => {
  it("zmení cudzie heslo: jej staré cookie padnú, jemu cookie neprichádza", async () => {
    const db = await zaklad();
    const jej = await cookieV0("Terezka");
    expect(await kto(jej)).toBe("Terezka");
    const r = await post({ login: "terezka", password: NOVE }, await cookieV0("Jerry"));
    expect(r.status).toBe(200);
    expect(novaCookie(r)).toBeNull();
    zabudniKonta();
    expect(await kto(jej)).toBeNull();
    expect(await heslaPlati(db, "terezka", NOVE)).toBe(true);
    expect(riadok(db, "terezka")!.name).toBe("Terezka");
  });
  it("vlastné heslo: nová cookie vo vyššej verzii, stará neplatí", async () => {
    const db = await zaklad();
    db.run("UPDATE users SET session_ver = 2 WHERE login = 'jerry'");
    const stara = await cookieV("Jerry", 2);
    const r = await post({ login: "jerry", password: NOVE }, stara);
    expect(r.status).toBe(200);
    expect(novaCookie(r)).toBe(await cookieV("Jerry", 3));
    expect(await kto(novaCookie(r)!)).toBe("Jerry");
    expect(await kto(stara)).toBeNull();
    expect(await kto(await cookieV0("Jerry"))).toBeNull();
    // Prihlásenie novým heslom vydá tú istú verziu, nie staršiu.
    expect((await overPouzivatela(d1(db) as never, "jerry", NOVE))!.sessionVer).toBe(3);
  });
  it("staršia cookie skladaná z loginu je stále Jerry, nikto sa nevymkne", async () => {
    await zaklad();
    const r = await post({ login: "terezka", password: NOVE }, await cookieV0("jerry"));
    expect(r.status).toBe(200);
  });
  it("založí konto, vypne a zapne ho, odhlási všade", async () => {
    const db = await zaklad();
    const c = await cookieV0("Jerry");
    expect((await post({ login: "novy", name: "Nový", password: NOVE }, c)).status).toBe(200);
    expect(riadok(db, "novy")).toMatchObject({ name: "Nový", active: 1, session_ver: 0 });
    expect((await post({ login: "novy", active: false }, c)).status).toBe(200);
    expect(riadok(db, "novy")!.active).toBe(0);
    expect((await post({ login: "novy", active: true }, c)).status).toBe(200);
    expect(riadok(db, "novy")).toMatchObject({ name: "Nový", active: 1 });
    expect((await post({ login: "terezka", akcia: "odhlas-vsade" }, c)).status).toBe(200);
    expect(riadok(db, "terezka")!.session_ver).toBe(1);
    expect((await post({ login: "nikto-taky", akcia: "odhlas-vsade" }, c)).status).toBe(404);
  });
  it("vlastné konto nevypne a heslom bez mena sa nepremenuje", async () => {
    const db = await zaklad();
    const c = await cookieV0("Jerry");
    const r = await post({ login: "jerry", active: false }, c);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe("vlastne_konto");
    expect(riadok(db, "jerry")!.active).toBe(1);
    await post({ login: "terezka", password: NOVE }, c);
    expect(riadok(db, "terezka")!.name).toBe("Terezka");
  });
  it("nové konto bez hesla a krátke heslo neprejdú", async () => {
    await zaklad();
    const c = await cookieV0("Jerry");
    expect(((await (await post({ login: "novy" }, c)).json()) as { error: string }).error).toBe("need_password");
    expect(((await (await post({ login: "novy", password: "kratke" }, c)).json()) as { error: string }).error).toBe("short_password");
  });
});

describe("záchrana cez spoločné heslo je zrušená", () => {
  it("cookie app a cookie bez mena: neprihlásené, ani GET, ani POST", async () => {
    const db = await zaklad();
    const pred = hash(db, "jerry");
    for (const c of [await cookieV0("app"), await cookieV0()]) {
      expect(await kto(c)).toBeNull();
      expect((await kontaGet(new Request("https://k/api/users", { headers: hlavicky(c) }))).status).toBe(401);
      expect((await post({ login: "jerry", password: NOVE }, c)).status).toBe(401);
      expect((await post({ login: "jerry", password: NOVE, akcia: "zachrana" }, c)).status).toBe(401);
    }
    expect(hash(db, "jerry")).toBe(pred);
    expect(audity(db)).toEqual([]);
  });
  it("akcia zachrana už neexistuje ani pre správcu", async () => {
    const db = await zaklad();
    const pred = hash(db, "terezka");
    const r = await post({ login: "terezka", password: NOVE, akcia: "zachrana" }, await cookieV0("Jerry"));
    expect(r.status).toBe(400);
    expect(hash(db, "terezka")).toBe(pred);
  });
  it("identita app nemá rolu, keby sa k obrazovke predsa dostala", () => {
    expect(rolaKonta("app", null)).toBe("cudzi");
  });
});

describe("cudzí: token Strižne, cookie btc, bez prihlásenia", () => {
  const POKUSY = [
    { login: "jerry", password: NOVE },
    { login: "novy", password: NOVE },
    { login: "jerry", active: false },
    { login: "jerry", akcia: "odhlas-vsade" },
  ];
  it("token Strižne nesmie nič", async () => {
    const db = await zaklad();
    const pred = hash(db, "jerry");
    for (const p of POKUSY) expect((await post(p, undefined, { "x-strizna-token": STRIZNA })).status).toBe(403);
    expect(hash(db, "jerry")).toBe(pred);
    expect(riadok(db, "novy")).toBeNull();
  });
  it("cookie z prechodu cez bitcoinovú knihu nesmie nič", async () => {
    await zaklad();
    for (const p of POKUSY) expect((await post(p, await cookieV0("btc"))).status).toBe(403);
  });
  it("bez prihlásenia 401", async () => {
    await zaklad();
    expect((await post({ login: "jerry", password: NOVE })).status).toBe(401);
  });
  it("databáza neodpovedá: nikto nič, hoci je podpis platný", async () => {
    env.DB = { prepare: () => { throw new Error("D1 neodpovedá"); } };
    const r = await post({ login: "terezka", password: NOVE }, await cookieV0("Jerry"));
    expect(r.status).toBe(500);
  });
});

describe("kým migrácia 0129 chýba", () => {
  it("zmena hesla povie pravdu a heslo nezmení", async () => {
    const db = await zaklad(false);
    const pred = hash(db, "terezka");
    const r = await post({ login: "terezka", password: NOVE }, await cookieV0("Jerry"));
    expect(r.status).toBe(500);
    expect(((await r.json()) as { error: string }).error).toBe("no_migration");
    expect(hash(db, "terezka")).toBe(pred);
  });
});

describe("GET: obrazovka vie, čo ukázať", () => {
  const get = async (cookie?: string, ine: Record<string, string> = {}) =>
    (await (await kontaGet(new Request("https://k/api/users", { headers: hlavicky(cookie, ine) }))).json()) as { rola: string; jaLogin: string | null };
  it("rola a login každej identity", async () => {
    await zaklad();
    expect(await get(await cookieV0("Jerry"))).toMatchObject({ rola: "spravca", jaLogin: "jerry" });
    expect(await get(await cookieV0("Terezka"))).toMatchObject({ rola: "trener", jaLogin: "terezka" });
    expect(await get(await cookieV0("btc"))).toMatchObject({ rola: "cudzi", jaLogin: null });
    expect(await get(undefined, { "x-strizna-token": STRIZNA })).toMatchObject({ rola: "cudzi", jaLogin: null });
  });
});

describe("kontaPrava", () => {
  it("vypnuté konto nie je tréner ani správca", () => {
    expect(rolaKonta("Jerry", { login: "jerry", active: 0 })).toBe("cudzi");
    expect(rolaKonta("Jerry", { login: "jerry", active: 1 })).toBe("spravca");
    expect(rolaKonta("Niekto", null)).toBe("cudzi");
    expect(rolaKonta(null, null)).toBe("cudzi");
  });
  it("tréner bez konta nemá vlastné heslo", () => {
    expect(smieKonta("trener", null, "heslo", "")).toBe(false);
  });
});
