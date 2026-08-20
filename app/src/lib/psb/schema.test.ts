import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Schéma, ktorú dostáva Jarvis, proti skutočnej databáze.
 *
 * `SCHEMA_DB` v chat.ts je RUČNE PÍSANÁ KÓPIA — Jarvis má SQL prístup, ale
 * nevie sa spýtať na to, o čom nevie. Keď v nej stĺpec chýba, odpovie
 * „nevidím", hoci dáta sú (stalo sa pri preco_neprisiel aj web_stranky).
 * A keď v nej stĺpec je, ale v databáze nie, jeho dopyt spadne.
 *
 * Test číta migrácie (CREATE TABLE + ALTER TABLE ADD COLUMN) a porovnáva ich
 * s tým, čo je napísané Jarvisovi. Nekontroluje opačný smer: stĺpce ako
 * `dedup_key` alebo `updated_at` sú vodovod, ktorý Jarvisa nezaujíma.
 */

const KOREN = new URL("../../../", import.meta.url).pathname;

/** Stĺpce podľa migrácií — prehrané v poradí, vrátane neskorších ALTER. */
function stlpceZMigracii(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  const subory = readdirSync(`${KOREN}migrations`).filter((f) => f.endsWith(".sql")).sort();
  for (const f of subory) {
    const sql = readFileSync(`${KOREN}migrations/${f}`, "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      const tab = m[1].toLowerCase();
      const telo = m[2];
      const set = (out[tab] ||= new Set());
      // Riadky definícií; preskoč obmedzenia (PRIMARY KEY (…), UNIQUE (…)).
      for (const riadok of telo.split("\n")) {
        const r = riadok.trim();
        const meno = /^["`]?(\w+)["`]?\s+\w/.exec(r)?.[1];
        if (!meno) continue;
        if (/^(primary|unique|foreign|check|constraint)$/i.test(meno)) continue;
        set.add(meno.toLowerCase());
      }
    }
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+ADD\s+(?:COLUMN\s+)?["`]?(\w+)["`]?/gi)) {
      (out[m[1].toLowerCase()] ||= new Set()).add(m[2].toLowerCase());
    }
    // Premenovanie stĺpca. Bez tohto by test tvrdil, že nový názov v databáze
    // neexistuje a starý áno — presne naopak, než ako to po migrácii je
    // (mkt_reklamy.videnia3s → videnia2s, 19. 8. 2026).
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+RENAME\s+(?:COLUMN\s+)?["`]?(\w+)["`]?\s+TO\s+["`]?(\w+)["`]?/gi)) {
      const set = (out[m[1].toLowerCase()] ||= new Set());
      set.delete(m[2].toLowerCase());
      set.add(m[3].toLowerCase());
    }
  }
  return out;
}

/** Čo je napísané Jarvisovi: „tabulka(stlpec, stlpec, …)". */
function stlpceZoSchemy(): Record<string, string[]> {
  const chat = readFileSync(`${KOREN}src/routes/api/chat.ts`, "utf8");
  const i = chat.indexOf("const SCHEMA_DB");
  const schema = chat.slice(i, chat.indexOf("`;", i));
  const out: Record<string, string[]> = {};
  // Oddeľovače: začiatok šablóny (`), nový riadok alebo „ · " — tabuľky sú
  // v texte písané aj po dvoch na riadok (gsc_dopyty · gsc_strany).
  for (const m of schema.matchAll(/(?:^|\n|`|·\s)(\w+)\(([^)]+)\)/g)) {
    const stlpce = m[2].split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^\w+$/.test(x));
    if (stlpce.length) out[m[1].toLowerCase()] = stlpce;
  }
  return out;
}

const MIGRACIE = stlpceZMigracii();
const SCHEMA = stlpceZoSchemy();

describe("SCHEMA_DB pre Jarvisa", () => {
  it("migrácie sa dajú prečítať", () => {
    expect(Object.keys(MIGRACIE).length).toBeGreaterThan(20);
    expect(MIGRACIE.sessions?.has("client_name")).toBe(true);
  });

  it("schéma sa dá prečítať", () => {
    expect(Object.keys(SCHEMA).length).toBeGreaterThan(15);
  });

  it("každý stĺpec, ktorý Jarvis dostane, v databáze existuje", () => {
    const chyby: string[] = [];
    for (const [tab, stlpce] of Object.entries(SCHEMA)) {
      const skutocne = MIGRACIE[tab];
      // Tabuľku, ktorú migrácie nepoznajú, tento test nekontroluje — môže
      // vzniknúť inak (napr. _cf_KV). Chýbajúca tabuľka je vlastný nález.
      if (!skutocne) continue;
      for (const c of stlpce) {
        if (!skutocne.has(c)) chyby.push(`${tab}.${c} — Jarvis ho dostane, v migráciách nie je`);
      }
    }
    expect(chyby).toEqual([]);
  });

  it("tabuľky, ktoré Jarvis pozná, v migráciách existujú", () => {
    const chyba = Object.keys(SCHEMA).filter((t) => !MIGRACIE[t]);
    expect(chyba).toEqual([]);
  });
});
