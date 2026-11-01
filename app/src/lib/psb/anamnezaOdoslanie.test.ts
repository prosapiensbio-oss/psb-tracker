import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * VYPLNENÚ ANAMNÉZU NEPREPÍŠE OBNOVENIE STRÁNKY.
 *
 * Po odoslaní stránka vracala 200, takže F5 alebo starý tab poslali formulár
 * znova a prepísali pôvodné odpovede, z ktorých berie začiatok pocitovka.
 * Skúša sa skutočná routa na skutočnom SQLite.
 */
const KLUC = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
let db: Database;
const d1 = () => {
  const prikaz = (sql: string, a: unknown[] = []) => ({
    run: async () => {
      const r = db.query(sql).run(...(a as string[]));
      return { meta: { changes: r.changes } };
    },
    first: async () => db.query(sql).get(...(a as string[])),
    all: async () => ({ results: db.query(sql).all(...(a as string[])) }),
  });
  return { prepare: (sql: string) => ({ ...prikaz(sql), bind: (...a: unknown[]) => prikaz(sql, a) }) };
};

mock.module("../bindings.server", () => ({ bindings: () => ({ DB: d1(), ANAMNEZA_KLUC: KLUC }) }));

const TOKEN = "AbCdEfGhJkMnPq";
const formular = (hodnota: string) => {
  const f = new FormData();
  f.set("suhlas_podmienky", "on");
  f.set("suhlas_gdpr", "on");
  f.set("oprava_email", hodnota + "@example.cz");
  f.set("priviedlo", hodnota);
  return f;
};

const posli = async (f: FormData) => {
  const { Route } = await import("../../routes/a.$token");
  const post = (Route.options.server as unknown as { handlers: { POST: (x: unknown) => Promise<Response> } }).handlers.POST;
  return post({ request: new Request(`https://x.cz/a/${TOKEN}`, { method: "POST", body: f }), params: { token: TOKEN } });
};
const riadok = () => db.query("SELECT klient_json, suhlasy_json, klient_vyplnil_at, stav FROM anamnezy").get() as Record<string, string | null>;

beforeEach(() => {
  db = new Database(":memory:");
  db.run(`CREATE TABLE anamnezy (id TEXT PRIMARY KEY, klient TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, stav TEXT NOT NULL DEFAULT 'ceka',
    verzia INTEGER NOT NULL DEFAULT 1, klient_json TEXT, zapis_json TEXT, suhlasy_json TEXT, klient_vyplnil_at TEXT, zapis_at TEXT, vytvorene_at TEXT NOT NULL, autor TEXT)`);
  db.run(`CREATE TABLE klient_fakturacia (klient TEXT PRIMARY KEY, firma TEXT, email TEXT, telefon TEXT, updated_at TEXT)`);
  db.run(`CREATE TABLE client_overrides (name TEXT PRIMARY KEY, narodeniny TEXT)`);
  db.run(`CREATE TABLE kal_udalosti (klient TEXT, zaciatok TEXT, typ TEXT, zmizla_at TEXT)`);
  db.run(`CREATE TABLE client_notes (id TEXT, client_name TEXT, note TEXT, author TEXT, created_at TEXT)`);
  db.run(`CREATE TABLE vzas_audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT, action TEXT NOT NULL, payment_id TEXT, month TEXT, old_value TEXT, new_value TEXT, reason TEXT)`);
  db.query("INSERT INTO anamnezy (id, klient, token, vytvorene_at) VALUES ('1', 'Josef Pávek', ?1, '2026-10-01')").run(TOKEN);
});

describe("POST /a/<token>", () => {
  it("prvé odoslanie zapíše a presmeruje (303)", async () => {
    const r = await posli(formular("prve"));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/a/${TOKEN}`);
    expect(riadok().klient_vyplnil_at).toBeTruthy();
    expect(riadok().stav).toBe("klient_vyplnil");
    expect(riadok().klient_json).toStartWith("v1:");
  });

  it("druhé odoslanie (starý tab) nezapíše nič — ani kontakt", async () => {
    await posli(formular("prve"));
    const pred = riadok();
    const emailPred = db.query("SELECT email FROM klient_fakturacia").get();
    const r = await posli(formular("druhe"));
    expect(r.status).toBe(303);
    expect(riadok()).toEqual(pred);
    expect(db.query("SELECT email FROM klient_fakturacia").get()).toEqual(emailPred);
    expect((db.query("SELECT COUNT(*) n FROM vzas_audit WHERE action = 'anamneza-klient'").get() as { n: number }).n).toBe(1);
  });

  it("bez súhlasov sa neukladá nič a formulár sa vráti s chybou", async () => {
    const f = formular("prve");
    f.delete("suhlas_gdpr");
    const r = await posli(f);
    expect(r.status).toBe(400);
    expect(riadok().klient_vyplnil_at).toBeNull();
  });
});

describe("ulozKlienta", () => {
  it("zapíše len raz; race dvoch tabov vyhrá prvý", async () => {
    const { ulozKlienta } = await import("./anamneza.server");
    const D = d1() as unknown as import("@cloudflare/workers-types").D1Database;
    expect(await ulozKlienta(D, TOKEN, { a: 1 }, {}, KLUC)).toBe(true);
    const prve = riadok().klient_json;
    expect(await ulozKlienta(D, TOKEN, { a: 2 }, {}, KLUC)).toBe(false);
    expect(riadok().klient_json).toBe(prve);
  });
});
