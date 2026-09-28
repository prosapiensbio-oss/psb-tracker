import { describe, expect, it } from "bun:test";

import { hodinaVPrahe, jeCasCitat, najblizsieOkno } from "./mailOkno";

// Leto: Praha je UTC+2, takže 05:30 UTC je 7:30 ráno.
const LETO_RANO = "2026-09-28T05:30:00Z";
const LETO_VECER = "2026-09-28T18:10:00Z";
const LETO_POLUDNIE = "2026-09-28T10:00:00Z";
// Zima: Praha je UTC+1, takže to isté okno je o hodinu inde.
const ZIMA_RANO = "2026-12-10T06:30:00Z";
const ZIMA_MIMO = "2026-12-10T05:30:00Z";

describe("hodinaVPrahe", () => {
  it("v lete pripočíta dve hodiny, v zime jednu", () => {
    expect(hodinaVPrahe(new Date(LETO_RANO))).toBe(7);
    expect(hodinaVPrahe(new Date(ZIMA_RANO))).toBe(7);
    expect(hodinaVPrahe(new Date(ZIMA_MIMO))).toBe(6);
  });
});

describe("jeCasCitat", () => {
  it("ráno aj večer áno, medzi tým nie", () => {
    expect(jeCasCitat(new Date(LETO_RANO), null)).toBe(true);
    expect(jeCasCitat(new Date(LETO_VECER), null)).toBe(true);
    expect(jeCasCitat(new Date(LETO_POLUDNIE), null)).toBe(false);
  });

  it("posun času nechá okno na tej istej miestnej hodine", () => {
    expect(jeCasCitat(new Date(ZIMA_RANO), null)).toBe(true);
    expect(jeCasCitat(new Date(ZIMA_MIMO), null)).toBe(false);
  });

  it("v jednom okne číta raz, aj keď plánovač zavolá dvakrát", () => {
    const prvy = "2026-09-28T05:05:00Z";
    expect(jeCasCitat(new Date(LETO_RANO), prvy)).toBe(false);
  });

  it("večer po rannom behu je nové okno", () => {
    expect(jeCasCitat(new Date(LETO_VECER), LETO_RANO)).toBe(true);
  });

  it("ráno nasledujúceho dňa je nové okno", () => {
    expect(jeCasCitat(new Date("2026-09-29T05:30:00Z"), LETO_RANO)).toBe(true);
  });

  it("nezrozumiteľný čas posledného behu nesmie čítanie zablokovať", () => {
    expect(jeCasCitat(new Date(LETO_RANO), "nezmysel")).toBe(true);
  });
});

describe("najblizsieOkno", () => {
  it("cez deň ukáže večer, po večeri zajtrajšie ráno", () => {
    expect(najblizsieOkno(new Date(LETO_POLUDNIE))).toBe("dnes o 20:00");
    expect(najblizsieOkno(new Date("2026-09-28T21:00:00Z"))).toBe("zajtra o 7:00");
  });
});
