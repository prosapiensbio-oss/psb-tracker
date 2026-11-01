import { describe, expect, it } from "bun:test";

import { vyhodnotBeh } from "./vysledokBehu";
import { sekciaAutomatov, stavAutomatu, type BehAutomatu } from "./zdravieKokpitu";

const j = (x: unknown) => JSON.stringify(x);

describe("vyhodnotBeh", () => {
  it("HTTP chyba je chyba aj s telom", () => {
    expect(vyhodnotBeh(500, "padlo")).toEqual({ ok: false, chyba: "HTTP 500: padlo" });
    expect(vyhodnotBeh(401, j({ ok: false })).ok).toBe(false);
  });
  it("200 s HTML nie je úspech — odpovedala stránka, nie trasa", () => {
    const v = vyhodnotBeh(200, "<!doctype html><html>");
    expect(v.ok).toBe(false);
    expect(v.chyba).toContain("nie je JSON");
  });
  it("ok:false na najvyššej úrovni", () => {
    expect(vyhodnotBeh(200, j({ ok: false, error: "IMAP odmietol" }))).toEqual({ ok: false, chyba: "IMAP odmietol" });
    expect(vyhodnotBeh(200, j({ ok: false, chyba: "Fio limit" }))).toEqual({ ok: false, chyba: "Fio limit" });
    expect(vyhodnotBeh(200, j({ ok: false })).ok).toBe(false);
  });
  it("kalendár: vysledky ako objekt podľa trénera", () => {
    const zle = vyhodnotBeh(200, j({ ok: true, vysledky: { Jerry: { ok: false, chyba: "HTTP 429 (3× za sebou)" } } }));
    expect(zle).toEqual({ ok: false, chyba: "Jerry: HTTP 429 (3× za sebou)" });
    expect(vyhodnotBeh(200, j({ ok: true, vysledky: { Terezka: { ok: true, udalosti: 118 } } }))).toEqual({ ok: true });
  });
  it("kalendár: dobeh, ktorý nemal čo robiť, je úspech", () => {
    expect(vyhodnotBeh(200, j({ ok: true, vysledky: {}, dobeh: "netreba" }))).toEqual({ ok: true });
  });
  it("ranná dávka: vysledky ako pole — povie, kto a prečo", () => {
    const v = vyhodnotBeh(200, j({ ok: true, odberov: 2, vysledky: [
      { kto: "Jerry", poloziek: 3, ok: true, status: 201 },
      { kto: "Terezka", poloziek: 1, ok: false, status: 403 },
    ] }));
    expect(v).toEqual({ ok: false, chyba: "Terezka: HTTP 403" });
  });
  it("mimo okna nie je ani úspech, ani chyba", () => {
    expect(vyhodnotBeh(200, j({ ok: true, preskocene: "mimo okna — číta sa dnes o 20:00" }))).toEqual({ ok: true, preskocene: true });
  });
  it("preskocene ako pole (Metricool) je obsah, nie preskočenie behu", () => {
    expect(vyhodnotBeh(200, j({ ok: true, mesiac: "2026-11", preskocene: [] }))).toEqual({ ok: true });
  });
  it("kontrola webu s nálezom je úspešný beh — nález hlási register", () => {
    expect(vyhodnotBeh(200, j({ ok: true, cast: "meranie", chyb: 1 }))).toEqual({ ok: true });
  });
  it("chyba v tele bez ok", () => {
    expect(vyhodnotBeh(200, j({ error: "no_db" }))).toEqual({ ok: false, chyba: "no_db" });
  });
});

describe("karta Zdravie Kokpitu pri 429 s dobehom", () => {
  const TERAZ = "2026-11-10T12:40:00.000Z";
  const riadok = (o: Partial<BehAutomatu>) => sekciaAutomatov({ teraz: TERAZ, behy: [{ automat: "kalendar", kedy: TERAZ, ok: 1, ...o }], chybyPrehliadaca: [], rozpory: [] })
    .riadky.find((r) => r.nazov === "Snímka kalendára")!;

  it("429 o 12:00, predošlý úspech ráno: stav ok, chyba len ako poznámka", () => {
    const r = riadok({ ok: 0, chyba: "Jerry: HTTP 429", poslednyOk: "2026-11-10T09:00:00.000Z" });
    expect(r.stav).toBe("ok");
    expect(r.detail).toContain("HTTP 429");
  });
  it("dobeh o 12:30 prešiel: poznámka zmizne", () => {
    const r = riadok({ ok: 1, poslednyOk: "2026-11-10T12:30:00.000Z" });
    expect(r.stav).toBe("ok");
    expect(r.detail).toBeUndefined();
  });
  it("dva dni bez úspechu je porucha — to dobeh nezakryje", () => {
    expect(stavAutomatu({ automat: "kalendar", kedy: TERAZ, ok: 0, chyba: "HTTP 429", poslednyOk: "2026-11-08T11:00:00.000Z" }, TERAZ)).toBe("pozor");
  });
});
