import { describe, expect, it } from "bun:test";
import { CTA_FAZY, FAZY, FORMATY, ctaDoZadania, zadanieProProject } from "./mapaCyklu";

/**
 * CTA podľa fázy nákupného cyklu.
 *
 * Do 30. 8. 2026 zadanie o výzve na akciu mlčalo a Project končil každý
 * scenár úvodnou diagnostikou — aj pri divákovi, ktorý ešte nevie, že má
 * problém.
 */
describe("CTA pre fázy nákupného cyklu", () => {
  it("každá fáza má vlastné CTA", () => {
    for (const f of FAZY) expect(CTA_FAZY[f.id]).toBeTruthy();
  });

  it("žiadne dve fázy nemajú to isté CTA", () => {
    const hodnoty = FAZY.map((f) => CTA_FAZY[f.id]);
    expect(new Set(hodnoty).size).toBe(hodnoty.length);
  });

  it("prvá fáza si nepýta klik", () => {
    expect(CTA_FAZY[1]).toContain("ŽIADNY odkaz");
    expect(CTA_FAZY[1]).not.toContain("diagnostika");
  });

  it("o stretnutie sa pýta až posledná fáza", () => {
    const sDiagnostikou = FAZY.filter((f) => /diagnostika/i.test(CTA_FAZY[f.id])).map((f) => f.id);
    expect(sDiagnostikou).toEqual([5]);
  });

  it("neznáma fáza nevyrobí hádané CTA", () => {
    expect(ctaDoZadania(0)).toBe("");
    expect(ctaDoZadania(9)).toBe("");
  });

  it("zadanie pre Project CTA naozaj nesie", () => {
    const z = zadanieProProject({ mesiac: "2026-10", faza: 2, koncept: "bolesť v boku", kto: "" });
    expect(z).toContain("VÝZVA NA AKCIU (CTA) PRE TÚTO FÁZU:");
    expect(z).toContain("test-postury");
    // a v prvej fáze nie ten istý text
    const z1 = zadanieProProject({ mesiac: "2026-10", faza: 1, koncept: "chôdza", kto: "" });
    expect(z1).not.toContain("test-postury");
  });

  it("fáza 3 posiela na JEDNU stránku, nie na rozcestník", () => {
    // Rozcestník s ôsmimi témami je menu — kto si má vybrať z ôsmich,
    // nevyberie ani jednu (Jerry, 30. 8. 2026). /dychani je navyše lead
    // magnet o dychu a ako hlavné CTA fázy 3 je príliš úzke.
    expect(CTA_FAZY[3]).toContain("JEDNU konkrétnu stránku");
    expect(CTA_FAZY[3]).not.toContain("pochopte-sve-telo");
    // konkrétne adresy tém, z ktorých sa vyberá
    for (const s of ["/principy-biomechaniky", "/postura-drzeni-tela", "/co-ocekavat-od-biomechanickeho-treninku"]) {
      expect(CTA_FAZY[3]).toContain(s);
    }
  });

  it("fáza 4 ponúka aj online tréning a nenesie číslo, čo zostarne", () => {
    // Online má vlastné KPI s cieľom 10–15 % a je to jediné CTA bez stropu
    // v kapacite štúdia. Číslo sa tu zámerne neuvádza — zostarlo by.
    expect(CTA_FAZY[4]).toContain("online-trenink");
    expect(CTA_FAZY[4]).toContain("ONLINE JE ZÁMER");
    expect(CTA_FAZY[4]).not.toMatch(/\d+[,.]\d+\s*%/);
  });

  it("pripomína striedanie formy a Stories bez odkazu v biu", () => {
    const z = zadanieProProject({ mesiac: "2026-10", faza: 5, koncept: "x", kto: "" });
    expect(z).toContain("Jedno CTA na jeden kus obsahu");
    expect(z).toContain("link sticker");
  });
});

/** Tvar obsahu — aby nebol každý kus príbeh klienta. */
describe("tvary obsahu v zadaní", () => {
  it("zadanie ponúka viac tvarov, nielen príbeh", () => {
    const z = zadanieProProject({ mesiac: "2026-10", faza: 3, koncept: "x", kto: "" });
    expect(z).toContain("TVAR OBSAHU");
    expect(z).toContain("Rozbor jedného cviku");
    expect(z).toContain("Otázka od klienta");
    expect(z).toContain("Dva rovnaké tvary za sebou");
  });

  it("príbeh klienta je jeden z tvarov, nie jediný", () => {
    expect(FORMATY.length).toBeGreaterThanOrEqual(5);
    expect(FORMATY.some((f) => f.nazov === "Príbeh klienta")).toBe(true);
  });

  it("bez vybraného záberu ide do zadania katalóg, nie výmysel", () => {
    const z = zadanieProProject({ mesiac: "2026-10", faza: 3, koncept: "x", kto: "" });
    expect(z).toContain("ÚVODNÝ ZÁBER NIE JE VYBRANÝ");
    expect(z).toContain("NEVYMÝŠĽAJ");
  });

  it("keď je záber vybraný, katalóg sa nepridáva", () => {
    const z = zadanieProProject({ mesiac: "2026-10", faza: 3, koncept: "x", kto: "", zaber: "sledovanie" });
    expect(z).toContain("ÚVODNÝ ZÁBER: Sledovanie chôdze zboku");
    expect(z).not.toContain("ÚVODNÝ ZÁBER NIE JE VYBRANÝ");
  });
});
