// Kopa kariet — poradie, odkladanie a to, že sa nič nestratí.
import { describe, expect, it } from "bun:test";

import { poradie, postavKarty, type Karta } from "./workspaceKarty";

const zdroje = {
  zmeny: [{ id: "z1", druh: "zrusene", klient: "Martin Vaško", nazov: null, pred: "2026-09-22T18:00", po: null, kedy: "2026-09-22T10:00:00Z", trener: "Jerry" }],
  nezname: [{ nazov: "Trening", trener: "Terezka", pocet: 1, najblizsi: "2026-09-09T12:00" }],
  platby: [
    { fioId: "p1", datum: "2026-09-16", suma: 21150, text: "Prosapiens 18h · Natália Pecková", kandidati: ["Natalia Peckova"] },
    { fioId: "p2", datum: "2026-09-09", suma: 3895, text: "Lozias", kandidati: ["Marketa Lozias", "Zdeněk Lozias"] },
  ],
  navrhMena: () => "",
};

describe("postavKarty", () => {
  it("poradie je zmeny → mená → peniaze", () => {
    // Zmeny prvé, kým si človek pamätá, prečo hodina zmizla. Peniaze
    // posledné — je ich veľa a idú mechanicky; keby boli prvé, na zvyšok by
    // nezostala trpezlivosť.
    expect(postavKarty(zdroje).map((k) => k.druh)).toEqual(["zmena", "meno", "platba", "platba"]);
  });

  it("jednoznačný návrh sa predvyplní, dvojznačný nie", () => {
    const k = postavKarty(zdroje).filter((x) => x.druh === "platba") as Extract<Karta, { druh: "platba" }>[];
    expect(k[0].navrh).toBe("Natalia Peckova");
    expect(k[1].navrh).toBe("");
  });

  it("zrušený tréning povie, z ktorého dňa zmizol", () => {
    const z = postavKarty(zdroje)[0] as Extract<Karta, { druh: "zmena" }>;
    expect(z.detail).toBe("zmizol tréning z 22. 9.");
  });
});

describe("poradie", () => {
  const karty = postavKarty(zdroje);

  it("vybavená karta zmizne", () => {
    expect(poradie(karty, new Set(["zmena|z1"]), []).length).toBe(karty.length - 1);
  });

  it("odložená karta sa NESTRATÍ — ide na koniec", () => {
    // „Neviem" nesmie znamenať „zmizlo". To je tá istá strata odpovede,
    // ktorú v appke rieši register.
    const r = poradie(karty, new Set(), ["zmena|z1"]);
    expect(r.length).toBe(karty.length);
    expect(`${r[r.length - 1].druh}|${r[r.length - 1].id}`).toBe("zmena|z1");
  });

  it("prázdna kopa je prázdna, nie chybná", () => {
    expect(poradie(karty, new Set(karty.map((k) => `${k.druh}|${k.id}`)), [])).toEqual([]);
  });
});
