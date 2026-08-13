import { describe, expect, it } from "bun:test";

import { kedyPublikovat, type Kus } from "./casy";

/** N príspevkov v tej istej hodine s tým istým dosahom. */
const davka = (pocet: number, cas: string, dosah: number, odDna = 1): Kus[] =>
  Array.from({ length: pocet }, (_, i) => ({
    cas,
    datum: `2026-0${1 + Math.floor((odDna + i) / 28)}-${String(((odDna + i) % 28) + 1).padStart(2, "0")}`,
    dosah,
  }));

describe("kedy publikovať", () => {
  it("bez časov to povie a poradí, čo s tým", () => {
    const v = kedyPublikovat([{ cas: "", datum: "2026-08-01", dosah: 900 }]);
    expect(v.sCasom).toBe(0);
    expect(v.malo).toContain("Stiahni Instagram");
    expect(v.pasma).toEqual([]);
  });

  it("pri málo kusoch povie, koľko ich treba", () => {
    const v = kedyPublikovat(davka(9, "18:00", 900));
    expect(v.malo).toContain("aspoň 20");
    expect(v.zaver).toBe("");
  });

  it("pásma sa zoradia podľa bežného dosahu", () => {
    const v = kedyPublikovat([...davka(10, "08:00", 500), ...davka(10, "20:00", 2000, 40)]);
    expect(v.malo).toBe("");
    expect(v.pasma[0].pasmo).toContain("večer");
    expect(v.pasma[0].medianDosah).toBe(2000);
  });

  it("víťaz sa vyhlási len pri zreteľnom rozdiele", () => {
    // 2 000 verzus 1 800 — pod hranicou 25 %, teda ticho.
    const tesne = kedyPublikovat([...davka(12, "08:00", 1800), ...davka(12, "20:00", 2000, 40)]);
    expect(tesne.zaver).toBe("");
    const jasne = kedyPublikovat([...davka(12, "08:00", 500), ...davka(12, "20:00", 3000, 40)]);
    expect(jasne.zaver).toContain("večer");
  });

  it("pásmo s malou vzorkou víťazom nebude", () => {
    // Tri nočné príspevky s obrovským dosahom by inak vyhrali.
    const v = kedyPublikovat([...davka(24, "08:00", 800), ...davka(3, "02:00", 90000, 40)]);
    expect(v.zaver === "" || v.zaver.includes("ráno")).toBe(true);
  });

  it("jeden výnimočný kus pásmo nevytiahne — počíta sa medián", () => {
    const v = kedyPublikovat([
      ...davka(11, "20:00", 700),
      { cas: "20:30", datum: "2026-03-01", dosah: 200000 },
      ...davka(12, "08:00", 800, 40),
    ]);
    const vecer = v.pasma.find((p) => p.pasmo.includes("večer"))!;
    expect(vecer.medianDosah).toBe(700);
  });

  it("noc prechádza cez polnoc", () => {
    const v = kedyPublikovat([...davka(11, "23:30", 400), ...davka(11, "02:00", 400, 40)]);
    const noc = v.pasma.find((p) => p.pasmo.includes("noc"))!;
    expect(noc.kusov).toBe(22);
  });

  it("dni sa počítajú z dátumu", () => {
    const v = kedyPublikovat(davka(22, "10:00", 900));
    expect(v.dni.reduce((a, d) => a + d.kusov, 0)).toBe(22);
    expect(v.dni.every((d) => d.kusov > 0)).toBe(true);
  });

  it("nezmyselný čas sa nepočíta ako polnoc", () => {
    const v = kedyPublikovat([...davka(20, "10:00", 900), { cas: "99:99", datum: "2026-05-05", dosah: 5 }]);
    expect(v.sCasom).toBe(20);
  });
});
