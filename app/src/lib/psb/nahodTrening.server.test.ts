import { describe, expect, it } from "bun:test";
import type { D1Database } from "@cloudflare/workers-types";

import { pravidloCelehoMena, typRucnePreNovu, zlucMenaKlientov } from "./nahodTrening.server";

/** Falošná D1: len zapamätá SQL a väzby, nič nespúšťa. */
function falosnaDb() {
  const prikazy: { sql: string; args: unknown[] }[] = [];
  const DB = {
    prepare(sql: string) {
      const p = { sql, args: [] as unknown[], bind(...a: unknown[]) { p.args = a; return p; } };
      prikazy.push(p);
      return p;
    },
  } as unknown as D1Database;
  return { DB, prikazy };
}

describe("pravidlo celého mena (21. 10. 2026)", () => {
  const { DB, prikazy } = falosnaDb();
  pravidloCelehoMena(DB, "Jana Nová", "Terezka");
  const upsert = prikazy.find((p) => /INSERT INTO kal_mapovanie/.test(p.sql))!;

  it("zakladá pravidlo vždy ako tréning — úvodný nie je vlastnosť mena", () => {
    expect(upsert.sql).toMatch(/VALUES \(\?1, \?2, '', \?1, 'trening'/);
    expect(upsert.args.slice(0, 2)).toEqual(["Jana Nová", "Terezka"]);
  });

  it("prepíše aj pravidlo s tým istým klientom, keď má iný druh (uvodny, netrening)", () => {
    expect(upsert.sql).toMatch(/DO UPDATE SET klient = excluded\.klient, typ = 'trening'/);
    expect(upsert.sql).toMatch(/kal_mapovanie\.typ IS NOT 'trening'/);
    // Staré pravidlo bez klienta (netrening/sukromne) chytí podmienka na klienta.
    expect(upsert.sql).toMatch(/kal_mapovanie\.klient IS NOT excluded\.klient/);
  });

  it("prvý úvodný sa podrží ručnou značkou PRED prepisom zlého pravidla", () => {
    const i = prikazy.findIndex((p) => /SET typ_rucne = 1/.test(p.sql));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(prikazy.indexOf(upsert));
    expect(prikazy[i].sql).toMatch(/typ = 'uvodny'/);
  });
});

describe("nová udalosť z Kokpitu", () => {
  it("úvodný nesie typ_rucne = 1, tréning nie", () => {
    expect(typRucnePreNovu("uvodny")).toBe(1);
    expect(typRucnePreNovu("trening")).toBeNull();
  });
});

describe("zlúčenie mien klientov zo všetkých zdrojov", () => {
  it("zlúči tvary jedného človeka podľa normName a nechá prvý tvar", () => {
    expect(zlucMenaKlientov(["Anna Nová", "Albert Matl", "anna nova", " Anna  Nová ", "", "Richard Matl"]))
      .toEqual(["Anna Nová", "Albert Matl", "Richard Matl"]);
  });
});
