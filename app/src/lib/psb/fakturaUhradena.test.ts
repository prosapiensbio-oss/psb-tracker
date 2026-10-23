import { describe, expect, it } from "bun:test";

import { faktureUhradeneBalickom } from "./fakturaUhradena";

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
