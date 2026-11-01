import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import { terazPraha } from "./cas";
import { jeTichyCas } from "./tichyCas";

/**
 * ROZVRH PLÁNOVAČA.
 *
 * Dva behy v tej istej minúte sú ten tvar práce, ktorý 29. 8. 2026 zabil
 * workera na limite CPU. `30 * * * *` (dobeh kalendára) takto dlho sedel na
 * 3:30 a 4:30 UTC spolu s novinkami a rannou dávkou a nikto si to nevšimol,
 * lebo sa to v `wrangler.jsonc` na pohľad nedá prečítať.
 */
const koren = new URL("../../../../cron/", import.meta.url).pathname;
const config = readFileSync(`${koren}wrangler.jsonc`, "utf8");
const worker = readFileSync(`${koren}src/index.ts`, "utf8");
const crons = JSON.parse(/"crons":\s*(\[[^\]]*\])/.exec(config)![1]) as string[];

/** Rozbalí pole cronu (`*`, `*\/3`, `0-2,6-23`, `30`) na zoznam hodnôt. */
function pole(v: string, max: number): number[] {
  const von: number[] = [];
  for (const kus of v.split(",")) {
    const krok = /^\*\/(\d+)$/.exec(kus);
    const rozsah = /^(\d+)-(\d+)$/.exec(kus);
    if (kus === "*") for (let i = 0; i < max; i++) von.push(i);
    else if (krok) for (let i = 0; i < max; i += Number(krok[1])) von.push(i);
    else if (rozsah) for (let i = Number(rozsah[1]); i <= Number(rozsah[2]); i++) von.push(i);
    else von.push(Number(kus));
  }
  return von;
}
/** Minúty dňa (UTC), v ktorých výraz vystrelí. */
const minuty = (c: string): number[] => {
  const [m, h] = c.split(" ");
  return pole(h, 24).flatMap((hod) => pole(m, 60).map((min) => hod * 60 + min));
};

describe("rozvrh plánovača", () => {
  it("žiadne dva behy v tej istej minúte", () => {
    const kde = new Map<number, string>();
    const kolizie: string[] = [];
    for (const c of crons) for (const t of minuty(c)) {
      if (kde.has(t)) kolizie.push(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} ${kde.get(t)} + ${c}`);
      kde.set(t, c);
    }
    expect(kolizie).toEqual([]);
  });

  it("poradie závislých behov platí: banka a reklamy pred rannou dávkou", () => {
    const min = (c: string) => minuty(c)[0];
    expect(min("10 4 * * *")).toBeLessThan(min("20 4 * * *"));
    expect(min("20 4 * * *")).toBeLessThan(min("30 4 * * *"));
    expect(min("30 4 * * *")).toBeLessThan(min("30 5 * * *"));
    for (const c of ["30 4 * * *", "30 5 * * *"]) expect(min(c)).toBeLessThan(min("45 6 * * *"));
  });

  it("každý spúšťač má vo workeri vetvu — inak by padol do snímky kalendára", () => {
    for (const c of crons) {
      if (c === "0 */3 * * *") continue; // Trojhodinový plán je záverečná vetva bez podmienky.
      expect(worker).toContain(`"${c}"`);
    }
  });

  it("v `fetch` nie je dvakrát ten istý parameter — druhá vetva by bola mŕtva", () => {
    const vetvy = [...worker.matchAll(/if \(q\.get\("(\w+)"\) === "1"\)/g)].map((m) => m[1]);
    expect(new Set(vetvy).size).toBe(vetvy.length);
    expect(vetvy).toContain("pushbeh");
  });

  it("strážca výberov, ktorý môže zazvoniť, beží po nočnom tichu v lete aj v zime", () => {
    for (const den of ["2026-07-10", "2026-12-10"]) {
      expect(jeTichyCas(new Date(`${den}T06:45:00Z`))).toBe(false);
    }
    expect(terazPraha(new Date("2026-12-10T06:45:00Z")).slice(11)).toBe("07:45");
  });

  it("worker nemá verejnú adresu", () => {
    expect(config).toContain('"workers_dev": false');
    expect(config).toContain('"preview_urls": false');
  });
});
