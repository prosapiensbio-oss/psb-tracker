// Meradlo súbežného chodu — bez neho je „keď by to sedelo" len pocit.
import { describe, expect, it } from "bun:test";

import { porovnajTyzdne } from "./porovnanieDochadzky";

const dnes = new Date("2026-09-22T12:00:00Z");
const u = (klient: string | null, zaciatok: string, typ: string | null = "trening") => ({ klient, zaciatok, typ });
const s = (client: string, date: string, trener = "Jerry") => ({ client, date: `${date}T00:00:00.000Z`, trener });
const kal = { Jerry: "2026-08-08", Terezka: "2026-08-09" };

describe("porovnajTyzdne", () => {
  it("zhodný týždeň nehlási nič", () => {
    const v = porovnajTyzdne(
      [u("Jan Kral", "2026-09-14T10:00:00Z"), u("Jan Kral", "2026-09-16T10:00:00Z")],
      [s("Jan Kral", "2026-09-14"), s("Jan Kral", "2026-09-16")],
      kal,
      dnes,
    );
    expect(v.lenPtminder).toBe(0);
    expect(v.lenKalendar).toBe(0);
    expect(v.sedeni).toBe(2);
  });

  it("sedenie bez udalosti je strata — to je číslo, ktoré rozhoduje", () => {
    const v = porovnajTyzdne(
      [u("Jan Kral", "2026-09-14T10:00:00Z")],
      [s("Jan Kral", "2026-09-14"), s("Eva Nova", "2026-09-15")],
      kal,
      dnes,
    );
    expect(v.lenPtminder).toBe(1);
    expect(v.tyzdne[0].chybaju).toEqual([{ klient: "Eva Nova", den: "2026-09-15", kde: "ptminder" }]);
  });

  it("udalosť bez zápisu je robota navyše, nie strata", () => {
    const v = porovnajTyzdne(
      [u("Jan Kral", "2026-09-14T10:00:00Z"), u("Eva Nova", "2026-09-15T10:00:00Z")],
      [s("Jan Kral", "2026-09-14"), s("Eva Nova", "2026-09-18")],
      kal,
      dnes,
    );
    expect(v.lenKalendar).toBe(1);
    expect(v.lenPtminder).toBe(1);
  });

  it("presun o deň sa za rozdiel nepočíta", () => {
    // Markéta 30. 7. v kalendári, 31. 7. v PTminderi — hodina sa presunula
    // a kalendár sa neopravil. Dvakrát za dva dni ten istý klient netrénuje.
    const v = porovnajTyzdne(
      [u("Marketa Resnerová", "2026-09-14T08:30:00Z")],
      [s("Marketa Resnerová", "2026-09-15")],
      kal,
      dnes,
    );
    expect(v.lenPtminder).toBe(0);
    expect(v.lenKalendar).toBe(0);
  });

  it("diakritika nerobí rozdiel", () => {
    const v = porovnajTyzdne(
      [u("Zuzana Spoligová", "2026-09-14T10:00:00Z")],
      [s("Zuzana Spoligova", "2026-09-14")],
      kal,
      dnes,
    );
    expect(v.lenPtminder).toBe(0);
  });

  it("obdobie pred pripojením kalendára sa nepočíta", () => {
    // Kalendáre sa pripojili 8. 8. 2026; sedenia z júla by inak vyzerali ako
    // strata, hoci kalendár vtedy ešte neexistoval.
    const v = porovnajTyzdne(
      [u("Jan Kral", "2026-09-14T10:00:00Z")],
      [s("Jan Kral", "2026-07-06"), s("Jan Kral", "2026-09-14")],
      kal,
      dnes,
    );
    expect(v.sedeni).toBe(1);
    expect(v.lenPtminder).toBe(0);
  });

  it("za koncom exportu sa udalosti nerátajú ako prebytok", () => {
    // Export siaha po 14. 9.; tréningy z 15. a 16. 9. ešte nemajú kde byť.
    const v = porovnajTyzdne(
      [u("Jan Kral", "2026-09-14T10:00:00Z"), u("Jan Kral", "2026-09-16T10:00:00Z")],
      [s("Jan Kral", "2026-09-14")],
      kal,
      dnes,
    );
    expect(v.lenKalendar).toBe(0);
    expect(v.do).toBe("2026-09-14");
  });

  it("dnešok sa nehodnotí — zápis do PTmindera ešte len príde", () => {
    const v = porovnajTyzdne(
      [u("Jan Kral", "2026-09-22T10:00:00Z"), u("Jan Kral", "2026-09-15T10:00:00Z")],
      [s("Jan Kral", "2026-09-15")],
      kal,
      dnes,
    );
    expect(v.lenKalendar).toBe(0);
  });

  it("udalosť bez klienta ani súkromná sa nepočíta", () => {
    const v = porovnajTyzdne(
      [u("Jan Kral", "2026-09-14T10:00:00Z"), u(null, "2026-09-15T10:00:00Z"), u("Veterina", "2026-09-16T10:00:00Z", "sukromne")],
      [s("Jan Kral", "2026-09-14")],
      kal,
      dnes,
    );
    expect(v.lenKalendar).toBe(0);
  });

  it("bez dát nespadne", () => {
    expect(porovnajTyzdne([], [], kal, dnes).tyzdne).toEqual([]);
  });
});

describe("hranica je per tréner", () => {
  it("Terezkino sedenie z 8. 8. sa nepočíta — jej kalendár pribudol 9. 8.", () => {
    const v = porovnajTyzdne([], [s("Eva Nova", "2026-08-08", "Terezka")], kal, dnes);
    expect(v.sedeni).toBe(0);
  });

  it("Jerryho sedenie z 8. 8. sa počíta", () => {
    const v = porovnajTyzdne([], [s("Eva Nova", "2026-08-08", "Jerry")], kal, dnes);
    expect(v.sedeni).toBe(1);
    expect(v.lenPtminder).toBe(1);
  });

  it("tréner bez kalendára sa neporovnáva, ale ani nezamlčí", () => {
    // Matyáš bol záskok a kalendár nemal. Jeho sedenia by po vypnutí
    // PTmindera zmizli všetky — číslo musí byť vidieť.
    const v = porovnajTyzdne([], [s("Eva Nova", "2026-08-20", "Matyáš"), s("Jan Kral", "2026-08-20", "Jerry")], kal, dnes);
    expect(v.sedeni).toBe(1);
    expect(v.bezKalendara).toEqual([{ trener: "Matyáš", sedeni: 1 }]);
  });
});
