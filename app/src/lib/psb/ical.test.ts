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
