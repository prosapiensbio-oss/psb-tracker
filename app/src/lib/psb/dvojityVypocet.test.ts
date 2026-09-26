import { describe, expect, it } from "bun:test";

import { porovnajDvojmo, porovnajTrenerov, sedi } from "./dvojityVypocet";

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

describe("vyťaženosť po trénerovi", () => {
  const t = (mesiac: string, trener: string, treningy: number, hodiny: number, klienti: number) =>
    ({ mesiac, trener, treningy, hodiny, klienti });

  it("spáruje trénerov z oboch strán", () => {
    // August 2026 naozaj: Terezka na kus, Jerry o tri menej.
    const r = porovnajTrenerov(
      [t("2026-08", "Jerry", 101, 101, 26), t("2026-08", "Terezka", 85, 85, 29)],
      [t("2026-08", "Jerry", 98, 98, 26), t("2026-08", "Terezka", 85, 85, 29)],
      "2026-08", false,
    );
    expect(r.map((x) => x.trener)).toEqual(["Jerry", "Terezka"]);
    expect(r[0]).toMatchObject({ treningyExport: 101, treningyVlastne: 98, sedi: true });
    expect(r[1]).toMatchObject({ treningyExport: 85, treningyVlastne: 85, sedi: true });
  });

  it("tréner len na jednej strane nie je pád, ale nezhoda", () => {
    // Záskok pripísaný v exporte niekomu, kto v kalendári nie je.
    const r = porovnajTrenerov([t("2026-08", "Matyáš", 12, 12, 5)], [], "2026-08", false);
    expect(r[0]).toMatchObject({ trener: "Matyáš", treningyExport: 12, treningyVlastne: 0, sedi: false });
  });

  it("v neúplnom mesiaci sa nehodnotí ani tréner", () => {
    const r = porovnajTrenerov([t("2026-09", "Jerry", 86, 86, 31)], [t("2026-09", "Jerry", 134, 134, 32)], "2026-09", true);
    expect(r[0].sedi).toBe(true);
  });

  it("mesiace sa nemiešajú", () => {
    const r = porovnajTrenerov(
      [t("2026-08", "Jerry", 101, 101, 26), t("2026-07", "Jerry", 102, 102, 26)],
      [t("2026-08", "Jerry", 98, 98, 26)],
      "2026-08", false,
    );
    expect(r.length).toBe(1);
    expect(r[0].treningyExport).toBe(101);
  });

  it("dvojitý výpočet nesie trénerov v každom mesiaci", () => {
    const r = porovnajDvojmo(
      [m("2026-08", 186, 186, 54, 199036)],
      [m("2026-08", 183, 183, 54, 83940)],
      "2026-09-20", 3, "2026-09",
      [t("2026-08", "Jerry", 101, 101, 26)],
      [t("2026-08", "Jerry", 98, 98, 26)],
    );
    expect(r[0].treneri[0]).toMatchObject({ trener: "Jerry", treningyVlastne: 98 });
  });
});
