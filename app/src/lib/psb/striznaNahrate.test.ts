import { describe, expect, it } from "bun:test";

import { cisteMeno, klucObjektu, overCasti, pocetCasti, PREFIX, rozsahCasti, rozsahZHlavicky, typVidea, VELKOST_CASTI } from "./striznaNahrate";

describe("časti", () => {
  it("2 GB z iPhonu = 82 častí po 25 MiB", () => {
    expect(pocetCasti(2 * 1000 ** 3)).toBe(Math.ceil((2 * 1000 ** 3) / VELKOST_CASTI));
    expect(pocetCasti(1)).toBe(1);
    expect(pocetCasti(VELKOST_CASTI)).toBe(1);
    expect(pocetCasti(VELKOST_CASTI + 1)).toBe(2);
    expect(pocetCasti(0)).toBe(0);
  });

  it("všetky časti okrem poslednej sú rovnako veľké a spolu dajú celý súbor", () => {
    const velkost = 3 * VELKOST_CASTI + 12345;
    const n = pocetCasti(velkost);
    let spolu = 0;
    for (let i = 1; i <= n; i++) {
      const { od, po } = rozsahCasti(i, velkost);
      expect(od).toBe(spolu);
      if (i < n) expect(po - od).toBe(VELKOST_CASTI);
      spolu = po;
    }
    expect(spolu).toBe(velkost);
    expect(rozsahCasti(n, velkost).po - rozsahCasti(n, velkost).od).toBe(12345);
  });
});

describe("overCasti", () => {
  it("prijme 1…N v ľubovoľnom poradí", () => {
    const r = overCasti([{ cislo: 2, etag: "b" }, { cislo: 1, etag: "a" }], 2);
    expect(r).toEqual([{ cislo: 1, etag: "a" }, { cislo: 2, etag: "b" }]);
  });
  it("dieru, chýbajúci etag aj zlý počet odmietne vetou", () => {
    expect(typeof overCasti([{ cislo: 1, etag: "a" }, { cislo: 3, etag: "c" }], 2)).toBe("string");
    expect(typeof overCasti([{ cislo: 1, etag: "" }], 1)).toBe("string");
    expect(typeof overCasti([{ cislo: 1, etag: "a" }], 2)).toBe("string");
    expect(typeof overCasti(null, 1)).toBe("string");
  });
});

describe("meno a kľúč", () => {
  it("kľúč je vždy pod prefixom Strižne a bez lomítok z mena", () => {
    const k = klucObjektu("abc123xyz", "../fotky/IMG 0001.MOV");
    expect(k.startsWith(PREFIX + "abc123xyz/")).toBe(true);
    expect(k.slice((PREFIX + "abc123xyz/").length)).not.toContain("/");
  });
  it("dlhé meno skráti a nechá príponu", () => {
    const m = cisteMeno("a".repeat(300) + ".mov");
    expect(m.length).toBe(120);
    expect(m.endsWith(".mov")).toBe(true);
  });
  it("prázdne meno dostane náhradu", () => {
    expect(cisteMeno("  ")).toBe("video.mov");
  });
});

describe("typVidea", () => {
  it("video/* berie, prázdny typ dopočíta z prípony, ostatné odmietne", () => {
    expect(typVidea("video/quicktime", "IMG_1.MOV")).toBe("video/quicktime");
    expect(typVidea("", "IMG_1.MOV")).toBe("video/quicktime");
    expect(typVidea("application/octet-stream", "a.mp4")).toBe("video/mp4");
    expect(typVidea("image/jpeg", "a.jpg")).toBeNull();
    expect(typVidea("", "a.txt")).toBeNull();
  });
});

describe("rozsahZHlavicky", () => {
  it("bez hlavičky celý súbor", () => {
    expect(rozsahZHlavicky(null, 100)).toBeNull();
  });
  it("a-b, a- aj -n", () => {
    expect(rozsahZHlavicky("bytes=0-9", 100)).toEqual({ od: 0, dlzka: 10 });
    expect(rozsahZHlavicky("bytes=90-", 100)).toEqual({ od: 90, dlzka: 10 });
    expect(rozsahZHlavicky("bytes=-10", 100)).toEqual({ od: 90, dlzka: 10 });
    expect(rozsahZHlavicky("bytes=95-500", 100)).toEqual({ od: 95, dlzka: 5 });
  });
  it("mimo súboru = 416", () => {
    expect(rozsahZHlavicky("bytes=100-", 100)).toBe("zly");
    expect(rozsahZHlavicky("bytes=50-10", 100)).toBe("zly");
  });
  it("viac rozsahov naraz → celý súbor (dovolené odpovedať 200)", () => {
    expect(rozsahZHlavicky("bytes=0-1,5-6", 100)).toBeNull();
  });
});
