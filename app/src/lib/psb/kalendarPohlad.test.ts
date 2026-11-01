import { describe, expect, it } from "bun:test";

import { denOdPondelka, dniTyzdnaPohladu, krokPolohy, polohaDnes } from "./kalendarPohlad";

const NEDELA = "2026-11-01";
const PONDELOK = "2026-11-02";
const STREDA = "2026-11-04";
const SOBOTA = "2026-11-07";

describe("kalendár sa otvára na tom, čo príde", () => {
  it("deň od pondelka", () => {
    expect(denOdPondelka(PONDELOK)).toBe(0);
    expect(denOdPondelka(NEDELA)).toBe(6);
  });
  it("„3 dni“ v nedeľu začínajú dnes, nie v piatok", () => {
    const p = polohaDnes(NEDELA, 3);
    const dni = dniTyzdnaPohladu("2026-10-26", 3);
    expect(dni.slice(p.zac, p.zac + 3)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
  it("„3 dni“ v sobotu: sobota, nedeľa, pondelok", () => {
    const p = polohaDnes(SOBOTA, 3);
    expect(dniTyzdnaPohladu("2026-11-02", 3).slice(p.zac, p.zac + 3)).toEqual(["2026-11-07", "2026-11-08", "2026-11-09"]);
  });
  it("„3 dni“ cez týždeň: dnes a dva ďalšie", () => {
    const p = polohaDnes(STREDA, 3);
    expect(p).toEqual({ posun: 0, zac: 2 });
    expect(dniTyzdnaPohladu("2026-11-02", 3).slice(p.zac, p.zac + 3)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06"]);
  });
  it("„Týždeň“ v nedeľu je budúci, inak tento", () => {
    expect(polohaDnes(NEDELA, 7).posun).toBe(1);
    expect(polohaDnes(PONDELOK, 7).posun).toBe(0);
    expect(polohaDnes(SOBOTA, 7).posun).toBe(0);
  });
  it("„Deň“ je dnes, aj v nedeľu", () => {
    expect(polohaDnes(NEDELA, 1)).toEqual({ posun: 0, zac: 6 });
  });
  it("mimo trojdňového pohľadu sa týždeň nenafukuje", () => {
    expect(dniTyzdnaPohladu("2026-11-02", 7)).toHaveLength(7);
    expect(dniTyzdnaPohladu("2026-11-02", 1)).toHaveLength(7);
  });
  it("cez zmenu času (25. 10.) idú dni po jednom", () => {
    expect(dniTyzdnaPohladu("2026-10-19", 3)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  });
});

describe("šípky", () => {
  it("tri dni z nedele doprava: ďalšie tri, bez dier", () => {
    const n = krokPolohy({ posun: 0, zac: 6 }, 3, 1)!;
    expect(n).toEqual({ posun: 1, zac: 2 });
    // nedeľa 1. 11. + 3 dni = streda 4. 11. = druhý deň od pondelka 2. 11.
    expect(dniTyzdnaPohladu("2026-11-02", 3)[n.zac]).toBe("2026-11-04");
  });
  it("a späť tým istým", () => {
    expect(krokPolohy({ posun: 1, zac: 2 }, 3, -1)).toEqual({ posun: 0, zac: 6 });
  });
  it("tri dni cez ľavý okraj týždňa", () => {
    expect(krokPolohy({ posun: 0, zac: 1 }, 3, -1)).toEqual({ posun: -1, zac: 5 });
  });
  it("deň po dni cez týždeň", () => {
    expect(krokPolohy({ posun: 0, zac: 6 }, 1, 1)).toEqual({ posun: 1, zac: 0 });
    expect(krokPolohy({ posun: 0, zac: 0 }, 1, -1)).toEqual({ posun: -1, zac: 6 });
  });
  it("týždeň o týždeň", () => {
    expect(krokPolohy({ posun: 1, zac: 0 }, 7, -1)).toEqual({ posun: 0, zac: 0 });
  });
  it("za hranicu stiahnutého kalendára sa nejde", () => {
    expect(krokPolohy({ posun: 2, zac: 0 }, 7, 1)).toBeNull();
    expect(krokPolohy({ posun: -3, zac: 0 }, 7, -1)).toBeNull();
    expect(krokPolohy({ posun: 2, zac: 6 }, 3, 1)).toBeNull();
    expect(krokPolohy({ posun: -3, zac: 1 }, 3, -1)).toBeNull();
  });
});
