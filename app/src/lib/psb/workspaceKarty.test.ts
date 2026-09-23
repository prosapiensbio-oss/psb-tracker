// Workspace — jedna karta = jeden DRUH práce, a patrí tomu, kto je prihlásený.
import { describe, expect, it } from "bun:test";

import { popisZmeny, postavKarty, type Zmena } from "./workspaceKarty";

const zmena = (o: Partial<Zmena> & { id: string; trener: string }): Zmena => ({
  id: o.id, druh: o.druh ?? "zrusene", klient: o.klient ?? "Martin Vaško", nazov: null,
  pred: o.pred ?? "2026-09-22T18:00", po: o.po ?? null, kedy: "2026-09-22T10:00:00Z", trener: o.trener,
});

const zdroje = {
  zmeny: [zmena({ id: "z1", trener: "Jerry" }), zmena({ id: "z2", trener: "Terezka", klient: "Barbora Vankova" })],
  nezname: [
    { nazov: "Trening", trener: "Terezka", pocet: 1, najblizsi: "2026-09-09T12:00" },
    { nazov: "Luky Kriz", trener: "Jerry", pocet: 1, najblizsi: "2026-09-28T17:00" },
  ],
  platby: [{ fioId: "p1", datum: "2026-09-16", suma: 21150, text: "Prosapiens 18h · Natália Pecková", kandidati: ["Natalia Peckova"] }],
  navrhMena: () => "",
};

describe("karta je kategória, nie položka", () => {
  it("tri kategórie dajú tri karty, nie päť", () => {
    // Prvá verzia dávala jednu kartu na jednu vec a z troch zmien boli tri
    // karty. Jerry 23. 9. 2026: „predstavoval som si celé kategórie."
    const k = postavKarty({ ...zdroje, ktoSom: null });
    expect(k.map((x) => x.druh)).toEqual(["zmeny", "mena", "platby"]);
    expect(k[0].polozky.length).toBe(2);
  });

  it("poradie je zmeny → mená → peniaze", () => {
    // Zmeny prvé, kým si človek pamätá, prečo hodina zmizla. Peniaze
    // posledné — je ich veľa a idú mechanicky.
    expect(postavKarty({ ...zdroje, ktoSom: null })[2].druh).toBe("platby");
  });

  it("prázdna kategória kartu nevyrobí", () => {
    const k = postavKarty({ ...zdroje, zmeny: [], nezname: [], ktoSom: null });
    expect(k.map((x) => x.druh)).toEqual(["platby"]);
  });
});

describe("karta patrí prihlásenému", () => {
  it("Jerry vidí svoje zmeny a svoje názvy", () => {
    const k = postavKarty({ ...zdroje, ktoSom: "jerry" });
    expect(k.find((x) => x.druh === "zmeny")!.polozky.map((p) => (p as Zmena).id)).toEqual(["z1"]);
    expect(k.find((x) => x.druh === "mena")!.polozky.length).toBe(1);
  });

  it("Terezka vidí svoje — a peniaze nie", () => {
    // Peniaze trénera nemajú a sú Jerryho, rovnako ako mesačné kontroly
    // (pravidlo z 31. 8. 2026: „nech Terezku nerozptyľujú").
    const k = postavKarty({ ...zdroje, ktoSom: "terezka" });
    expect(k.map((x) => x.druh)).toEqual(["zmeny", "mena"]);
    expect(k[0].polozky.map((p) => (p as Zmena).id)).toEqual(["z2"]);
  });

  it("bez prihlásenia sa nefiltruje nič", () => {
    expect(postavKarty({ ...zdroje, ktoSom: null })[0].polozky.length).toBe(2);
  });

  it("Jerry vidí peniaze", () => {
    expect(postavKarty({ ...zdroje, ktoSom: "jerry" }).some((x) => x.druh === "platby")).toBe(true);
  });
});

describe("popisZmeny", () => {
  it("zrušený tréning povie, z ktorého dňa zmizol", () => {
    expect(popisZmeny(zmena({ id: "z", trener: "Jerry" }))).toBe("zmizol tréning z 22. 9.");
  });
  it("presun povie odkiaľ a kam", () => {
    expect(popisZmeny(zmena({ id: "z", trener: "Jerry", druh: "posunute", pred: "2026-09-22T16:00", po: "2026-09-24T14:00" })))
      .toBe("presun z 22. 9. na 24. 9.");
  });
});
