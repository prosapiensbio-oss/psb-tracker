import { describe, expect, it } from "bun:test";

import { typZNazvu } from "./kalendar";

describe("typ z názvu udalosti", () => {
  it("úvodný spozná bez ohľadu na diakritiku a pravopis", () => {
    for (const n of [
      "Úvodní trénink — Jana",
      "úvodný tréning Peter",
      "uvodny Novak",
      "ÚVODNÍ TRÉNINK 9:00",
      "Jana K. – úvodní",
    ]) expect(typZNazvu(n)).toBe("uvodny");
  });

  it("Guillermo tiež", () => {
    expect(typZNazvu("Guillermo call")).toBe("guillermo");
  });

  it("bežný tréning sa NEuhádne — vráti sa otázka, nie dohad", () => {
    // `null` znamená „spýtaj sa". Predpokladať tréning by znamenalo, že sa
    // súkromná udalosť ticho započíta do kapacity.
    expect(typZNazvu("Jakub Gerich")).toBe(null);
    expect(typZNazvu("zubár")).toBe(null);
    expect(typZNazvu("")).toBe(null);
    expect(typZNazvu("   ")).toBe(null);
  });

  it("meno klienta sa z názvu nehádа — na to je človek", () => {
    // Funkcia vracia len typ. Zlé priradenie človeka je horšie než žiadne:
    // sedenie by sa pripísalo cudziemu.
    expect(typeof typZNazvu("Úvodní trénink — Jana")).toBe("string");
  });
});
