import { describe, expect, it } from "bun:test";

import { coStym, holdRate, hookRate, medianHooku, pasmoCtr, pasmoFrekvencie, pasmoHook } from "./reklamaMetriky";

const zaklad = {
  id: "1", nazov: "reklama", kampan: "k", mesiac: "2026-09",
  spend: 500, impressions: 10000, clicks: 220, ctr: 2.2, cpm: 50, frekvencia: 1.8,
  videnia2s: 3000, thruplay: 1200,
};

describe("hook a hold", () => {
  it("hook je podiel dvojsekundových videní na zobrazeniach", () => {
    expect(hookRate(zaklad)).toBe(30);
  });

  it("hold sa počíta z tých, čo ZASTAVILI, nie zo zobrazení", () => {
    // Inak by každá reklama vyzerala zle: väčšina ľudí video ani nezačne.
    expect(holdRate(zaklad)).toBe(40);
  });

  it("bez dát nevymýšľa nulu", () => {
    expect(hookRate({ videnia2s: 0, impressions: 1000 })).toBeNull();
    expect(holdRate({ thruplay: 0, videnia2s: 0 })).toBeNull();
  });
});

describe("pásma", () => {
  it("hook sa meria proti vlastnému mediánu, nie proti benchmarku", () => {
    // Dvojsekundové videnia dávajú u PSB 63–65 %. Odvetvové pásmo 18–28 %
    // je merané na trojsekundových — proti nemu by bolo všetko „výborné".
    expect(pasmoHook(75, 60)).toBe("dobre");
    expect(pasmoHook(60, 60)).toBe("hranica");
    expect(pasmoHook(40, 60)).toBe("zle");
    expect(pasmoHook(null, 60)).toBe("nevie");
    // Bez mediánu sa nehodnotí — jedna reklama nemá s čím súperiť.
    expect(pasmoHook(63, null)).toBe("nevie");
  });

  it("medián potrebuje aspoň tri reklamy", () => {
    expect(medianHooku([60, 70])).toBeNull();
    expect(medianHooku([50, 60, 70])).toBe(60);
    expect(medianHooku([50, 60, 70, 80])).toBe(65);
    expect(medianHooku([null, 0, 60, 70, 80])).toBe(70);
  });

  it("CTR sa meria proti mediánu 2,19 %", () => {
    expect(pasmoCtr(2.5)).toBe("dobre");
    expect(pasmoCtr(1.5)).toBe("hranica");
    expect(pasmoCtr(0.6)).toBe("zle");
  });

  it("frekvencia nad 3,5 je únava", () => {
    expect(pasmoFrekvencie(1.9)).toBe("dobre");
    expect(pasmoFrekvencie(3)).toBe("hranica");
    expect(pasmoFrekvencie(4.2)).toBe("zle");
    expect(pasmoFrekvencie(0)).toBe("nevie");
  });
});

describe("coStym", () => {
  it("slabý hook prebije všetko ostatné", () => {
    // Keď video nezastaví palec, CTR ani frekvencia nie sú príčina.
    const v = coStym({ ...zaklad, videnia2s: 1500, ctr: 0.4, frekvencia: 5 }, 30);
    expect(v).toContain("menej ľudí než tvoje bežné video");
  });

  it("dobrý hook a slabý hold ukazuje na telo videa", () => {
    expect(coStym({ ...zaklad, thruplay: 600 }, 25)).toContain("zvyšok nie");
  });

  it("únava publika sa pomenuje číslom", () => {
    expect(coStym({ ...zaklad, frekvencia: 4.2 }, 25)).toContain("4,2×");
  });

  it("keď je všetko v poriadku, mlčí", () => {
    expect(coStym(zaklad, 25)).toBe("");
  });
});
