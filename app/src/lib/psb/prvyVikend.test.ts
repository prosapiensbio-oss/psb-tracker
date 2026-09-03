// Kedy sa appka začne pýtať na mesačnú uzávierku.
//
// Jerry, 1. 9. 2026: „dnes je 1. 9. a vyskočili mi všetky notifikácie typu
// treba zapísať platba… potreboval by som, aby mi to vyskakovali prvý víkend
// v novom mesiaci."
import { describe, expect, it } from "bun:test";

import { prvyVikendMesiaca, ritualy } from "./rituals";

const den = (d: Date) => d.toISOString().slice(0, 10);

describe("prvyVikendMesiaca", () => {
  it("september 2026 začína v utorok → piatok 4. 9.", () => {
    expect(den(prvyVikendMesiaca(2026, 8))).toBe("2026-09-04");
  });

  it("október 2026 začína vo štvrtok → piatok 2. 10.", () => {
    expect(den(prvyVikendMesiaca(2026, 9))).toBe("2026-10-02");
  });

  it("keď prvý padne na PIATOK, uzávierka je až ďalší víkend", () => {
    // 1. 1. 2027 je piatok — mesiac práve skončil a PTminder nemá zaúčtované.
    expect(den(prvyVikendMesiaca(2027, 0))).toBe("2027-01-08");
    // 1. 5. 2026 je tiež piatok.
    expect(den(prvyVikendMesiaca(2026, 4))).toBe("2026-05-08");
  });

  it("keď prvý padne na SOBOTU alebo NEDEĽU, tiež až ďalší víkend", () => {
    expect(den(prvyVikendMesiaca(2026, 7))).toBe("2026-08-07");   // 1. 8. je sobota
    expect(den(prvyVikendMesiaca(2026, 10))).toBe("2026-11-06");  // 1. 11. je nedeľa
  });
});

describe("mesačná uzávierka v registri", () => {
  const mesacny = (dnes: Date) => ritualy(dnes, {}, {}, { chybaju: [] }).find((r) => r.druh === "mesiac");

  it("1. 9. 2026 (utorok) sa NEPÝTA — to je presne to, čo Jerryho rušilo", () => {
    expect(mesacny(new Date("2026-09-01T09:00:00Z"))?.splatne).toBe(false);
  });

  it("3. 9. (štvrtok) ešte nie, 4. 9. (piatok) už áno", () => {
    expect(mesacny(new Date("2026-09-03T09:00:00Z"))?.splatne).toBe(false);
    expect(mesacny(new Date("2026-09-04T09:00:00Z"))?.splatne).toBe(true);
  });

  it("po víkende NEZHASÍNA — kým nie je zapísané, pýta sa ďalej", () => {
    // Toto je staršia lekcia: 4. 8. 2026 odznak zmizol, hoci júl bol prázdny.
    expect(mesacny(new Date("2026-09-20T09:00:00Z"))?.splatne).toBe(true);
    expect(mesacny(new Date("2026-09-30T09:00:00Z"))?.splatne).toBe(true);
  });

  it("zapísaný mesiac sa nepýta ani po víkende", () => {
    const zapisane = { "2026-08": { note: "hotovo" } };
    const r = ritualy(new Date("2026-09-10T09:00:00Z"), {}, zapisane, { chybaju: [] }).find((x) => x.druh === "mesiac");
    expect(r?.splatne).toBe(false);
    expect(r?.hotove).toBe(true);
  });
});

// Jerry, 1. 9. 2026: „napísalo mi, že nie je zapísaná únava za minulý týždeň —
// ale je zapísaná." Nebola to chyba pravidla: `weeks` bolo ešte prázdne, lebo
// panel sa otvoril skôr, než dobehol fetch.
describe("kým dáta nedobehli, pripomienka mlčí", () => {
  const DNES = new Date("2026-09-01T19:00:00Z");
  // presne to, čo v ten deň stálo v databáze
  const SKUTOCNOST = {
    "2026-08-24": { jerry_score: "7", terezka_score: "4" },
  } as Record<string, Record<string, string>>;

  it("s načítanými dátami je minulý týždeň HOTOVÝ, nie chýbajúci", () => {
    const r = ritualy(DNES, SKUTOCNOST, {}, { chybaju: [] }, { nacitane: true })
      .filter((x) => x.id.startsWith("tyzden-2026-08-24"));
    expect(r.length).toBe(2);
    expect(r.every((x) => x.hotove && !x.splatne)).toBe(true);
  });

  it("s NENAČÍTANÝMI dátami nič nevyskočí — z prázdna sa netvrdí „chýba“", () => {
    const r = ritualy(DNES, {}, {}, { chybaju: [] }, { nacitane: false });
    expect(r.filter((x) => x.druh === "tyzden").some((x) => x.splatne)).toBe(false);
    expect(r.filter((x) => x.druh === "mesiac").some((x) => x.splatne)).toBe(false);
  });

  it("prázdne dáta OZNAČENÉ ako načítané sa hlásia — vtedy je to pravda", () => {
    const r = ritualy(new Date("2026-09-05T09:00:00Z"), {}, {}, { chybaju: [] }, { nacitane: true });
    expect(r.filter((x) => x.druh === "mesiac").some((x) => x.splatne)).toBe(true);
  });
});
