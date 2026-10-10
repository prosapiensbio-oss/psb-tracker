import { describe, expect, it } from "bun:test";

import { oblastKontroly, stavSpolu, vysledkyKontroly, type VstupKontroly } from "./kontrolaVysledky";

const ZAKLAD: VstupKontroly = {
  dnes: "2026-10-10",
  importy: { sessions: "2026-10-03", packages: "2026-10-03", metricool: "2026-10-10", gsc: "2026-08-03" },
  otvoreneUpozornenia: 0,
  stavUctu: { datum: "2026-10-01" },
  stavHotovosti: { datum: "2026-10-01" },
};

describe("oblastKontroly", () => {
  it("vytiahne oblasť z kľúča aj z holého mena", () => {
    expect(oblastKontroly("kontrola-peniaze-2026-09")).toBe("peniaze");
    expect(oblastKontroly("kontrola-jarvis-2026-12")).toBe("jarvis");
    expect(oblastKontroly("marketing")).toBe("marketing");
  });
});

describe("vysledkyKontroly", () => {
  it("peniaze: čerstvý stav účtu je v poriadku", () => {
    const r = vysledkyKontroly("peniaze", ZAKLAD);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ text: "Stav účtu je k: pred 9 dňami", stav: "ok" });
  });

  it("peniaze: starší než mesiac je nález", () => {
    const r = vysledkyKontroly("peniaze", { ...ZAKLAD, stavUctu: { datum: "2026-08-20" } });
    expect(r[0].stav).toBe("pozor");
  });

  it("chýbajúci zdroj je neznámy, nie v poriadku", () => {
    const r = vysledkyKontroly("peniaze", { ...ZAKLAD, stavUctu: null, stavHotovosti: null });
    expect(r.map((x) => x.stav)).toEqual(["nevie", "nevie"]);
    const j = vysledkyKontroly("jarvis", { ...ZAKLAD, importy: {} });
    expect(j.every((x) => x.stav === "nevie")).toBe(true);
    expect(j[0].text).toContain("nikdy sa nenahral");
  });

  it("jarvis: berie NAJNOVŠÍ z piatich reportov PTmindera", () => {
    const r = vysledkyKontroly("jarvis", {
      ...ZAKLAD,
      importy: { sessions: "2026-07-01", payments: "2026-10-05", metricool: "2026-10-10" },
    });
    expect(r[0]).toEqual({ text: "PTminder: pred 5 dňami", stav: "ok" });
  });

  it("jarvis: dva týždne je hranica, nie orientačné číslo", () => {
    const o = (d: string) => vysledkyKontroly("jarvis", { ...ZAKLAD, importy: { sessions: d, metricool: d } })[0].stav;
    expect(o("2026-09-26")).toBe("ok");      // presne 14 dní
    expect(o("2026-09-25")).toBe("pozor");   // 15
  });

  it("dnes a včera sa píšu slovom", () => {
    expect(vysledkyKontroly("marketing", { ...ZAKLAD, importy: { metricool: "2026-10-10" } })[0].text).toContain("dnes");
    expect(vysledkyKontroly("marketing", { ...ZAKLAD, importy: { metricool: "2026-10-09" } })[0].text).toContain("včera");
  });

  it("klienti: otvorené upozornenie je nález, nula nie", () => {
    expect(vysledkyKontroly("klienti", ZAKLAD)[0].stav).toBe("ok");
    expect(vysledkyKontroly("klienti", { ...ZAKLAD, otvoreneUpozornenia: 3 })[0]).toEqual({
      text: "Upozornenia mesiaca: 3 čaká na odpoveď", stav: "pozor",
    });
    expect(vysledkyKontroly("klienti", { ...ZAKLAD, otvoreneUpozornenia: undefined })[0].stav).toBe("nevie");
  });

  it("neznáma oblasť nevyrobí falošné v poriadku", () => {
    expect(vysledkyKontroly("nieco", ZAKLAD)).toEqual([]);
  });
});

describe("tržby z dvoch zdrojov", () => {
  const s = (kokpit: number, ptminder: number) =>
    vysledkyKontroly("peniaze", { ...ZAKLAD, trzby: { kokpit, ptminder, mesiac: "2026-10", platbyOd: "2026-10" } })[0];

  it("zhoda do tolerancie je v poriadku a ukáže obe čísla", () => {
    const r = s(324849, 324849);
    expect(r.stav).toBe("ok");
    // toLocaleString("sk-SK") oddeľuje tisíce PEVNOU medzerou (U+00A0),
    // nie obyčajnou — porovnanie na znak by padlo na neviditeľnom rozdiele.
    const cisla = (x?: string) => (x || "").replace(/\s/g, " ");
    expect(cisla(r.kokpit)).toBe("324 849 Kč");
    expect(cisla(r.druhy)).toBe("324 849 Kč");
    expect(r.zdroj).toBe("PTminder");
  });

  it("tolerancia je 200 Kč alebo 1 %, čo je viac — ako pri prepínači peňazí", () => {
    expect(s(100150, 100000).stav).toBe("ok");      // 150 Kč pri 100 tis.
    expect(s(100900, 100000).stav).toBe("ok");      // 900 Kč = pod 1 %
    expect(s(102000, 100000).stav).toBe("pozor");   // 2 %
    expect(s(5190, 5000).stav).toBe("ok");          // 190 Kč pri malom mesiaci
    expect(s(5400, 5000).stav).toBe("pozor");       // 400 Kč
  });

  it("rozdiel je v texte aj so znamienkom", () => {
    expect(s(102000, 100000).text).toContain("+2000");
    expect(s(98000, 100000).text).toContain("-2000");
  });

  it("nula proti nule NIE JE zhoda", () => {
    const r = s(0, 0);
    expect(r.stav).toBe("nevie");
    expect(r.druhy).toBe("nemá platby");
  });

  it("bez vstupu sa riadok nekreslí — netvárime sa, že porovnanie prebehlo", () => {
    const bez = vysledkyKontroly("peniaze", { ...ZAKLAD, trzby: null });
    expect(bez.some((x) => x.text.startsWith("Tržby"))).toBe(false);
  });

  it("mesiac spred súbežného chodu sa NESÚDI — rozdiel je tam zámer", () => {
    const r = vysledkyKontroly("peniaze", {
      ...ZAKLAD,
      trzby: { kokpit: 232967, ptminder: 324849, mesiac: "2026-09", platbyOd: "2026-10" },
    })[0];
    expect(r.stav).toBe("nevie");
    expect(r.text).toContain("2026-10");
    // Žiadne číslo — porovnanie neprebehlo, tak sa ani netvári.
    expect(r.kokpit).toBeUndefined();
  });

  it("od zvoleného mesiaca sa už súdi", () => {
    const r = vysledkyKontroly("peniaze", {
      ...ZAKLAD,
      trzby: { kokpit: 232967, ptminder: 324849, mesiac: "2026-10", platbyOd: "2026-10" },
    })[0];
    expect(r.stav).toBe("pozor");
  });
});

describe("príjmy z banky bez klienta", () => {
  it("je to práca, nie rozpor — a vidno, koľko peňazí to je", () => {
    const r = (pocet: number, suma: number) =>
      vysledkyKontroly("peniaze", { ...ZAKLAD, prijmyBezKlienta: { pocet, suma } }).find((x) => x.text.includes("Príjmy z banky"));
    expect(r(0, 0)?.stav).toBe("ok");
    expect(r(8, 91882)?.stav).toBe("pozor");
    expect((r(8, 91882)?.kokpit || "").replace(/\s/g, " ")).toBe("91 882 Kč");
  });
});

describe("dopyty bez zdroja", () => {
  it("všetky so zdrojom je v poriadku, čo i len jeden bez neho je nález", () => {
    const r = (bezZdroja: number) =>
      vysledkyKontroly("marketing", { ...ZAKLAD, dopyty: { spolu: 8, bezZdroja } }).find((x) => x.text.includes("Dopyty"));
    expect(r(0)?.stav).toBe("ok");
    expect(r(1)?.stav).toBe("pozor");
    expect(r(3)?.kokpit).toBe("3 z 8");
  });
});

describe("stavSpolu", () => {
  it("nález prebije neznáme aj v poriadku", () => {
    expect(stavSpolu([{ text: "", stav: "ok" }, { text: "", stav: "nevie" }, { text: "", stav: "pozor" }])).toBe("pozor");
    expect(stavSpolu([{ text: "", stav: "ok" }, { text: "", stav: "nevie" }])).toBe("nevie");
    expect(stavSpolu([{ text: "", stav: "ok" }])).toBe("ok");
    expect(stavSpolu([])).toBeNull();
  });
});
