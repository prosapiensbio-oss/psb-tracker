import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Dĺžka prvej odpovede — strážca pravidla, ktoré sa inak overiť nedá.
 *
 * Odpoveď modelu naživo z testu skontrolovať nemôžeme (chce to API kľúč
 * a bežiacu appku). Skontrolovať sa DÁ zadanie: či je strop jeden, či sa
 * dá dodržať a či ho spĺňajú príklady, ktoré prompt sám uvádza ako správne.
 *
 * Prečo vety a nie slová: jazykový model slová nevidí, vidí tokeny — „spočítaj
 * si slová, kým odošleš" je pokyn, ktorý sa nedá vykonať, a rozpočet sa tým
 * mení z hranice na cieľ. Vety sú bodky a tie vidno.
 */

const KOREN = new URL("../../", import.meta.url).pathname;
const chat = readFileSync(`${KOREN}routes/api/chat.ts`, "utf8");

/** Vety v texte — bodka, otáznik alebo výkričník ukončuje vetu. */
const viet = (t: string) =>
  t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 1).length;

describe("zadanie o dĺžke prvej odpovede", () => {
  it("strop je vyjadrený vo VETÁCH, nie počítaním slov", () => {
    const blok = chat.slice(chat.indexOf("TERAZ JE PRVÁ ODPOVEĎ"), chat.indexOf("TERAZ JE PRVÁ ODPOVEĎ") + 900);
    expect(blok).toContain("PÄŤ VIET");
    // Toto bola tá chyba: pokyn, ktorý sa nedá vykonať.
    expect(blok).not.toContain("spočítaj si to");
  });

  it("príklad označený ako DOBRE strop spĺňa", () => {
    const i = chat.indexOf("DOBRE (46 slov):");
    const ukazka = chat.slice(chat.indexOf("„", i) + 1, chat.indexOf("\n", i));
    expect(viet(ukazka)).toBeLessThanOrEqual(5);
  });

  it("zlý príklad je označený počtom VIET, nie len slov", () => {
    // Ukážka v prompte je skrátená, takže sama osebe strop neporuší —
    // a bez počtu viet by pod novým pravidlom vyzerala ako vyhovujúca.
    // Príklad musí povedať, čím presne bola zlá.
    const i = chat.indexOf("ZLE (skutočná odpoveď");
    const hlavicka = chat.slice(i, chat.indexOf(":", i));
    expect(hlavicka).toContain("viet");
    expect(hlavicka).toContain("len jej začiatok");
  });

  it("ohlasovacia veta je zakázaná v OBOCH blokoch", () => {
    // Naživo 18. 8., verzia 450: odpoveď o rezerve mala šesť viet a tá
    // navyše bola „Tri veci to priamo brzdia alebo môžu naopak potiahnuť
    // nahor." — veta, ktorá neniesla nič, čo by v bodoch pod ňou nebolo.
    const i = chat.indexOf("TERAZ JE PRVÁ ODPOVEĎ");
    expect(chat.slice(i, i + 1800)).toContain("PRVÁ VETA NESIE ZÁVER");
    expect(chat).toContain("ŽIADNA OHLASOVACIA VETA");
  });

  it("príklad označený ako DOBRE ohlasovaciu vetu nemá", () => {
    const i = chat.indexOf("DOBRE (41 slov");
    const ukazka = chat.slice(chat.indexOf("„", i) + 1, chat.indexOf("\n", i));
    const prva = ukazka.split(/(?<=[.!?])\s+/)[0];
    // Prvá veta musí povedať odpoveď, nie ohlásiť zoznam.
    expect(prva).not.toMatch(/^(Tri|Dve|Štyri|Vidím|Rozpíšem)\b/);
  });

  it("odkaz sa do stropu neráta — inak by ho model vynechával", () => {
    // Adresa článku je to najužitočnejšie, čo krátka odpoveď nesie.
    expect(chat).toContain("Odkaz sa do limitu neráta");
  });
});

describe("zadanie o návrhu kampane", () => {
  it("prompt pozná tvar tokenu aj to, že sa ním kampaň nezakladá", () => {
    const i = chat.indexOf("NÁVRH KAMPANE");
    // 1200 → 1600: vysvetlenie cieľa „dopyty" sa 20. 8. 2026 predĺžilo
    // o pravdivý dôvod (CAPI Lead + málo udalostí) a účet sa posunul ďalej.
    const blok = chat.slice(i, i + 1600);
    expect(blok).toContain("⟦kampan|");
    expect(blok).toContain("POZASTAVENÁ");
    // Účet je pravidlo, nie detail — kampaň v inom účte appka nevidí.
    expect(blok).toContain("172897726151288");
  });
});
