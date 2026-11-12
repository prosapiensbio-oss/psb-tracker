import { describe, expect, it } from "bun:test";

import { postavReport, type MesiacReportu } from "./mesacnyReport";
import { dalej, plnyKrok, postavPrezentaciu, postavPrezentaciuA, spat, type SlajdAkcie, type SlajdOtazka, type SlajdSemafor, type SlajdTitulka, type SlajdZaver } from "./prezentacia";

const m = (mm: string, o: Partial<MesiacReportu> = {}): MesiacReportu => ({ m: mm, hodiny: 200, aktivni: 55, novi: 5, dopyty: 6, prijmy: 200000, naklady: 150000, zisk: 50000, prirastokIg: 10, dosahReels: 450, reklama: 2000, prestali: 3, ...o });
const mesiace = [
  m("2026-03"), m("2026-04"), m("2026-05"), m("2026-06"),
  m("2026-07", { hodiny: 214 }), m("2026-08", { hodiny: 183 }),
  m("2026-09", { hodiny: 231, aktivni: 60, novi: 4, dopyty: 7, zisk: 60000 }),
];
const extra = { odmlcani: 3, zositChyba: false, topVydaje: [{ nazov: "Nájom", suma: 54750 }], zdroje: [{ zdroj: "referencia", pocet: 3 }] };
const report = postavReport(mesiace, "2026-09", "mesiac", extra);

describe("prezentácia z reportu", () => {
  it("poskladá príbeh: titulka, semafor, otázka po otázke, záver, akcie", () => {
    const s = postavPrezentaciu(report);
    expect(s[0].druh).toBe("titulka");
    expect(s[1].druh).toBe("semafor");
    expect(s.filter((x) => x.druh === "otazka").map((x) => (x as SlajdOtazka).id)).toEqual(report.otazky.map((o) => o.id));
    expect(s[s.length - 2].druh).toBe("zaver");
    expect(s[s.length - 1].druh).toBe("akcie");
    expect(s.length).toBe(2 + report.otazky.length + 2);
  });

  it("číslo na slajde je to isté, aké má report — nič sa neprepočítava", () => {
    const s = postavPrezentaciu(report);
    const praca = s.find((x) => x.druh === "otazka" && x.id === "praca") as SlajdOtazka;
    const zdroj = report.otazky.find((o) => o.id === "praca")!;
    expect(praca.hodnota).toBe("231");
    expect(praca.jednotka).toBe(zdroj.hlavne.jednotka);
    expect(praca.zmena).toBe(zdroj.hlavne.zmena);
    expect(praca.odpoved).toBe(zdroj.odpoved);
    expect(praca.seria).toEqual(zdroj.hlavne.seria);
    const titulka = s[0] as SlajdTitulka;
    expect(titulka.nadpis).toBe("September 2026");
    expect(titulka.porovnanie).toBe(report.porovnanie);
    expect(titulka.cisla[0].hodnota).toBe("231 hodín");
  });

  it("semafor nesie slovo aj hodnotu každej otázky", () => {
    const sem = postavPrezentaciu(report)[1] as SlajdSemafor;
    expect(sem.karty.length).toBe(report.otazky.length);
    expect(sem.nadpis).toBe("Šesť otázok, jeden pohľad");
    for (const k of sem.karty) {
      expect(k.hodnota.length).toBeGreaterThan(0);
      expect(["z", "o", "c"]).toContain(k.semafor);
    }
  });

  it("záver delí otázky na dobré, na tie, čo si žiadajú pozornosť, a na tie bez zdroja", () => {
    const z = postavPrezentaciu(report).find((x) => x.druh === "zaver") as SlajdZaver;
    expect(z.dobre.length + z.pozor.length + z.bezDat.length).toBe(report.otazky.length);
    expect(z.dobre.concat(z.pozor).join(" ")).toContain("?");
    // otázka bez čísla sa nesmie objaviť medzi dobrými ani medzi varovaniami
    for (const otazka of z.bezDat) {
      expect(z.dobre.some((r) => r.startsWith(otazka))).toBe(false);
      expect(z.pozor.some((r) => r.startsWith(otazka))).toBe(false);
    }
    expect(z.dobre.concat(z.pozor).join(" ")).not.toContain("—");
  });

  it("akcie sú návrhy reportu; vety bez návrhu sa nepočítajú", () => {
    const a = postavPrezentaciu(report).find((x) => x.druh === "akcie") as SlajdAkcie;
    for (const x of a.akcie) expect(x.text).not.toMatch(/^(Bez zmeny|Držať)/i);
    expect(a.nadpis).toBe("Čo urobíme v ďalšom mesiaci");
  });

  it("chýbajúci zdroj dá pomlčku, nie nulu, a z titulky vypadne", () => {
    const bez = postavReport([...mesiace.slice(0, 6), m("2026-09", { prijmy: undefined, zisk: undefined, naklady: undefined })], "2026-09", "mesiac", { ...extra, zositChyba: true });
    const s = postavPrezentaciu(bez);
    const peniaze = s.find((x) => x.druh === "otazka" && x.id === "peniaze") as SlajdOtazka;
    if (peniaze.hodnota === "—") {
      expect((s[0] as SlajdTitulka).cisla.map((c) => c.popis)).not.toContain("Zarábame?");
    }
  });

  it("šípka ide po celých slajdoch a každý slajd je hneď celý (18. 10. 2026)", () => {
    const s = postavPrezentaciu(report);
    expect(spat(s, 0, 0)).toBeNull();
    let kde = { i: 0, krok: plnyKrok(s, 0) };
    let n = 1;
    for (;;) {
      const d = dalej(s, kde.i, kde.krok);
      if (!d) break;
      kde = d;
      n++;
      expect(kde.krok).toBe(s[kde.i].kroky - 1);
      expect(n).toBeLessThan(500);
    }
    expect(kde.i).toBe(s.length - 1);
    expect(n).toBe(s.length);
    let z = 1;
    for (;;) {
      const p = spat(s, kde.i, kde.krok);
      if (!p) break;
      kde = p;
      z++;
    }
    expect(z).toBe(n);
    expect(kde).toEqual({ i: 0, krok: plnyKrok(s, 0) });
  });

  it("kvartálny report má vlastný nadpis titulky aj akcií", () => {
    const q = postavReport([m("2025-10"), m("2025-11"), m("2025-12"), m("2026-01"), m("2026-02"), m("2026-03"), m("2026-04"), m("2026-05"), m("2026-06"), m("2026-07"), m("2026-08"), m("2026-09")], "2026-09", "kvartal", extra);
    const s = postavPrezentaciu(q);
    expect((s[0] as SlajdTitulka).nadpis).toBe("Kvartálny report Q3 2026");
    expect((s[s.length - 1] as SlajdAkcie).nadpis).toBe("Čo urobíme v ďalšom štvrťroku");
  });
});

describe("prezentácia, návrh A (bez opakovania)", () => {
  const ex = {
    ...extra,
    strop: { jerry: 120, terezka: 120 },
    rezervaMesiacov: 1.8, dlzne: 50780, predplateneHodiny: 315, odlozeneDoRezervy: 4741,
    vydavky: [
      { kat: "fixne.prevadzka.najom", nazov: "Nájom", suma: 29750, priemer: 32000, mesiacov: 6 },
      { kat: "fixne.apps.ai", nazov: "AI", suma: 7694, priemer: 5638, mesiacov: 6 },
    ],
  };
  const r = postavReport(mesiace.map((x) => (x.m === "2026-09" ? { ...x, hodinyJerry: 132, hodinyTerezka: 99 } : x)), "2026-09", "mesiac", ex);
  const s = postavPrezentaciuA(r);

  it("každá otázka je okrem prehľadu na obrazovke najviac raz", () => {
    expect(s[0].druh).toBe("prehlad");
    for (const o of r.otazky) {
      const vOtazke = s.filter((x) => x.druh === "otazka" && x.id === o.id).length;
      const vSpolu = s.filter((x) => x.druh === "spolu" && x.karty.some((k) => k.id === o.id)).length;
      expect(vOtazke + vSpolu).toBe(1);
    }
    expect(s.some((x) => x.druh === "zaver" || x.druh === "semafor" || x.druh === "titulka")).toBe(false);
  });

  it("pri otázke už nie je „Urob“, na konci najviac tri veci", () => {
    expect(s.filter((x) => x.druh === "otazka").every((x) => x.druh === "otazka" && x.akcia === "")).toBe(true);
    const akcie = s[s.length - 1];
    expect(akcie.druh).toBe("akcie");
    if (akcie.druh === "akcie") {
      expect(akcie.akcie.length).toBeLessThanOrEqual(3);
      // Posledný blok sa ukáže na kroku `akcie.length`; slajd sa kreslí na kroku kroky - 1.
      expect(plnyKrok(s, s.length - 1)).toBeGreaterThanOrEqual(akcie.akcie.length);
    }
  });

  it("vyťaženosť, výdavky a rezerva majú vlastný slajd v poradí za prácou a peniazmi", () => {
    const druhy = s.map((x) => (x.druh === "otazka" ? x.id : x.druh));
    expect(druhy.slice(0, 6)).toEqual(["prehlad", "praca", "vytazenost", "peniaze", "vydavky", "rezerva"]);
    const v = s.find((x) => x.druh === "vytazenost");
    expect(v && v.druh === "vytazenost" && v.nadpis).toBe("Jerry je nad stropom, Terezka má 21 h voľných");
    const vy = s.find((x) => x.druh === "vydavky");
    expect(vy && vy.druh === "vydavky" && vy.p.vydavky.nestandardne.map((n) => n.kat)).toEqual(["fixne.apps.ai"]);
  });
});
