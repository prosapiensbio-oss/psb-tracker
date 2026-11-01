import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";

import { hmacHex, overPodpisCookie, sessionPlati, tokenSession, identitaZdielaneho } from "./sessionToken";
import { env, podstrcEnv } from "./testEnv";

/**
 * Prihlásenie celou cestou: skutočný kód auth.server.ts nad skutočným SQLite,
 * v tvare, aký dáva D1. Väzby Cloudflaru sa podstrčia.
 */
const SECRET = "testovacie-tajomstvo";
podstrcEnv();
const { currentUser, isAuthed, overPouzivatela, sessionCookie, stavKonta, zabudniKonta, hashPassword, novaSol } = await import("./auth.server");

type Dopyty = { n: number };
function d1(db: Database, dopyty: Dopyty = { n: 0 }) {
  return {
    prepare(sql: string) {
      const st = (args: unknown[]) => ({
        first: async () => { dopyty.n++; return db.query(sql).get(...(args as string[])) ?? null; },
        run: async () => { const r = db.query(sql).run(...(args as string[])); return { meta: { changes: r.changes } }; },
        bind: (...a: unknown[]) => st(a),
      });
      return st([]);
    },
  };
}
const zlaDb = { prepare: () => { throw new Error("D1 neodpovedá"); } };

function zaklad(sVerziou = true) {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE users (login TEXT PRIMARY KEY, name TEXT, pass_hash TEXT, pass_salt TEXT, active INT DEFAULT 1, created_at TEXT, last_login TEXT ${sVerziou ? ", session_ver INT NOT NULL DEFAULT 0" : ""})`);
  db.run("INSERT INTO users (login, name, pass_hash, pass_salt, active, created_at) VALUES ('jerry', 'Jerry', 'h', 's', 1, '')");
  db.run("INSERT INTO users (login, name, pass_hash, pass_salt, active, created_at) VALUES ('stary', 'Starý', 'h', 's', 0, '')");
  return db;
}

const req = (cookie?: string, hlavicky: Record<string, string> = {}) =>
  new Request("https://k/api/data", { headers: { ...(cookie ? { cookie: `psb_session=${encodeURIComponent(cookie)}` } : {}), ...hlavicky } });
/** Hodnota cookie tak, ako ju zapísal kód PRED touto zmenou — tu napevno, nie cez nový kód. */
const staraCookie = async (meno = "") => {
  const t = await hmacHex(SECRET, meno ? `psb-authed-v1|${meno}` : "psb-authed-v1");
  return meno ? `${meno}|${t}` : t;
};
const noveCookie = async (meno: string, verzia: number) => `${meno}|${await tokenSession(SECRET, meno, verzia)}`;

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  env.PSB_SESSION_SECRET = SECRET;
  zabudniKonta();
});

describe("nasadenie nikoho neodhlási", () => {
  it("cookie vydaná pred zmenou platí, kým je verzia 0", async () => {
    env.DB = d1(zaklad());
    expect(await currentUser(req(await staraCookie("Jerry")))).toBe("Jerry");
  });
  it("najstarší tvar bez mena platí a hlási sa ako app", async () => {
    env.DB = d1(zaklad());
    expect(await currentUser(req(await staraCookie()))).toBe("app");
  });
  it("meno bez konta platí vo verzii 0 (prechod z bitcoinovej knihy, zdieľané heslo)", async () => {
    env.DB = d1(zaklad());
    expect(await currentUser(req(await staraCookie("btc")))).toBe("btc");
  });
  it("kým migrácia nebeží (stĺpec chýba), staré cookies platia a neaktívny neprejde", async () => {
    env.DB = d1(zaklad(false));
    expect(await currentUser(req(await staraCookie("Jerry")))).toBe("Jerry");
    expect(await currentUser(req(await staraCookie("Starý")))).toBeNull();
  });
  it("nová cookie vo verzii 0 je presne pôvodný tvar", async () => {
    const c = await sessionCookie("Jerry");
    expect(c).toContain(encodeURIComponent(await staraCookie("Jerry")));
  });
});

describe("odhlásiť všade a neaktívne konto", () => {
  it("vyššia verzia zneplatní staré cookies a platí nová", async () => {
    const db = zaklad();
    env.DB = d1(db);
    db.run("UPDATE users SET session_ver = 3 WHERE login = 'jerry'");
    expect(await currentUser(req(await staraCookie("Jerry")))).toBeNull();
    expect(await currentUser(req(await noveCookie("Jerry", 2)))).toBeNull();
    expect(await currentUser(req(await noveCookie("Jerry", 3)))).toBe("Jerry");
  });
  it("prihlásenie vystaví cookie v aktuálnej verzii", async () => {
    const c = await sessionCookie("Jerry", 3);
    expect(decodeURIComponent(c.split(";")[0].split("=")[1])).toBe(await noveCookie("Jerry", 3));
  });
  it("neaktívne konto neprejde so žiadnou cookie", async () => {
    env.DB = d1(zaklad());
    expect(await currentUser(req(await staraCookie("Starý")))).toBeNull();
    expect(await currentUser(req(await noveCookie("Starý", 1)))).toBeNull();
  });
  it("cookie skladaná z loginu (Stary) sa nájde aj podľa login", async () => {
    env.DB = d1(zaklad());
    expect(await currentUser(req(await staraCookie("Stary")))).toBeNull();
  });
  it("verzia bez konta neprejde — takú cookie nikto nevydal", async () => {
    env.DB = d1(zaklad());
    expect(await currentUser(req(await noveCookie("Niekto", 2)))).toBeNull();
  });
  it("zabudniKonta: zmena sa v tom istom izoláte prejaví hneď", async () => {
    const db = zaklad();
    env.DB = d1(db);
    const c = await staraCookie("Jerry");
    expect(await currentUser(req(c))).toBe("Jerry");
    db.run("UPDATE users SET session_ver = 1 WHERE login = 'jerry'");
    zabudniKonta();
    expect(await currentUser(req(c))).toBeNull();
  });
});

describe("výpadok databázy", () => {
  it("platný podpis prejde, nikoho nevyhodí", async () => {
    env.DB = zlaDb;
    expect(await currentUser(req(await staraCookie("Jerry")))).toBe("Jerry");
    expect(await currentUser(req(await noveCookie("Jerry", 3)))).toBe("Jerry");
  });
  it("bez platného podpisu neprejde nikto, ani s meniacou sa verziou", async () => {
    env.DB = zlaDb;
    expect(await currentUser(req("Jerry|falosny"))).toBeNull();
    expect(await currentUser(req("Jerry|v2.falosny"))).toBeNull();
    expect(await currentUser(req(`Terezka|${(await staraCookie("Jerry")).split("|")[1]}`))).toBeNull();
  });
  it("výpadok sa nezapamätá: po obnove sa stav konta overí", async () => {
    const c = await staraCookie("Starý");
    env.DB = zlaDb;
    expect(await currentUser(req(c))).toBe("Starý");
    env.DB = d1(zaklad());
    expect(await currentUser(req(c))).toBeNull();
  });
});

describe("cena", () => {
  it("isAuthed + currentUser na jednej požiadavke = jeden dopyt", async () => {
    const d: Dopyty = { n: 0 };
    env.DB = d1(zaklad(), d);
    const r = req(await staraCookie("Jerry"));
    await isAuthed(r); await currentUser(r); await isAuthed(r);
    expect(d.n).toBe(1);
  });
  it("ďalšie požiadavky v krátkom čase idú z pamäte izolátu", async () => {
    const d: Dopyty = { n: 0 };
    env.DB = d1(zaklad(), d);
    const c = await staraCookie("Jerry");
    for (let i = 0; i < 40; i++) await currentUser(req(c));
    expect(d.n).toBe(1);
  });
  it("cookie bez platného podpisu do databázy vôbec nejde", async () => {
    const d: Dopyty = { n: 0 };
    env.DB = d1(zaklad(), d);
    await currentUser(req("Jerry|falosny"));
    expect(d.n).toBe(0);
  });
});

describe("bez PSB_SESSION_SECRET", () => {
  it("cookie podpísaná verejným dev-secret neprejde", async () => {
    delete env.PSB_SESSION_SECRET;
    env.DB = d1(zaklad());
    const t = await hmacHex("dev-secret", "psb-authed-v1|Jerry");
    expect(await currentUser(req(`Jerry|${t}`))).toBeNull();
    expect(await currentUser(req(t))).toBeNull();
  });
  it("session sa nedá založiť", async () => {
    delete env.PSB_SESSION_SECRET;
    await expect(sessionCookie("Jerry")).rejects.toThrow();
  });
  it("token Strižne nezávisí od tohto tajomstva", async () => {
    delete env.PSB_SESSION_SECRET;
    env.STRIZNA_TOKEN = "s".repeat(32);
    expect(await currentUser(req(undefined, { "x-strizna-token": "s".repeat(32) }))).toBe("Strižňa");
  });
});

describe("heslo a zdieľané heslo", () => {
  it("vlastné konto: vráti verziu; bez stĺpca verzia 0", async () => {
    const sol = novaSol();
    const hash = await hashPassword("heslo-123456", sol);
    for (const [sVerziou, ver] of [[true, 4], [false, 0]] as const) {
      const db = zaklad(sVerziou);
      db.run("UPDATE users SET pass_hash = ?, pass_salt = ? WHERE login = 'jerry'", [hash, sol]);
      if (sVerziou) db.run("UPDATE users SET session_ver = 4 WHERE login = 'jerry'");
      const u = await overPouzivatela(d1(db) as never, "jerry", "heslo-123456");
      expect(u).toEqual({ login: "jerry", name: "Jerry", sessionVer: ver });
      expect(await overPouzivatela(d1(db) as never, "jerry", "zle-heslo")).toBeNull();
    }
  });
  it("zdieľané heslo neotvorí meno s kontom, ani neaktívnym", async () => {
    const db = d1(zaklad()) as never;
    expect(identitaZdielaneho(await stavKonta(db, "jerry"))).toBeNull();
    expect(identitaZdielaneho(await stavKonta(db, "stary"))).toBeNull();
  });
  it("záchranná brzda: bez mena, s neznámym menom aj pri výpadku databázy = app", async () => {
    const db = d1(zaklad()) as never;
    expect(identitaZdielaneho(await stavKonta(db, ""))).toBe("app");
    expect(identitaZdielaneho(await stavKonta(db, "falosny-jerry"))).toBe("app");
    expect(identitaZdielaneho(await stavKonta(zlaDb as never, "jerry"))).toBe("app");
  });
});

describe("čisté funkcie tokenu", () => {
  it("meno so zvislou čiarou nevyrobí cudziu vyššiu verziu", async () => {
    // Kto cez zdieľané heslo získa podpis mena „Jerry|v1", nesmie ním prejsť ako Jerry v1.
    const t = await tokenSession(SECRET, "Jerry|v1", 0);
    expect(await overPodpisCookie(SECRET, `Jerry|v1.${t}`)).toBeNull();
  });
  it("sessionPlati", () => {
    expect(sessionPlati(0, undefined)).toBe(true);
    expect(sessionPlati(5, undefined)).toBe(true);
    expect(sessionPlati(0, null)).toBe(true);
    expect(sessionPlati(1, null)).toBe(false);
    expect(sessionPlati(0, { active: 1 })).toBe(true);
    expect(sessionPlati(0, { active: 0 })).toBe(false);
    expect(sessionPlati(0, { active: 1, session_ver: 1 })).toBe(false);
  });
});
