import { SKRYTE, TAJNE_KLUCE, VZORY_TAJNYCH } from "./tajneKluce";

/**
 * STRÁŽ NÁSTROJA `dopyt_db` — Jarvis smie len čítať a nesmie vidieť tajomstvá.
 *
 * Zakázať tabuľku podľa textu dopytu sa nedá spoľahlivo (`SELECT *`, poddopyty,
 * UNION, komentáre) a zakázať celý `vzas_audit` by Jarvisovi vzalo otázku
 * „kto čo zmenil". Preto sa citlivé tabuľky ZATIENIA: pred dopyt sa pridá CTE
 * s rovnakým menom a v ňom tajomstvá nie sú. Nech je dopyt napísaný akokoľvek,
 * nekvalifikované meno v SQLite vždy nájde CTE a skutočnú tabuľku nevidí.
 *
 *   vzas_settings → bez tajných kľúčov (ciele, cenník a pod. ostávajú)
 *   vzas_audit    → pri tajných kľúčoch `[skryté]`, inak bez zmeny
 *   users         → bez hesiel
 *
 * K skutočnej tabuľke vedie jediná cesta: `main.meno`. Identifikátor sa v SQL
 * nedá poskladať ani rozdeliť komentárom, takže text `meno` tam byť musí —
 * preto stačí odmietnuť bodku pred ním (aj s medzerami, komentárom, úvodzovkami).
 */
const ZOZNAM = TAJNE_KLUCE.map((k) => `'${k}'`).join(",");
const JE_TAJNY = (stlpec: string) =>
  `(${stlpec} IN (${ZOZNAM}) OR ${VZORY_TAJNYCH.map((v) => `instr(${stlpec},'${v}')>0`).join(" OR ")})`;
const SKRY = (stlpec: string) =>
  `CASE WHEN ${stlpec} IS NOT NULL AND ${JE_TAJNY("payment_id")} THEN '${SKRYTE}' ELSE ${stlpec} END AS ${stlpec}`;

const TIENE: Record<string, string> = {
  vzas_settings: `SELECT key, value, updated_at FROM main.vzas_settings WHERE NOT ${JE_TAJNY("key")}`,
  vzas_audit: `SELECT id, at, actor, action, payment_id, month, ${SKRY("old_value")}, ${SKRY("new_value")}, reason FROM main.vzas_audit`,
  users: "SELECT login, name, active, created_at, last_login FROM main.users",
};

const MENA = Object.keys(TIENE).join("|");
const KVALIFIKOVANE = new RegExp(`\\.(?:\\s|/\\*[\\s\\S]*?\\*/|--[^\\n]*(?:\\n|$))*["\`\\[]?(?:${MENA})\\b`, "i");

/** Guard: pustíme len čítanie. Nič iné sa cez tento nástroj nedostane. */
export function bezpecnySql(raw: string): { sql: string } | { chyba: string } {
  const sql = raw.trim().replace(/;+\s*$/, "");
  if (!/^\s*(select|with)\b/i.test(sql)) return { chyba: "Povolený je len SELECT alebo WITH." };
  if (sql.includes(";")) return { chyba: "Len jeden dopyt, bez stredníkov." };
  if (/\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum)\b/i.test(sql))
    return { chyba: "Zápisové a DDL príkazy nie sú povolené — na zmenu dát použi psb-action blok." };
  if (KVALIFIKOVANE.test(sql)) return { chyba: "Tabuľky vzas_settings, vzas_audit a users sa čítajú bez predpony (main.)." };

  const tiene = Object.keys(TIENE)
    .filter((t) => new RegExp(`\\b${t}\\b`, "i").test(sql))
    .map((t) => `${t} AS (${TIENE[t]})`);
  let vysledok = sql;
  if (tiene.length) {
    const hlava = /^\s*with\b(\s+recursive\b)?/i.exec(sql);
    vysledok = hlava
      ? `WITH${hlava[1] ? " RECURSIVE" : ""} ${tiene.join(", ")}, ${sql.slice(hlava[0].length)}`
      : `WITH ${tiene.join(", ")} ${sql}`;
  }
  return { sql: /\blimit\s+\d+/i.test(sql) ? vysledok : `${vysledok} LIMIT 200` };
}
