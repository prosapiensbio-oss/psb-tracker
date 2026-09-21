import { describe, expect, it } from "bun:test";

import { dochadzkaPorovnatelna, mesiacovVztahu, priemerOstatnych, tempoMesacne, zaplateneMesacne } from "./profil";

const DEN = 86400000;
const TERAZ = new Date("2026-09-21T12:00:00Z");
const pred = (dni: number) => new Date(TERAZ.getTime() - dni * DEN).toISOString();
const klient = (prveSedeniePred: number, dniSedeni: number[]) => ({
  firstSession: pred(prveSedeniePred),
  sessions: dniSedeni.map((d) => ({ date: pred(d) })) as never,
});

describe("tempo nepenalizuje nováčika", () => {
  /**
   * Presne prípad Dominiky Križovej z 21. 9. 2026: chodí 6 dní, má 1 sedenie.
   * Pôvodný výpočet delil tromi mesiacmi a ukázal 0,3 — vedľa priemeru 3,1
   * to vyzeralo, akoby prestala chodiť.
   */
  it("klient, ktorý chodí týždeň, sa delí týždňom, nie štvrťrokom", () => {
    const c = klient(6, [5, 2]);
    expect(tempoMesacne(c, TERAZ)).toBeCloseTo(2 / 0.5, 1);   // pol mesiaca je minimum
  });

  it("klient s polročnou históriou sa delí tromi mesiacmi", () => {
    const c = klient(180, [80, 50, 20, 5]);
    expect(tempoMesacne(c, TERAZ)).toBeCloseTo(4 / 3, 2);
  });

  it("tréning presne na hranici 90 dní sa ešte počíta", () => {
    // Sedenia majú v dátume polnoc; keby sa okno porovnávalo s presným časom,
    // toto by vypadlo a tempo by záviselo od hodiny, kedy sa profil otvorí.
    const c = klient(200, [90, 30]);
    expect(tempoMesacne(c, TERAZ)).toBeCloseTo(2 / 3, 2);
  });

  it("staršie sedenia než 90 dní do tempa nevstupujú", () => {
    expect(tempoMesacne(klient(400, [300, 200]), TERAZ)).toBe(0);
  });
});

describe("zaplatené sa porovnáva mesačne", () => {
  it("dlhý a krátky vzťah sa dajú porovnať", () => {
    const stary = klient(608, []);     // 20 mesiacov
    const novy = klient(30, []);       // 1 mesiac
    expect(Math.round(zaplateneMesacne(51934, stary, TERAZ))).toBe(2597);
    expect(Math.round(zaplateneMesacne(2600, novy, TERAZ))).toBe(2635);
  });

  it("bez prvého sedenia sa delí pol mesiacom, nie nulou", () => {
    expect(zaplateneMesacne(1000, { firstSession: "" }, TERAZ)).toBe(2000);
    expect(mesiacovVztahu({ firstSession: "" }, TERAZ)).toBe(0.5);
  });
});

describe("dochádzka sa porovnáva až od šiestich týždňov", () => {
  it("dvojtýždňový klient sa neporovnáva", () => {
    expect(dochadzkaPorovnatelna(klient(14, []), TERAZ)).toBe(false);
  });
  it("po šiestich týždňoch áno", () => {
    expect(dochadzkaPorovnatelna(klient(43, []), TERAZ)).toBe(true);
  });
});

describe("priemer ostatných", () => {
  it("nuly sa nerátajú — priemer je z tých, čo chodia", () => {
    expect(priemerOstatnych([2, 4, 0, 0])).toBe(3);
  });
  it("keď nie je z čoho, vráti nulu namiesto NaN", () => {
    expect(priemerOstatnych([0, 0])).toBe(0);
  });
});
