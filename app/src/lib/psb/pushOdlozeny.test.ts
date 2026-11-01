import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { polozkyFotiek } from "./fotkyOdkazy";
import { pushTrenerovi, rozosliOdlozene } from "./ponukaTerminov.server";
import { bajtyNaB64u } from "./push.server";
import { jeTichyCas } from "./tichyCas";

/**
 * Akcia klienta v noci nezvoní (rozbor, 1. 11. 2026). Skutočné šifrovanie aj VAPID,
 * skutočné SQLite; podstrčený je len `fetch` na push server.
 */
const NOC = new Date("2026-12-10T22:30:00Z");   // 23:30 v Prahe
const DEN = new Date("2026-12-10T10:00:00Z");   // 11:00 v Prahe
const OBSAH = { titulok: "Termín vybraný", text: "Eva: vybraný termín", url: "/#kalendar", znacka: "ponuka-x" };

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
  } as never;
}

async function zaklad() {
  const db = new Database(":memory:");
  db.run("CREATE TABLE vzas_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
  db.run("CREATE TABLE push_odbery (endpoint TEXT, p256dh TEXT, auth TEXT, kto TEXT)");
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const verejny = bajtyNaB64u(new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey)));
  const sukromny = (await crypto.subtle.exportKey("jwk", vapid.privateKey)).d!;
  db.run("INSERT INTO vzas_settings (key, value) VALUES ('vapid_public', ?), ('vapid_private', ?)", [verejny, sukromny]);
  for (const kto of ["Terezka", "Jerry"]) {
    const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const p256dh = bajtyNaB64u(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    db.run("INSERT INTO push_odbery VALUES (?, ?, ?, ?)", [`https://push.test/${kto}`, p256dh, bajtyNaB64u(crypto.getRandomValues(new Uint8Array(16))), kto]);
  }
  return db;
}

const fronta = (db: Database) => (db.query("SELECT value FROM vzas_settings WHERE key = 'push_odlozene'").get() as { value: string } | null)?.value ?? null;

let volane: string[] = [];
let priVolani: (() => void) | null = null;
let spy: ReturnType<typeof spyOn>;
beforeEach(() => {
  volane = [];
  priVolani = null;
  spy = spyOn(globalThis, "fetch").mockImplementation((async (u: string) => {
    volane.push(String(u));
    priVolani?.();
    return new Response(null, { status: 201 });
  }) as never);
});
afterEach(() => spy.mockRestore());

describe("pushTrenerovi", () => {
  it("cez deň zvoní hneď a len tomu trénerovi", async () => {
    const db = await zaklad();
    await pushTrenerovi(d1(db), "terezka", OBSAH, DEN);
    expect(volane).toEqual(["https://push.test/Terezka"]);
    expect(fronta(db)).toBeNull();
  });
  it("v tichu nezvoní a položka čaká", async () => {
    const db = await zaklad();
    await pushTrenerovi(d1(db), "Terezka", OBSAH, NOC);
    await pushTrenerovi(d1(db), "Jerry", { ...OBSAH, titulok: "Žiadosť o históriu" }, NOC);
    expect(volane).toEqual([]);
    expect(JSON.parse(fronta(db)!).map((x: { trener: string }) => x.trener)).toEqual(["Terezka", "Jerry"]);
  });
  it("chyba databázy výber termínu nezhodí", async () => {
    const zla = { prepare: () => { throw new Error("D1 neodpovedá"); } } as never;
    await pushTrenerovi(zla, "Terezka", OBSAH, NOC);
    await pushTrenerovi(zla, "Terezka", OBSAH, DEN);
    expect(volane).toEqual([]);
  });
});

describe("rozosliOdlozene (push-beh po konci ticha)", () => {
  it("pošle každému jeho a zoznam zmaže; druhý beh už nič", async () => {
    const db = await zaklad();
    await pushTrenerovi(d1(db), "Terezka", OBSAH, NOC);
    await pushTrenerovi(d1(db), "Jerry", OBSAH, NOC);
    expect(await rozosliOdlozene(d1(db))).toBe(2);
    expect(volane).toEqual(["https://push.test/Terezka", "https://push.test/Jerry"]);
    expect(fronta(db)).toBeNull();
    volane = [];
    expect(await rozosliOdlozene(d1(db))).toBe(0);
    expect(volane).toEqual([]);
  });
  it("položka pribudnutá počas odosielania sa nestratí", async () => {
    const db = await zaklad();
    await pushTrenerovi(d1(db), "Terezka", OBSAH, NOC);
    priVolani = () => { priVolani = null; void pushTrenerovi(d1(db), "Jerry", OBSAH, NOC); };
    await rozosliOdlozene(d1(db));
    expect(fronta(db)).toContain("Jerry");
  });
  it("prázdna fronta nesiaha na push", async () => {
    const db = await zaklad();
    expect(await rozosliOdlozene(d1(db))).toBe(0);
    expect(volane).toEqual([]);
  });
});

describe("čo sa neodkladá, lebo je v registri", () => {
  it("odpoveď na fotky je oranžová: `push-beh` ju pošle ráno sám", () => {
    const p = polozkyFotiek({ odpovede: [{ id: 1, token: "t", klient: "Eva", kedy: "2026-12-10", trener: "Terezka", text: "ďakujem" }], suhlasy: [] });
    expect(p[0].tone).toBe("orange");
    expect(p[0].trener).toBe("Terezka");
  });
  it("noc a prvý denný beh plánovača: 22:30 ticho, 6:00 UTC už nie (zima 7:00, leto 8:00)", () => {
    expect(jeTichyCas(NOC)).toBe(true);
    expect(jeTichyCas(new Date("2026-12-10T06:00:00Z"))).toBe(false);
    expect(jeTichyCas(new Date("2026-07-10T06:00:00Z"))).toBe(false);
  });
});
