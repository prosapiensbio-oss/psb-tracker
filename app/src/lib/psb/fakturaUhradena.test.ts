import { describe, expect, it } from "bun:test";

import { faktureUhradeneBalickom, fakturyUhradeneRozdelenim } from "./fakturaUhradena";

const f = (o: object) => ({ id: "f", klient: "Martin Vaško", balicekId: "b", vystavene: "2026-10-08", celkom: 6990, uhradeneAt: null, stornoAt: null, ...o });
const pl = [{ id: "p", klient: "Martin Vaško", datum: "2026-10-09", suma: 6990 }];

describe("faktúra uhradená balíčkom (Martin Vaško, 23. 10. 2026)", () => {
  it("balíček zaplatený → faktúra uhradená dňom platby", () => {
    expect(faktureUhradeneBalickom([f({})], new Set(["b"]), [], pl, "2026-10-23")).toEqual([{ id: "f", den: "2026-10-09", platbaId: "p" }]);
  });
  it("balíček v dlhu (aj čiastočne) → nie", () => {
    const dlh = [{ klient: "Martin Vaško", den: "2026-09-27", nazov: "x", cena: 6990, doplatit: 100, zdroj: "kokpit", id: "b" }] as never;
    expect(faktureUhradeneBalickom([f({})], new Set(["b"]), dlh, pl, "2026-10-23")).toEqual([]);
  });
  it("zrušený balíček alebo faktúra bez balíčka → nie", () => {
    expect(faktureUhradeneBalickom([f({})], new Set(), [], pl, "2026-10-23")).toEqual([]);
    expect(faktureUhradeneBalickom([f({ balicekId: null })], new Set(["b"]), [], pl, "2026-10-23")).toEqual([]);
  });
});

describe("faktúra za viacerých — uhradená až rozdeleným prevodom (29. 10. 2026)", () => {
  const fa = [{ id: "f", klient: "Branislav Široký", vystavene: "2026-10-28", diely: [{ klient: "Branislav Široký", suma: 7890 }, { klient: "Linda Muth", suma: 7790 }] }];
  it("diel každého z jedného prevodu = uhradená", () => {
    const r = fakturyUhradeneRozdelenim(fa, [
      { id: "p1", klient: "Branislav Široký", datum: "2026-11-03", suma: 7890, fioId: "fio1" },
      { id: "p2", klient: "Linda Muth", datum: "2026-11-03", suma: 7790, fioId: "fio1" },
    ]);
    expect(r).toEqual([{ id: "f", den: "2026-11-03", platbaId: "p1" }]);
  });
  it("zaplatený len Branislavov diel nestačí", () => {
    expect(fakturyUhradeneRozdelenim(fa, [{ id: "p1", klient: "Branislav Široký", datum: "2026-11-03", suma: 7890, fioId: "fio1" }])).toEqual([]);
  });
  it("prevod spred vystavenia sa nepočíta", () => {
    expect(fakturyUhradeneRozdelenim(fa, [
      { id: "p1", klient: "Branislav Široký", datum: "2026-10-01", suma: 7890, fioId: "fio0" },
      { id: "p2", klient: "Linda Muth", datum: "2026-10-01", suma: 7790, fioId: "fio0" },
    ])).toEqual([]);
  });
});
