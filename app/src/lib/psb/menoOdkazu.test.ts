import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { menoOdkazu } from "./odkazy";

const KOREN = new URL("../../", import.meta.url).pathname;
const chat = readFileSync(`${KOREN}routes/api/chat.ts`, "utf8");

describe("menoOdkazu", () => {
  it("bez zvislice je zobrazené meno aj kľúč to isté", () => {
    expect(menoOdkazu("Richard Matl")).toEqual({ text: "Richard Matl", meno: "Richard Matl" });
  });

  it("so zvislicou zobrazí pád a odkáže na meno z dát", () => {
    // Presne to, čo 18. 8. chýbalo: „tréning s Richardom Matlom" a klik na Matla.
    expect(menoOdkazu("Richardom Matlom|Richard Matl"))
      .toEqual({ text: "Richardom Matlom", meno: "Richard Matl" });
  });

  it("medzery okolo zvislice nerozbijú hľadanie klienta", () => {
    expect(menoOdkazu("Jakuba Štiguta | Jakub Štigut").meno).toBe("Jakub Štigut");
  });

  it("prázdny vstup nevyrobí odkaz na prázdno", () => {
    expect(menoOdkazu("")).toEqual({ text: "", meno: "" });
  });
});

describe("zadanie o menách a bodkočiarke", () => {
  it("prompt žiada skloňovanie a ukazuje ako", () => {
    const i = chat.indexOf("MENÁ KLIENTOV");
    const blok = chat.slice(i, i + 900);
    expect(blok).toContain("V PÁDE, KTORÝ VETA ŽIADA");
    expect(blok).toContain("|Richard Matl»");
    // Zlý príklad musí byť napísaný doslova. Bez neho pravidlo prehralo
    // so susednou vetou „meno presne ako v dátach" (overené naživo 18. 8.).
    expect(blok).toContain("ZLE: \u201eZačni s «Veronika Stoklaskova».");
  });

  it("bodkočiarka je v prvej odpovedi ZAKÁZANÁ, nie odporúčaná", () => {
    // Naživo 18. 8.: druhá veta mala 47 slov a dve bodkočiarky, formálne
    // to boli tri vety. Pravidlo vtedy existovalo, ale ako poznámka na konci.
    const i = chat.indexOf("TERAZ JE PRVÁ ODPOVEĎ");
    const blok = chat.slice(i, i + 1400);
    expect(blok).toContain("NEPOUŽI BODKOČIARKU");
    expect(blok).toContain("zákaz");
  });

  it("príklady označené ako DOBRE bodkočiarku neobsahujú", () => {
    for (const m of chat.matchAll(/DOBRE[^:]*:\s*„([^"]{10,400})"/g)) {
      expect(m[1]).not.toContain(";");
    }
  });
});
