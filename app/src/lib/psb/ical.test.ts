import { describe, expect, test } from "bun:test";
import { citajIcal } from "./ical";

const ics = (...udalosti: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...udalosti, "END:VCALENDAR", ""].join("\r\n");
const ev = (...riadky: string[]) => ["BEGIN:VEVENT", ...riadky, "END:VEVENT"].join("\r\n");
const zaciatky = (r: { zaciatok: string }[]) => r.map((x) => x.zaciatok);

const AUG_OD = Date.UTC(2026, 7, 1);
const AUG_DO = Date.UTC(2026, 8, 1);

describe("citajIcal — prevod pásma", () => {
  test("UTC v lete → Praha +2", () => {
    const r = citajIcal(ics(ev("UID:a", "DTSTART:20260803T070000Z", "DTEND:20260803T080000Z", "SUMMARY:Robin")), AUG_OD, AUG_DO);
    expect(r).toEqual([{ uid: "a|2026-08-03T09:00", zaciatok: "2026-08-03T09:00", koniec: "2026-08-03T10:00", nazov: "Robin", celodenna: false }]);
  });

  test("UTC v zime → Praha +1", () => {
    const r = citajIcal(ics(ev("UID:z", "DTSTART:20260110T080000Z", "SUMMARY:Zima")), Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1));
    expect(zaciatky(r)).toEqual(["2026-01-10T09:00"]);
  });

  test("prelom na letný čas (29. 3. 2026, 01:00 UTC) — posun sa nezamení medzi hodinami", () => {
    const r = citajIcal(ics(
      ev("UID:p1", "DTSTART:20260328T013000Z", "SUMMARY:x"),
      ev("UID:p2", "DTSTART:20260329T003000Z", "SUMMARY:x"),
      ev("UID:p3", "DTSTART:20260329T013000Z", "SUMMARY:x"),
    ), Date.UTC(2026, 2, 1), Date.UTC(2026, 3, 1));
    expect(zaciatky(r)).toEqual(["2026-03-28T02:30", "2026-03-29T01:30", "2026-03-29T03:30"]);
  });

  test("prelom na zimný čas (25. 10. 2026, 01:00 UTC)", () => {
    const r = citajIcal(ics(
      ev("UID:o1", "DTSTART:20261025T003000Z", "SUMMARY:x"),
      ev("UID:o2", "DTSTART:20261025T013000Z", "SUMMARY:x"),
    ), Date.UTC(2026, 9, 1), Date.UTC(2026, 10, 1));
    expect(r.map((x) => `${x.uid}=${x.zaciatok}`).sort()).toEqual(["o1|2026-10-25T02:30=2026-10-25T02:30", "o2|2026-10-25T02:30=2026-10-25T02:30"]);
  });
});

describe("citajIcal — okno", () => {
  test("UTC cez polnoc na začiatku okna sa NESMIE stratiť v hrubom site", () => {
    // 31. 7. 22:30 UTC je 1. 8. 00:30 v Prahe — surový dátum je pred oknom.
    const r = citajIcal(ics(ev("UID:hrana", "DTSTART:20260731T223000Z", "SUMMARY:x")), AUG_OD, AUG_DO);
    expect(zaciatky(r)).toEqual(["2026-08-01T00:30"]);
  });

  test("UTC cez polnoc na konci okna vypadne, lebo miestne je už za oknom", () => {
    const r = citajIcal(ics(ev("UID:koniec", "DTSTART:20260831T223000Z", "SUMMARY:x")), AUG_OD, AUG_DO);
    expect(r).toEqual([]);
  });

  test("stará jednorazová udalosť sa zahodí", () => {
    expect(citajIcal(ics(ev("UID:stara", "DTSTART:20240115T080000Z", "SUMMARY:x")), AUG_OD, AUG_DO)).toEqual([]);
  });

  test("zrušená udalosť sa nevráti", () => {
    expect(citajIcal(ics(ev("UID:c", "DTSTART:20260805T070000Z", "STATUS:CANCELLED", "SUMMARY:x")), AUG_OD, AUG_DO)).toEqual([]);
  });
});

describe("citajIcal — opakovanie", () => {
  test("séria z 2023 s výnimkou a presunutým výskytom", () => {
    const r = citajIcal(ics(
      ev("UID:S", "DTSTART;TZID=Europe/Prague:20230102T090000", "DTEND;TZID=Europe/Prague:20230102T100000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;TZID=Europe/Prague:20260810T090000", "SUMMARY:Jakub"),
      ev("UID:S", "RECURRENCE-ID;TZID=Europe/Prague:20260817T090000", "DTSTART;TZID=Europe/Prague:20260818T100000",
        "DTEND;TZID=Europe/Prague:20260818T110000", "SUMMARY:Jakub"),
    ), AUG_OD, AUG_DO);
    expect(zaciatky(r)).toEqual(["2026-08-03T09:00", "2026-08-18T10:00", "2026-08-24T09:00", "2026-08-31T09:00"]);
    // Presun nesie PÔVODNÝ kľúč — appka ho vidí ako posunutú hodinu, nie zrušenie + nový tréning.
    expect(r.find((x) => x.zaciatok === "2026-08-18T10:00")?.uid).toBe("S|2026-08-17T09:00");
  });
});

describe("citajIcal — výkon (regres z 10. 9. 2026)", () => {
  test("8 000 starých časov v UTC nepostaví formátovač znova", () => {
    const stare = Array.from({ length: 8000 }, (_, i) =>
      ev(`UID:o${i}`, `DTSTART:2024${String(1 + (i % 12)).padStart(2, "0")}${String(1 + (i % 28)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}0000Z`,
        `DTEND:2024${String(1 + (i % 12)).padStart(2, "0")}${String(1 + (i % 28)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}3000Z`, "SUMMARY:x"));
    const Povodny = Intl.DateTimeFormat;
    let postavene = 0;
    (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = function (...a: unknown[]) {
      postavene++;
      return new (Povodny as unknown as new (...b: unknown[]) => Intl.DateTimeFormat)(...a);
    };
    try {
      const r = citajIcal(ics(...stare, ev("UID:novy", "DTSTART:20260805T070000Z", "SUMMARY:y")), AUG_OD, AUG_DO);
      expect(r.map((x) => x.uid)).toEqual(["novy|2026-08-05T09:00"]);
      expect(postavene).toBeLessThanOrEqual(1);
    } finally {
      (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = Povodny;
    }
  });
});

describe("INTERVAL počíta týždne od začiatku týždňa (WKST), nie od DTSTART", () => {
  const OD = Date.parse("2026-09-01T00:00:00Z");
  const DO = Date.parse("2026-10-20T00:00:00Z");
  const ics = (rrule: string) => `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:s1
DTSTART;TZID=Europe/Prague:20260902T090000
DTEND;TZID=Europe/Prague:20260902T100000
RRULE:${rrule}
SUMMARY:Séria
END:VEVENT
END:VCALENDAR`;

  test("každé 2 týždne Po a St so začiatkom v stredu", () => {
    // 2. 9. 2026 je streda. Týždeň od 31. 8. je „párny": po ňom až týždeň od 14. 9.
    const dni = citajIcal(ics("FREQ=WEEKLY;WKST=MO;INTERVAL=2;BYDAY=MO,WE"), OD, DO).map((u) => u.zaciatok.slice(0, 10));
    expect(dni).toEqual(["2026-09-02", "2026-09-14", "2026-09-16", "2026-09-28", "2026-09-30", "2026-10-12", "2026-10-14"]);
  });

  test("WKST=SU posúva hranicu týždňa, podľa RFC 5545", () => {
    // Nedeľa 6. 9. už patrí do ďalšieho týždňa, teda vynechaného.
    const dni = citajIcal(ics("FREQ=WEEKLY;WKST=SU;INTERVAL=2;BYDAY=SU,WE"), OD, Date.parse("2026-09-25T00:00:00Z")).map((u) => u.zaciatok.slice(0, 10));
    expect(dni).toEqual(["2026-09-02", "2026-09-13", "2026-09-16"]);
  });

  test("jeden deň a týždenný rytmus sa nezmenili", () => {
    expect(citajIcal(ics("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE"), OD, DO).map((u) => u.zaciatok.slice(0, 10)))
      .toEqual(["2026-09-02", "2026-09-16", "2026-09-30", "2026-10-14"]);
    expect(citajIcal(ics("FREQ=WEEKLY;WKST=MO;INTERVAL=1;BYDAY=WE"), OD, Date.parse("2026-09-20T00:00:00Z")).map((u) => u.zaciatok.slice(0, 10)))
      .toEqual(["2026-09-02", "2026-09-09", "2026-09-16"]);
  });

  test("COUNT ráta len skutočné výskyty", () => {
    expect(citajIcal(ics("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=3"), OD, DO).map((u) => u.zaciatok.slice(0, 10)))
      .toEqual(["2026-09-02", "2026-09-14", "2026-09-16"]);
  });
});

describe("TZID iné než Praha sa prepočíta", () => {
  const OD = Date.parse("2026-01-01T00:00:00Z");
  const DO = Date.parse("2026-12-31T00:00:00Z");
  const jedna = (pasmo: string, zac: string, kon: string) => `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:x
DTSTART;TZID=${pasmo}:${zac}
DTEND;TZID=${pasmo}:${kon}
SUMMARY:Cesta
END:VEVENT
END:VCALENDAR`;

  test("New York: leto +6 h", () => {
    const [u] = citajIcal(jedna("America/New_York", "20260715T100000", "20260715T110000"), OD, DO);
    expect(u.zaciatok).toBe("2026-07-15T16:00");
    expect(u.koniec).toBe("2026-07-15T17:00");
    expect(u.uid).toBe("x|2026-07-15T16:00");
  });
  test("Kaliningrad bez letného času: v zime −1 h, v lete rovnako ako Praha", () => {
    expect(citajIcal(jedna("Europe/Kaliningrad", "20260115T100000", "20260115T110000"), OD, DO)[0].zaciatok).toBe("2026-01-15T09:00");
    expect(citajIcal(jedna("Europe/Kaliningrad", "20260715T100000", "20260715T110000"), OD, DO)[0].zaciatok).toBe("2026-07-15T10:00");
  });
  test("Brusel a Viedeň sú to isté ako Praha", () => {
    expect(citajIcal(jedna("Europe/Brussels", "20260715T100000", "20260715T110000"), OD, DO)[0].zaciatok).toBe("2026-07-15T10:00");
    expect(citajIcal(jedna("Europe/Vienna", "20260115T100000", "20260115T110000"), OD, DO)[0].zaciatok).toBe("2026-01-15T10:00");
  });
  test("neznáme pásmo: čas ostáva, ako stojí, a nič nespadne", () => {
    expect(citajIcal(jedna("Central European Standard Time", "20260715T100000", "20260715T110000"), OD, DO)[0].zaciatok).toBe("2026-07-15T10:00");
  });
  test("pražské a bez pásma sa neprepočítavajú", () => {
    expect(citajIcal(jedna("Europe/Prague", "20260715T100000", "20260715T110000"), OD, DO)[0].zaciatok).toBe("2026-07-15T10:00");
  });
  test("séria v New Yorku: BYDAY platí tam, aj keď je v Prahe už ďalší deň", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:ny
DTSTART;TZID=America/New_York:20260706T200000
DTEND;TZID=America/New_York:20260706T210000
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3
EXDATE;TZID=America/New_York:20260713T200000
SUMMARY:Séria
END:VEVENT
END:VCALENDAR`;
    // Pondelok 20:00 v New Yorku = utorok 2:00 v Prahe; výnimka 13. 7. vypadne.
    expect(citajIcal(ics, OD, DO).map((u) => u.zaciatok)).toEqual(["2026-07-07T02:00", "2026-07-21T02:00"]);
  });
});
