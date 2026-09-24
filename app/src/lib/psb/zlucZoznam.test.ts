import { describe, expect, it } from "bun:test";

import { zlucZoznam } from "./zlucZoznam";

type C = { id: string; text: string };
const k = (x: C) => x.id;

describe("zlucZoznam", () => {
  it("cudzí zápis, ktorý medzitým pribudol, prežije", () => {
    // Jarvis pridal cieľ „c2", kým mal Jerry obrazovku otvorenú.
    const povodny = [{ id: "c1", text: "a" }];
    const novy = [{ id: "c1", text: "a-upravene" }];
    const server = [{ id: "c1", text: "a" }, { id: "c2", text: "od Jarvisa" }];
    expect(zlucZoznam(povodny, novy, server, k).map(k).sort()).toEqual(["c1", "c2"]);
  });

  it("úprava človeka vyhrá nad serverovou verziou tej istej položky", () => {
    const v = zlucZoznam(
      [{ id: "c1", text: "a" }],
      [{ id: "c1", text: "nove" }],
      [{ id: "c1", text: "stare" }],
      k,
    );
    expect(v).toEqual([{ id: "c1", text: "nove" }]);
  });

  it("zámerné zmazanie zostane zmazané", () => {
    // Bez rozlíšenia „z čoho obrazovka vyšla" by sa zmazaná položka vrátila.
    const v = zlucZoznam(
      [{ id: "c1", text: "a" }, { id: "c2", text: "b" }],
      [{ id: "c1", text: "a" }],
      [{ id: "c1", text: "a" }, { id: "c2", text: "b" }],
      k,
    );
    expect(v.map(k)).toEqual(["c1"]);
  });

  it("keď sa nič inde nezmenilo, vyjde presne to, čo človek uložil", () => {
    const novy = [{ id: "c1", text: "a" }, { id: "c2", text: "b" }];
    expect(zlucZoznam(novy, novy, novy, k)).toEqual(novy);
  });

  it("tá istá položka pridaná na oboch stranách sa nezdvojí", () => {
    const v = zlucZoznam([], [{ id: "c1", text: "moje" }], [{ id: "c1", text: "cudzie" }], k);
    expect(v.length).toBe(1);
    expect(v[0].text).toBe("moje");
  });
});
