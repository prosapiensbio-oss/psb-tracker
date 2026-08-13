import { describe, expect, it } from "bun:test";

import { planObsahu, type Clanok, type HookVysledok, type Prilezitost } from "./planObsahu";

/** Slovenský formát čísel používa pevnú medzeru — v teste ju zrovnáme. */
const bezPevnej = (s: string) => s.replace(/\u00a0/g, " ");

const p = (dopyt: string, kliky: number, zobrazenia: number, pozicia: number): Prilezitost =>
  ({ dopyt, kliky, zobrazenia, pozicia });
const c = (nazov: string, zobrazenia: number): Clanok => ({ nazov, zobrazenia });
const h = (kategoria: string, dopytov: number, podiel: number, podielBezne: number): HookVysledok =>
  ({ kategoria, dopytov, podiel, podielBezne });

const zaklad = {
  prilezitosti: [] as Prilezitost[],
  clanky: [] as Clanok[],
  hooky: [] as HookVysledok[],
  prispevkovMesacne: 8,
  prispevkovVSilnychMesiacoch: null as number | null,
};

describe("plán obsahu", () => {
  it("téma z vyhľadávania ide prvá a nesie svoje čísla", () => {
    const [n] = planObsahu({ ...zaklad, prilezitosti: [p("fasce", 2, 3959, 4.8)] });
    expect(n.co).toContain("fasce");
    expect(bezPevnej(n.dokaz)).toContain("3 959");
    expect(n.dokaz).toContain("4.8");
    expect(n.zdroj).toBe("vyhľadávanie");
  });

  it("pri dobrej pozícii hovorí o dôvode kliknúť, pri zlej o pozícii", () => {
    const [dobra] = planObsahu({ ...zaklad, prilezitosti: [p("fasce", 0, 900, 4.0)] });
    const [zla] = planObsahu({ ...zaklad, prilezitosti: [p("fascie", 0, 900, 29.1)] });
    expect(dobra.preco).toContain("prvej strane");
    expect(zla.preco).toContain("hlboko");
  });

  it("článok, ktorý ľudia čítajú, sa navrhne pripomenúť", () => {
    const v = planObsahu({ ...zaklad, clanky: [c("Fascie – Voda v nás", 1829)] });
    expect(v[0].co).toContain("Pripomeň");
    expect(bezPevnej(v[0].dokaz)).toContain("1 829");
  });

  it("typ začiatku sa navrhne, len keď zreteľne prekonáva bežný deň", () => {
    const slabo = planObsahu({ ...zaklad, hooky: [h("Otázka", 20, 30, 26)] });
    const jasne = planObsahu({ ...zaklad, hooky: [h("Vyvrátenie mýtu", 20, 44, 25)] });
    expect(slabo).toEqual([]);
    expect(jasne[0].co).toContain("Vyvrátenie mýtu");
  });

  it("málo dopytov znamená mlčať — podiel z piatich nič neznamená", () => {
    expect(planObsahu({ ...zaklad, hooky: [h("Vyvrátenie mýtu", 5, 60, 20)] })).toEqual([]);
  });

  it("nikdy netvrdí príčinu", () => {
    const v = planObsahu({ ...zaklad, hooky: [h("Vyvrátenie mýtu", 20, 44, 25)] });
    expect(v[0].preco).toContain("Nie je to dôkaz");
  });

  it("prepadnuté tempo sa ozve", () => {
    const v = planObsahu({ ...zaklad, prispevkovMesacne: 6, prispevkovVSilnychMesiacoch: 14 });
    expect(v[0].co).toContain("14 príspevkov");
  });

  it("tempo blízko silných mesiacov sa nekomentuje", () => {
    expect(planObsahu({ ...zaklad, prispevkovMesacne: 11, prispevkovVSilnychMesiacoch: 14 })).toEqual([]);
  });

  it("bez porovnania sa o tempe mlčí", () => {
    expect(planObsahu({ ...zaklad, prispevkovMesacne: 2, prispevkovVSilnychMesiacoch: null })).toEqual([]);
  });

  it("prázdne dáta nevyrobia žiadny návrh", () => {
    expect(planObsahu(zaklad)).toEqual([]);
  });

  it("zoznam sa neprelieva — najviac šesť návrhov", () => {
    const v = planObsahu({
      ...zaklad,
      prilezitosti: Array.from({ length: 9 }, (_, i) => p(`t${i}`, 0, 900 - i, 5)),
      clanky: Array.from({ length: 6 }, (_, i) => c(`c${i}`, 500 - i)),
      hooky: [h("Vyvrátenie mýtu", 20, 44, 25)],
      prispevkovMesacne: 2,
      prispevkovVSilnychMesiacoch: 14,
    });
    expect(v.length).toBe(6);
    // Poradie riešenia sa drží: vyhľadávanie pred webom, web pred obsahom.
    expect(v[0].zdroj).toBe("vyhľadávanie");
    expect(v[3].zdroj).toBe("web");
  });
});
