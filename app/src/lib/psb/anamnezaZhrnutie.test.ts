import { describe, expect, it } from "bun:test";

import { stavAnamnezy, vlajkyBezNicoho, zhrnutieAnamnezy } from "./anamnezaZhrnutie";

/** Doslovná odpoveď z ostrého testu 30. 9. 2026 (AATest). */
const KLIENT = {
  privadza: "Něco mě bolí",
  oblasti: [{ oblast: "bedra", sila: 6 }, { oblast: "kolena", sila: 3 }],
  vlajky: ["bolest budí v noci"],
  vlajky_popis: "Skúšobné dáta — test anamnézy.",
  lieky: "ne",
  zakaz: "Ne",
};

describe("zhrnutie ukáže to, čo musí byť vidieť pred tréningom", () => {
  it("bolesť nesie oblasť aj silu", () => {
    const r = zhrnutieAnamnezy(KLIENT, {});
    expect(r.find((x) => x.popis === "bolesť")?.hodnota).toBe("bedra 6/10 · kolena 3/10");
  });

  it("červená vlajka je označená ako vlajka", () => {
    const r = zhrnutieAnamnezy(KLIENT, {});
    const v = r.find((x) => x.popis === "pozor");
    expect(v?.hodnota).toBe("bolest budí v noci");
    expect(v?.vlajka).toBe(true);
  });

  it("„ne“ pri liekoch riadok nevyrobí — je to odpoveď, nie údaj", () => {
    expect(zhrnutieAnamnezy(KLIENT, {}).some((x) => x.popis === "lieky a liečba")).toBe(false);
    expect(zhrnutieAnamnezy({ ...KLIENT, lieky: "Warfarin" }, {}).some((x) => x.popis === "lieky a liečba")).toBe(true);
  });

  it("zákaz od lekára sa ukáže len pri „Ano“", () => {
    expect(zhrnutieAnamnezy(KLIENT, {}).some((x) => x.popis === "lekár niečo zakázal")).toBe(false);
    const s = zhrnutieAnamnezy({ ...KLIENT, zakaz: "Ano", zakaz_popis: "žádné dřepy" }, {});
    expect(s.find((x) => x.popis === "lekár niečo zakázal")?.hodnota).toBe("žádné dřepy");
  });

  it("zápis trénera prebíja odpoveď klienta", () => {
    // Tréner videl človeka naživo; jeho oprava je novšia.
    const r = zhrnutieAnamnezy(KLIENT, { oblasti: [{ oblast: "krk", sila: 8 }] });
    expect(r.find((x) => x.popis === "bolesť")?.hodnota).toBe("krk 8/10");
  });

  it("prázdna anamnéza nevyrobí ani jeden riadok", () => {
    expect(zhrnutieAnamnezy({}, {})).toEqual([]);
  });

  it("oblasť bez sily sa ukáže bez čísla, nie s nulou", () => {
    // Z testu postury prídu oblasti bez sily — nula by znamenala „nebolí".
    const r = zhrnutieAnamnezy({ oblasti: [{ oblast: "krk", sila: null }] }, {});
    expect(r.find((x) => x.popis === "bolesť")?.hodnota).toBe("krk");
  });
});

describe("„nic z toho“ nie je varovanie", () => {
  it("sama o sebe vlajku nevyrobí", () => {
    expect(vlajkyBezNicoho(["nic z toho"])).toEqual([]);
    expect(zhrnutieAnamnezy({ vlajky: ["nic z toho"] }, {}).some((x) => x.vlajka)).toBe(false);
  });

  it("vedľa skutočnej vlajky sa odfiltruje", () => {
    expect(vlajkyBezNicoho(["závratě nebo mdloby", "nic z toho"])).toEqual(["závratě nebo mdloby"]);
  });
});

describe("stav anamnézy", () => {
  it("rozlíši štyri situácie", () => {
    expect(stavAnamnezy({ existuje: false, klientVyplnilAt: null, zapisAt: null }).tón).toBe("caka");
    expect(stavAnamnezy({ existuje: true, klientVyplnilAt: null, zapisAt: null }).tón).toBe("caka");
    expect(stavAnamnezy({ existuje: true, klientVyplnilAt: "2026-09-30", zapisAt: null }).tón).toBe("ide");
    expect(stavAnamnezy({ existuje: true, klientVyplnilAt: "2026-09-30", zapisAt: "2026-10-01" }).tón).toBe("hotovo");
  });
});
