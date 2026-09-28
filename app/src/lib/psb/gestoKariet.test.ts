import { describe, expect, it } from "bun:test";

import { koniecSvihu, krokGesta, novyStavGesta, novyStavSvihu, zacniSvih, type StavGesta } from "./gestoKariet";

/** Jedno šmyknutie: niekoľko udalostí rýchlo po sebe. */
function smyk(g: StavGesta, dx: number, od: number, kusov = 4): { smer: number; cas: number } {
  let smer = 0;
  let cas = od;
  for (let n = 0; n < kusov; n++) {
    cas += 16;
    const v = krokGesta(g, { deltaX: dx / kusov, deltaY: 0, cas });
    if (v) smer = v;
  }
  return { smer, cas };
}

/** Dozvuk zotrvačnosti: veľké hodnoty, ktoré rýchlo slabnú. */
function dozvuk(g: StavGesta, od: number, dx = 40): number {
  let cas = od;
  let v = dx;
  while (v > 0.4) {
    cas += 16;
    krokGesta(g, { deltaX: v, deltaY: 0, cas });
    v *= 0.85;
  }
  return cas;
}

describe("gesto dvoma prstami", () => {
  it("šmyknutie doprava prepne o kartu ďalej", () => {
    expect(smyk(novyStavGesta(), 100, 1000).smer).toBe(1);
  });

  it("šmyknutie doľava prepne späť", () => {
    expect(smyk(novyStavGesta(), -100, 1000).smer).toBe(-1);
  });

  it("jedno šmyknutie prepne práve jednu kartu", () => {
    const g = novyStavGesta();
    let prepnuti = 0;
    let cas = 1000;
    for (let n = 0; n < 12; n++) { cas += 16; if (krokGesta(g, { deltaX: 25, deltaY: 0, cas })) prepnuti++; }
    expect(prepnuti).toBe(1);
  });

  it("dozvuk po prepnutí neprepne druhýkrát", () => {
    const g = novyStavGesta();
    const prve = smyk(g, 100, 1000);
    expect(prve.smer).toBe(1);
    let navyse = 0;
    let cas = prve.cas;
    let v = 40;
    while (v > 0.4) { cas += 16; if (krokGesta(g, { deltaX: v, deltaY: 0, cas })) navyse++; v *= 0.85; }
    expect(navyse).toBe(0);
  });

  it("DRUHÉ šmyknutie funguje — to je tá chyba, ktorú Jerry našiel", () => {
    // Stará verzia púšťala zámok až po úplnom tichu, takže druhé gesto počas
    // dozvuku zámok len predĺžilo a nikdy sa nepustil.
    const g = novyStavGesta();
    expect(smyk(g, 100, 1000).smer).toBe(1);
    const po = dozvuk(g, 1100);
    expect(smyk(g, 100, po + 200).smer).toBe(1);
  });

  it("šmyknúť sa dá aj päťkrát za sebou", () => {
    const g = novyStavGesta();
    let cas = 1000;
    for (let n = 0; n < 5; n++) {
      const v = smyk(g, 100, cas);
      expect(v.smer).toBe(1);
      cas = dozvuk(g, v.cas) + 200;
    }
  });

  it("zvislé rolovanie kartu neprepne", () => {
    const g = novyStavGesta();
    let cas = 1000;
    for (let n = 0; n < 20; n++) { cas += 16; expect(krokGesta(g, { deltaX: 3, deltaY: 40, cas })).toBe(0); }
  });

  it("pomalé tápanie pod prahom neprepne nič", () => {
    const g = novyStavGesta();
    let cas = 1000;
    for (let n = 0; n < 6; n++) { cas += 400; expect(krokGesta(g, { deltaX: 8, deltaY: 0, cas })).toBe(0); }
  });
});

describe("švihnutie prstom", () => {
  const svih = (dx: number, dy: number, ms = 200, sirka = 375) => {
    const s = novyStavSvihu();
    zacniSvih(s, 200, 400, 1000);
    return koniecSvihu(s, 200 + dx, 400 + dy, 1000 + ms, sirka);
  };

  it("ťah doľava ide na ďalšiu kartu, doprava na predchádzajúcu", () => {
    expect(svih(-120, 5)).toBe(1);
    expect(svih(120, 5)).toBe(-1);
  });

  it("rolovanie prstom kartu neprepne", () => {
    // Zvislý pohyb s malým bočným šmykom je bežný pri čítaní zoznamu.
    expect(svih(-60, 200)).toBe(0);
  });

  it("palec ide po oblúku — a aj tak sa to počíta", () => {
    // Prvá verzia žiadala 1,5-násobok a na telefóne nezabrala ani raz.
    expect(svih(-90, 70)).toBe(1);
  });

  it("krátke šklbnutie nestačí", () => {
    expect(svih(-30, 0)).toBe(0);
  });

  it("pomalé ťahanie nie je švihnutie", () => {
    expect(svih(-150, 0, 1200)).toBe(0);
  });

  it("na širokej obrazovke treba dlhší ťah, ale nie donekonečna", () => {
    // 12 % z 1600 px je 192 — strop je 110, inak sa na monitore nešvihne.
    expect(svih(-120, 0, 200, 1600)).toBe(1);
    expect(svih(-90, 0, 200, 1600)).toBe(0);
  });

  it("koniec bez začiatku nič nespraví", () => {
    const s = novyStavSvihu();
    expect(koniecSvihu(s, 0, 0, 1000, 375)).toBe(0);
  });

  it("jeden začiatok = jedno švihnutie", () => {
    const s = novyStavSvihu();
    zacniSvih(s, 200, 400, 1000);
    expect(koniecSvihu(s, 60, 400, 1200, 375)).toBe(1);
    expect(koniecSvihu(s, 60, 400, 1200, 375)).toBe(0);
  });
});
