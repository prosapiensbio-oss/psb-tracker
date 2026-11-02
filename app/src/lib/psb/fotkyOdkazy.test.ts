import { describe, expect, it } from "bun:test";
import { odkazNeodoslany, polozkyFotiek, smsKOdkazu } from "./fotkyOdkazy";

describe("odpovede klientov na fotky v notifikáciách", () => {
  it("každá odpoveď je vlastná položka trénerovi, ktorý odkaz poslal", () => {
    const p = polozkyFotiek({
      odpovede: [{ id: 7, token: "t1", klient: "Tomáš Novák", kedy: "2026-10-12T10:00:00Z", trener: "Terezka", text: "Super, díky!" }],
      suhlasy: [],
    });
    expect(p).toHaveLength(1);
    expect(p[0].key).toBe("fotky|odpoved|7");
    expect(p[0].trener).toBe("Terezka");
    expect(p[0].detail).toContain("Super, díky!");
    expect(p[0].detail).toMatch(/^Tomáš Novák/);
  });
  it("súhlas „ano“ sa oznámi, „ne“ nie", () => {
    const p = polozkyFotiek({ odpovede: [], suhlasy: [
      { token: "a", klient: "X", kedy: "2026-10-12", suhlas: "ano", trener: null },
      { token: "b", klient: "Y", kedy: "2026-10-12", suhlas: "ne", trener: null },
    ] });
    expect(p.map((x) => x.key)).toEqual(["fotky|suhlas|a"]);
  });
  it("bez dát nič", () => expect(polozkyFotiek(undefined)).toEqual([]));
});

describe("odkaz s fotkami, ku ktorému neodišla SMS (Lukas Hanus, 1. 11. 2026)", () => {
  const vznik = "2026-11-01T13:31:51.851Z";
  const zaklad = { vytvorene: vznik, platiDo: "2026-12-01", sms: null };
  const teraz = new Date("2026-11-02T09:00:00Z");
  it("SMS pred vznikom odkazu ani SMS inému klientovi sa nerátajú", () => {
    expect(smsKOdkazu("Lukas Hanus", vznik, [
      { at: "2026-10-15T15:36:00Z", predmet: "Lukas Hanus · +420733712969" },
      { at: "2026-11-01T14:00:00Z", predmet: "Radek Balaž · +420777776363" },
    ])).toBeNull();
  });
  it("SMS po vzniku sa ráta aj pri inom tvare mena", () => {
    expect(smsKOdkazu("Lukas Hanus", vznik, [{ at: "2026-11-01T14:00:00Z", predmet: "Lukáš Hanus · +420733712969" }])).toBe("2026-11-01T14:00:00Z");
  });
  it("hlási sa odkaz bez SMS starší než hodina", () => {
    expect(odkazNeodoslany(zaklad, teraz)).toBe(true);
    expect(odkazNeodoslany(zaklad, new Date("2026-11-01T14:00:00Z"))).toBe(false);
  });
  it("nehlási sa odoslaný, otvorený, zrušený ani po platnosti", () => {
    expect(odkazNeodoslany({ ...zaklad, sms: "2026-11-01T14:00:00Z" }, teraz)).toBe(false);
    expect(odkazNeodoslany({ ...zaklad, otvorene: "2026-11-01T14:00:00Z" }, teraz)).toBe(false);
    expect(odkazNeodoslany({ ...zaklad, zrusene: "2026-11-01T14:00:00Z" }, teraz)).toBe(false);
    expect(odkazNeodoslany({ ...zaklad, platiDo: "2026-11-01" }, teraz)).toBe(false);
  });
  it("v registri je to oranžová položka s menom a miestom, kde sa to vybaví", () => {
    const p = polozkyFotiek({ odpovede: [], suhlasy: [], neodoslane: [{ token: "uM", klient: "Lukas Hanus", kedy: vznik, trener: "Jerry" }] });
    expect(p[0].key).toBe("fotky|neodoslane|uM");
    expect(p[0].tone).toBe("orange");
    expect(p[0].detail).toContain("Lukas Hanus");
    expect(p[0].detail).toContain("Poslať SMS");
  });
});
