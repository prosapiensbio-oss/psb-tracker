import { describe, expect, it } from "bun:test";

import { hodinaVPrahe, jeCasCitat, najblizsieOkno, oknoCitania } from "./mailOkno";

// Leto: Praha je UTC+2, takže 05:30 UTC je 7:30 ráno.
const LETO_RANO = "2026-09-28T05:30:00Z";
const LETO_VECER = "2026-09-28T18:10:00Z";
const LETO_POLUDNIE = "2026-09-28T10:00:00Z";
// Zima: Praha je UTC+1, takže to isté okno je o hodinu inde.
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

describe("plánovač každé tri hodiny v UTC", () => {
  it("zima: raz ráno o 7:00 a raz večer o 22:00, nič navyše", () => {
    expect(behy("2026-12-10", 2)).toEqual([
      "2026-12-10T06:00", "2026-12-10T21:00",
      "2026-12-11T06:00", "2026-12-11T21:00",
    ]);
  });
  it("leto: raz ráno o 8:00 a raz večer o 20:00, nič navyše", () => {
    expect(behy("2026-07-10", 2)).toEqual([
      "2026-07-10T06:00", "2026-07-10T18:00",
      "2026-07-11T06:00", "2026-07-11T18:00",
    ]);
  });
  it("zmena času v noci neprečíta nič navyše", () => {
    // 25. 10. 2026 o 3:00 sa v Prahe vracia čas.
    expect(behy("2026-10-24", 3)).toEqual([
      "2026-10-24T06:00", "2026-10-24T18:00",
      "2026-10-25T06:00", "2026-10-25T21:00",
      "2026-10-26T06:00", "2026-10-26T21:00",
    ]);
  });
  it("po dnešnom rannom behu (1. 11., 7:00) sa číta až večer o 22:00", () => {
    const rano = "2026-11-01T06:00:22.315Z";
    for (const t of ["2026-11-01T09:00:00Z", "2026-11-01T12:00:00Z", "2026-11-01T15:00:00Z", "2026-11-01T18:00:00Z"]) {
      expect(jeCasCitat(new Date(t), rano)).toBe(false);
    }
    expect(jeCasCitat(new Date("2026-11-01T21:00:00Z"), rano)).toBe(true);
  });
});

describe("jeCasCitat", () => {
  it("prvý beh od 7:00 aj od 20:00 číta", () => {
    expect(jeCasCitat(new Date(LETO_POLUDNIE), LETO_RANO)).toBe(false);
    expect(jeCasCitat(new Date(LETO_VECER), LETO_RANO)).toBe(true);
    expect(jeCasCitat(new Date("2026-09-29T05:30:00Z"), LETO_VECER)).toBe(true);
  });

  it("v jednom okne číta raz, aj keď plánovač zavolá dvakrát", () => {
    expect(jeCasCitat(new Date(LETO_RANO), "2026-09-28T05:05:00Z")).toBe(false);
  });

  it("večerné okno ide cez polnoc: v noci sa znova nečíta", () => {
    expect(jeCasCitat(new Date("2026-12-11T00:00:00Z"), "2026-12-10T21:00:00Z")).toBe(false); // 1:00
    expect(jeCasCitat(new Date("2026-12-11T03:00:00Z"), "2026-12-10T21:00:00Z")).toBe(false); // 4:00
    expect(oknoCitania(new Date("2026-12-11T03:00:00Z"))).toBe("2026-12-10|20");
  });

  it("večerný beh, ktorý neprebehol, dobehne v noci", () => {
    expect(jeCasCitat(new Date("2026-12-11T00:00:00Z"), "2026-12-10T06:00:00Z")).toBe(true);
  });

  it("zlyhaný aj ručný beh okno spotrebujú: zapisujú ten istý mail_stav", () => {
    expect(jeCasCitat(new Date(ZIMA_RANO), "2026-12-10T06:01:00Z")).toBe(false);
  });

  it("nezrozumiteľný čas posledného behu nesmie čítanie zablokovať", () => {
    expect(jeCasCitat(new Date(LETO_RANO), "nezmysel")).toBe(true);
    expect(jeCasCitat(new Date(LETO_RANO), null)).toBe(true);
  });
});

describe("najblizsieOkno", () => {
  it("povie, od kedy sa číta nabudúce", () => {
    expect(najblizsieOkno(new Date(LETO_POLUDNIE))).toBe("dnes od 20:00");
    expect(najblizsieOkno(new Date("2026-09-28T21:00:00Z"))).toBe("zajtra od 7:00");
    expect(najblizsieOkno(new Date(ZIMA_MIMO))).toBe("dnes od 7:00");
  });
});
