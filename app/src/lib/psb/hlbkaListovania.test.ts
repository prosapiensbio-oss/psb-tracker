import { describe, expect, it } from "bun:test";

import {
  dokialVydrzi, hlbkaZoGa4, najvacsiPad, type RiadokGa4, vetaOStranke, zariadenieZGa4,
} from "./hlbkaListovania";

/** Riadok tak, ako ho vracia GA4: pagePath, cislo, nazov, zariadenie + 2 metriky. */
const r = (cesta: string, cislo: string, nazov: string, zar: string, udalosti: number, ludia: number): RiadokGa4 => ({
  dimensionValues: [{ value: cesta }, { value: cislo }, { value: nazov }, { value: zar }],
  metricValues: [{ value: String(udalosti) }, { value: String(ludia) }],
});
const navsteva = (cesta: string, zar: string, zobrazenia: number, ludia: number): RiadokGa4 => ({
  dimensionValues: [{ value: cesta }, { value: zar }],
  metricValues: [{ value: String(zobrazenia) }, { value: String(ludia) }],
});

describe("najväčší pád", () => {
  it("nájde relatívne najväčší, nie absolútne najväčší", () => {
    // 41→7 je −83 %, 7→6 je −14 %: rozhoduje podiel, nie rozdiel.
    expect(najvacsiPad([41, 7, 6, 6])).toEqual({ od: 1, podiel: (41 - 7) / 41 });
  });

  it("obrazovku s nulou pred sebou preskočí — delenie nulou nie je pád", () => {
    expect(najvacsiPad([0, 0, 5, 1])).toEqual({ od: 3, podiel: 0.8 });
  });

  it("keď nikto neodpadol, vráti nič", () => {
    expect(najvacsiPad([3, 3, 4])).toBeNull();
  });
});

describe("dokiaľ vydrží polovica", () => {
  it("meria od najsilnejšej obrazovky, nie od prvej", () => {
    // /sluzby/: chodí sa tam odkazom na #cenik, tretia obrazovka je najsilnejšia.
    expect(dokialVydrzi([2, 5, 11, 5, 3])).toBe(3);
  });

  it("na článku, kde ľudia čítajú do hĺbky, ukáže vysoké číslo", () => {
    expect(dokialVydrzi([1, 5, 5, 6, 4, 3, 3, 3, 3, 3, 1, 1])).toBe(10);
  });

  it("prázdna krivka je nula, nie pád", () => {
    expect(dokialVydrzi([])).toBe(0);
  });
});

describe("preskladanie odpovede z GA4", () => {
  const riadky = [
    r("/", "1", "Úvod", "desktop", 40, 36),
    r("/", "1", "Úvod", "mobile", 6, 5),
    r("/", "2", "Vzorec", "desktop", 1, 1),
    r("/", "2", "Vzorec", "mobile", 7, 6),
    r("/", "(not set)", "(not set)", "desktop", 1, 1),
    r("/sluzby/", "3", "Balíčky", "desktop", 12, 11),
  ];
  const navstevy = [navsteva("/", "desktop", 60, 41), navsteva("/", "mobile", 12, 10)];

  it("počíta ĽUDÍ a sčíta zariadenia do jednej krivky", () => {
    const s = hlbkaZoGa4(riadky, navstevy);
    const uvod = s.find((x) => x.cesta === "/");
    expect(uvod?.krivka).toEqual([41, 7]);
    expect(uvod?.ludia).toBe(51);
  });

  it("drží rozpad podľa zariadenia — bez neho sa nedá rozhodnúť, čo opraviť", () => {
    const uvod = hlbkaZoGa4(riadky, navstevy).find((x) => x.cesta === "/");
    expect(uvod?.podlaZariadenia.pc).toEqual([36, 1]);
    expect(uvod?.podlaZariadenia.telefon).toEqual([5, 6]);
  });

  it("udalosti bez čísla obrazovky sa nestratia, ale do krivky nejdú", () => {
    const uvod = hlbkaZoGa4(riadky, navstevy).find((x) => x.cesta === "/");
    expect(uvod?.bezRozmeru).toBe(1);
    expect(uvod?.krivka.length).toBe(2);
  });

  it("stránka bez menovateľa z GA4 nespadne dole", () => {
    const s = hlbkaZoGa4(riadky, navstevy);
    expect(s.map((x) => x.cesta)).toEqual(["/", "/sluzby/"]);
    expect(s[1]?.ludia).toBe(0);
  });

  it("prázdna odpoveď nie je pád, je to prázdny zoznam", () => {
    expect(hlbkaZoGa4([], [])).toEqual([]);
  });

  it("chýbajúcu obrazovku uprostred vyplní nulou, nie dierou", () => {
    const s = hlbkaZoGa4([r("/x/", "1", "A", "desktop", 5, 5), r("/x/", "3", "C", "desktop", 2, 2)], []);
    expect(s[0]?.krivka).toEqual([5, 0, 2]);
  });
});

describe("veta pod krivkou", () => {
  it("pomenuje obrazovku, na ktorej to padlo", () => {
    const s = hlbkaZoGa4(
      [r("/", "1", "Úvod", "desktop", 41, 41), r("/", "2", "Vzorec", "desktop", 7, 7)],
      [navsteva("/", "desktop", 60, 41)],
    );
    expect(vetaOStranke(s[0]!)).toContain("Úvod nepresvedčila");
    expect(vetaOStranke(s[0]!)).toContain("−83 %");
  });

  it("stránku, na ktorú sa chodí odkazom doprostred, nehlási ako pád", () => {
    const s = hlbkaZoGa4(
      [r("/sluzby/", "1", "Služby", "desktop", 2, 2), r("/sluzby/", "3", "Ceník", "desktop", 11, 11)],
      [],
    );
    expect(vetaOStranke(s[0]!)).toContain("odkazom rovno na 3. obrazovku");
  });
});

describe("zariadenie z GA4", () => {
  it("pozná počítač aj telefón, zvyšok je iné", () => {
    expect(zariadenieZGa4("desktop")).toBe("pc");
    expect(zariadenieZGa4("mobile")).toBe("telefon");
    expect(zariadenieZGa4("tablet")).toBe("ine");
    expect(zariadenieZGa4("")).toBe("ine");
  });
});
