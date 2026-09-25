import { describe, expect, it } from "bun:test";

import { KROK_Y, MAX_ZOOM, MEDZERA_X, MIN_ZOOM, spojnica, vMedziach, RIADOK, STRED, VETVY_ZAKLAD, novaVetva, vetvyMapy, idVetvy, kusovNaMesiac, rozparsujVysyp, mapaNaText, potomkovia, rozlozMapu, sirkaUzla, smiePresunut, vetvaUzla, viditelny, type Uzol } from "./mapaNapadov";
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
    const vpravo = VETVY_ZAKLAD.filter((v) => v.strana === 1);
    const vlavo = VETVY_ZAKLAD.filter((v) => v.strana === -1);
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
    for (const v of VETVY_ZAKLAD) {
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

describe("spojnica", () => {
  const kus = (x: number, y: number, w = 200) => ({ x, y, w, hlbka: 2 }) as never as { x: number; y: number; w: number; hlbka: number };

  /** Body na kubike `M x y C c1 c2 koniec` — na kontrolu, kade oblúk vedie. */
  const body = (d: string) => {
    const c = d.replace(/[MC,]/g, " ").trim().split(/\s+/).map(Number);
    const [x0, y0, x1, y1, x2, y2, x3, y3] = c;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, o = 1 - t;
      out.push({
        x: o * o * o * x0 + 3 * o * o * t * x1 + 3 * o * t * t * x2 + t * t * t * x3,
        y: o * o * o * y0 + 3 * o * o * t * y1 + 3 * o * t * t * y2 + t * t * t * y3,
      });
    }
    return out;
  };
  const vnutri = (m: { x: number; y: number; w: number }, p: { x: number; y: number }) =>
    p.x > m.x + 0.01 && p.x < m.x + m.w - 0.01 && p.y > m.y + 0.01 && p.y < m.y + RIADOK - 0.01;

  it("vedľa seba: z pravého boku do ľavého, vo výške stredov", () => {
    const a = kus(100, 100), b = kus(400, 100);
    const p = body(spojnica(a, b));
    expect(p[0].x).toBeCloseTo(300, 6);
    expect(p[0].y).toBeCloseTo(126, 6);
    expect(p[p.length - 1].x).toBeCloseTo(400, 6);
  });

  it("doľava: z ľavého boku do pravého", () => {
    const a = kus(400, 100), b = kus(100, 100);
    const p = body(spojnica(a, b));
    expect(p[0].x).toBeCloseTo(400, 6);
    expect(p[p.length - 1].x).toBeCloseTo(300, 6);
  });

  it("dieťa vysoko nad rodičom nepretne ani jednu bublinu", () => {
    // Presne prípad, ktorý Jerry videl 25. 9.: hlbšia vrstva, dieťa o osem
    // riadkov vyššie. Starý výpočet vyšiel HORNOU stenou a oblúk sa vrátil
    // cez text.
    const a = kus(100, 600), b = kus(400, 100);
    for (const t of body(spojnica(a, b))) {
      expect(vnutri(a, t)).toBe(false);
      expect(vnutri(b, t)).toBe(false);
    }
  });

  it("oblúk ostane v medzere medzi stĺpcami", () => {
    const a = kus(100, 600), b = kus(400, 100);
    for (const t of body(spojnica(a, b))) {
      expect(t.x).toBeGreaterThanOrEqual(300 - 0.01);
      expect(t.x).toBeLessThanOrEqual(400 + 0.01);
    }
  });

  it("nad sebou: z vrchu do spodku, nie cez bublinu", () => {
    const a = kus(100, 100), b = kus(120, 400);
    const p = body(spojnica(a, b));
    expect(p[0].y).toBeCloseTo(100 + RIADOK, 6);
    expect(p[p.length - 1].y).toBeCloseTo(400, 6);
    for (const t of p) {
      expect(vnutri(a, t)).toBe(false);
      expect(vnutri(b, t)).toBe(false);
    }
  });

  it("dve bubliny na sebe nevyrobia NaN", () => {
    const d = spojnica(kus(100, 100), kus(100, 100));
    expect(d.includes("NaN")).toBe(false);
  });
});

describe("vMedziach", () => {
  it("drží mierku v medziach", () => {
    expect(vMedziach(0.05)).toBe(MIN_ZOOM);
    expect(vMedziach(9)).toBe(MAX_ZOOM);
    expect(vMedziach(0.734)).toBeCloseTo(0.73, 6);
  });

  it("pri zmestení radšej menej — Math.floor", () => {
    // 0.418 zaokrúhlené nahor by mapu o kúsok vystrčilo z okna.
    expect(vMedziach(0.418, Math.floor)).toBeCloseTo(0.41, 6);
    expect(vMedziach(0.418)).toBeCloseTo(0.42, 6);
  });

  it("delenie nulou nezhodí mapu", () => {
    // clientWidth / 0 je Infinity, 0 / 0 je NaN — oboje musí skončiť pri 1,
    // nie pri mierke NaN, ktorá by plochu zmenila na prázdnu.
    expect(vMedziach(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM);
    expect(vMedziach(Number.NaN)).toBe(1);
  });
});

describe("vlastné vetvy mapy", () => {
  it("prázdny stĺpec znamená tri základné", () => {
    expect(vetvyMapy("")).toEqual(VETVY_ZAKLAD);
    expect(vetvyMapy(null)).toEqual(VETVY_ZAKLAD);
    expect(vetvyMapy("[]")).toEqual(VETVY_ZAKLAD);
  });

  it("pokazený JSON mapu nezhasne", () => {
    expect(vetvyMapy("{toto nie je")).toEqual(VETVY_ZAKLAD);
  });

  it("prečíta uložené vetvy", () => {
    const v = vetvyMapy('[{"id":"videa","nazov":"Videá","farba":"#3E82A8","strana":-1}]');
    expect(v[0]).toEqual({ id: "videa", nazov: "Videá", farba: "#3E82A8", strana: -1 });
    // Odkladisko sa doplní vždy — inak by nápady bez domova zmizli z mapy.
    expect(v.some((x) => x.id === "nezaradene")).toBe(true);
  });

  it("zahodí id, ktoré nie je bezpečné do SQL ani do adresy", () => {
    const v = vetvyMapy('[{"id":"a\'; DROP TABLE","nazov":"zlo"},{"id":"ok","nazov":"Dobrá"}]');
    expect(v.map((x) => x.id)).toEqual(["ok", "nezaradene"]);
  });

  it("dve vetvy s tým istým id sa nezdvoja", () => {
    const v = vetvyMapy('[{"id":"a","nazov":"Prvá"},{"id":"a","nazov":"Druhá"}]');
    expect(v.filter((x) => x.id === "a").length).toBe(1);
  });

  it("id sa vyrobí z názvu, bez diakritiky a jedinečné", () => {
    expect(idVetvy("Články na blog", [])).toBe("clanky-na-blog");
    expect(idVetvy("Články", [{ id: "clanky", nazov: "x", farba: "#000000", strana: 1 }])).toBe("clanky-2");
    expect(idVetvy("🙂", [])).toBe("vetva");
  });

  it("nová vetva si vezme voľnú farbu a redšiu stranu", () => {
    const v = novaVetva("Videá", VETVY_ZAKLAD);
    // Vpravo sú dve zo základu, vľavo jedna — nová ide doľava.
    expect(v.strana).toBe(-1);
    expect(VETVY_ZAKLAD.some((x) => x.farba.toLowerCase() === v.farba.toLowerCase())).toBe(false);
  });

  it("rozloženie postaví aj vlastnú vetvu", () => {
    const vetvy = [...VETVY_ZAKLAD, novaVetva("Videá", VETVY_ZAKLAD)];
    const uzly = [u({ id: "a", vetva: "videa", text: "prvý" })];
    const r = rozlozMapu(uzly, { text: "Obsah" }, {}, vetvy);
    expect(r.poz["vetva:videa"]).toBeDefined();
    // Nápad visí na svojej vetve, nie v odkladisku.
    expect(vetvaUzla("a", uzly, vetvy)).toBe("videa");
    expect(vetvaUzla("a", uzly)).toBe("nezaradene");
  });
});

describe("nová vetva a ručne odsunuté vetvy", () => {
  it("ručne položená vetva nedrží miesto v stĺpci", () => {
    // Všetky tri základné sú odsunuté rukou; štvrtá je na výpočte a nesmie
    // pristáť na žiadnej z nich.
    const vetvy = [...VETVY_ZAKLAD, novaVetva("Skúška", VETVY_ZAKLAD)];
    const rucne = {
      "vetva:uvodny": { x: 1329, y: 635 },
      "vetva:kniha": { x: 1974, y: 1104 },
      "vetva:nezaradene": { x: 1443, y: 1309 },
    };
    const r = rozlozMapu([], { text: "Obsah" }, rucne, vetvy);
    const nova = r.poz["vetva:skuska"];
    expect(nova).toBeDefined();
    for (const kluc of Object.keys(rucne)) {
      const iná = r.poz[kluc];
      const prekryv = nova.x < iná.x + iná.w && nova.x + nova.w > iná.x
        && nova.y < iná.y + RIADOK && nova.y + RIADOK > iná.y;
      expect(prekryv).toBe(false);
    }
  });
});
