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
    // Platí len tam, kde stránka na tú tému EXISTUJE — bez nej je odpoveďou
    // nový text, nie prepis. Preto vlastník.
    const majitel = () => ({ url: "/fascia/", titulok: "Fascie", druh: "titulok" as const });
    const [dobra] = planObsahu({ ...zaklad, prilezitosti: [p("fasce", 0, 900, 4.0)], vlastnik: majitel });
    const [zla] = planObsahu({ ...zaklad, prilezitosti: [p("fascie", 0, 900, 29.1)], vlastnik: majitel });
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

describe("návrh sedí na kanál, z ktorého vyšiel", () => {
  // Jerry, 17. 8. 2026: „odporúča mi na Google spraviť reel, ale tam reel
  // nerobia." Príležitosť zo Search Console je vec WEBU — reel na ňu nemá
  // žiadny vplyv, lebo Google indexuje stránky, nie Instagram.
  const zaklad = { clanky: [], hooky: [], prispevkovMesacne: 10, prispevkovVSilnychMesiacoch: null };

  it("stránka na prvej strane potrebuje titulok, nie nový obsah", () => {
    const majitel = () => ({ url: "/fascia/", titulok: "Fascie", druh: "titulok" as const });
    const [n] = planObsahu({ ...zaklad, prilezitosti: [{ dopyt: "fascie", kliky: 2, zobrazenia: 900, pozicia: 4.2 }], vlastnik: majitel });
    expect(n.co).toContain("Prepíš titulok");
    expect(n.co.toLowerCase()).not.toContain("reel");
  });

  it("hlboká pozícia potrebuje text na webe, nie reel", () => {
    const majitel = () => ({ url: "/rib-flare/", titulok: "Rib flare", druh: "titulok" as const });
    const [n] = planObsahu({ ...zaklad, prilezitosti: [{ dopyt: "rib flare", kliky: 0, zobrazenia: 400, pozicia: 18.5 }], vlastnik: majitel });
    expect(n.co).toContain("článok");
    expect(n.co.toLowerCase()).not.toContain("reel");
  });

  it("žiadny návrh z vyhľadávania neponúka reel", () => {
    const navrhy = planObsahu({
      ...zaklad,
      prilezitosti: [
        { dopyt: "a", kliky: 1, zobrazenia: 500, pozicia: 3 },
        { dopyt: "b", kliky: 0, zobrazenia: 400, pozicia: 12 },
        { dopyt: "c", kliky: 5, zobrazenia: 300, pozicia: 9 },
      ],
    });
    for (const n of navrhy.filter((x) => x.zdroj === "vyhľadávanie")) {
      expect(n.co.toLowerCase()).not.toContain("reel");
      expect(n.co.toLowerCase()).not.toContain("instagram");
    }
  });

  it("pripomenutie článku na Instagrame reelom byť SMIE — je to jeho kanál", () => {
    const navrhy = planObsahu({ ...zaklad, prilezitosti: [], clanky: [{ nazov: "Fascie", zobrazenia: 1800 }] });
    expect(navrhy[0].co).toContain("Instagram");
    expect(navrhy[0].zdroj).toBe("web");
  });
});

describe("návrh rozlíši prepis od chýbajúcej stránky", () => {
  // Jerryho test 17. 8. 2026: „subokcipitální svaly" — 849 zobrazení, pozícia
  // 2,3 a na webe o tom NIE JE stránka. Návrh „prepíš titulok" tam nedáva
  // zmysel; je to žiadosť o nový text.
  const zaklad = { clanky: [], hooky: [], prispevkovMesacne: 10, prispevkovVSilnychMesiacoch: null };
  const p = [{ dopyt: "subokcipitální svaly", kliky: 10, zobrazenia: 849, pozicia: 2.3 }];

  it("bez vlastnej stránky navrhne novú, nie prepis", () => {
    const [n] = planObsahu({ ...zaklad, prilezitosti: p, vlastnik: () => null });
    expect(n.co).toContain("Napíš stránku");
    expect(n.co).not.toContain("Prepíš");
  });

  it("keď sa téma len mihne inde, povie kde", () => {
    const [n] = planObsahu({
      ...zaklad, prilezitosti: p,
      vlastnik: () => ({ url: "/superficial-back-line/", titulok: "Superficial Back Line", druh: "zmienka" }),
    });
    expect(n.co).toContain("Napíš stránku");
    expect(n.preco).toContain("Superficial Back Line");
  });

  it("keď stránka tému vlastní a drží prvú stranu, navrhne prepis titulku", () => {
    const [n] = planObsahu({
      ...zaklad, prilezitosti: p,
      vlastnik: () => ({ url: "/x/", titulok: "Subokcipitální svaly", druh: "titulok" }),
    });
    expect(n.co).toContain("Prepíš titulok");
    expect(n.co).toContain("Subokcipitální svaly");
  });

  it("keď stránka tému vlastní, ale je hlboko, navrhne rozšírenie", () => {
    const [n] = planObsahu({
      ...zaklad,
      prilezitosti: [{ ...p[0], pozicia: 22 }],
      vlastnik: () => ({ url: "/x/", titulok: "Subokcipitální svaly", druh: "titulok" }),
    });
    expect(n.co).toContain("Rozšír článok");
  });
});
