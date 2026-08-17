import { describe, expect, it } from "bun:test";

import { ktoDnesTrenoval } from "./compute";

const DNES = new Date("2026-08-17T18:00:00Z");
const u = (zaciatok: string, klient: string | null, typ = "trening", zmizlaAt: string | null = null) =>
  ({ zaciatok, klient, typ, zmizlaAt });

describe("koho si dnes trénoval", () => {
  it("vráti mená z dnešných tréningov aj úvodných", () => {
    expect(ktoDnesTrenoval([
      u("2026-08-17T09:00:00Z", "Jakub Štigut"),
      u("2026-08-17T11:00:00Z", "Anna Nova", "uvodny"),
    ], { dnes: DNES })).toEqual(["Jakub Štigut", "Anna Nova"]);
  });

  it("tréning, ktorý sa ešte len chystá, medzi nimi nie je", () => {
    // Zapisovať do denníka niečo, čo sa nestalo, nedáva zmysel.
    expect(ktoDnesTrenoval([u("2026-08-17T20:00:00Z", "Neskorší")], { dnes: DNES })).toEqual([]);
  });

  it("včerajšie, zrušené, súkromné ani udalosti bez mena sa nerátajú", () => {
    expect(ktoDnesTrenoval([
      u("2026-08-16T09:00:00Z", "Včerajší"),
      u("2026-08-17T09:00:00Z", "Zrušený", "trening", "2026-08-16"),
      u("2026-08-17T09:00:00Z", "Súkromné", "sukromne"),
      u("2026-08-17T09:00:00Z", null),
    ], { dnes: DNES })).toEqual([]);
  });

  it("dva tréningy s tým istým klientom dajú jedno meno", () => {
    expect(ktoDnesTrenoval([
      u("2026-08-17T09:00:00Z", "Dvakrát"),
      u("2026-08-17T15:00:00Z", "Dvakrát"),
    ], { dnes: DNES })).toEqual(["Dvakrát"]);
  });
});
