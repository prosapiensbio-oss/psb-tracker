import { describe, expect, it } from "bun:test";
import { CTA_FAZY, FAZY, ctaDoZadania, zadanieProProject } from "./mapaCyklu";

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

  it("fáza 3 posiela na rozcestník, nie na dychovú príručku", () => {
    // /dychani je lead magnet o dychu — ako hlavné CTA fázy 3 je príliš úzke
    // (Jerry, 30. 8. 2026). Rozcestník má osem tém aj podcast.
    expect(CTA_FAZY[3]).toContain("pochopte-sve-telo");
    expect(CTA_FAZY[3]).toContain("Co očekávat od biomechanického tréninku");
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
