import { describe, expect, it } from "bun:test";

import { platnaHodnota, vetaOPocitoch, zhrnutiePocitov, type Meranie } from "./pocitovka";

const m = (datum: string, bolest: number | null, pohyb: number | null = null, posun: number | null = null): Meranie =>
  ({ datum, bolest, pohyb, posun });

describe("hodnota zo stránky", () => {
  it("berie len celé čísla 1–10", () => {
    expect(platnaHodnota(1)).toBe(1);
    expect(platnaHodnota("7")).toBe(7);
    expect(platnaHodnota(10)).toBe(10);
  });

  it("nula je prázdno, nie „nebolí“", () => {
    // Nula by sa v bolesti čítala ako odpoveď „vôbec" — a tú klient nedal.
    expect(platnaHodnota(0)).toBeNull();
  });

  it("mimo stupnice a nezmysly sú prázdno", () => {
    expect(platnaHodnota(11)).toBeNull();
    expect(platnaHodnota(3.5)).toBeNull();
    expect(platnaHodnota("veľa")).toBeNull();
    expect(platnaHodnota(null)).toBeNull();
    expect(platnaHodnota("")).toBeNull();
  });
});

describe("zmena sa počíta pre každú otázku zvlášť", () => {
  it("bolesť je lepšie, keď KLESNE", () => {
    const z = zhrnutiePocitov([m("2026-01-10", 8), m("2026-03-11", 3)]);
    expect(z.zmeny.bolest?.lepsieO).toBe(5);
    expect(z.zmeny.bolest?.dni).toBe(60);
  });

  it("pohyb je lepšie, keď STÚPNE", () => {
    const z = zhrnutiePocitov([m("2026-01-10", null, 3), m("2026-02-09", null, 7)]);
    expect(z.zmeny.pohyb?.lepsieO).toBe(4);
  });

  it("zhoršenie je záporné, nie zamlčané", () => {
    expect(zhrnutiePocitov([m("2026-01-10", 3), m("2026-02-10", 6)]).zmeny.bolest?.lepsieO).toBe(-3);
  });

  it("chýbajúca odpoveď posunie ZAČIATOK tej otázky, nie ostatných", () => {
    // Klient prvýkrát klepol len bolesť, druhýkrát oboje. Pohyb má prvú
    // hodnotu až v druhom zázname a porovnávať ho ešte niet s čím.
    const z = zhrnutiePocitov([m("2026-01-10", 8), m("2026-02-10", 6, 4), m("2026-03-10", 5, 8)]);
    expect(z.zmeny.bolest?.prva).toBe(8);
    expect(z.zmeny.pohyb?.prva).toBe(4);
    expect(z.zmeny.pohyb?.dni).toBe(28);
  });

  it("jedna hodnota nie je zmena", () => {
    const z = zhrnutiePocitov([m("2026-01-10", 8)]);
    expect(z.zmeny.bolest).toBeUndefined();
    expect(z.pocet).toBe(1);
  });

  it("poradie na vstupe nerozhoduje, dátum áno", () => {
    const z = zhrnutiePocitov([m("2026-03-11", 3), m("2026-01-10", 8)]);
    expect(z.zmeny.bolest?.prva).toBe(8);
    expect(z.posledne?.datum).toBe("2026-03-11");
  });
});

describe("veta pre obrazovku aj Jarvisa", () => {
  it("bez merania sa netvrdí nič", () => {
    expect(vetaOPocitoch(zhrnutiePocitov([]))).toBe("Klient sa zatiaľ nehodnotil.");
  });

  it("prvé hodnotenie to povie nahlas", () => {
    const v = vetaOPocitoch(zhrnutiePocitov([m("2026-01-10", 8, 4, 5)]));
    expect(v).toContain("bolest: 8/10");
    expect(v).toContain("porovnávať sa nemá s čím");
  });

  it("pri druhom hodnotení nesie smer", () => {
    const v = vetaOPocitoch(zhrnutiePocitov([m("2026-01-10", 8), m("2026-02-09", 5)]));
    expect(v).toContain("lepšie o 3");
    expect(v).not.toContain("porovnávať");
  });
});
