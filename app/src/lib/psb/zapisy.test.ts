import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Čo sa dá UPRAVIŤ, musí sa dať aj ZALOŽIŤ.
 *
 * PREČO TENTO TEST EXISTUJE
 *
 * 24. 8. 2026 som štyrikrát za jeden deň pridal stĺpec do UPDATE a zabudol ho
 * v INSERT: hotovy_text, zaber, dvojica scenar + sekvencia, a poznamka.
 * Zakaždým to dopadlo rovnako — obrazovka hodnotu poslala, SQLite ju ticho
 * zahodila (chýbajúci stĺpec v INSERTe nie je chyba) a appka ohlásila
 * „uložené" nad stratou. Testy boli zelené, TypeScript spokojný, a našlo sa to
 * len tým, že som si to zakaždým overil v databáze.
 *
 * Toto je jediný druh chyby z celého dňa, ktorý sa dá zachytiť staticky:
 * porovnať zoznamy stĺpcov v tom istom súbore.
 *
 * KEĎ TEST SPADNE
 *
 * Buď stĺpec do INSERTu dopíš (obvyklý prípad), alebo ho pridaj do VYNIMKY
 * aj s dôvodom. Nič netreba obchádzať potichu — zoznam výnimiek je krátky
 * a každá v ňom má vetu, prečo tam patrí.
 */

/** Stĺpce, ktoré sa zámerne zapisujú až neskôr, nie pri vzniku riadku. */
const VYNIMKY: Record<string, Record<string, string>> = {
  jarvis_dokumenty: {
    zmazane_at: "mäkké mazanie — pri vzniku dokument zmazaný nie je",
  },
  jarvis_zavery: {
    vysledok: "vyhodnotenie záveru prichádza až po termíne overenia",
  },
  ig_prispevky: {
    faza: "príspevky zakladá import z Instagramu; fázu priraďuje človek neskôr",
  },
  mkt_napady: {
    pouzite_at: "deň použitia sa zapisuje pri prechode na „použitý“, nie pri vzniku",
    odkaz: "adresa hotového príspevku existuje až keď obsah vyjde",
  },
  // Dvojfázový zápis: sitemap založí riadok s adresou, obsah stránky sa
  // dopĺňa až pri jej načítaní. Do INSERTu tieto stĺpce nepatria — v tej
  // chvíli sa stránka ešte nečítala a prázdny text by sa nedal odlíšiť od
  // stránky, ktorá je naozaj prázdna.
  web_stranky: {
    h1: "obsah stránky je známy až po jej načítaní, nie zo sitemapy",
    meta_popis: "obsah stránky je známy až po jej načítaní, nie zo sitemapy",
    nacitane_at: "kedy sa stránka čítala — pri založení sa ešte nečítala",
    text: "obsah stránky je známy až po jej načítaní, nie zo sitemapy",
    titulok: "obsah stránky je známy až po jej načítaní, nie zo sitemapy",
    znakov: "dĺžka textu vzniká až s textom samotným",
  },
};

/** SQL žije v reťazcoch — mimo nich by sa chytal bežný JavaScript. */
function retazce(zdroj: string): string[] {
  const out: string[] = [];
  const re = /`([^`]*)`|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(zdroj))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

function zapisyVSubore(zdroj: string) {
  const ins = new Set<string>();
  const upd = new Set<string>();
  for (const lit of retazce(zdroj)) {
    if (!/\b(INSERT|UPDATE)\b/i.test(lit)) continue;
    for (const m of lit.matchAll(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)\s*\(([^)]*)\)/gis)) {
      for (const c of m[2].split(",")) {
        const s = c.trim().replace(/[`"]/g, "");
        if (/^\w+$/.test(s)) ins.add(`${m[1]}.${s}`);
      }
    }
    for (const m of lit.matchAll(/UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:\bWHERE\b|$)/gi)) {
      for (const c of m[2].matchAll(/(?:^|,)\s*(\w+)\s*=/g)) {
        if (!/^(case|when|then|else|end)$/i.test(c[1])) upd.add(`${m[1]}.${c[1]}`);
      }
    }
  }
  return { ins, upd };
}

function subory(): { meno: string; zdroj: string }[] {
  const out: { meno: string; zdroj: string }[] = [];
  const apiDir = join(import.meta.dir, "../../routes/api");
  for (const f of readdirSync(apiDir)) {
    if (f.endsWith(".ts")) out.push({ meno: `api/${f}`, zdroj: readFileSync(join(apiDir, f), "utf8") });
  }
  out.push({ meno: "db.server.ts", zdroj: readFileSync(join(import.meta.dir, "db.server.ts"), "utf8") });
  return out;
}

describe("čo sa dá upraviť, musí sa dať aj založiť", () => {
  const vsetky = subory();

  it("nájde vôbec nejaké zápisy — inak by test bol zelený omylom", () => {
    const spolu = vsetky.reduce((n, s) => n + zapisyVSubore(s.zdroj).ins.size, 0);
    expect(spolu).toBeGreaterThan(30);
  });

  for (const { meno, zdroj } of vsetky) {
    const { ins, upd } = zapisyVSubore(zdroj);
    const tabulky = new Set([...ins].map((x) => x.split(".")[0]));
    const chybajuce = [...upd].filter((x) => {
      const [tab, stlpec] = x.split(".");
      if (!tabulky.has(tab)) return false;      // súbor tabuľku nezakladá, len upravuje
      if (ins.has(x)) return false;
      return VYNIMKY[tab]?.[stlpec] === undefined;
    });

    it(`${meno}: každý upraviteľný stĺpec je aj v INSERT`, () => {
      expect({ subor: meno, chybaVInsert: chybajuce.sort() })
        .toEqual({ subor: meno, chybaVInsert: [] });
    });
  }

  it("zoznam výnimiek nezhnije — každá má dôvod", () => {
    const bezDovodu: string[] = [];
    for (const [tab, stlpce] of Object.entries(VYNIMKY)) {
      for (const [stlpec, dovod] of Object.entries(stlpce)) {
        // Krátky text nie je dôvod. „to isté" tento test raz sám zachytil —
        // presne preto, aby zoznam výnimiek nezhnil na zoznam kódov.
        if (dovod.trim().length < 25) bezDovodu.push(`${tab}.${stlpec}`);
      }
    }
    expect(bezDovodu).toEqual([]);
  });
});
