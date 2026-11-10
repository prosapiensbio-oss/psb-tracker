import { describe, expect, test } from "bun:test";

import { klucRocnejPlatby, ROCNE_PLATBY, rocneNaZaplatenie } from "./rocnePlatby";
import type { PohybPlatby } from "./platbyMesiaca";

const p = (datum: string, suma: number, text = ""): PohybPlatby => ({ datum, suma, kategoria: "fixne.prevadzka.poistenie", text });
const ids = (s: ReturnType<typeof rocneNaZaplatenie>) => s.map((x) => x.platba.id).sort();

describe("ročné platby — poistka za priestor", () => {
  test("pred 15. 9. 2027 a v prvý rok sa nepýta", () => {
    expect(rocneNaZaplatenie([], {}, "2026-11-10")).toHaveLength(0);
    expect(rocneNaZaplatenie([], {}, "2027-09-14")).toHaveLength(0);
  });

  test("15. 9. príde výpoveď/porovnanie, 25. 10. aj platba", () => {
    expect(ids(rocneNaZaplatenie([], {}, "2027-09-15"))).toEqual(["poistka-priestor-vypoved"]);
    expect(ids(rocneNaZaplatenie([], {}, "2027-10-25"))).toEqual(["poistka-priestor", "poistka-priestor-vypoved"]);
  });

  test("po konci okna sa nepýta donekonečna", () => {
    expect(rocneNaZaplatenie([], {}, "2028-01-01")).toHaveLength(0);
  });

  test("platba vo výpise (VS alebo ČPP) pripomienku zhasne", () => {
    const v = [p("2027-11-02", -7315, "700135002/0800 VS 0029969549")];
    expect(rocneNaZaplatenie(v, {}, "2027-11-05")).toHaveLength(0);
    const cpp = [p("2027-11-02", -7400, "Česká podnikatelská pojišťovna")];
    expect(rocneNaZaplatenie(cpp, {}, "2027-11-05")).toHaveLength(0);
  });

  test("výdavok spred okna ani príjem nezhasne pripomienku", () => {
    const stary = [p("2026-11-10", -7315, "VS 0029969549")];
    expect(ids(rocneNaZaplatenie(stary, {}, "2027-10-25"))).toContain("poistka-priestor");
    const prijem = [p("2027-10-30", 7315, "VS 0029969549")];
    expect(ids(rocneNaZaplatenie(prijem, {}, "2027-11-05"))).toContain("poistka-priestor");
  });

  test("odklik zatvára, odložená notifikácia nie", () => {
    const ack = { [klucRocnejPlatby("poistka-priestor", "2027")]: { note: "zaplatené" } };
    expect(ids(rocneNaZaplatenie([], ack, "2027-10-26"))).toEqual(["poistka-priestor-vypoved"]);
    const odlozene = { [klucRocnejPlatby("poistka-priestor", "2027")]: { note: "odlozene|2027-11-01|" } };
    expect(ids(rocneNaZaplatenie([], odlozene, "2027-10-26"))).toContain("poistka-priestor");
  });

  test("termín je po začiatku okna a okno po termíne", () => {
    for (const x of ROCNE_PLATBY) {
      expect(x.od < x.termin).toBe(true);
      expect(x.termin < x.do).toBe(true);
    }
  });
});
