// STRÁŽ MIGRÁCIÍ PRI KAŽDOM BUILDE — aj pri automatickom nasadení po pushi.
//
// Workers Builds nasadí každý push na main (bun run build → wrangler deploy)
// a stráž z nasad.sh pritom nebeží: kód, ktorý potrebuje novú tabuľku, by šiel
// von skôr, než ju niekto v D1 založil, a appka by ticho padala (rozbor 1. 11.
// 2026). Build sa databázy pýtať nemôže (nemá k nej kľúč), preto evidencia
// v repe: migrations/aplikovane.txt zapisuje `nasad.sh --migracia-hotova`.
// Súbor .sql, ktorý v nej chýba, build zastaví — nič sa nenasadí.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const evidencia = new Set(
  readFileSync(join(dir, "aplikovane.txt"), "utf8").split("\n").map((r) => r.trim()).filter((r) => r && !r.startsWith("#")),
);
const chybaju = readdirSync(dir).filter((f) => f.endsWith(".sql") && !evidencia.has(f)).sort();
if (chybaju.length) {
  console.error("✗ Stráž migrácií: tieto migrácie nie sú zapísané ako aplikované v ostrej D1:");
  for (const f of chybaju) console.error(`    ${f}`);
  console.error("  Aplikuj: wrangler d1 execute psb-tracker-db --remote --config wrangler.jsonc --file migrations/<súbor>");
  console.error("  Potom:   ./scripts/nasad.sh --migracia-hotova <súbor>  (zapíše do DB aj do migrations/aplikovane.txt)");
  console.error("  a commitni migrations/aplikovane.txt spolu s kódom.");
  process.exit(1);
}
console.log(`✓ stráž migrácií: ${evidencia.size} aplikovaných, priečinok sedí`);
