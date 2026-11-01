import { describe, expect, it } from "bun:test";

import { najdiZdvojenia, prijmyNaOtazku, type PlatbaZdvojenia, type PohybZdvojenia } from "./zositZdvojenia";

const NOVA = "2026-11-01T16:33:00Z";
const STARA = "2026-10-09T12:04:00Z";
const pohyb = (id: string, date: string, amount_czk: number, counterparty: string, category = "", created_at = NOVA, typ = "hotovosť"): PohybZdvojenia =>
  ({ id, date, amount_czk, counterparty, note: "zo zošita", typ, category, created_at });
const platba = (id: string, klient: string, datum: string, suma_czk: number, navyse: Partial<PlatbaZdvojenia> = {}): PlatbaZdvojenia =>
  ({ id, klient, datum, suma_czk, sposob: "hotovost", fio_id: null, zrusene_at: null, ...navyse });

describe("zdvojenia po zápise zošita — riadky z 1. 11. 2026", () => {
  it("príjem zo zošita spozná ručnú platbu, aj keď je meno krivé a suma o pár korún iná", () => {
    const p = najdiZdvojenia({
      pohyby: [pohyb("n", "2026-10-28", 9400, "Naďa"), pohyb("l", "2026-10-12", 4400, "Luky"), pohyb("pa", "2026-10-19", 9400, "Patrik Lutovský")],
      platby: [platba("1", "Naďa Khamaziuk", "2026-10-28", 9400), platba("2", "Luky Križ", "2026-10-12", 4408), platba("3", "Patrik Lutonsky", "2026-10-19", 9400)],
    });
    expect(p.map((x) => [x.druh, x.riadok.id, x.druhy.id])).toEqual([["prijem", "n", "1"], ["prijem", "l", "2"], ["prijem", "pa", "3"]]);
  });

  it("dve platby po 9 400 do troch dní sa neprekrížia", () => {
    const p = najdiZdvojenia({
      pohyby: [pohyb("pa", "2026-10-19", 9400, "Patrik Lutovský"), pohyb("ma", "2026-10-22", 9400, "Markéta Resnerová")],
      platby: [platba("m", "Marketa Resnerová", "2026-10-22", 9400), platba("p", "Patrik Lutonsky", "2026-10-19", 9400)],
    });
    expect(p.map((x) => [x.riadok.id, x.druhy.id])).toEqual([["pa", "p"], ["ma", "m"]]);
  });

  it("Radek: náklad zo zošita a vrátenie ako záporná platba", () => {
    const p = najdiZdvojenia({
      pohyby: [pohyb("r", "2026-10-13", -15500, "Radek Dalaz", "variabilne.sluzby.ine")],
      platby: [platba("v", "Radek Balaž", "2026-10-13", -15275)],
    });
    expect(p.map((x) => x.druh)).toEqual(["vratenie"]);
  });

  it("Obed −490 a Oběd −450: ten istý riadok z dvoch dávok", () => {
    const p = najdiZdvojenia({
      pohyby: [pohyb("old", "2026-10-01", -450, "Oběd", "spolocne.Potraviny", STARA), pohyb("new", "2026-10-01", -490, "Obed", "spolocne.Potraviny")],
      platby: [],
    });
    expect(p.map((x) => [x.druh, x.riadok.id, x.druhy.id])).toEqual([["dvaRiadky", "new", "old"]]);
  });

  it("dva podobné riadky z jednej dávky sú dva", () => {
    const p = najdiZdvojenia({
      pohyby: [pohyb("a", "2026-10-23", -1200, "Terka", "vyplaty.terezka"), pohyb("b", "2026-10-23", -1300, "Terka", "vyplaty.terezka")],
      platby: [],
    });
    expect(p).toEqual([]);
  });

  it("Terka: 500 v hotovosti a 500 z banky je otázka; odpoveď „sú to dve“ sa pamätá", () => {
    const pohyby = [
      pohyb("c", "2026-10-28", -500, "Terka", "vyplaty.terezka"),
      pohyb("b", "2026-10-27", -500, "2325740014/3030", "vyplaty.terezka", NOVA, "Okamžitá odchozí platba"),
    ];
    expect(najdiZdvojenia({ pohyby, platby: [] }).map((x) => x.kluc)).toEqual(["banka|c|b"]);
    expect(najdiZdvojenia({ pohyby, platby: [], vybavene: new Set(["banka|c|b"]) })).toEqual([]);
  });

  it("Jarek −10 000 bez riadku v banke sa nepýta", () => {
    expect(najdiZdvojenia({ pohyby: [pohyb("j", "2026-10-22", -10000, "Jarek splátka", "fixne.prevadzka.splatkaJarek")], platby: [] })).toEqual([]);
  });

  it("čo je vyriešené, sa už nepýta: priradený riadok, zrušená platba, mimo P&L, zamknutý mesiac", () => {
    const r = pohyb("n", "2026-10-28", 9400, "Naďa");
    expect(najdiZdvojenia({ pohyby: [r], platby: [platba("1", "Naďa Khamaziuk", "2026-10-28", 9400, { fio_id: "n" })] })).toEqual([]);
    expect(najdiZdvojenia({ pohyby: [r], platby: [platba("1", "Naďa Khamaziuk", "2026-10-28", 9400, { zrusene_at: "2026-10-29" })] })).toEqual([]);
    expect(najdiZdvojenia({ pohyby: [pohyb("r", "2026-10-13", -15500, "Radek Dalaz", "mimo")], platby: [platba("v", "Radek Balaž", "2026-10-13", -15275)] })).toEqual([]);
    expect(najdiZdvojenia({ pohyby: [r], platby: [platba("1", "Naďa Khamaziuk", "2026-10-28", 9400)], zamky: new Set(["2026-10"]) })).toEqual([]);
  });

  it("do nepriradených nejde len príjem, ktorý čaká na otázku", () => {
    const p = najdiZdvojenia({
      pohyby: [pohyb("n", "2026-10-28", 9400, "Naďa"), pohyb("x", "2026-10-29", 7000, "Nikto")],
      platby: [platba("1", "Naďa Khamaziuk", "2026-10-28", 9400)],
    });
    expect([...prijmyNaOtazku(p)]).toEqual(["n"]);
  });
});
