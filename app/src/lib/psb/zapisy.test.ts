import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Tichý zápis — strážca proti návratu starej chyby.
 *
 * `precoNeprisiel` (13. 8. 2026) sa uložilo optimisticky do obrazovky, server
 * ho odmietol a nikto sa to nedozvedel: Jerry vypisoval dôvody celý večer do
 * niečoho, čo len vyzeralo funkčne. Revízia 18. 8. našla ten istý vzor na
 * dvadsiatich miestach.
 *
 * Test nekontroluje každé volanie — to by bol regexový hlavolam. Kontroluje
 * DVE veci, ktoré sa dajú overiť spoľahlivo:
 *   1. ukladacie funkcie v client.ts vracajú úspech, nie `void`,
 *   2. žiadna z nich nepolyká chybu cez `catch { }` bez návratovej hodnoty.
 */

const KOREN = new URL("../../", import.meta.url).pathname;
const client = readFileSync(`${KOREN}lib/psb/client.ts`, "utf8");

/** Funkcie, ktoré niečo ZAPISUJÚ — poznajú sa podľa mena. */
const ZAPISOVE = /export async function (save\w+|uloz\w+|set\w+|delete\w+|vyhodnot\w+|premenuj\w+)\s*\(/g;

describe("ukladacie funkcie hlásia výsledok", () => {
  const najdene = [...client.matchAll(ZAPISOVE)].map((m) => m[1]);

  it("nejaké vôbec existujú (regex sa nerozišiel so súborom)", () => {
    expect(najdene.length).toBeGreaterThan(5);
  });

  it("žiadna nevracia void", () => {
    const zle: string[] = [];
    for (const meno of najdene) {
      const i = client.indexOf(`export async function ${meno}`);
      const hlavicka = client.slice(i, client.indexOf("{", client.indexOf(")", i)));
      if (/:\s*Promise<void>/.test(hlavicka)) zle.push(meno);
    }
    expect(zle).toEqual([]);
  });

  it("žiadna neprehltne chybu bez toho, aby vrátila false", () => {
    const zle: string[] = [];
    for (const meno of najdene) {
      const i = client.indexOf(`export async function ${meno}`);
      const koniec = client.indexOf("\nexport ", i + 10);
      const telo = client.slice(i, koniec > 0 ? koniec : client.length);
      // `catch { /* … */ }` bez `return` je presne ten tichý zápis.
      for (const m of telo.matchAll(/catch\s*(?:\([^)]*\))?\s*\{([^}]*)\}/g)) {
        if (!/return/.test(m[1])) zle.push(`${meno}: catch bez return`);
      }
    }
    expect(zle).toEqual([]);
  });
});

describe("optimistický zápis do klienta má návratku", () => {
  it("setOverride v App.tsx vracia hodnotu späť, keď server odmietne", () => {
    const app = readFileSync(`${KOREN}components/psb/App.tsx`, "utf8");
    const i = app.indexOf("setOverride: async (name, key, value)");
    const telo = app.slice(i, app.indexOf("\n      ingest:", i));
    expect(telo).toContain("const ok = await saveOverride");
    // Bez tejto vetvy by pole zostalo prepísané na obrazovke a po reloade
    // bolo prázdne — presne prípad z 13. 8.
    expect(telo).toContain("if (!ok)");
    expect(telo).toContain("setChybaZapisu");
  });
});
