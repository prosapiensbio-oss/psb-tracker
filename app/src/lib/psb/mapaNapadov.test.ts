import { describe, expect, it } from "bun:test";

import { RIADOK, kusovNaMesiac, rozparsujVysyp, mapaNaText, potomkovia, rozlozMapu, sirkaUzla, smiePresunut, vetvaUzla, viditelny, type Uzol } from "./mapaNapadov";
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

describe("rozloženie", () => {
  it("rodič sedí v strede svojich detí", () => {
    const uzly = [u({ id: "a", vetva: "uvodny" }), u({ id: "b", rodic: "a" }), u({ id: "c", rodic: "a", poradie: 1 })];
    const { poz } = rozlozMapu(uzly);
    expect(poz.a.y).toBeCloseTo((poz.b.y + poz.c.y) / 2, 5);
  });

  it("dieťa je napravo od rodiča, za jeho šírkou", () => {
    const uzly = [u({ id: "a", vetva: "uvodny", text: "dlhší text nápadu" }), u({ id: "b", rodic: "a" })];
    const { poz } = rozlozMapu(uzly);
    expect(poz.b.x).toBe(poz.a.x + sirkaUzla("dlhší text nápadu", 2) + 76);
  });

  it("súrodenci sa neprekrývajú", () => {
    const uzly = [u({ id: "a", vetva: "uvodny" }), u({ id: "b", vetva: "uvodny", poradie: 1 })];
    const { poz } = rozlozMapu(uzly);
    expect(Math.abs(poz.a.y - poz.b.y)).toBeGreaterThanOrEqual(RIADOK);
  });

  it("zbalená vetva miesto svojich detí nezaberá", () => {
    const zbalena = [u({ id: "a", vetva: "uvodny", zbalene: true }), u({ id: "b", rodic: "a" }), u({ id: "c", rodic: "a", poradie: 1 })];
    const otvorena = zbalena.map((x) => (x.id === "a" ? { ...x, zbalene: false } : x));
    expect(rozlozMapu(zbalena).vyska).toBeLessThan(rozlozMapu(otvorena).vyska);
  });

  it("všetky tri vetvy majú miesto aj keď sú prázdne", () => {
    const { poz } = rozlozMapu([]);
    expect(poz["vetva:uvodny"]).toBeDefined();
    expect(poz["vetva:kniha"]).toBeDefined();
    expect(poz["vetva:nezaradene"]).toBeDefined();
    expect(poz["koren"]).toBeDefined();
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

  it("uzol so živým rodičom sa nezmení", () => {
    const zdravy = [u({ id: "a", vetva: "kniha" }), u({ id: "b", rodic: "a" })];
    const { poz } = rozlozMapu(zdravy);
    expect(poz.b.x).toBeGreaterThan(poz.a.x);
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
