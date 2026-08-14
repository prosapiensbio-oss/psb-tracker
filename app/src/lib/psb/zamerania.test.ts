import { describe, expect, test } from "bun:test";

import { brief, PRIECHOD, ZAMERANIA } from "./zamerania";

/**
 * Zameranie je nastavenie, ktorého účinok človek nevidí priamo — a to je
 * presne ten druh veci, ktorá sa pokazí ticho. Testy tu nedržia vzhľad, držia
 * to, aby prepínač naozaj niečo robil.
 */

describe("zoznam zameraní", () => {
  test("Všetko je prvé a nezužuje", () => {
    // Predvolený stav musí byť ten, ktorý nič nevynecháva. Keby bol predvolený
    // marketing, Jarvis by mlčky ignoroval peniaze pri každej prvej otázke.
    expect(ZAMERANIA[0].id).toBe("");
    expect(ZAMERANIA[0].brief).toBe("");
  });

  test("každé zameranie okrem Všetko má brief", () => {
    // Chip bez briefu je prepínač, ktorý nič nerobí — a človek si myslí,
    // že áno.
    for (const z of ZAMERANIA.filter((x) => x.id)) {
      expect(z.brief.length).toBeGreaterThan(200);
    }
  });

  test("id sú jedinečné a nikdy sa nemenia", () => {
    // Zameranie sa ukládá ku konverzácii. Premenované id by osirelo staré
    // rozhovory — otvorili by sa bez pravidiel, v ktorých vznikli.
    const ids = ZAMERANIA.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const povinne of ["", "marketing", "peniaze", "klienti"]) {
      expect(ids).toContain(povinne);
    }
  });

  test("každé zameranie má rolu aj popis pre človeka", () => {
    for (const z of ZAMERANIA) {
      expect(z.rola.length).toBeGreaterThan(5);
      expect(z.popis.length).toBeGreaterThan(20);
      expect(z.label.length).toBeGreaterThan(2);
    }
  });
});

describe("zúženie nesmie zúžiť schopnosť", () => {
  test("každý brief končí priechodom do ostatných oblastí", () => {
    // Toto je tá najdôležitejšia podmienka celej funkcie. Zameranie, ktoré
    // Jarvisovi zakáže pozrieť sa inam, by zopakovalo chybu z 14. 8. 2026:
    // trikrát vyhlásil, že vec neexistuje, len preto, že sa pozrel na jedno
    // miesto.
    for (const z of ZAMERANIA.filter((x) => x.id)) {
      expect(z.brief).toContain(PRIECHOD);
    }
  });

  test("priechod hovorí obe veci: začni tu, ale choď si po zvyšok", () => {
    expect(PRIECHOD).toContain("PRIORITE");
    expect(PRIECHOD).toContain("NIKDY neodpovedaj, že niečo nemáš");
  });
});

describe("pravidlá, ktoré sa nesmú stratiť", () => {
  test("marketing nesie FP aj zákaz umelej urgencie", () => {
    const b = brief("marketing");
    expect(b).toContain("FP");
    expect(b).toContain("umelá urgencia");
    // Konverzie z Google Ads nie sú klienti — chyba, ktorá dnes stála 46 000 Kč
    // na nepoužiteľnom čísle.
    expect(b).toContain("NIE SÚ klienti");
  });

  test("peniaze nesú kotvu dát aj FP Spain", () => {
    const b = brief("peniaze");
    expect(b).toContain("POSLEDNÝM PLNÝM MESIACOM");
    expect(b).toContain("FP Spain");
    expect(b).toContain("OSOBNÝ");
    // Jerryho vlastný príklad: pri znižovaní nákladov nechce vidieť kliky.
    expect(b).toContain("NEUVÁDZAJ marketingové čísla");
  });

  test("klienti nesú, že pauza nie je strata", () => {
    const b = brief("klienti");
    expect(b).toContain("NIE JE stratený klient");
    expect(b).toContain("NEVYMÝŠĽAJ");
  });
});

describe("brief()", () => {
  test("neznáme zameranie vráti prázdno, nie cudzí brief", () => {
    // Keby vrátilo prvý v zozname, Jerry by sa pýtal na peniaze a dostal
    // marketingové pravidlá — a nezistil by prečo.
    expect(brief("neexistuje")).toBe("");
    expect(brief("")).toBe("");
  });

  test("známe zameranie vráti svoj vlastný brief", () => {
    expect(brief("peniaze")).toBe(ZAMERANIA.find((z) => z.id === "peniaze")!.brief);
    expect(brief("marketing")).not.toBe(brief("peniaze"));
  });
});
