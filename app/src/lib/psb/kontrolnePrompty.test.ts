import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { PROMPTY_KONTROL, promptKontroly, PROTOKOL } from "./kontrolnePrompty";

/**
 * Kontroly a ich prompty sú dva zoznamy, ktoré musia sedieť. Keby pribudla
 * piata mesačná kontrola a prompt nie, register by ponúkol tlačidlo, ktoré
 * skopíruje prázdno — presne tá trieda chyby, na ktorú tento test je.
 */
describe("prompty mesačných kontrol", () => {
  const rituals = readFileSync(new URL("./rituals.ts", import.meta.url).pathname, "utf8");
  const idcka = [...rituals.matchAll(/tyzden: \d, id: "([a-z]+)"/g)].map((m) => m[1]);

  it("každá mesačná kontrola v rituals.ts má prompt", () => {
    expect(idcka.length).toBeGreaterThan(0);
    for (const id of idcka) expect(promptKontroly(id)).not.toBeNull();
  });

  it("žiadny prompt nevisí bez kontroly", () => {
    for (const id of Object.keys(PROMPTY_KONTROL)) expect(idcka).toContain(id);
  });

  it("skopírovaný text nesie protokol aj oblasť", () => {
    const t = promptKontroly(idcka[0])!;
    expect(t).toContain(PROTOKOL);
    expect(t).toContain(PROMPTY_KONTROL[idcka[0]].nadpis);
  });

  it("neznáme id nevráti prázdny reťazec, ale null", () => {
    expect(promptKontroly("neexistuje")).toBeNull();
  });
});
