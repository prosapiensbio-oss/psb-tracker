import { describe, expect, it } from "bun:test";

import { feedKlienta, odoberaKalendar, platformaZAgenta, zalom } from "./kalendarMobil";

const T = { Jerry: { krstne: "Filip", telefon: "+420 111 222 333" }, Terezka: { krstne: "Terezka", telefon: "+420 702 147 704" } } as Record<string, { krstne: string; telefon: string }>;
const tr = (t: string) => T[t] || T.Jerry;

// Jerry, 7. 10. 2026: „uvidí všetky moje udalosti, alebo len tie svoje?"
describe("kalendár v mobile", () => {
  it("kalendár nesie len udalosti, ktoré dostane — a nič o hodinách ani peniazoch", () => {
    const s = feedKlienta([
      { uid: "abc@google.com|2026-10-13T10:00", trener: "Jerry", zaciatok: "2026-10-13T10:00", koniec: "2026-10-13T11:00" },
    ], tr, new Date("2026-10-07T08:00:00Z"));
    expect(s.match(/BEGIN:VEVENT/g)?.length).toBe(1);
    expect(s).toContain("DTSTART:20261013T080000Z");
    expect(s).toContain("SUMMARY:Trénink ProSapiens");
    expect(s).toContain("X-WR-CALNAME:ProSapiens");
    expect(s).toContain("TRIGGER:-P1D");
    expect(s).toContain("TRIGGER:-PT2H");
    expect(/ Kč|hodin zbývá|balíč/i.test(s)).toBe(false);
  });

  it("Terezkin tréning má jej meno a číslo, nie Jerryho", () => {
    const s = feedKlienta([{ uid: "x|2026-10-14T09:00", trener: "Terezka", zaciatok: "2026-10-14T09:00", koniec: "2026-10-14T10:00" }], tr);
    const spojene = s.replace(/\r\n /g, "");
    expect(spojene).toContain("Terezkou");
    expect(spojene).toContain("702 147 704");
    expect(spojene.includes("111 222 333")).toBe(false);
  });

  it("dlhý riadok sa láme podľa normy a nič sa nestratí", () => {
    const dlhy = `DESCRIPTION:${"Trénink s Filipem — změna termínu? ".repeat(5)}`;
    const z = zalom(dlhy);
    for (const r of z.split("\r\n")) expect(new TextEncoder().encode(r).length).toBeLessThanOrEqual(75);
    expect(z.replace(/\r\n /g, "")).toBe(dlhy);
  });

  it("platforma z hlavičky a kto ešte odoberá", () => {
    expect(platformaZAgenta("iOS/18.0 (22A3354) dataaccessd/1.0")).toBe("iPhone");
    expect(platformaZAgenta("Google-Calendar-Importer")).toBe("Google Kalendár");
    const teraz = Date.parse("2026-10-07T12:00:00Z");
    expect(odoberaKalendar("2026-10-06T12:00:00Z", teraz)).toBe(true);
    expect(odoberaKalendar("2026-10-01T12:00:00Z", teraz)).toBe(false);
    expect(odoberaKalendar(null, teraz)).toBe(false);
  });
});
