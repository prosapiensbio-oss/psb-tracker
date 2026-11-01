import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";

import { zapisDopytZWebu, type DopytZWebu } from "./dopytWeb";

/** Skutočné SQL na skutočnom SQLite — `ON CONFLICT` sa inak overiť nedá. */
function databaza() {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE leads (id TEXT PRIMARY KEY, date TEXT NOT NULL, name TEXT, source TEXT NOT NULL, referrer TEXT,
    status TEXT NOT NULL DEFAULT 'novy', note TEXT, created_at TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', telefon TEXT NOT NULL DEFAULT '',
    kampan TEXT NOT NULL DEFAULT '', utm TEXT NOT NULL DEFAULT '', stranka TEXT NOT NULL DEFAULT '', druh TEXT NOT NULL DEFAULT 'dopyt')`);
  const d1 = { prepare: (sql: string) => ({ bind: (...a: unknown[]) => ({ run: async () => db.query(sql).run(...(a as string[])) }) }) };
  return { db, d1: d1 as unknown as import("@cloudflare/workers-types").D1Database };
}

const dopyt = (o: Partial<DopytZWebu> = {}): DopytZWebu => ({
  id: "web-2026-11-01-hana@example.cz", date: "2026-11-01", name: "Hana Marko", menoZFormulara: "Hana Marko",
  source: "web", note: "Bolí mě záda.", createdAt: "2026-11-01T08:00:00Z", email: "hana@example.cz", telefon: "777111222",
  kampan: "jaro", utm: "source=fb", stranka: "/kontakt/", druh: "dopyt", ...o,
});
const riadok = (db: Database) => db.query("SELECT * FROM leads").all() as Record<string, string>[];

describe("druhý formulár v ten istý deň", () => {
  it("lead magnet po dopyte nezhorší druh a správa neprepíše pôvodnú", async () => {
    const { db, d1 } = databaza();
    await zapisDopytZWebu(d1, dopyt());
    await zapisDopytZWebu(d1, dopyt({ note: "LEAD MAGNET | postura", druh: "magnet", name: "hana@example.cz", menoZFormulara: "", telefon: "", kampan: "", utm: "", stranka: "" }));
    const r = riadok(db);
    expect(r).toHaveLength(1);
    expect(r[0].druh).toBe("dopyt");
    expect(r[0].note).toBe("Bolí mě záda. · LEAD MAGNET | postura");
    // Prázdne pole z magnetu nezmaže vyplnené z kontaktného formulára.
    expect(r[0].name).toBe("Hana Marko");
    expect(r[0].telefon).toBe("777111222");
    expect(r[0].kampan).toBe("jaro");
    expect(r[0].stranka).toBe("/kontakt/");
  });

  it("dopyt po magnete druh zlepší", async () => {
    const { db, d1 } = databaza();
    await zapisDopytZWebu(d1, dopyt({ note: "LEAD MAGNET | postura", druh: "magnet" }));
    await zapisDopytZWebu(d1, dopyt());
    expect(riadok(db)[0].druh).toBe("dopyt");
    expect(riadok(db)[0].note).toBe("LEAD MAGNET | postura · Bolí mě záda.");
  });

  it("rovnaká správa (dvojklik, opakovaný pokus CF7) sa nezdvojí", async () => {
    const { db, d1 } = databaza();
    await zapisDopytZWebu(d1, dopyt());
    await zapisDopytZWebu(d1, dopyt());
    await zapisDopytZWebu(d1, dopyt({ note: "Druhá správa" }));
    await zapisDopytZWebu(d1, dopyt());
    expect(riadok(db)[0].note).toBe("Bolí mě záda. · Druhá správa");
  });

  it("prázdna správa nezmaže starú a do prázdnej sa zapíše bez oddeľovača", async () => {
    const { db, d1 } = databaza();
    await zapisDopytZWebu(d1, dopyt({ note: "" }));
    await zapisDopytZWebu(d1, dopyt());
    await zapisDopytZWebu(d1, dopyt({ note: "" }));
    expect(riadok(db)[0].note).toBe("Bolí mě záda.");
  });

  it("nové vyplnené pole sa doplní, poznámka má strop", async () => {
    const { db, d1 } = databaza();
    await zapisDopytZWebu(d1, dopyt({ telefon: "" }));
    await zapisDopytZWebu(d1, dopyt({ telefon: "605000111" }));
    expect(riadok(db)[0].telefon).toBe("605000111");
    await zapisDopytZWebu(d1, dopyt({ note: "x".repeat(1900) }));
    await zapisDopytZWebu(d1, dopyt({ note: "y".repeat(1900) }));
    expect(riadok(db)[0].note.length).toBe(2000);
  });

  it("kontrolný riadok z nočnej kontroly ostáva kontrolný", async () => {
    const { db, d1 } = databaza();
    await zapisDopytZWebu(d1, dopyt({ druh: "kontrola" }));
    await zapisDopytZWebu(d1, dopyt({ druh: "kontrola" }));
    expect(riadok(db)[0].druh).toBe("kontrola");
  });
});
