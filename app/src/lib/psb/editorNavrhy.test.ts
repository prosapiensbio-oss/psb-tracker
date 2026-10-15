import { describe, expect, it } from "bun:test";

import { zmazNavrhyKlienta } from "./editorNavrhy.server";

/** Falošná D1 a R2 — len to, čo mazanie používa. */
function prostredie(riadky: { id: string; kto: string; klient: string | null }[], objekty: string[]) {
  const db = { riadky: [...riadky] };
  const r2 = new Set(objekty);
  const DB = {
    prepare: (sql: string) => ({
      bind: (...a: string[]) => ({
        all: async () => ({ results: db.riadky.filter((r) => r.kto === a[0]).map((r) => ({ id: r.id, klient: r.klient })) }),
        run: async () => { if (sql.startsWith("DELETE")) db.riadky = db.riadky.filter((r) => r.id !== a[0]); },
      }),
    }),
  };
  const STORAGE = {
    list: async ({ prefix }: { prefix: string }) => ({ objects: [...r2].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    delete: async (k: string) => { r2.delete(k); },
  };
  return { env: { DB, STORAGE } as never, db, r2 };
}

describe("rozrobené návrhy po odoslaní fotiek klientovi", () => {
  it("zmaže len návrhy toho klienta od toho, kto posiela — aj s fotkami v R2", async () => {
    const { env, db, r2 } = prostredie(
      [
        { id: "n1", kto: "Jerry", klient: "Martin Vaško" },
        { id: "n2", kto: "Jerry", klient: "Martin Vasko" }, // iný tvar mena, ten istý klient
        { id: "n3", kto: "Jerry", klient: "Anna Nová" },
        { id: "n4", kto: "Terezka", klient: "Martin Vaško" },
        { id: "n5", kto: "Jerry", klient: null },
      ],
      ["editor/navrhy/n1/nahlad", "editor/navrhy/n1/obr-a", "editor/navrhy/n3/nahlad", "editor/navrhy/n4/nahlad"],
    );
    expect(await zmazNavrhyKlienta(env, "Jerry", "Martin Vaško")).toBe(2);
    expect(db.riadky.map((r) => r.id)).toEqual(["n3", "n4", "n5"]);
    expect([...r2].sort()).toEqual(["editor/navrhy/n3/nahlad", "editor/navrhy/n4/nahlad"]);
  });
  it("bez mena alebo bez trénera nezmaže nič", async () => {
    const { env } = prostredie([{ id: "n1", kto: "Jerry", klient: "X" }], []);
    expect(await zmazNavrhyKlienta(env, "", "X")).toBe(0);
    expect(await zmazNavrhyKlienta(env, "Jerry", "")).toBe(0);
  });
});
