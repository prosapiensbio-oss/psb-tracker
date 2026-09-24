import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";

import { oznam, pocuvaj, type Oblast } from "./obnovaSignal";

describe("signál obnovy", () => {
  it("oznámenie dôjde tomu, kto počúva danú oblasť", () => {
    let n = 0;
    const stop = pocuvaj("peniaze", () => { n++; });
    oznam("peniaze");
    expect(n).toBe(1);
    stop();
  });

  it("oblasti sa nemiešajú", () => {
    let peniaze = 0, kalendar = 0;
    const a = pocuvaj("peniaze", () => { peniaze++; });
    const b = pocuvaj("kalendar", () => { kalendar++; });
    oznam("kalendar");
    expect(peniaze).toBe(0);
    expect(kalendar).toBe(1);
    a(); b();
  });

  it("odhlásený poslucháč už nedostane nič", () => {
    let n = 0;
    pocuvaj("zapisy", () => { n++; })();
    oznam("zapisy");
    expect(n).toBe(0);
  });

  it("jeden pokazený poslucháč nezhodí ostatných", () => {
    // Inak by výnimka v jednej obrazovke umlčala obnovu všetkých ostatných.
    let dobry = 0;
    const a = pocuvaj("klienti", () => { throw new Error("zle"); });
    const b = pocuvaj("klienti", () => { dobry++; });
    oznam("klienti");
    expect(dobry).toBe(1);
    a(); b();
  });

  it("každá oblasť, ktorú appka oznamuje, má v App poslucháča", () => {
    // Stráž proti pridaniu oblasti, ktorú nikto nespracuje — zápis by sa
    // zase potichu nikam nepremietol.
    // Poslucháč nemusí byť v App — marketingové obrazovky si oblasť
    // „marketing" odoberajú samy. Hľadá sa preto naprieč komponentmi.
    const kde = ["App.tsx", "MapaCyklu.tsx", "PlanMarketingu.tsx"]
      .map((f) => readFileSync(`${import.meta.dir}/../../components/psb/${f}`, "utf8"))
      .join("\n");
    const oblasti: Oblast[] = ["peniaze", "kalendar", "zapisy", "klienti", "marketing"];
    const bezPosluchaca = oblasti.filter((o) => !kde.includes(`pocuvaj("${o}"`));
    expect(bezPosluchaca).toEqual([]);
  });
});
