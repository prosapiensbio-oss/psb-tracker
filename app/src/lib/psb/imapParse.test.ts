import { describe, expect, it } from "bun:test";

import { uidValidity, vyberUidy } from "./imapParse";

const rad = (od: number, po: number) => Array.from({ length: po - od + 1 }, (_, i) => String(od + i));

describe("vyberUidy — správy navyše sa nestratia", () => {
  it("keď sa nové zmestia, berie sa posledných `limit` ako doteraz", () => {
    const v = vyberUidy(rad(1, 100), 40, 90);
    expect(v.vybrane).toEqual(rad(61, 100));
    expect(v.zostava).toBe(0);
    expect(v.novyKurzor).toBe(100);
  });
  it("keď ich je viac než limit, ide sa od najstaršej neprečítanej", () => {
    const v = vyberUidy(rad(1, 100), 40, 10);
    expect(v.vybrane).toEqual(rad(11, 50));
    expect(v.zostava).toBe(50);
    expect(v.novyKurzor).toBe(50);
  });
  it("po sebe idúce behy prečítajú všetko a nič dvakrát navyše", () => {
    const videne = new Set<string>();
    let kurzor = 0;
    for (let beh = 0; beh < 5; beh++) {
      const v = vyberUidy(rad(1, 130), 40, kurzor);
      v.vybrane.forEach((u) => videne.add(u));
      kurzor = v.novyKurzor;
    }
    expect(videne.size).toBe(130);
    expect(kurzor).toBe(130);
  });
  it("žiadna nová správa: kurzor stojí, posledné sa prečítajú znova (panel v Údajoch)", () => {
    const v = vyberUidy(rad(1, 19), 40, 19);
    expect(v.vybrane).toEqual(rad(1, 19));
    expect(v.novyKurzor).toBe(19);
    expect(v.zostava).toBe(0);
  });
  it("prázdne hľadanie kurzor neposunie späť", () => {
    expect(vyberUidy([], 40, 77)).toEqual({ vybrane: [], zostava: 0, novyKurzor: 77 });
  });
  it("UID sa radia číselne, nie ako text", () => {
    expect(vyberUidy(["100", "9", "10"], 2, 0).vybrane).toEqual(["9", "10"]);
  });
});

describe("uidValidity", () => {
  it("nájde číslo v odpovedi SELECT", () => {
    expect(uidValidity("* FLAGS (\\Seen)\r\n* OK [UIDVALIDITY 1712345] UIDs valid\r\nk2 OK [READ-WRITE] done\r\n")).toBe("1712345");
    expect(uidValidity("k2 OK done\r\n")).toBe("");
  });
});
