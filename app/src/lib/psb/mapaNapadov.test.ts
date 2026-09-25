import { describe, expect, it } from "bun:test";

import { KROK, RIADOK, STRED, VETVY, kusovNaMesiac, rozparsujVysyp, mapaNaText, potomkovia, rozlozMapu, sirkaUzla, smiePresunut, vetvaUzla, viditelny, type Uzol } from "./mapaNapadov";
import { nazovFazy } from "./mapaCyklu";

const u = (o: Partial<Uzol> & { id: string }): Uzol =>
  ({ text: "nápad", rodic: "", vetva: "nezaradene", poradie: 0, zbalene: false, faza: 0, ...o });

describe("do ktorej vetvy uzol patrí", () => {
  it("koreňový nesie vetvu sám", () => {
    expect(vetvaUzla("a", [u({ id: "a", vetva: "kniha" })])).toBe("kniha");
  });

  it("potomok ju dedí cez celý reťazec", () => {
    // Vetva sa neukladá na každý uzol — inak by sa dve kópie tej istej pravdy
    // raz rozišli a potomok by svietil inou farbou než jeho rodič.
    const uzly = [u({ id: "a", vetva: "uvodny" }), u({ id: "b", rodic: "a" }), u({ id: "c", rodic: "b" })];
    expect(vetvaUzla("c", uzly)).toBe("uvodny");
  });

  it("neznáma vetva padne do odkladiska, nie do prázdna", () => {
    expect(vetvaUzla("a", [u({ id: "a", vetva: "vymyslena" })])).toBe("nezaradene");
  });

  it("kruh v rodičoch mapu nezacyklí", () => {
    const uzly = [u({ id: "a", rodic: "b" }), u({ id: "b", rodic: "a" })];
    expect(vetvaUzla("a", uzly)).toBe("nezaradene");
  });
});

describe("zbalená vetva", () => {
  const uzly = [u({ id: "a", zbalene: true }), u({ id: "b", rodic: "a" }), u({ id: "c", rodic: "b" })];
  it("skryje potomkov do hĺbky", () => {
    expect(viditelny("a", uzly)).toBe(true);
    expect(viditelny("b", uzly)).toBe(false);
    expect(viditelny("c", uzly)).toBe(false);
  });
});

describe("radiálne rozloženie", () => {
  const stredBubliny = (m: { x: number; y: number; w: number }) => ({ x: m.x + m.w / 2, y: m.y + RIADOK / 2 });
  const vzdialenost = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  it("kmeň je presne v strede plochy", () => {
    const { poz } = rozlozMapu([]);
    expect(stredBubliny(poz.koren)).toEqual(STRED);
  });

  it("všetky tri vetvy sú rovnako ďaleko od kmeňa, ale inde", () => {
    const { poz } = rozlozMapu([]);
    const v = VETVY.map((x) => stredBubliny(poz["vetva:" + x.id]));
    for (const s of v) expect(vzdialenost(s, STRED)).toBeCloseTo(KROK, 6);
    expect(vzdialenost(v[0], v[1])).toBeGreaterThan(100);
    expect(vzdialenost(v[1], v[2])).toBeGreaterThan(100);
  });

  it("každá ďalšia úroveň leží ďalej od stredu", () => {
    const uzly = [u({ id: "a", vetva: "uvodny" }), u({ id: "b", rodic: "a" }), u({ id: "c", rodic: "b" })];
    const { poz } = rozlozMapu(uzly);
    const r = (id: string) => vzdialenost(stredBubliny(poz[id]), STRED);
    expect(r("a")).toBeGreaterThan(KROK);
    expect(r("b")).toBeGreaterThan(r("a"));
    expect(r("c")).toBeGreaterThan(r("b"));
  });

  it("konár s viacerými nápadmi dostane širší výsek", () => {
    // Inak by sa desať bublín tlačilo do toho istého uhla ako jedna.
    const husty = [
      u({ id: "a", vetva: "uvodny" }), u({ id: "a1", rodic: "a" }), u({ id: "a2", rodic: "a" }),
      u({ id: "a3", rodic: "a" }), u({ id: "a4", rodic: "a" }),
      u({ id: "b", vetva: "kniha" }),
    ];
    const { poz } = rozlozMapu(husty);
    const uhly = ["a1", "a2", "a3", "a4"].map((id) => {
      const s = stredBubliny(poz[id]);
      return Math.atan2(s.y - STRED.y, s.x - STRED.x);
    });
    const rozptyl = Math.max(...uhly) - Math.min(...uhly);
    expect(rozptyl).toBeGreaterThan(0.2);
  });

  it("ručná pozícia prebíja výpočet", () => {
    const { poz } = rozlozMapu([u({ id: "a", vetva: "uvodny", posX: 400, posY: 250 })]);
    expect(stredBubliny(poz.a)).toEqual({ x: 400, y: 250 });
  });

  it("potomok posunutej bubliny ide s ňou, nie späť ku kmeňu", () => {
    const uzly = [u({ id: "a", vetva: "uvodny", posX: 300, posY: 300 }), u({ id: "b", rodic: "a" })];
    const { poz } = rozlozMapu(uzly);
    expect(vzdialenost(stredBubliny(poz.b), { x: 300, y: 300 })).toBeCloseTo(KROK, 6);
  });

  it("zbalená vetva svoje deti nekreslí", () => {
    const uzly = [u({ id: "a", vetva: "uvodny", zbalene: true }), u({ id: "b", rodic: "a" })];
    expect(rozlozMapu(uzly).poz.b).toBeUndefined();
  });

  it("plátno sa roztiahne na ručne vytlačenú bublinu", () => {
    const daleko = rozlozMapu([u({ id: "a", vetva: "uvodny", posX: 4000, posY: 3000 })]);
    expect(daleko.sirka).toBeGreaterThan(4000);
    expect(daleko.vyska).toBeGreaterThan(3000);
  });
});

describe("preklad mapy do textu", () => {
  const uzly = [
    u({ id: "a", vetva: "uvodny", text: "Prečo strečing nezaberá", faza: 3 }),
    u({ id: "b", rodic: "a", text: "Dych a rebrá", faza: 2 }),
    u({ id: "c", vetva: "kniha", text: "Prvá kapitola nahlas" }),
  ];
  const text = mapaNaText(uzly, { mesiac: "október 2026", kadenciaTyzdenne: 2, nazovFazy });

  it("povie, koľko toho je a kam to mieri", () => {
    expect(text).toContain("október 2026");
    expect(text).toContain("2 do „úvodný tréning“");
  });

  it("vypíše fázy, ktoré obsadené sú", () => {
    expect(text).toContain("Fáza 2");
    expect(text).toContain("Fáza 3");
  });

  it("a hlavne tie, ktoré nie sú — to je celá cena toho textu", () => {
    expect(text).toContain("Fáza 1 (Nevie o probléme) nemá ani jeden kus.");
    expect(text).toContain("Fáza 5");
  });

  it("povie, koľko chýba do mesiaca pri danej kadencii", () => {
    expect(text).toContain("chýba 6 zaradených kusov");
  });

  it("nápad bez fázy nezmizne, vymenuje sa menom", () => {
    expect(text).toContain("Bez fázy leží 1: „Prvá kapitola nahlas“.");
  });

  it("prázdny text sa do zadania nedostane", () => {
    const s = mapaNaText([...uzly, u({ id: "x", text: "   " })], { mesiac: "október 2026", kadenciaTyzdenne: 2, nazovFazy });
    expect(s).not.toContain("„   “");
  });
});

describe("ťahanie nápadu pod iný", () => {
  const strom = [
    u({ id: "a", vetva: "uvodny" }),
    u({ id: "b", rodic: "a" }),
    u({ id: "c", rodic: "b" }),
    u({ id: "x", vetva: "kniha" }),
  ];

  it("pozná všetkých potomkov do hĺbky", () => {
    expect([...potomkovia("a", strom)].sort()).toEqual(["b", "c"]);
    expect([...potomkovia("c", strom)]).toEqual([]);
  });

  it("pod cudzí nápad sa presunúť dá", () => {
    expect(smiePresunut("a", "x", strom)).toBe(true);
    expect(smiePresunut("c", "x", strom)).toBe(true);
  });

  it("pod vlastného potomka NIE — inak sa konár odpojí od kmeňa", () => {
    expect(smiePresunut("a", "b", strom)).toBe(false);
    expect(smiePresunut("a", "c", strom)).toBe(false);
  });

  it("sám na seba nie", () => {
    expect(smiePresunut("a", "a", strom)).toBe(false);
  });

  it("tam, kde už visí, sa nepresúva", () => {
    expect(smiePresunut("b", "a", strom)).toBe(false);
  });

  it("neznámy uzol neprejde", () => {
    expect(smiePresunut("zzz", "a", strom)).toBe(false);
  });
});

describe("sirota — uzol, ktorému zmizol rodič", () => {
  // Rodiča môže zamietnuť karta Nápady alebo ho odreže strop dopytu. Bez
  // tejto vetvy by potomok nedostal pozíciu, z mapy by zmizol a keďže sa
  // nekreslí, nedal by sa ani vrátiť späť.
  const sirota = [u({ id: "b", rodic: "niet-ho", vetva: "" })];

  it("dostane pozíciu, teda je vidieť", () => {
    expect(rozlozMapu(sirota).poz.b).toBeDefined();
  });

  it("visí v odkladisku, nie v prázdne", () => {
    expect(vetvaUzla("b", sirota)).toBe("nezaradene");
  });

  it("uzol so živým rodičom visí ďalej od stredu než jeho rodič", () => {
    const zdravy = [u({ id: "a", vetva: "kniha" }), u({ id: "b", rodic: "a" })];
    const { poz } = rozlozMapu(zdravy);
    const r = (m: { x: number; y: number; w: number }) => Math.hypot(m.x + m.w / 2 - STRED.x, m.y + RIADOK / 2 - STRED.y);
    expect(r(poz.b)).toBeGreaterThan(r(poz.a));
  });
});

describe("šírka bubliny", () => {
  it("má spodok aj strop — inak sa mapa rozsype na jednom dlhom nápade", () => {
    expect(sirkaUzla("", 2)).toBe(150);
    expect(sirkaUzla("", 0)).toBe(200);
    expect(sirkaUzla("x".repeat(400), 2)).toBe(360);
  });

  it("rastie s dĺžkou textu", () => {
    expect(sirkaUzla("krátky", 2)).toBeLessThan(sirkaUzla("oveľa dlhší nápad na dve slová", 2));
  });
});

describe("čo sa počíta do mesiaca", () => {
  const zaklad = { mesiac: "október 2026", kadenciaTyzdenne: 2, nazovFazy };

  it("kadencia má jedno miesto", () => {
    expect(kusovNaMesiac(2)).toBe(8);
    expect(kusovNaMesiac(3)).toBe(12);
  });

  it("publikovaný nápad mesiac nezapĺňa", () => {
    // Inak mapa vyhlási mesiac za pokrytý obsahom, ktorý už dávno vyšiel.
    const uzly = [
      u({ id: "a", vetva: "uvodny", text: "Už vyšlo", faza: 3, stav: "pouzity" }),
      u({ id: "b", vetva: "uvodny", text: "Ešte len bude", faza: 3 }),
    ];
    const t = mapaNaText(uzly, zaklad);
    expect(t).toContain("chýba 7 zaradených kusov");
    expect(t).not.toContain("Už vyšlo");
  });
});

describe("hromadné vysypanie", () => {
  it("jeden riadok = jeden nápad, prázdne sa zahodia", () => {
    expect(rozparsujVysyp("prvý\n\ndruhý\n   \ntretí")).toEqual([
      { text: "prvý", uroven: 0 }, { text: "druhý", uroven: 0 }, { text: "tretí", uroven: 0 },
    ]);
  });

  it("odsadenie tabulátorom aj medzerami drží hierarchiu", () => {
    expect(rozparsujVysyp("rodič\n\tdieťa\n  druhé dieťa")).toEqual([
      { text: "rodič", uroven: 0 }, { text: "dieťa", uroven: 1 }, { text: "druhé dieťa", uroven: 1 },
    ]);
  });

  it("odrážky sa zahodia — sú to znaky zoznamu, nie nápad", () => {
    expect(rozparsujVysyp("- prvý\n* druhý\n• tretí\n1. štvrtý\n2) piaty").map((r) => r.text))
      .toEqual(["prvý", "druhý", "tretí", "štvrtý", "piaty"]);
  });

  it("celý blok odsadený rovnako začína na nule", () => {
    // Skopírované z poznámok aj s odsadením — inak by celý blok visel
    // na rodičovi, ktorý neexistuje.
    expect(rozparsujVysyp("\tprvý\n\t\tdruhý")).toEqual([
      { text: "prvý", uroven: 0 }, { text: "druhý", uroven: 1 },
    ]);
  });

  it("prázdny vstup nič nevyrobí", () => {
    expect(rozparsujVysyp("")).toEqual([]);
    expect(rozparsujVysyp("   \n\n- \n")).toEqual([]);
  });
});
