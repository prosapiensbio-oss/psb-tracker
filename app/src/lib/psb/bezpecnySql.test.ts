import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { bezpecnySql } from "./bezpecnySql";

/** Spúšťa sa na skutočnom SQLite: dôkaz je, čo dopyt VRÁTI, nie ako vyzerá. */
const TAJNE = "TAJNA-HODNOTA-xyz";
const HASH = "ODTLACOK-HESLA-xyz";
let db: Database;

beforeAll(() => {
  db = new Database(":memory:");
  db.run("CREATE TABLE vzas_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
  db.run("CREATE TABLE vzas_audit (id TEXT, at TEXT, actor TEXT, action TEXT, payment_id TEXT, month TEXT, old_value TEXT, new_value TEXT, reason TEXT)");
  db.run("CREATE TABLE users (login TEXT, name TEXT, pass_hash TEXT, pass_salt TEXT, active INT, created_at TEXT, last_login TEXT)");
  db.run("CREATE TABLE sessions (id TEXT, client_name TEXT)");
  for (const k of ["mail_heslo", "meta_token", "sms_kluc", "google_sa", "novy_token"]) {
    db.run("INSERT INTO vzas_settings VALUES (?, ?, '')", [k, `"${TAJNE}"`]);
    db.run("INSERT INTO vzas_audit VALUES ('i', 'a', 'Jerry', 'nastavenie', ?, NULL, ?, ?, NULL)", [k, TAJNE, TAJNE]);
  }
  db.run(`INSERT INTO vzas_settings VALUES ('ciele', '[{"id":"c1"}]', '')`);
  db.run("INSERT INTO vzas_audit VALUES ('j', 'a', 'Terezka', 'uprava-klienta', 'Jana', NULL, 'stare', 'nove', NULL)");
  db.run(`INSERT INTO users VALUES ('jerry', 'Jerry', '${HASH}', '${HASH}', 1, '', '')`);
  db.run("INSERT INTO sessions VALUES ('1', 'Jana')");
});

function spusti(raw: string): { odmietnute: true } | { riadky: unknown[]; text: string } {
  const g = bezpecnySql(raw);
  if ("chyba" in g) return { odmietnute: true };
  try {
    const riadky = db.query(g.sql).all();
    return { riadky, text: JSON.stringify(riadky) };
  } catch {
    return { odmietnute: true };   // SQL chyba je tiež odmietnutie: Jarvis nič nedostal
  }
}

describe("tajomstvá sa nedajú vytiahnuť", () => {
  const POKUSY = [
    "SELECT * FROM vzas_settings",
    "select value from VZAS_SETTINGS where key='mail_heslo'",
    `SELECT value FROM "vzas_settings"`,
    "SELECT value FROM [vzas_settings]",
    "SELECT value FROM `vzas_settings`",
    "SELECT value FROM main.vzas_settings",
    `SELECT value FROM "main"."vzas_settings"`,
    "SELECT value FROM main . vzas_settings",
    "SELECT value FROM main/**/./**/vzas_settings",
    "SELECT value FROM main. -- x\n vzas_settings",
    "SELECT value FROM/* x */vzas_settings",
    "SELECT value FROM (SELECT * FROM vzas_settings)",
    "SELECT 1 UNION ALL SELECT value FROM vzas_settings",
    "WITH a AS (SELECT * FROM vzas_settings) SELECT * FROM a",
    "WITH RECURSIVE a AS (SELECT value FROM vzas_settings) SELECT * FROM a",
    "WITH vzas_settings AS (SELECT * FROM main.vzas_settings) SELECT * FROM vzas_settings",
    "WITH x AS (WITH vzas_settings AS (SELECT * FROM vzas_settings) SELECT * FROM vzas_settings) SELECT * FROM x",
    "SELECT value FROM vzas_settings WHERE key LIKE '%' ORDER BY 1 LIMIT 5",
    "SELECT * FROM vzas_audit",
    "SELECT a.* FROM vzas_audit a",
    "SELECT old_value, new_value FROM vzas_audit WHERE payment_id='mail_heslo'",
    `SELECT "new_value" FROM VZAS_AUDIT`,
    "SELECT new_value FROM main.vzas_audit",
    `SELECT new_value FROM "main" . [vzas_audit]`,
    "SELECT (SELECT group_concat(new_value) FROM vzas_audit)",
    "SELECT x.n FROM (SELECT new_value n FROM vzas_audit) x",
    "SELECT * FROM users",
    "SELECT pass_hash FROM users",
    "SELECT pass_hash FROM main.users",
    "SELECT * FROM sessions, users",
  ];
  for (const sql of POKUSY) {
    it(sql.replace(/\s+/g, " "), () => {
      const v = spusti(sql);
      if ("text" in v) {
        expect(v.text).not.toContain(TAJNE);
        expect(v.text).not.toContain(HASH);
      }
    });
  }
});

describe("Jarvis vie ďalej bežné veci", () => {
  it("netajné nastavenia aj ciele", () => {
    const v = spusti("SELECT value FROM vzas_settings WHERE key='ciele'");
    expect("text" in v && v.text).toContain("c1");
  });
  it("vo vzas_settings vidí len netajné kľúče", () => {
    expect(spusti("SELECT key FROM vzas_settings")).toEqual({ riadky: [{ key: "ciele" }], text: '[{"key":"ciele"}]' });
  });
  it("audit bežného zápisu ostáva čitateľný", () => {
    const v = spusti("SELECT old_value, new_value FROM vzas_audit WHERE payment_id='Jana'");
    expect("riadky" in v && v.riadky).toEqual([{ old_value: "stare", new_value: "nove" }]);
  });
  it("pri tajnom kľúči audit povie kto a kedy, hodnotu nie", () => {
    const v = spusti("SELECT actor, new_value FROM vzas_audit WHERE payment_id='mail_heslo'");
    expect("riadky" in v && v.riadky).toEqual([{ actor: "Jerry", new_value: "[skryté]" }]);
  });
  it("počty a kontá bez hesiel", () => {
    expect(spusti("SELECT COUNT(*) n FROM vzas_audit")).toMatchObject({ riadky: [{ n: 6 }] });
    expect(spusti("SELECT login, name FROM users")).toMatchObject({ riadky: [{ login: "jerry", name: "Jerry" }] });
  });
  it("vlastné WITH sa spojí s tieňom, aj s RECURSIVE", () => {
    expect(spusti("WITH a AS (SELECT key FROM vzas_settings) SELECT * FROM a")).toMatchObject({ riadky: [{ key: "ciele" }] });
    expect(spusti("WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n<2) SELECT n, (SELECT COUNT(*) FROM users) u FROM c"))
      .toMatchObject({ riadky: [{ n: 1, u: 1 }, { n: 2, u: 1 }] });
  });
  it("dopyt mimo citlivých tabuliek sa nemení, len dostane limit", () => {
    expect(bezpecnySql("SELECT * FROM sessions")).toEqual({ sql: "SELECT * FROM sessions LIMIT 200" });
    expect(bezpecnySql("SELECT * FROM sessions LIMIT 5;")).toEqual({ sql: "SELECT * FROM sessions LIMIT 5" });
  });
});

describe("pôvodná stráž zápisu platí", () => {
  for (const sql of ["DELETE FROM sessions", "SELECT 1; DROP TABLE sessions", "UPDATE users SET name='x'", "/* x */ SELECT 1", "WITH a AS (SELECT 1) DELETE FROM sessions"]) {
    it(sql, () => expect("chyba" in bezpecnySql(sql)).toBe(true));
  }
});

describe("zapojenie v chat.ts", () => {
  const chat = readFileSync(new URL("../../routes/api/chat.ts", import.meta.url).pathname, "utf8");
  it("dopyt_db ide cez túto stráž a inú kópiu nemá", () => {
    expect(chat).toContain('from "../../lib/psb/bezpecnySql"');
    expect(chat).not.toContain("function bezpecnySql");
  });
  it("spúšťa sa výsledok stráže, nie pôvodný text", () => {
    expect(chat).toContain("DB.prepare(g.sql)");
  });
});
