import { describe, expect, it } from "bun:test";

import type { Udalost } from "./klientOsCasu";
import { hodinTreningu, poslednychMesiacov, vypisAkoText, vypisHodin, zaciatokBalicka, zostatkyOsi } from "./vypisHodin";

const bal = (den: string, hodin: number, nazov = "OFF 18 h"): Udalost => ({ druh: "balicekOd", den, nazov, hodin });
const tre = (den: string, minut?: number): Udalost => ({ druh: "trening", den, minut });
const pla = (den: string, suma: number): Udalost => ({ druh: "platba", den, suma, metoda: "banka" });
const DNES = "2026-09-26";

describe("výpis hodín", () => {
  // Anetka Přinosilová: členstvo na 18 h od 2. 9., tri tréningy, ostáva 15.
  const os: Udalost[] = [bal("2026-09-02", 18), tre("2026-09-09"), tre("2026-09-16"), tre("2026-09-23"), pla("2026-09-03", 21150)];

  it("rad skončí na čísle, ktoré hovorí appka", () => {
    const v = vypisHodin(os, "", DNES, 15);
    expect(v.koniec).toBe(15);
    expect(v.kupene).toBe(18);
    expect(v.odtrenovane).toBe(3);
    expect(v.riadky.find((r) => r.druh === "platba")!.zmena).toBe(0);
  });

  it("najnovšie hore a každý riadok o hodinu vyššie dozadu", () => {
    const v = vypisHodin(os, "", DNES, 15);
    expect(v.riadky.map((r) => [r.den, r.zostatok])).toEqual([
      ["2026-09-23", 15],
      ["2026-09-16", 16],
      ["2026-09-09", 17],
      ["2026-09-03", 18],
      ["2026-09-02", 18],
    ]);
  });

  it("bez čísla z karty sa zostatok nevymýšľa", () => {
    const v = vypisHodin(os, "", DNES, null);
    expect(v.koniec).toBeNull();
    expect(v.riadky.every((r) => r.zostatok === null)).toBe(true);
    expect(v.spolu).toBe(3);   // hodiny appka vie vždy
  });

  it("horná hranica obdobia platí — stav je k jej dňu", () => {
    const v = vypisHodin(os, "2026-09-01", "2026-09-10", 17);
    expect(v.riadky.map((r) => r.den)).toEqual(["2026-09-09", "2026-09-03", "2026-09-02"]);
    expect(v.koniec).toBe(17);
  });

  it("prázdna os nevyrobí nezmysel", () => {
    expect(vypisHodin([])).toMatchObject({ riadky: [], zaciatok: null, koniec: null, kupene: 0, odtrenovane: 0, spolu: 0 });
  });
});

describe("obnovované členstvo sa nedopočítava", () => {
  /**
   * Jakub Gerich: „OFF - 6h S viazanosťou", export hovorí 1 zo 6 — a za
   * pol roka má 37 hodín, lebo sa členstvo každý mesiac obnovuje. Dopredný
   * súčet z balíčka mu dával −30 h.
   */
  const os: Udalost[] = [
    bal("2026-03-03", 6), tre("2026-03-10"), tre("2026-03-17"), tre("2026-03-24"),
    tre("2026-08-05"), tre("2026-08-12"), tre("2026-08-19"), tre("2026-08-21"),
  ];

  it("zostatok nikdy nejde do mínusu", () => {
    const v = vypisHodin(os, "", DNES, 1);
    expect(v.koniec).toBe(1);
    expect(v.riadky.every((r) => r.zostatok === null || r.zostatok >= 0)).toBe(true);
  });

  it("počítanie sa zastaví nad hodinami balíčka a prizná to", () => {
    const v = vypisHodin(os, "", DNES, 1);
    const sCislom = v.riadky.filter((r) => r.zostatok !== null);
    expect(sCislom.map((r) => r.zostatok)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(v.neuplny).toBe(true);
  });

  it("staršie riadky nesú aspoň súčet odtrénovaných hodín", () => {
    const v = vypisHodin(os, "", DNES, 1);
    expect(v.spolu).toBe(7);
    expect(v.riadky[v.riadky.length - 1].spolu).toBe(0);   // riadok balíčka
  });
});

describe("tréning z kalendára sa odpočíta po exporte", () => {
  // Číslo z karty je k dňu exportu; čo prišlo z kalendára po ňom, appka
  // ešte nevidela — musí sa odrátať dopredu.
  const os: Udalost[] = [bal("2026-09-02", 18), tre("2026-09-16"), { druh: "trening", den: "2026-09-23", zKalendara: true }];

  it("po dni exportu sa ide dopredu", () => {
    const v = vypisHodin(os, "", DNES, 17);
    expect(v.riadky[0]).toMatchObject({ den: "2026-09-23", zostatok: 16 });
    expect(v.riadky[1]).toMatchObject({ den: "2026-09-16", zostatok: 17 });
  });

  it("pod nulu sa nejde — appka len nevidí novší balíček", () => {
    // Natália Pečková: export hovorí 0 k 16. 9., 23. 9. bol ďalší tréning
    // a 16. 9. zaplatila za nové členstvo, ktoré v exporte ešte nie je.
    const v = vypisHodin(os, "", DNES, 0);
    expect(v.riadky[0]).toMatchObject({ den: "2026-09-23", zostatok: null });
    expect(v.koniec).toBe(0);
    expect(v.neuplny).toBe(true);
  });
});

describe("dĺžka tréningu", () => {
  it("bez údaja je to hodina, deväťdesiat minút je hodina a pol", () => {
    expect(hodinTreningu(tre("2026-09-09"))).toBe(1);
    expect(hodinTreningu(tre("2026-09-09", 90))).toBe(1.5);
    expect(hodinTreningu(tre("2026-09-09", 30))).toBe(0.5);
  });

  it("do zostatku aj do súčtu ide skutočná dĺžka", () => {
    const v = vypisHodin([bal("2026-09-02", 18), tre("2026-09-09", 90)], "", DNES, 16.5);
    expect(v.odtrenovane).toBe(1.5);
    expect(v.riadky[0].zostatok).toBe(16.5);
    expect(v.riadky[1].zostatok).toBe(18);
  });
});

describe("obdobie", () => {
  const os: Udalost[] = [tre("2025-05-10"), tre("2025-06-10"), bal("2026-09-02", 18), tre("2026-09-09"), tre("2026-09-16")];

  it("staršie riadky sú vo výpise aj bez zostatku", () => {
    const v = vypisHodin(os, "", DNES, 16);
    expect(v.riadky).toHaveLength(5);
    expect(v.riadky.filter((r) => r.den < "2026-09-02").every((r) => r.zostatok === null)).toBe(true);
    expect(v.spolu).toBe(4);
  });

  it("obdobie od kotvy ďalej nesie počiatočný stav", () => {
    const v = vypisHodin(os, "2026-09-10", DNES, 16);
    expect(v.zaciatok).toBe(17);
    expect(v.odtrenovane).toBe(1);
    expect(v.spolu).toBe(4);   // celá história, nielen obdobie
  });

  it("posledné N mesiace", () => {
    expect(poslednychMesiacov(3, "2026-09-26")).toEqual({ od: "2026-06-26", do: "2026-09-26" });
  });
});

describe("text pre klienta", () => {
  const os: Udalost[] = [
    { druh: "balicekOd", den: "2026-09-02", nazov: "OFF - 18 hodín", hodin: 18, doDna: "2027-03-01" },
    { druh: "platba", den: "2026-09-03", suma: 21150, metoda: "bank" },
    { druh: "trening", den: "2026-09-09", cas: "3:00pm", trener: "Terezka" },
  ];

  it("nesie stav, riadky aj ľudské tvary čísel", () => {
    const t = vypisAkoText(vypisHodin(os, "", DNES, 17), "Anetka Přinosilová");
    expect(t).toContain("Výpis hodín — Anetka Přinosilová");
    expect(t).toContain("Zostáva: 17 h");
    expect(t).toContain("Zaplatené: 21 150 Kč");
    expect(t).toContain("do 1. 3. 2027");
    expect(t).toContain("platba 21 150 Kč · prevodom");
    expect(t).toContain("tréning 15:00 · Terezka");
    expect(t).not.toContain("2027-03-01");
  });

  it("bez zostatku o ňom mlčí", () => {
    expect(vypisAkoText(vypisHodin(os, "", DNES, null), "Anetka")).not.toContain("Zostáva");
  });
});

describe("kotva", () => {
  it("nájde posledný balíček, ktorý už platí", () => {
    const os: Udalost[] = [bal("2025-11-01", 18), tre("2026-01-05"), bal("2026-09-02", 18), bal("2027-01-01", 10)];
    expect(zaciatokBalicka(os, DNES)).toBe("2026-09-02");
  });

  it("bez balíčka vráti prázdno a žiadne stavy", () => {
    expect(zaciatokBalicka([tre("2026-09-01")], DNES)).toBe("");
    expect(zostatkyOsi([tre("2026-09-01")], 5, DNES).stavy.size).toBe(0);
  });
});
