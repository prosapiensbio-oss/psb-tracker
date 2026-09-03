// Téma na dnešné hovorené video.
import { describe, expect, it } from "bun:test";

import { temaDna } from "./temaDna";

const HLADANIA = [
  { dopyt: "joga na bolavá záda", zobrazenia: 1191 },
  { dopyt: "cviky na bederní páteř", zobrazenia: 953 },
  { dopyt: "bolest bederní páteře cviky", zobrazenia: 557 },
];
const NAPADY = [{ text: "prečo ma bolí krížom, keď robím drepy?", druh: "otazka klienta" }];
const Z = { hladania: HLADANIA, napady: NAPADY };
const D = (s: string) => new Date(`${s}T06:00:00Z`);

describe("temaDna", () => {
  it("v ten istý deň dá vždy to isté — téma sa počas dňa nemení", () => {
    const a = temaDna(Z, D("2026-09-03"));
    const b = temaDna(Z, new Date("2026-09-03T21:30:00Z"));
    expect(a.tema).toBe(b.tema);
  });

  it("druh témy sa strieda — päť dní po sebe päť rôznych tvarov", () => {
    const druhy = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]
      .map((d) => temaDna(Z, D(d)).druh);
    expect(new Set(druhy).size).toBe(5);
  });

  it("vyhľadávanie cituje skutočnú vetu aj s počtom", () => {
    // Nájdi deň, keď vyjde druh „hladanie".
    const den = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]
      .find((d) => temaDna(Z, D(d)).druh === "hladanie") as string;
    const t = temaDna(Z, D(den));
    expect(HLADANIA.some((h) => t.tema.includes(h.dopyt))).toBe(true);
    expect(t.tema).toMatch(/\d+×/);
    expect(t.odkial).toContain("Google");
  });

  it("keď zdroje chýbajú, téma je stále použiteľná — nie prázdna", () => {
    for (const d of ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]) {
      const t = temaDna({}, D(d));
      expect(t.tema.length).toBeGreaterThan(25);
      expect(t.odkial.length).toBeGreaterThan(3);
    }
  });

  it("krátke útržky z Googlu sa nepoužijú", () => {
    // „cviky" samo o sebe nie je téma na šesťdesiat sekúnd.
    const t = temaDna({ hladania: [{ dopyt: "cviky", zobrazenia: 900 }] }, D("2026-09-03"));
    expect(t.tema).not.toContain("„cviky“");
  });

  it("cez dlhšie obdobie sa témy neopakujú dokola po piatich dňoch", () => {
    const temy = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const d = new Date(Date.UTC(2026, 8, 1 + i, 6));
      temy.add(temaDna(Z, d).tema);
    }
    // 25 dní musí dať výrazne viac než 5 rôznych tém.
    expect(temy.size).toBeGreaterThan(10);
  });
});

// Reálne dáta 3. 9. 2026 ukázali dve slabé miesta, ktoré testy nezachytili.
describe("téma musí byť povedateľná pred kamerou", () => {
  const D2 = (s: string) => new Date(`${s}T06:00:00Z`);

  it("odkaz z nápadov sa nepoužije ako téma", () => {
    // `mkt_napady` slúži aj ako odkladisko inšpirácie.
    const napady = [
      { text: "Inšpirácia: https://www.instagram.com/p/DZcuwwzJcSo/", druh: "iné" },
      { text: "https://instagram.com/p/xyz", druh: "iné" },
    ];
    for (let i = 0; i < 10; i++) {
      const t = temaDna({ napady }, new Date(Date.UTC(2026, 8, 1 + i, 6)));
      expect(t.tema).not.toContain("http");
    }
  });

  it("fáza dáva zadanie v druhej osobe, nie opis kategórie", () => {
    const den = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]
      .find((d) => temaDna({}, D2(d)).druh === "faza") as string;
    const t = temaDna({}, D2(den));
    // „Je pripravený. Chýba mu dôkaz" je opis publika — nie to, čo má povedať.
    expect(t.tema).not.toContain("Chýba mu dôkaz");
    expect(t.tema).toMatch(/Povedz|Pomenuj|Vysvetli|Ukáž/);
  });
});
