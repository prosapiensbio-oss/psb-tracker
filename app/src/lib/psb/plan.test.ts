import { describe, expect, it } from "bun:test";

import {
  KATALOG_METRIK, METRIKA_MAPA, dlzkaPlanu, mesiacePlanu, skontrolujPlan, splnenie, type Plan,
} from "./plan";

const zaklad: Plan = {
  id: "p1", nazov: "Jeseň 2026", od: "2026-09", do: "2026-12",
  ciel: "Zaplniť 8 voľných miest", preco: "Odišlo 8 klientov",
  metriky: [{ kluc: "dopyty", cielova: 10.5 }],
  pristup: "Fáza 3 a 4, dva reely týždenne", rozpocet: 0,
  stav: "navrh", vyhodnotenie: "",
};

describe("obdobie plánu", () => {
  it("berie oba kraje vrátane", () => {
    expect(mesiacePlanu("2026-09", "2026-12")).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(dlzkaPlanu({ od: "2026-09", do: "2026-09" })).toBe(1);
  });

  it("prechádza cez zlom roka", () => {
    expect(mesiacePlanu("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("nezmyselný rozsah vráti prázdno, nie vymyslené mesiace", () => {
    expect(mesiacePlanu("2026-12", "2026-09")).toEqual([]);
    expect(mesiacePlanu("", "2026-09")).toEqual([]);
    expect(mesiacePlanu("2026-9", "2026-12")).toEqual([]);
  });

  it("preklep v roku nevyrobí plán na sto rokov", () => {
    expect(mesiacePlanu("2026-01", "2126-01")).toEqual([]);
  });

  it("trinásty mesiac neexistuje — vzor \\d{2} ho pustil a plán vyšiel prázdny", () => {
    expect(mesiacePlanu("2026-13", "2027-02")).toEqual([]);
    expect(mesiacePlanu("2026-00", "2026-05")).toEqual([]);
    expect(mesiacePlanu("2026-09", "2026-13")).toEqual([]);
  });
});

describe("splnenie metriky", () => {
  it("pri metrike, kde je vyššie lepšie, je to bežný pomer", () => {
    expect(splnenie(METRIKA_MAPA.get("dopyty")!, 8, 10)).toBe(80);
  });

  it("pri cene za dopyt sa pomer OBRACIA — lacnejšie je lepšie", () => {
    const def = METRIKA_MAPA.get("cenaZaDopyt")!;
    expect(splnenie(def, 500, 1000)).toBe(200);
    expect(splnenie(def, 2000, 1000)).toBe(50);
  });

  it("bez skutočnosti alebo bez cieľa nevráti číslo", () => {
    expect(splnenie(METRIKA_MAPA.get("dopyty")!, null, 10)).toBe(null);
    expect(splnenie(METRIKA_MAPA.get("dopyty")!, 8, 0)).toBe(null);
  });
});

describe("kontrola plánu", () => {
  it("dobrý plán nemá tvrdý nález", () => {
    expect(skontrolujPlan(zaklad).filter((x) => x.tvrdy)).toHaveLength(0);
  });

  it("plán bez metriky sa nedá vyhodnotiť", () => {
    const n = skontrolujPlan({ ...zaklad, metriky: [] });
    expect(n.some((x) => x.tvrdy && /nebude sa čím merať/.test(x.text))).toBe(true);
  });

  it("plán bez cieľa je len práca", () => {
    expect(skontrolujPlan({ ...zaklad, ciel: "  " }).some((x) => x.tvrdy)).toBe(true);
  });

  it("metrika bez cieľovej hodnoty je tvrdý nález", () => {
    const n = skontrolujPlan({ ...zaklad, metriky: [{ kluc: "dopyty", cielova: 0 }] });
    expect(n.some((x) => x.tvrdy && /cieľovú hodnotu/.test(x.text))).toBe(true);
  });

  it("rozpočet bez metriky o dopytoch je mäkké upozornenie, nie chyba", () => {
    const n = skontrolujPlan({ ...zaklad, rozpocet: 20000, metriky: [{ kluc: "ulozenia", cielova: 3 }] });
    const x = n.find((y) => /čo za tie peniaze prišlo/.test(y.text));
    expect(x?.tvrdy).toBe(false);
  });

  it("jeden mesiac aj rok upozorní, ale nezablokuje", () => {
    for (const [od, doo] of [["2026-09", "2026-09"], ["2026-01", "2027-06"]]) {
      const n = skontrolujPlan({ ...zaklad, od, do: doo });
      expect(n.filter((x) => x.tvrdy)).toHaveLength(0);
      expect(n.some((x) => !x.tvrdy)).toBe(true);
    }
  });

  it("neznámu metriku odmietne", () => {
    const n = skontrolujPlan({ ...zaklad, metriky: [{ kluc: "vymyslena", cielova: 5 }] });
    expect(n.some((x) => x.tvrdy && /Neznáma metrika/.test(x.text))).toBe(true);
  });
});

describe("katalóg metrík", () => {
  it("má jedinečné kľúče a každá vysvetľuje, načo je", () => {
    expect(new Set(KATALOG_METRIK.map((m) => m.kluc)).size).toBe(KATALOG_METRIK.length);
    for (const m of KATALOG_METRIK) expect(m.popis.length).toBeGreaterThan(25);
  });

  it("cena za dopyt je jediná, kde je nižšie lepšie", () => {
    expect(KATALOG_METRIK.filter((m) => !m.vyssieLepsie).map((m) => m.kluc)).toEqual(["cenaZaDopyt"]);
  });
});
