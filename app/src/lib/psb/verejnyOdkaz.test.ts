import { describe, expect, it } from "bun:test";

import { verejnyOdkaz, VEREJNA_DOMENA } from "./verejnyOdkaz";

const WORKER = "https://kokpit.prosapiensbio.workers.dev";

describe("krátka adresa pre SMS", () => {
  it("odkaz na stránku pred úvodným aj na výpis ide cez vlastnú doménu", () => {
    expect(verejnyOdkaz("/u/DD7bibTzQk9A", WORKER)).toBe(`${VEREJNA_DOMENA}/u/DD7bibTzQk9A`);
    expect(verejnyOdkaz("/v/AZG5rX2v4bdP", WORKER)).toBe(`${VEREJNA_DOMENA}/v/AZG5rX2v4bdP`);
  });

  it("ponuka termínov aj kalendár v mobile idú cez doménu, feed .ics nie", () => {
    expect(verejnyOdkaz("/t/Ab3xK9mQ2r1Zqw", WORKER)).toBe(`${VEREJNA_DOMENA}/t/Ab3xK9mQ2r1Zqw`);
    expect(verejnyOdkaz("/k/Ab3xK9mQ2r1Zqw", WORKER)).toBe(`${VEREJNA_DOMENA}/k/Ab3xK9mQ2r1Zqw`);
    expect(verejnyOdkaz("/d/Ab3xK9mQ2r1Zqw", WORKER)).toBe(`${VEREJNA_DOMENA}/d/Ab3xK9mQ2r1Zqw`);
    expect(verejnyOdkaz("/k/Ab3xK9mQ2r1Zqw/kalendar.ics", WORKER)).toBe(`${WORKER}/k/Ab3xK9mQ2r1Zqw/kalendar.ics`);
  });

  it("je naozaj kratšia — o toľko ide o jednu SMS menej", () => {
    const kratka = verejnyOdkaz("/u/DD7bibTzQk9A", WORKER);
    expect(kratka.length).toBeLessThan(`${WORKER}/u/DD7bibTzQk9A`.length - 15);
  });

  it("čo presmerovanie na webe nepozná, ide PRIAMO na workera", () => {
    // Snippet púšťa len /u/ a /v/ s tvarom tokenu. Odkaz mimo toho by cez
    // doménu skončil na 404 — a to je horšie než dlhá adresa.
    expect(verejnyOdkaz("/a/Ab3xK9mQ2r1Z", WORKER)).toBe(`${WORKER}/a/Ab3xK9mQ2r1Z`);
    expect(verejnyOdkaz("/u/kratky", WORKER)).toBe(`${WORKER}/u/kratky`);
    expect(verejnyOdkaz("/v/ma_podtrzitko__", WORKER)).toBe(`${WORKER}/v/ma_podtrzitko__`);
  });

  it("lomka na začiatku je nepovinná a záloha sa nezdvojí", () => {
    expect(verejnyOdkaz("u/DD7bibTzQk9A", WORKER)).toBe(`${VEREJNA_DOMENA}/u/DD7bibTzQk9A`);
    expect(verejnyOdkaz("/a/x", `${WORKER}/`)).toBe(`${WORKER}/a/x`);
  });
});
