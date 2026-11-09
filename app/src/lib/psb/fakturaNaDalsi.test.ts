import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

import { dlhyKlientov } from "./zaplatene";
import { dlhyNaFakturu } from "./fakturaDlhy";
import { balicekBerieFakturu, balicekZFaktury, popisNaDalsi, prvyTreningNovehoBalicka, terminSlovom, type CakajucaFaktura } from "./fakturaNaDalsi";
import { cakajucaFaktura, klientiSCakajucouFakturou, pripojFakturuKBalicku } from "./fakturaNaDalsi.server";
import { fakturyNaDalsiUhradene } from "./fakturaUhradena";

const f = (o: Partial<CakajucaFaktura> = {}): CakajucaFaktura => ({
  id: "f", cislo: "20261020", klient: "Jan Kral", dalsi_nazov: "6h Předplatné", dalsi_hodiny: 6, ks: 1, cena_czk: 6990, ...o,
});

describe("prvý tréning nového balíčka", () => {
  const terminy = ["2026-11-13T08:00", "2026-11-09T15:00"];
  it("Jan Kral: 0 h → najbližší termín, nech sú v akomkoľvek poradí", () => {
    expect(prvyTreningNovehoBalicka(terminy, 0, "2026-11-08")).toBe("2026-11-09T15:00");
  });
  it("zostávajúca hodina kryje prvý termín", () => {
    expect(prvyTreningNovehoBalicka(terminy, 1, null)).toBe("2026-11-13T08:00");
  });
  it("koniec platnosti prebije zostávajúce hodiny", () => {
    expect(prvyTreningNovehoBalicka(terminy, 2, "2026-11-08")).toBe("2026-11-09T15:00");
  });
  it("mínus ani chýbajúci zostatok nepreskočia termín, prázdny kalendár je null", () => {
    expect(prvyTreningNovehoBalicka(terminy, -2, null)).toBe("2026-11-09T15:00");
    expect(prvyTreningNovehoBalicka(terminy, null, null)).toBe("2026-11-09T15:00");
    expect(prvyTreningNovehoBalicka([], 0, null)).toBeNull();
  });
  it("termín slovom", () => expect(terminSlovom("2026-11-09T15:00")).toBe("Po 9. 11. o 15:00"));
});

describe("balíček podľa faktúry", () => {
  it("nesie názov, hodiny, sumu faktúry a platnosť od dňa vzniku", () => {
    expect(balicekZFaktury(f(), "2026-11-09")).toEqual({ nazov: "6h Předplatné", hodiny: 6, cena: 6990, doDna: "2026-12-08" });
    expect(balicekZFaktury(f({ dalsi_nazov: "18h Balíček", dalsi_hodiny: 18, cena_czk: 21150 }), "2026-11-09")?.hodiny).toBe(18);
  });
  it("faktúra bez výberu balíčka neurčuje nič", () => {
    expect(balicekZFaktury(f({ dalsi_nazov: null, dalsi_hodiny: null }), "2026-11-09")).toBeNull();
  });
  it("úvodný, doplnenie, prenesené a samostatná hodina si faktúru neberú", () => {
    for (const n of ["Úvodní trénink", "Doplnenie členstva", "Prenesené hodiny"]) expect(balicekBerieFakturu(n, 6, f())).toBe(false);
    expect(balicekBerieFakturu("1h Balíček", 1, f())).toBe(false);
    expect(balicekBerieFakturu("1h Balíček", 1, f({ dalsi_nazov: "1h Balíček", dalsi_hodiny: 1 }))).toBe(true);
    expect(balicekBerieFakturu("6h Předplatné", 6, f())).toBe(true);
  });
});

describe("popis položky", () => {
  it("vlastný text pre firmu ostáva", () => {
    const text = "Individuální vzdělávací program pro kompenzaci sedavého zaměstnání";
    expect(popisNaDalsi([text, "6h Předplatné"], "6h Předplatné")).toBe(text);
  });
  it("názov balíčka, doplatok ani úvodný sa neopakujú", () => {
    for (const p of ["6h Balíček", "OFF - 6h S viazanostou", "6h Předplatné — doplatek", "Úvodní trénink", "6h Předplatné (2. 10. 2026)", ""]) {
      expect(popisNaDalsi([p], "6h Předplatné")).toBe("6h Předplatné");
    }
    expect(popisNaDalsi([], "6h Předplatné")).toBe("6h Předplatné");
  });
});

describe("úhrada platbou vopred", () => {
  const fa = [{ id: "f", klient: "Jan Kral", vystavene: "2026-11-04", celkom: 6990 }];
  const p = (o: object) => ({ id: "p", klient: "Jan Král", datum: "2026-11-06", suma: 6990, vopred: 1, ...o });
  it("platba vopred na sumu od vystavenia uhradí, aj keď je meno s dĺžňom", () => {
    expect(fakturyNaDalsiUhradene(fa, [p({})], new Set())).toEqual([{ id: "f", den: "2026-11-06", platbaId: "p" }]);
  });
  it("platba na starý dlh, staršia platba, iná suma ani platba z inej faktúry neuhradia", () => {
    expect(fakturyNaDalsiUhradene(fa, [p({ vopred: 0 })], new Set())).toEqual([]);
    expect(fakturyNaDalsiUhradene(fa, [p({ datum: "2026-10-19" })], new Set())).toEqual([]);
    expect(fakturyNaDalsiUhradene(fa, [p({ suma: 5000 })], new Set())).toEqual([]);
    expect(fakturyNaDalsiUhradene(fa, [p({})], new Set(["p"]))).toEqual([]);
  });
  it("jedna platba uhradí jednu faktúru", () => {
    const dve = [...fa, { id: "g", klient: "Jan Kral", vystavene: "2026-11-05", celkom: 6990 }];
    expect(fakturyNaDalsiUhradene(dve, [p({})], new Set()).map((x) => x.id)).toEqual(["f"]);
  });
});

describe("balíček si faktúru priradí — skutočné SQL a skutočná migrácia", () => {
  const databaza = () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE vydane_faktury (id TEXT PRIMARY KEY, cislo TEXT, klient TEXT, balicek_id TEXT, vystavene TEXT, ks REAL, cena_czk REAL, storno_at TEXT);
      CREATE TABLE balicky (id TEXT PRIMARY KEY, zrusene_at TEXT);
      CREATE TABLE vzas_audit (id TEXT, at TEXT, actor TEXT, action TEXT, payment_id TEXT, month TEXT, old_value TEXT, new_value TEXT, reason TEXT);`);
    db.exec(readFileSync(join(import.meta.dir, "../../../migrations/0134_faktura_na_dalsi_balicek.sql"), "utf8"));
    const d1 = {
      prepare: (sql: string) => {
        const zviaz = (...a: unknown[]) => ({
          all: async () => ({ results: db.query(sql).all(...(a as never[])) }),
          first: async () => db.query(sql).get(...(a as never[])),
          run: async () => ({ meta: { changes: db.query(sql).run(...(a as never[])).changes } }),
        });
        return { bind: zviaz, ...zviaz() };
      },
    };
    const vloz = (id: string, klient: string, vystavene: string, o: { naDalsi?: number; balicek?: string | null; storno?: string | null } = {}) =>
      db.query(`INSERT INTO vydane_faktury (id, cislo, klient, balicek_id, vystavene, ks, cena_czk, storno_at, na_dalsi_balicek, dalsi_nazov, dalsi_hodiny)
        VALUES (?,?,?,?,?,1,6990,?,?,'6h Předplatné',6)`).run(id, `c-${id}`, klient, o.balicek ?? null, vystavene, o.storno ?? null, o.naDalsi ?? 1);
    return { db, d1: d1 as unknown as import("@cloudflare/workers-types").D1Database, vloz };
  };
  const balicek = { id: "b1", klient: "Jan Král", nazov: "6h Předplatné", hodiny: 6 };

  it("migrácia: stará faktúra nečaká", async () => {
    const { db, d1 } = databaza();
    db.exec("INSERT INTO vydane_faktury (id, cislo, klient, vystavene, ks, cena_czk) VALUES ('s','c','Jan Kral','2026-10-16',1,6990)");
    expect(await cakajucaFaktura(d1, "Jan Kral")).toBeNull();
  });
  it("priradí najstaršiu podľa mena bez diakritiky, druhá čaká ďalej", async () => {
    const { db, d1, vloz } = databaza();
    vloz("nova", "Jan Kral", "2026-11-05"); vloz("stara", "Jan Kral", "2026-11-04");
    await pripojFakturuKBalicku(d1, balicek, "kokpit");
    expect(db.query("SELECT balicek_id b FROM vydane_faktury WHERE id = 'stara'").get()).toEqual({ b: "b1" });
    expect(db.query("SELECT balicek_id b FROM vydane_faktury WHERE id = 'nova'").get()).toEqual({ b: null });
    expect(db.query("SELECT action FROM vzas_audit").all()).toEqual([{ action: "faktura-na-dalsi-pripojena" }]);
  });
  it("stornovaná, cudzia a bežná faktúra sa nepriradia", async () => {
    const { db, d1, vloz } = databaza();
    vloz("storno", "Jan Kral", "2026-11-01", { storno: "t" });
    vloz("cudzia", "Peter Gažo", "2026-11-01");
    vloz("bezna", "Jan Kral", "2026-11-01", { naDalsi: 0 });
    await pripojFakturuKBalicku(d1, balicek);
    expect(db.query("SELECT COUNT(*) n FROM vydane_faktury WHERE balicek_id IS NOT NULL").get()).toEqual({ n: 0 });
    expect(await klientiSCakajucouFakturou(d1)).toEqual(["Peter Gažo"]);
  });
  it("úvodný si ju nezoberie", async () => {
    const { db, d1, vloz } = databaza();
    vloz("a", "Jan Kral", "2026-11-04");
    await pripojFakturuKBalicku(d1, { ...balicek, nazov: "Úvodní trénink", hodiny: 1 });
    expect(db.query("SELECT balicek_id b FROM vydane_faktury").get()).toEqual({ b: null });
  });
  it("po zrušení balíčka čaká znova, živý balíček ju drží", async () => {
    const { db, d1, vloz } = databaza();
    vloz("a", "Jan Kral", "2026-11-04", { balicek: "b0" });
    db.exec("INSERT INTO balicky (id, zrusene_at) VALUES ('b0', NULL)");
    expect(await cakajucaFaktura(d1, "Jan Kral")).toBeNull();
    db.exec("UPDATE balicky SET zrusene_at = 't' WHERE id = 'b0'");
    expect((await cakajucaFaktura(d1, "Jan Kral"))?.id).toBe("a");
  });
  it("priradený balíček Kokpit na faktúru druhýkrát neponúkne", () => {
    const dlh = [{ id: "b1", klient: "Jan Kral", den: "2026-11-09", nazov: "6h Předplatné", cena: 6990, doplatit: 6990 }] as never;
    expect(dlhyNaFakturu(dlh, ["Jan Kral"], [null, "b1"])).toEqual([]);
    expect(dlhyNaFakturu(dlh, ["Jan Kral"], [null]).length).toBe(1);
  });
});

describe("celý beh Jana Krala cez jedno pravidlo „zaplatený\"", () => {
  const stary = { id: "b0", klient: "Jan Kral", nazov: "6h Předplatné", cena: 6990, platnostOd: "2026-10-09", zdroj: "rucne" };
  const novy = { id: "b1", klient: "Jan Kral", nazov: "6h Předplatné", cena: 6990, platnostOd: "2026-11-09", zdroj: "rucne" };
  const zaStary = { klient: "Jan Kral", datum: "2026-10-19", suma: 6990, vopred: 0 };
  const vopred = { klient: "Jan Kral", datum: "2026-11-06", suma: 6990, vopred: 1 };
  const dlhy = (balicky: object[], platby: object[]) => dlhyKlientov({ poplatky: [], balicky, platby, ptPlatby: [], ptHistoria: [] } as never).polozky;

  const naDalsi = (balicky: object[], platby: object[]) => dlhyKlientov({ poplatky: [], balicky, platby, ptPlatby: [], ptHistoria: [] } as never).naDalsiZaplatene;
  // 9. 11. 2026 ráno: notifikácia „1 h nad rámec", hoci ďalší balíček bol zaplatený.
  it("zaplatený ďalší balíček, ktorý ešte nevznikol, je vidno", () => {
    expect(naDalsi([stary], [zaStary, vopred])).toEqual(["Jan Kral"]);
    expect(naDalsi([stary], [zaStary])).toEqual([]);
    expect(naDalsi([stary, novy], [zaStary, vopred])).toEqual([]);
    expect(naDalsi([stary], [zaStary, { ...vopred, suma: 3000 }])).toEqual([]);
  });
  it("pred pondelkom bez balíčka: nikto nič nedlží", () => {
    expect(dlhy([stary], [zaStary])).toEqual([]);
    expect(dlhy([stary], [zaStary, vopred])).toEqual([]);
  });
  it("firma zaplatila pred pondelkom: nový balíček vznikne zaplatený", () => {
    expect(dlhy([stary, novy], [zaStary, vopred])).toEqual([]);
  });
  it("firma nezaplatila: v pondelok dlh je, ale na faktúru sa už neponúkne", () => {
    const polozky = dlhy([stary, novy], [zaStary]);
    expect(polozky.map((p) => (p as { id?: string }).id)).toEqual(["b1"]);
    expect(dlhyNaFakturu(polozky as never, ["Jan Kral"], [null, "b1"])).toEqual([]);
  });
});
