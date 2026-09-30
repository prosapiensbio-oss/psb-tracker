import { describe, expect, it } from "bun:test";

import { CELKOVO, oblastiZJson, platnaHodnota, TAZKOST, vetaOPocitoch, zhrnutiePocitov, type Meranie } from "./pocitovka";

const m = (
  datum: string,
  oblasti: { oblast: string; sila: number | null }[] = [],
  tazkost: number | null = null,
  posun: number | null = null,
  poznamka = "",
): Meranie => ({ datum, oblasti, tazkost, posun, poznamka });

describe("hodnota zo stránky", () => {
  it("berie celé čísla vrátane nuly — nula je odpoveď „nebolí“", () => {
    expect(platnaHodnota(0)).toBe(0);
    expect(platnaHodnota("7")).toBe(7);
    expect(platnaHodnota(10)).toBe(10);
  });

  it("mimo stupnice a nezmysly sú prázdno", () => {
    expect(platnaHodnota(11)).toBeNull();
    expect(platnaHodnota(-1)).toBeNull();
    expect(platnaHodnota(3.5)).toBeNull();
    expect(platnaHodnota("veľa")).toBeNull();
    expect(platnaHodnota("")).toBeNull();
    expect(platnaHodnota(null)).toBeNull();
  });

  it("posun má vlastný rozsah 1–3", () => {
    expect(platnaHodnota(3, 1, 3)).toBe(3);
    expect(platnaHodnota(0, 1, 3)).toBeNull();
    expect(platnaHodnota(4, 1, 3)).toBeNull();
  });
});

describe("oblasti z uloženého JSON", () => {
  it("prečíta tvar, aký píše anamnéza", () => {
    expect(oblastiZJson('[{"oblast":"krk","sila":7}]')).toEqual([{ oblast: "krk", sila: 7 }]);
  });

  it("čo nemá meno, nie je oblasť", () => {
    expect(oblastiZJson('[{"sila":4},{"oblast":"  "},{"oblast":"bedra","sila":null}]'))
      .toEqual([{ oblast: "bedra", sila: null }]);
  });

  it("rozbitý zápis nezhodí kartu", () => {
    expect(oblastiZJson("{toto nie je json")).toEqual([]);
    expect(oblastiZJson(null)).toEqual([]);
  });
});

describe("každá oblasť je vlastný rad", () => {
  it("nižšie číslo je lepšie — v celej pocitovke", () => {
    const z = zhrnutiePocitov([
      m("2026-01-10", [{ oblast: "krk", sila: 8 }], 6),
      m("2026-03-11", [{ oblast: "krk", sila: 3 }], 2),
    ]);
    expect(z.rady.find((r) => r.kluc === "krk")?.lepsieO).toBe(5);
    expect(z.rady.find((r) => r.kluc === TAZKOST.id)?.lepsieO).toBe(4);
  });

  it("zhoršenie je záporné, nie zamlčané", () => {
    const z = zhrnutiePocitov([m("2026-01-10", [{ oblast: "krk", sila: 3 }]), m("2026-02-10", [{ oblast: "krk", sila: 6 }])]);
    expect(z.rady[0].lepsieO).toBe(-3);
  });

  it("oblasť pridaná neskôr má VLASTNÝ začiatok", () => {
    // Klient prvý mesiac hlásil krk, koleno pribudlo až potom. Spoločný
    // začiatok by koleno porovnával s krkom.
    const z = zhrnutiePocitov([
      m("2026-01-10", [{ oblast: "krk", sila: 8 }]),
      m("2026-02-09", [{ oblast: "krk", sila: 6 }, { oblast: "koleno", sila: 5 }]),
      m("2026-03-11", [{ oblast: "krk", sila: 5 }, { oblast: "koleno", sila: 2 }]),
    ]);
    expect(z.rady.find((r) => r.kluc === "koleno")?.prva).toBe(5);
    expect(z.rady.find((r) => r.kluc === "koleno")?.dni).toBe(30);
    expect(z.rady.find((r) => r.kluc === "krk")?.dni).toBe(60);
  });

  it("prázdna hodnota do radu nevstúpi", () => {
    const z = zhrnutiePocitov([m("2026-01-10", [{ oblast: "krk", sila: null }], null)]);
    expect(z.rady).toHaveLength(0);
    expect(z.pocet).toBe(1);
  });

  it("bolesť stojí pred bežnými vecami", () => {
    const z = zhrnutiePocitov([m("2026-01-10", [{ oblast: CELKOVO, sila: 4 }], 5)]);
    expect(z.rady.map((r) => r.kluc)).toEqual([CELKOVO, TAZKOST.id]);
  });

  it("poradie na vstupe nerozhoduje, dátum áno", () => {
    const z = zhrnutiePocitov([m("2026-03-11", [{ oblast: "krk", sila: 3 }]), m("2026-01-10", [{ oblast: "krk", sila: 8 }])]);
    expect(z.rady[0].prva).toBe(8);
    expect(z.posledne?.datum).toBe("2026-03-11");
  });
});

describe("posun a odkazy", () => {
  it("posun berie POSLEDNÚ odpoveď, nie prvú", () => {
    const z = zhrnutiePocitov([m("2026-01-10", [], null, 1), m("2026-02-10", [], null, 3)]);
    expect(z.posun?.text).toBe("veľmi");
    expect(z.posun?.datum).toBe("2026-02-10");
  });

  it("odkazy idú od najnovšieho a prázdne sa nezbierajú", () => {
    const z = zhrnutiePocitov([
      m("2026-01-10", [], null, null, "bolí to menej"),
      m("2026-02-10", [], null, null, "   "),
      m("2026-03-10", [], null, null, "lepšie sa mi spí"),
    ]);
    expect(z.odkazy.map((o) => o.text)).toEqual(["lepšie sa mi spí", "bolí to menej"]);
  });
});

describe("veta pre obrazovku aj Jarvisa", () => {
  it("bez hodnotenia sa netvrdí nič", () => {
    expect(vetaOPocitoch(zhrnutiePocitov([]))).toBe("Klient sa zatiaľ nehodnotil.");
  });

  it("prvé hodnotenie to povie nahlas", () => {
    const v = vetaOPocitoch(zhrnutiePocitov([m("2026-01-10", [{ oblast: "krk", sila: 8 }], 5, 2)]));
    expect(v).toContain("krk: 8/10");
    expect(v).toContain("zmenu k lepšiemu cíti: trochu");
    expect(v).toContain("porovnávať sa nemá s čím");
  });

  it("pri druhom hodnotení nesie smer", () => {
    const v = vetaOPocitoch(zhrnutiePocitov([
      m("2026-01-10", [{ oblast: "krk", sila: 8 }]),
      m("2026-02-09", [{ oblast: "krk", sila: 5 }]),
    ]));
    expect(v).toContain("lepšie o 3");
    expect(v).not.toContain("porovnávať");
  });
});
