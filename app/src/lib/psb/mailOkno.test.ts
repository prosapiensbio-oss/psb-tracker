import { describe, expect, it } from "bun:test";

import { hodinaVPrahe, jeCasCitat, najblizsieOkno, oknoCitania } from "./mailOkno";

// Leto: Praha je UTC+2, takže 05:30 UTC je 7:30 ráno.
const LETO_RANO = "2026-09-28T05:30:00Z";
const LETO_POLUDNIE = "2026-09-28T10:00:00Z";
// Zima: Praha je UTC+1.
const ZIMA_RANO = "2026-12-10T06:30:00Z";
const ZIMA_MIMO = "2026-12-10T05:30:00Z";

/** Rozvrh plánovača `0 *\/3 * * *` za `dni` dní; `citane` si drží mail_stav ako ostrá trasa. */
function behy(od: string, dni: number) {
  const citania: string[] = [];
  let posledny: string | null = `${od}T00:00:00Z`;
  const start = Date.parse(`${od}T03:00:00Z`);
  for (let i = 0; i < dni * 8; i++) {
    const kedy = new Date(start + i * 3 * 3600000);
    if (jeCasCitat(kedy, posledny)) {
      citania.push(kedy.toISOString().slice(0, 16));
      posledny = kedy.toISOString();
    }
  }
  return citania;
}

describe("hodinaVPrahe", () => {
  it("v lete pripočíta dve hodiny, v zime jednu", () => {
    expect(hodinaVPrahe(new Date(LETO_RANO))).toBe(7);
    expect(hodinaVPrahe(new Date(ZIMA_RANO))).toBe(7);
    expect(hodinaVPrahe(new Date(ZIMA_MIMO))).toBe(6);
  });
  it("polnoc je 0, nie 24", () => {
    expect(hodinaVPrahe(new Date("2026-12-09T23:00:00Z"))).toBe(0);
  });
});

// Od 12. 11. 2026 každé tri hodiny cez deň (karta Email), v noci nie.
describe("plánovač každé tri hodiny v UTC", () => {
  it("zima: 7, 10, 13, 16, 19 a 22 h, v noci nič", () => {
    expect(behy("2026-12-10", 1)).toEqual([
      "2026-12-10T06:00", "2026-12-10T09:00", "2026-12-10T12:00", "2026-12-10T15:00", "2026-12-10T18:00", "2026-12-10T21:00",
    ]);
  });
  it("leto: 8, 11, 14, 17, 20 a 23 h, v noci nič", () => {
    expect(behy("2026-07-10", 1)).toEqual([
      "2026-07-10T06:00", "2026-07-10T09:00", "2026-07-10T12:00", "2026-07-10T15:00", "2026-07-10T18:00", "2026-07-10T21:00",
    ]);
  });
  it("zmena času v noci neprečíta nič navyše", () => {
    const b = behy("2026-10-24", 3);
    expect(b.length).toBe(18);
    expect(b.every((t) => Number(t.slice(11, 13)) >= 6)).toBe(true);
  });
});

describe("jeCasCitat", () => {
  it("v jednom okne číta raz, aj keď plánovač zavolá dvakrát", () => {
    expect(jeCasCitat(new Date(LETO_RANO), "2026-09-28T05:05:00Z")).toBe(false);
  });
  it("ďalšie okno o tri hodiny číta", () => {
    expect(jeCasCitat(new Date("2026-12-10T09:00:00Z"), "2026-12-10T06:00:00Z")).toBe(true);
  });
  it("večerné okno ide cez polnoc: v noci sa znova nečíta", () => {
    expect(jeCasCitat(new Date("2026-12-11T00:00:00Z"), "2026-12-10T21:00:00Z")).toBe(false); // 1:00
    expect(jeCasCitat(new Date("2026-12-11T03:00:00Z"), "2026-12-10T21:00:00Z")).toBe(false); // 4:00
    expect(oknoCitania(new Date("2026-12-11T03:00:00Z"))).toBe("2026-12-10|22");
  });
  it("posledný večerný beh, ktorý neprebehol, dobehne v noci", () => {
    expect(jeCasCitat(new Date("2026-12-11T00:00:00Z"), "2026-12-10T18:00:00Z")).toBe(true);
  });
  it("nezrozumiteľný čas posledného behu nesmie čítanie zablokovať", () => {
    expect(jeCasCitat(new Date(LETO_RANO), "nezmysel")).toBe(true);
    expect(jeCasCitat(new Date(LETO_RANO), null)).toBe(true);
  });
});

describe("najblizsieOkno", () => {
  it("povie, od kedy sa číta nabudúce", () => {
    expect(najblizsieOkno(new Date(LETO_POLUDNIE))).toBe("dnes od 13:00");
    expect(najblizsieOkno(new Date("2026-09-28T21:00:00Z"))).toBe("zajtra od 7:00");
    expect(najblizsieOkno(new Date(ZIMA_MIMO))).toBe("dnes od 7:00");
  });
});
