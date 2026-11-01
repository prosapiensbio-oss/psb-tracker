import { describe, expect, it } from "bun:test";

import { jeCasRannejDavky, jeTichyCas, smieRannaDavka } from "./tichyCas";

const utc = (s: string) => new Date(`${s}:00Z`);

describe("tichý čas: 21:30 – 7:00 v Prahe", () => {
  it("zima (UTC+1): hranice", () => {
    expect(jeTichyCas(utc("2026-12-10T20:29"))).toBe(false); // 21:29
    expect(jeTichyCas(utc("2026-12-10T20:30"))).toBe(true);  // 21:30
    expect(jeTichyCas(utc("2026-12-10T05:59"))).toBe(true);  // 6:59
    expect(jeTichyCas(utc("2026-12-10T06:00"))).toBe(false); // 7:00
  });
  it("leto (UTC+2): tie isté hranice o hodinu inde", () => {
    expect(jeTichyCas(utc("2026-07-10T19:29"))).toBe(false); // 21:29
    expect(jeTichyCas(utc("2026-07-10T19:30"))).toBe(true);  // 21:30
    expect(jeTichyCas(utc("2026-07-10T04:59"))).toBe(true);  // 6:59
    expect(jeTichyCas(utc("2026-07-10T05:00"))).toBe(false); // 7:00
  });

  // Trojhodinový plán v UTC: 0, 3, 6, 9, 12, 15, 18, 21.
  const beh = (den: string) => [0, 3, 6, 9, 12, 15, 18, 21]
    .filter((h) => !jeTichyCas(utc(`${den}T${String(h).padStart(2, "0")}:00`)));

  it("zima: zvoní 7, 10, 13, 16, 19 — 22, 1 a 4 mlčia", () => {
    expect(beh("2026-12-10")).toEqual([6, 9, 12, 15, 18]);
  });
  it("leto: zvoní 8, 11, 14, 17, 20 — 23, 2 a 5 mlčia", () => {
    expect(beh("2026-07-10")).toEqual([6, 9, 12, 15, 18]);
  });
  it("deň zmeny času neposunie deň do noci", () => {
    // 25. 10. 2026 sa o 3:00 letného ide na 2:00 zimného.
    expect(jeTichyCas(utc("2026-10-25T00:00"))).toBe(true);  // 2:00 leto
    expect(jeTichyCas(utc("2026-10-25T03:00"))).toBe(true);  // 4:00 zima
    expect(jeTichyCas(utc("2026-10-25T06:00"))).toBe(false); // 7:00 zima
  });
});

describe("ranná dávka o 6:30 celý rok", () => {
  it("zima: pustí sa beh o 5:30 UTC, nie o 4:30", () => {
    expect(jeCasRannejDavky(utc("2026-12-10T04:30"))).toBe(false); // 5:30
    expect(jeCasRannejDavky(utc("2026-12-10T05:30"))).toBe(true);  // 6:30
  });
  it("leto: pustí sa beh o 4:30 UTC, nie o 5:30", () => {
    expect(jeCasRannejDavky(utc("2026-07-10T04:30"))).toBe(true);  // 6:30
    expect(jeCasRannejDavky(utc("2026-07-10T05:30"))).toBe(false); // 7:30
  });
  it("v deň zmeny času ide práve raz", () => {
    for (const den of ["2026-03-29", "2026-10-25"]) {
      const behy = ["04:30", "05:30"].filter((c) => jeCasRannejDavky(utc(`${den}T${c}`)));
      expect(behy.length).toBe(1);
    }
  });
  it("ručné spustenie v noci nezvoní, cez deň áno", () => {
    expect(smieRannaDavka(utc("2026-12-10T23:00"))).toBe(false); // 0:00
    expect(smieRannaDavka(utc("2026-12-10T04:59"))).toBe(false); // 5:59
    expect(smieRannaDavka(utc("2026-12-10T05:30"))).toBe(true);  // 6:30
    expect(smieRannaDavka(utc("2026-12-10T12:00"))).toBe(true);
    expect(smieRannaDavka(utc("2026-12-10T20:30"))).toBe(false); // 21:30
  });
});
