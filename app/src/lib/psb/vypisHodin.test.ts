import { describe, expect, it } from "bun:test";

import type { Udalost } from "./klientOsCasu";
import { poslednychMesiacov, vypisAkoText, vypisHodin, zaciatokBalicka } from "./vypisHodin";

const bal = (den: string, hodin: number, nazov = "OFF 18 h"): Udalost => ({ druh: "balicekOd", den, nazov, hodin });
const tre = (den: string): Udalost => ({ druh: "trening", den });
const pla = (den: string, suma: number): Udalost => ({ druh: "platba", den, suma, metoda: "banka" });

describe("výpis hodín", () => {
  const os: Udalost[] = [bal("2026-09-02", 18), tre("2026-09-09"), tre("2026-09-16"), tre("2026-09-23"), pla("2026-09-03", 21150)];

  it("balíček pridá, tréning uberie, platba nemení", () => {
    const v = vypisHodin(os);
    expect(v.kupene).toBe(18);
    expect(v.odtrenovane).toBe(3);
    expect(v.koniec).toBe(15);
    // Platba hodiny nemení — mení ich balíček.
    expect(v.riadky.find((r) => r.druh === "platba")!.zmena).toBe(0);
  });

  it("najnovšie hore, zostatok sedí po každom riadku", () => {
    const v = vypisHodin(os);
    expect(v.riadky[0].den).toBe("2026-09-23");
    expect(v.riadky[0].zostatok).toBe(15);
    expect(v.riadky[v.riadky.length - 1].zostatok).toBe(18);
  });

  it("obdobie nezoberie hodiny z minulosti", () => {
    // Klient kúpil 18 h vlani a minul 3. Výpis za september nesmie začínať
    // od nuly, inak mu vyjde mínus.
    const stare: Udalost[] = [bal("2025-11-01", 18), tre("2025-11-05"), tre("2025-11-12"), tre("2025-11-19"), tre("2026-09-09")];
    const v = vypisHodin(stare, "2026-09-01", "2026-09-30");
    expect(v.zaciatok).toBe(15);
    expect(v.riadky.length).toBe(1);
    expect(v.koniec).toBe(14);
  });

  it("horná hranica obdobia platí tiež — stav je k jej dňu, nie k dnešku", () => {
    const v = vypisHodin(os, "2026-09-01", "2026-09-10");
    expect(v.riadky.map((r) => r.den)).toEqual(["2026-09-09", "2026-09-03", "2026-09-02"]);
    expect(v.koniec).toBe(17);
  });

  it("prázdna os nevyrobí nezmysel", () => {
    const v = vypisHodin([]);
    expect(v).toMatchObject({ riadky: [], zaciatok: 0, koniec: 0, kupene: 0, odtrenovane: 0 });
  });

  it("tréning z kalendára si nesie značku", () => {
    const v = vypisHodin([{ druh: "trening", den: "2026-09-25", zKalendara: true }]);
    expect(v.riadky[0].zKalendara).toBe(true);
  });
});

describe("obdobie a text", () => {
  it("posledné tri mesiace", () => {
    expect(poslednychMesiacov(3, "2026-09-26")).toEqual({ od: "2026-06-26", do: "2026-09-26" });
  });

  it("text pre klienta nesie stav aj riadky v čase", () => {
    const t = vypisAkoText(vypisHodin([bal("2026-09-02", 18), tre("2026-09-09")]), "Anetka Přinosilová");
    expect(t).toContain("Výpis hodín — Anetka Přinosilová");
    expect(t).toContain("Stav na konci: 17 h");
    // Od najstaršieho — klient číta zhora nadol, ako sa to dialo.
    expect(t.indexOf("OFF 18 h")).toBeLessThan(t.indexOf("tréning"));
  });
});

describe("kotva zostatku", () => {
  it("nájde posledný balíček, ktorý už platí", () => {
    const os: Udalost[] = [bal("2025-11-01", 18), tre("2026-01-05"), bal("2026-09-02", 18), bal("2027-01-01", 10)];
    expect(zaciatokBalicka(os, "2026-09-26")).toBe("2026-09-02");
  });

  it("bez balíčka vráti prázdno", () => {
    expect(zaciatokBalicka([tre("2026-09-01")], "2026-09-26")).toBe("");
  });

  it("od kotvy zostatok nejde do mínusu", () => {
    // Anetka: v appke sú tréningy od 2025, ale balíček len ten z 2. 9. Bez
    // kotvy vychádzalo −37 h, hoci jej zostáva 15.
    const os: Udalost[] = [
      tre("2025-05-10"), tre("2025-06-10"), bal("2026-09-02", 18),
      tre("2026-09-09"), tre("2026-09-16"), tre("2026-09-23"),
    ];
    const v = vypisHodin(os, "", "", zaciatokBalicka(os, "2026-09-26"));
    expect(v.koniec).toBe(15);
    expect(v.zaciatok).toBe(0);
  });
});

describe("obdobie sa oreže kotvou", () => {
  const os: Udalost[] = [tre("2025-05-10"), bal("2026-09-02", 18), tre("2026-09-09")];

  it("hlavička nezačína skôr než počítanie", () => {
    const { od } = poslednychMesiacov(3, "2026-09-26");
    const v = vypisHodin(os, od, "2026-09-26", zaciatokBalicka(os, "2026-09-26"));
    expect(v.od).toBe("2026-09-02");
    expect(v.odKotvy).toBe(true);
  });

  it("keď obdobie začína až po balíčku, kotva nerozhoduje", () => {
    const v = vypisHodin(os, "2026-09-05", "2026-09-26", zaciatokBalicka(os, "2026-09-26"));
    expect(v.od).toBe("2026-09-05");
    expect(v.odKotvy).toBe(false);
    expect(v.zaciatok).toBe(18);
  });
});

describe("výpis číta klient, nie appka", () => {
  it("prepíše ISO dátum, poldenný čas aj kód metódy", () => {
    const os: Udalost[] = [
      { druh: "balicekOd", den: "2026-09-02", nazov: "OFF - 18 hodín", hodin: 18, doDna: "2027-03-01" },
      { druh: "platba", den: "2026-09-03", suma: 21150, metoda: "bank" },
      { druh: "trening", den: "2026-09-09", cas: "3:00pm", trener: "Terezka" },
    ];
    const t = vypisAkoText(vypisHodin(os, "", "2026-09-26", "2026-09-02"), "Anetka");
    expect(t).toContain("do 1. 3. 2027");
    expect(t).toContain("platba 21 150 Kč · prevodom");
    expect(t).toContain("tréning 15:00 · Terezka");
    expect(t).not.toContain("2027-03-01");
  });
});
