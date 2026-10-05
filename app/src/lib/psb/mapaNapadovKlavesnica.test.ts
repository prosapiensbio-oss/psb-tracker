import { describe, expect, it } from "bun:test";

import {
  hladajNapady, osnova, preradenie, predkovia, surodenci, vetvaUzla, vetvyVsetkych, viditelneVsetky,
  viditelny, vlozenieZa, VETVY_ZAKLAD, type Uzol,
} from "./mapaNapadov";

const u = (o: Partial<Uzol> & { id: string }): Uzol =>
  ({ text: "nápad", rodic: "", vetva: "nezaradene", poradie: 0, zbalene: false, faza: 0, ...o });

describe("vetva a viditeľnosť naraz — to isté ako po jednom", () => {
  const uzly = [
    u({ id: "a", vetva: "kniha" }), u({ id: "b", rodic: "a", zbalene: true }), u({ id: "c", rodic: "b" }),
    u({ id: "d", vetva: "vymyslena" }), u({ id: "e", rodic: "zmizol" }),
    u({ id: "x", rodic: "y" }), u({ id: "y", rodic: "x" }),
  ];
  it("vetvyVsetkych == vetvaUzla pri každom uzle (aj sirota a kruh)", () => {
    const m = vetvyVsetkych(uzly);
    for (const x of uzly) expect(m.get(x.id)).toBe(vetvaUzla(x.id, uzly));
  });
  it("viditelneVsetky == viditelny pri každom uzle", () => {
    const s = viditelneVsetky(uzly);
    for (const x of uzly) expect(s.has(x.id)).toBe(viditelny(x.id, uzly));
  });
});

describe("súrodenci", () => {
  const uzly = [
    u({ id: "k1", vetva: "kniha", poradie: 0 }), u({ id: "u1", vetva: "uvodny", poradie: 0 }),
    u({ id: "k2", vetva: "kniha", poradie: 1 }), u({ id: "d1", rodic: "k1", poradie: 1 }),
    u({ id: "d0", rodic: "k1", poradie: 0 }),
  ];
  it("koreňové len v tej istej vetve, v poradí", () => {
    expect(surodenci("k2", uzly).map((x) => x.id)).toEqual(["k1", "k2"]);
  });
  it("deti podľa poradia", () => {
    expect(surodenci("d1", uzly).map((x) => x.id)).toEqual(["d0", "d1"]);
  });
});

describe("preradenie ⌘↑ / ⌘↓", () => {
  it("vymení so susedom a prečísluje diery aj zhody", () => {
    const uzly = [u({ id: "a", poradie: 0 }), u({ id: "b", poradie: 0 }), u({ id: "c", poradie: 7 })];
    // poradie na mape: a, b (zhoda → podľa id), c
    expect(preradenie("c", -1, uzly)).toEqual([{ id: "c", poradie: 1 }, { id: "b", poradie: 2 }]);
    expect(preradenie("a", 1, uzly)).toEqual([{ id: "a", poradie: 1 }, { id: "c", poradie: 2 }]);
  });
  it("na okraji vráti null", () => {
    const uzly = [u({ id: "a", poradie: 0 }), u({ id: "b", poradie: 1 })];
    expect(preradenie("a", -1, uzly)).toBeNull();
    expect(preradenie("b", 1, uzly)).toBeNull();
  });
});

describe("Enter vloží hneď za", () => {
  it("prečísluje rad a nechá miesto (aj keď sa poradie zrážalo)", () => {
    const rad = [{ id: "a", poradie: 0 }, { id: "b", poradie: 1 }, { id: "c", poradie: 1 }];
    expect(vlozenieZa(rad, "a", "N")).toEqual([
      { id: "N", poradie: 1 }, { id: "b", poradie: 2 }, { id: "c", poradie: 3 },
    ]);
  });
  it("za posledného — nikto sa nehýbe", () => {
    expect(vlozenieZa([{ id: "a", poradie: 0 }, { id: "b", poradie: 1 }], "b", "N")).toEqual([{ id: "N", poradie: 2 }]);
  });
  it("neznáma kotva = na koniec", () => {
    expect(vlozenieZa([{ id: "a", poradie: 4 }], "zz", "N")).toEqual([{ id: "N", poradie: 5 }]);
  });
});

describe("osnova", () => {
  const uzly = [
    u({ id: "k", vetva: "kniha", text: "Kniha 1" }),
    u({ id: "k2", rodic: "k", poradie: 1, text: "druhý" }),
    u({ id: "k1", rodic: "k", poradie: 0, text: "prvý", zbalene: true }),
    u({ id: "skryty", rodic: "k1" }),
    u({ id: "n", vetva: "", text: "bez vetvy" }),
  ];
  const o = osnova(uzly, VETVY_ZAKLAD);
  it("vetvy v poradí mapy, hĺbka a poradie detí", () => {
    expect(o.map((x) => x.vetva.id)).toEqual(["uvodny", "kniha", "nezaradene"]);
    expect(o[1].riadky.map((r) => [r.uzol.id, r.hlbka])).toEqual([["k", 0], ["k1", 1], ["k2", 1]]);
  });
  it("zbalený skryje deti, ale povie, koľko ich má", () => {
    expect(o[1].riadky.find((r) => r.uzol.id === "k1")?.deti).toBe(1);
    expect(o[1].riadky.some((r) => r.uzol.id === "skryty")).toBe(false);
  });
  it("koreň bez vetvy je v odkladisku", () => {
    expect(o[2].riadky.map((r) => r.uzol.id)).toEqual(["n"]);
  });
});

describe("hľadanie", () => {
  const r = [
    { id: "1", text: "Prečo strečing nezaberá" },
    { id: "2", text: "Fascie a strečing", stav: "zamietnuty" },
    { id: "3", text: "Dych a rebrá" },
  ];
  it("bez diakritiky, každé slovo, zamietnuté nie", () => {
    expect(hladajNapady(r, "strecing").map((x) => x.id)).toEqual(["1"]);
    expect(hladajNapady(r, "nezabera PRECO").map((x) => x.id)).toEqual(["1"]);
    expect(hladajNapady(r, "  ")).toEqual([]);
  });
  it("predkovia od rodiča ku koreňu", () => {
    const uzly = [u({ id: "a" }), u({ id: "b", rodic: "a" }), u({ id: "c", rodic: "b" })];
    expect(predkovia("c", uzly).map((x) => x.id)).toEqual(["b", "a"]);
  });
});
