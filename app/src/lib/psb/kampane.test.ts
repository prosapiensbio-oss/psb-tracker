import { describe, expect, it } from "bun:test";

import { ciel, suhrnKampani, zlucKampane, type Kampan } from "./kampane";

const k = (o: Partial<Kampan> & { id: string; mesiac: string }): Kampan => ({
  nazov: "", ciel: "OUTCOME_AWARENESS", spend: 0, impressions: 0, clicks: 0, vysledky: 0, ...o,
});

describe("zlucKampane", () => {
  it("kampaň cez tri mesiace je jeden riadok, nie tri", () => {
    // Toto je tá chyba, kvôli ktorej to nie je v komponente: tri mesiace
    // jednej kampane by vyzerali ako tri kampane a cena za dopyt by vyšla
    // trojnásobne lepšie.
    const r = zlucKampane([
      k({ id: "a", mesiac: "2026-03", spend: 300, vysledky: 1 }),
      k({ id: "a", mesiac: "2026-02", spend: 200, vysledky: 2 }),
      k({ id: "a", mesiac: "2026-01", spend: 100, vysledky: 0 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ spend: 600, vysledky: 3, mesiacov: 3, od: "2026-01", do: "2026-03" });
  });

  it("meno a cieľ berie z najnovšieho mesiaca aj pri opačnom poradí", () => {
    // Meta vracia mesiace zostupne, ale poradie sa spoliehať nedá.
    const rastuce = zlucKampane([
      k({ id: "a", mesiac: "2026-01", nazov: "staré", ciel: "OUTCOME_AWARENESS" }),
      k({ id: "a", mesiac: "2026-05", nazov: "nové", ciel: "OUTCOME_LEADS" }),
    ]);
    const klesajuce = zlucKampane([
      k({ id: "a", mesiac: "2026-05", nazov: "nové", ciel: "OUTCOME_LEADS" }),
      k({ id: "a", mesiac: "2026-01", nazov: "staré", ciel: "OUTCOME_AWARENESS" }),
    ]);
    expect(rastuce[0].nazov).toBe("nové");
    expect(rastuce[0].ciel).toBe("OUTCOME_LEADS");
    expect(klesajuce[0].nazov).toBe("nové");
    expect(klesajuce[0].ciel).toBe("OUTCOME_LEADS");
  });

  it("radí podľa výdavku, nie podľa mesiaca", () => {
    const r = zlucKampane([
      k({ id: "malá", mesiac: "2026-07", spend: 100 }),
      k({ id: "veľká", mesiac: "2026-01", spend: 9000 }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["veľká", "malá"]);
  });
});

describe("suhrnKampani", () => {
  it("bez dopytov je cena null, nie nekonečno", () => {
    const s = suhrnKampani(zlucKampane([k({ id: "a", mesiac: "2026-01", spend: 5000 })]));
    expect(s.cena).toBeNull();
  });

  it("podiel výdavku mierený na dopyt počíta len z cieľov, čo o dopyt žiadali", () => {
    const s = suhrnKampani(zlucKampane([
      k({ id: "a", mesiac: "2026-01", spend: 750, ciel: "OUTCOME_AWARENESS" }),
      k({ id: "b", mesiac: "2026-01", spend: 250, ciel: "OUTCOME_LEADS" }),
    ]));
    expect(s.spend).toBe(1000);
    expect(s.naDopyt).toBe(250);
    expect(s.podielNaDopyt).toBe(25);
  });

  it("skutočné čísla z 19 mesiacov: na dopyt išlo pod percento", () => {
    const s = suhrnKampani(zlucKampane([
      k({ id: "eng", mesiac: "2026-01", spend: 14625, ciel: "OUTCOME_ENGAGEMENT" }),
      k({ id: "clk", mesiac: "2026-01", spend: 10771, ciel: "LINK_CLICKS" }),
      k({ id: "awa", mesiac: "2026-01", spend: 5797, ciel: "OUTCOME_AWARENESS" }),
      k({ id: "led", mesiac: "2026-01", spend: 260, ciel: "OUTCOME_LEADS" }),
    ]));
    expect(Math.round(s.spend)).toBe(31453);
    expect(s.podielNaDopyt).toBeLessThan(1);
  });

  it("prázdny vstup nedelí nulou", () => {
    expect(suhrnKampani([])).toMatchObject({ spend: 0, cena: null, podielNaDopyt: 0 });
  });
});

describe("ciel", () => {
  it("neznámy cieľ prežije a nepredstiera, že pýtal dopyt", () => {
    expect(ciel("NIECO_NOVE")).toMatchObject({ label: "NIECO_NOVE", dopyt: false });
    expect(ciel("")).toMatchObject({ label: "—", dopyt: false });
  });
});
