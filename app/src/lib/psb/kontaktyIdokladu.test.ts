import { describe, expect, it } from "bun:test";

import { jeFirma, navrhniKlienta, rozdelRiadok, rozparsujKontakty } from "./kontaktyIdokladu";

const CSV = `Firma,IČ,DIČ,E-mailová adresa,Telefon,Jméno,Příjmení
Aneta Přinosilová,,,,,,
Benefit Management s.r.o.,27069770,CZ27069770,bohdan.klimek@heineken.com,,,
"Comfort production, s.r.o.",10976744,,,,,
"DK Consulting, s.r.o.",29211441,CZ29211441,,,"Dan ",Kouřil
Ing. arch. Anna Nová,75625008,,,,,
Tomáš Krčmár,,,tomas.krcmar97@gmail.com," 739144679",Tomáš,Krčmár
`;

describe("čítanie CSV z iDokladu", () => {
  it("čiarka v názve firmy riadok nerozbije", () => {
    // „Comfort production, s.r.o." má čiarku v úvodzovkách.
    expect(rozdelRiadok('"Comfort production, s.r.o.",10976744,,,,,'))
      .toEqual(["Comfort production, s.r.o.", "10976744", "", "", "", "", ""]);
  });

  it("prečíta všetky kontakty aj s IČO a mailom", () => {
    const k = rozparsujKontakty(CSV);
    expect(k.length).toBe(6);
    expect(k[1]).toMatchObject({ firma: "Benefit Management s.r.o.", ico: "27069770", dic: "CZ27069770", email: "bohdan.klimek@heineken.com" });
    expect(k[5]).toMatchObject({ firma: "Tomáš Krčmár", email: "tomas.krcmar97@gmail.com", osPriezvisko: "Krčmár" });
  });

  it("prázdny vstup nevyrobí nič", () => {
    expect(rozparsujKontakty("")).toEqual([]);
    expect(rozparsujKontakty("nejaka,hlavicka,bez,firmy")).toEqual([]);
  });
});

describe("firma verzus človek", () => {
  it("rozozná právnu formu", () => {
    expect(jeFirma({ firma: "Benefit Management s.r.o." })).toBe(true);
    expect(jeFirma({ firma: "Effective Fitness and Beauty s.r.o." })).toBe(true);
    expect(jeFirma({ firma: "Tomáš Krčmár" })).toBe(false);
    expect(jeFirma({ firma: "Ing. arch. Anna Nová" })).toBe(false);
  });
});

describe("návrh klienta", () => {
  const mena = ["Anna Nova", "Tomaš Krčmar", "Lucie Podolova", "Michal Knapčok", "Michal Novy"];

  it("tituly nevadia", () => {
    expect(navrhniKlienta({ firma: "Ing. arch. Anna Nová", osMeno: "", osPriezvisko: "" }, mena)).toEqual(["Anna Nova"]);
    expect(navrhniKlienta({ firma: "Mgr. Lucie Podolová", osMeno: "", osPriezvisko: "" }, mena)).toEqual(["Lucie Podolova"]);
  });

  it("firme sa klient nehádže", () => {
    // Kto stojí za „FSH Devices", vie jedine Jerry.
    expect(navrhniKlienta({ firma: "FSH Devices s.r.o.", osMeno: "", osPriezvisko: "" }, mena)).toEqual([]);
  });

  it("dvaja s rovnakým priezviskom znamenajú, že rozhodne človek", () => {
    expect(navrhniKlienta({ firma: "Michal", osMeno: "", osPriezvisko: "" }, mena)).toEqual([]);
  });

  it("neznámeho nevymyslí", () => {
    expect(navrhniKlienta({ firma: "Niekto Cudzi", osMeno: "", osPriezvisko: "" }, mena)).toEqual([]);
  });
});
