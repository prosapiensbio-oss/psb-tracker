import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

/**
 * KAŽDÝ STĹPEC S MENOM KLIENTA MUSÍ PREMENOVANIE POZNAŤ.
 *
 * `/api/premenuj` mení meno v zozname tabuliek. Dvakrát mu chýbali tie, čo
 * pribudli neskôr (21. 10. 2026 sedemnásť, 8. 11. 2026 štyri) — premenovaný
 * klient by tam ostal pod starým menom a nikto by to nevidel. Test číta
 * migrácie a hľadá stĺpce `klient` a `client_name`; nová tabuľka bez riadku
 * v `premenuj.ts` ho zhodí. Ak meno klienta naozaj nenesie, patrí do VYNIMKY
 * aj s dôvodom.
 */
const VYNIMKY: Record<string, string> = {
  "vzas_audit.klient": "audit sa neprepisuje — je to záznam toho, čo sa stalo pod vtedajším menom",
  "kal_mapovanie_nove.klient": "dočasná tabuľka migrácie, premenuje sa na kal_mapovanie (tá v zozname je)",
};

const app = join(import.meta.dir, "../../..");
const premenuj = readFileSync(join(app, "src/routes/api/premenuj.ts"), "utf8");
const zname = new Set([...premenuj.matchAll(/tab:\s*"([a-z_0-9]+)",\s*stlpec:\s*"([a-z_0-9]+)"/g)].map((m) => `${m[1]}.${m[2]}`));
// fakturacne_kontakty.klient je zoznam mien, premenuj ho rieši vlastnou funkciou.
if (/kontaktySMenom/.test(premenuj)) zname.add("fakturacne_kontakty.klient");

function stlpceSMenom(): string[] {
  const out = new Set<string>();
  for (const f of readdirSync(join(app, "migrations")).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(join(app, "migrations", f), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_0-9]+)\s*\(([\s\S]*?)\n\);?/gi)) {
      for (const c of m[2].matchAll(/(?:^|,)\s*(klient|client_name)\s+TEXT/gim)) out.add(`${m[1]}.${c[1]}`);
    }
    for (const m of sql.matchAll(/ALTER TABLE\s+([a-z_0-9]+)\s+ADD COLUMN\s+(klient|client_name)\b/gi)) out.add(`${m[1]}.${m[2]}`);
  }
  return [...out].sort();
}

describe("premenovanie pozná všetky tabuľky s menom klienta", () => {
  it("žiadny stĺpec klient / client_name mimo zoznamu", () => {
    const chyba = stlpceSMenom().filter((x) => !zname.has(x) && !(x in VYNIMKY));
    expect(chyba).toEqual([]);
  });
});
