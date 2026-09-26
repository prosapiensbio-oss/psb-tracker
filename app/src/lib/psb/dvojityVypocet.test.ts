import { describe, expect, it } from "bun:test";

import { porovnajDvojmo, sedi } from "./dvojityVypocet";

const m = (mesiac: string, treningy: number, hodiny: number, klienti: number, trzby: number) =>
  ({ mesiac, treningy, hodiny, klienti, trzby });

describe("hranica zhody", () => {
  it("tréningy: dva kusy alebo päť percent", () => {
    expect(sedi("treningy", 186, 183)).toBe(true);   // −3 z 186 je 1,6 %
    expect(sedi("treningy", 10, 8)).toBe(true);      // dva kusy pri malom čísle
    expect(sedi("treningy", 10, 7)).toBe(false);
    expect(sedi("treningy", 216, 144)).toBe(false);  // marec 2026 — 33 %
  });

  it("peniaze: päť percent, najmenej dvesto korún", () => {
    expect(sedi("trzby", 194955, 194800)).toBe(true);
    expect(sedi("trzby", 1000, 850)).toBe(true);     // 150 Kč je pod stropom
    expect(sedi("trzby", 100000, 80000)).toBe(false);
  });

  it("nula na oboch stranách je zhoda", () => {
    expect(sedi("trzby", 0, 0)).toBe(true);
    expect(sedi("treningy", 0, 0)).toBe(true);
  });
});

describe("dvojitý výpočet po mesiacoch", () => {
  const exp = [m("2026-09", 153, 153, 57, 160030), m("2026-08", 186, 186, 54, 194955), m("2026-07", 214, 214, 51, 199463)];
  const vla = [m("2026-09", 207, 207, 59, 120000), m("2026-08", 183, 183, 54, 190000), m("2026-07", 193, 193, 50, 195000)];

  it("berie posledné tri mesiace, najnovší hore", () => {
    const r = porovnajDvojmo(exp, vla, "2026-09-20", 3, "2026-09");
    expect(r.map((x) => x.mesiac)).toEqual(["2026-09", "2026-08", "2026-07"]);
  });

  it("budúce mesiace z kalendára sa nepočítajú", () => {
    // Kalendár má objednané hodiny aj na december; export o nich nevie.
    // Kým sa budúcnosť neodrezala, vytlačila z tabuľky uzavreté mesiace.
    const sBuducnostou = [...vla, m("2026-12", 101, 101, 16, 0), m("2026-11", 87, 87, 16, 0)];
    const r = porovnajDvojmo(exp, sBuducnostou, "2026-09-20", 3, "2026-09");
    expect(r.map((x) => x.mesiac)).toEqual(["2026-09", "2026-08", "2026-07"]);
  });

  it("prebiehajúci mesiac sa nehodnotí", () => {
    // Export chodí raz týždenne; v septembri je vždy pozadu a rozdiel je
    // vlastnosť kalendára, nie nezhoda.
    const r = porovnajDvojmo(exp, vla, "2026-09-20", 3, "2026-09");
    expect(r[0].neuplny).toBe(true);
    expect(r[0].sedi).toBe(true);
  });

  it("uzavretý mesiac hodnotí naozaj", () => {
    const r = porovnajDvojmo(exp, vla, "2026-09-20", 3, "2026-09");
    const august = r.find((x) => x.mesiac === "2026-08")!;
    expect(august.neuplny).toBe(false);
    expect(august.riadky.find((x) => x.metrika === "treningy")).toMatchObject({ export: 186, vlastne: 183, rozdiel: -3, sedi: true });
    expect(august.sedi).toBe(true);
  });

  it("nezhodu ukáže aj s percentom", () => {
    const juli = porovnajDvojmo(exp, vla, "2026-09-20", 3, "2026-09").find((x) => x.mesiac === "2026-07")!;
    const t = juli.riadky.find((x) => x.metrika === "treningy")!;
    expect(t.rozdiel).toBe(-21);
    expect(t.percent).toBeCloseTo(-9.8, 1);
    expect(t.sedi).toBe(false);
    expect(juli.sedi).toBe(false);
  });

  it("chýbajúca strana je nula, nie pád", () => {
    const r = porovnajDvojmo([], [m("2026-08", 5, 5, 3, 1000)], "2026-09-20", 3, "2026-09");
    expect(r[0].riadky.find((x) => x.metrika === "treningy")).toMatchObject({ export: 0, vlastne: 5, percent: 0 });
  });

  it("každý mesiac nesie všetky štyri metriky", () => {
    const r = porovnajDvojmo(exp, vla, "2026-09-20", 3, "2026-09");
    expect(r[0].riadky.map((x) => x.metrika)).toEqual(["treningy", "hodiny", "klienti", "trzby"]);
  });
});
