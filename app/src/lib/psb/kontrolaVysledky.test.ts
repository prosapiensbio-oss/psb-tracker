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

describe("stavSpolu", () => {
  it("nález prebije neznáme aj v poriadku", () => {
    expect(stavSpolu([{ text: "", stav: "ok" }, { text: "", stav: "nevie" }, { text: "", stav: "pozor" }])).toBe("pozor");
    expect(stavSpolu([{ text: "", stav: "ok" }, { text: "", stav: "nevie" }])).toBe("nevie");
    expect(stavSpolu([{ text: "", stav: "ok" }])).toBe("ok");
    expect(stavSpolu([])).toBeNull();
  });
});
