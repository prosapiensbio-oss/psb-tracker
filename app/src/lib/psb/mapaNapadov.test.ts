import { describe, expect, it } from "bun:test";

import { KROK_Y, MEDZERA_X, okrajBubliny, RIADOK, STRANA_VETVY, STRED, VETVY, kusovNaMesiac, rozparsujVysyp, mapaNaText, potomkovia, rozlozMapu, sirkaUzla, smiePresunut, vetvaUzla, viditelny, type Uzol } from "./mapaNapadov";
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

describe("rozloženie v stĺpcoch", () => {
  const stredB = (m: { x: number; y: number; w: number }) => ({ x: m.x + m.w / 2, y: m.y + RIADOK / 2 });

  it("kmeň je v strede plochy", () => {
    expect(stredB(rozlozMapu([]).poz.koren)).toEqual(STRED);
  });

  it("vetvy idú na obe strany kmeňa", () => {
    const { poz } = rozlozMapu([]);
    const vpravo = VETVY.filter((v) => STRANA_VETVY[v.id] === 1);
    const vlavo = VETVY.filter((v) => STRANA_VETVY[v.id] === -1);
    expect(vpravo.length).toBeGreaterThan(0);
    expect(vlavo.length).toBeGreaterThan(0);
    for (const v of vpravo) expect(stredB(poz["vetva:" + v.id]).x).toBeGreaterThan(STRED.x);
    for (const v of vlavo) expect(stredB(poz["vetva:" + v.id]).x).toBeLessThan(STRED.x);
  });

  it("súrodenci stoja POD SEBOU, nie dokola", () => {
    // Toto je celé zadanie: dva nápady, ktoré patria k sebe, musia zostať
    // vedľa seba, nie na opačných koncoch oblúka.
    const uzly = [
      u({ id: "a", vetva: "uvodny" }),
      u({ id: "b", vetva: "uvodny", poradie: 1 }),
      u({ id: "c", vetva: "uvodny", poradie: 2 }),
    ];
    const { poz } = rozlozMapu(uzly);
    const s = ["a", "b", "c"].map((id) => stredB(poz[id]));
    expect(s[0].x).toBeCloseTo(s[1].x, 6);
    expect(s[1].x).toBeCloseTo(s[2].x, 6);
    expect(s[1].y - s[0].y).toBeCloseTo(KROK_Y, 6);
    expect(s[2].y - s[1].y).toBeCloseTo(KROK_Y, 6);
  });

  it("dieťa je o stĺpec ďalej od kmeňa, nie pod rodičom", () => {
    const uzly = [u({ id: "a", vetva: "uvodny" }), u({ id: "b", rodic: "a" })];
    const { poz } = rozlozMapu(uzly);
    expect(stredB(poz.b).x - stredB(poz.a).x).toBeGreaterThanOrEqual(MEDZERA_X);
    expect(stredB(poz.b).y).toBeCloseTo(stredB(poz.a).y, 6);
  });

  it("vetva vľavo rastie doľava", () => {
    const uzly = [u({ id: "a", vetva: "nezaradene" }), u({ id: "b", rodic: "a" })];
    const { poz } = rozlozMapu(uzly);
    expect(stredB(poz.b).x).toBeLessThan(stredB(poz.a).x);
  });

  it("rodič sedí v strede svojich detí", () => {
    const uzly = [u({ id: "a", vetva: "uvodny" }), u({ id: "b", rodic: "a" }), u({ id: "c", rodic: "a", poradie: 1 })];
    const { poz } = rozlozMapu(uzly);
    expect(stredB(poz.a).y).toBeCloseTo((stredB(poz.b).y + stredB(poz.c).y) / 2, 6);
  });

  it("otvorený konár odsunie suseda nadol, nie cez seba", () => {
    const uzly = [
      u({ id: "a", vetva: "uvodny" }), u({ id: "a1", rodic: "a" }), u({ id: "a2", rodic: "a", poradie: 1 }),
      u({ id: "b", vetva: "uvodny", poradie: 1 }),
    ];
    const { poz } = rozlozMapu(uzly);
    expect(stredB(poz.b).y - stredB(poz.a).y).toBeGreaterThanOrEqual(KROK_Y);
  });

  it("zbalená vetva svoje deti nekreslí ani im nedrží miesto", () => {
    const zbal = [u({ id: "a", vetva: "uvodny", zbalene: true }), u({ id: "b", rodic: "a" }), u({ id: "c", vetva: "uvodny", poradie: 1 })];
    const otvor = zbal.map((x) => (x.id === "a" ? { ...x, zbalene: false } : x));
    expect(rozlozMapu(zbal).poz.b).toBeUndefined();
    const dZbal = Math.abs(rozlozMapu(zbal).poz.c.y - rozlozMapu(zbal).poz.a.y);
    const dOtvor = Math.abs(rozlozMapu(otvor).poz.c.y - rozlozMapu(otvor).poz.a.y);
    expect(dZbal).toBeLessThanOrEqual(dOtvor);
  });

  it("ručná pozícia prebíja výpočet a konár ide s ňou", () => {
    const uzly = [u({ id: "a", vetva: "uvodny", posX: 400, posY: 250 }), u({ id: "b", rodic: "a" })];
    const { poz } = rozlozMapu(uzly);
    expect(stredB(poz.a)).toEqual({ x: 400, y: 250 });
    expect(stredB(poz.b).x).toBeGreaterThan(400);
    expect(stredB(poz.b).y).toBeCloseTo(250, 6);
  });

  it("plátno sa roztiahne na ručne vytlačenú bublinu", () => {
    const d = rozlozMapu([u({ id: "a", vetva: "uvodny", posX: 5000, posY: 4000 })]);
    expect(d.sirka).toBeGreaterThan(5000);
    expect(d.vyska).toBeGreaterThan(4000);
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

describe("ručné miesto kmeňa a vetiev", () => {
  const stredB = (m: { x: number; y: number; w: number }) => ({ x: m.x + m.w / 2, y: m.y + RIADOK / 2 });

  it("kmeň sa dá posunúť a vetvy idú s ním", () => {
    const { poz } = rozlozMapu([], { text: "Obsah" }, { koren: { x: 900, y: 700 } });
    expect(stredB(poz.koren)).toEqual({ x: 900, y: 700 });
    for (const v of VETVY) {
      const s = stredB(poz["vetva:" + v.id]);
      expect(Math.abs(s.x - 900)).toBeGreaterThan(MEDZERA_X);
      expect(Math.abs(s.y - 700)).toBeLessThan(400);
    }
  });

  it("vetva sa dá posunúť samostatne", () => {
    const { poz } = rozlozMapu([], { text: "" }, { "vetva:kniha": { x: 1500, y: 300 } });
    expect(stredB(poz["vetva:kniha"])).toEqual({ x: 1500, y: 300 });
    // Ostatné dve zostanú tam, kde ich spočítala appka.
    expect(stredB(poz["vetva:uvodny"])).not.toEqual({ x: 1500, y: 300 });
  });

  it("nápady presunutej vetvy idú s ňou, nie späť ku kmeňu", () => {
    const uzly = [u({ id: "a", vetva: "kniha" })];
    const { poz } = rozlozMapu(uzly, { text: "" }, { "vetva:kniha": { x: 1500, y: 300 } });
    const s = stredB(poz.a);
    expect(s.x).toBeGreaterThan(1500);
    expect(s.y).toBeCloseTo(300, 6);
  });

  it("prázdne ručné pozície nič nemenia", () => {
    const bez = rozlozMapu([], { text: "" });
    const s = rozlozMapu([], { text: "" }, {});
    expect(s.poz.koren).toEqual(bez.poz.koren);
  });
});

describe("čiara sa chytá okraja bubliny", () => {
  const m = { x: 100, y: 100, w: 200, h: 0, hlbka: 2 } as never as { x: number; y: number; w: number; hlbka: number };
  // stred bubliny je (200, 126) pri RIADOK = 52

  it("doprava sa trafí pravý okraj, nie stred", () => {
    const b = okrajBubliny(m, 1000, 126);
    expect(b.x).toBeCloseTo(300, 6);
    expect(b.y).toBeCloseTo(126, 6);
  });

  it("doľava ľavý okraj", () => {
    expect(okrajBubliny(m, -500, 126).x).toBeCloseTo(100, 6);
  });

  it("nadol spodný okraj", () => {
    const b = okrajBubliny(m, 200, 900);
    expect(b.y).toBeCloseTo(126 + RIADOK / 2, 6);
    expect(b.x).toBeCloseTo(200, 6);
  });

  it("bod vnútri bubliny sa neposúva von", () => {
    // Inak by čiara k prekrytej bubline vystrelila mimo nej.
    const b = okrajBubliny(m, 210, 130);
    expect(b.x).toBeCloseTo(210, 6);
    expect(b.y).toBeCloseTo(130, 6);
  });

  it("na strede sa nedelí nulou", () => {
    expect(okrajBubliny(m, 200, 126)).toEqual({ x: 200, y: 126 });
  });
});
