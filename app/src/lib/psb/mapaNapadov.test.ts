import { describe, expect, it } from "bun:test";

import { mapaNaText, rozlozMapu, sirkaUzla, vetvaUzla, viditelny, type Uzol } from "./mapaNapadov";
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
    expect(Math.abs(poz.a.y - poz.b.y)).toBeGreaterThanOrEqual(52);
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
