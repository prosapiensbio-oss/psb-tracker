import { describe, expect, it } from "bun:test";

import { kontrolaKanalov, kontrolaMerania, type MeranieMesiac, type Riadok } from "./kontrolaDat";

const r = (mesiac: string, kanal: string, metrika: string, hodnota: number): Riadok =>
  ({ mesiac, kanal, metrika, hodnota });

/** Rada dvanástich mesiacov okolo rovnakej hodnoty — základ pre kontrolu rádu. */
const rada = (kanal: string, metrika: string, v: number) =>
  Array.from({ length: 12 }, (_, i) => r(`2026-${String(i + 1).padStart(2, "0")}`, kanal, metrika, v));

describe("dvojice, ktoré sa musia rovnať", () => {
  it("nájde presne tú chybu, kvôli ktorej to vzniklo", () => {
    // Júl 2026: Impressions 2 994, Views 137 200.
    const v = kontrolaKanalov([
      r("2026-07", "Instagram", "Impressions", 2994),
      r("2026-07", "Instagram", "Views", 137200),
    ], []);
    expect(v).toHaveLength(1);
    expect(v[0].zavaznost).toBe("vysoka");
    expect(v[0].nadpis).toContain("nerovnajú");
  });

  it("zaokrúhľovanie v zostave nehlási", () => {
    expect(kontrolaKanalov([
      r("2026-06", "Instagram", "Impressions", 75020),
      r("2026-06", "Instagram", "Views", 75000),
    ], [])).toEqual([]);
  });

  it("keď jedno z čísel chýba, mlčí — chýbajúce nie je zlé", () => {
    expect(kontrolaKanalov([r("2026-06", "Instagram", "Impressions", 75020)], [])).toEqual([]);
  });

  it("dve nuly nie sú nezhoda", () => {
    expect(kontrolaKanalov([
      r("2026-06", "Instagram", "Impressions", 0),
      r("2026-06", "Instagram", "Views", 0),
    ], [])).toEqual([]);
  });

  it("iný kanál sa nekontroluje — pravidlo platí len pre Instagram", () => {
    expect(kontrolaKanalov([
      r("2026-06", "Facebook", "Impressions", 100),
      r("2026-06", "Facebook", "Views", 90000),
    ], [])).toEqual([]);
  });
});

describe("výdavok na reklamu z dvoch zdrojov", () => {
  it("rozdiel nad desatinu a nad 200 Kč sa hlási", () => {
    const v = kontrolaKanalov([r("2026-07", "Meta Ads", "Spent", 3000)], [{ mesiac: "2026-07", spend: 4796 }]);
    expect(v.some((x) => x.kluc === "reklama|2026-07")).toBe(true);
  });

  it("rozdiel pod dvesto korún nikoho nezaujíma", () => {
    const v = kontrolaKanalov([r("2026-07", "Meta Ads", "Spent", 800)], [{ mesiac: "2026-07", spend: 950 }]);
    expect(v.some((x) => x.kluc.startsWith("reklama"))).toBe(false);
  });

  it("zhodné čísla nehlásia nič", () => {
    const v = kontrolaKanalov([r("2026-07", "Meta Ads", "Spent", 4796)], [{ mesiac: "2026-07", spend: 4796 }]);
    expect(v).toEqual([]);
  });

  it("mesiac, ktorý je len v jednom zdroji, sa nehodnotí", () => {
    const v = kontrolaKanalov([r("2026-06", "Meta Ads", "Spent", 1881)], [{ mesiac: "2026-07", spend: 4796 }]);
    expect(v.some((x) => x.kluc.startsWith("reklama"))).toBe(false);
  });
});

describe("hodnota mimo rádu", () => {
  it("hodnota tridsaťkrát nižšia než medián sa označí", () => {
    const riadky = [...rada("Instagram", "Views", 100000), r("2026-13", "Instagram", "Views", 3000)];
    const v = kontrolaKanalov(riadky, []);
    expect(v.some((x) => x.kluc.includes("Views") && x.nadpis.includes("mimo rádu"))).toBe(true);
  });

  it("starý výkyv sa NEHLÁSI — podľa deväť mesiacov starého čísla sa nerozhoduje", () => {
    // Jerry, 13. 8.: „Facebook 2025-11 — prečo by ma toto malo zaujímať?"
    // Nemalo. Dohad má zmysel len o mesiacoch, ktoré sú ešte v hre.
    const riadky = [
      r("2026-01", "Facebook", "Impressions", 2086),
      ...Array.from({ length: 11 }, (_, i) => r(`2026-${String(i + 2).padStart(2, "0")}`, "Facebook", "Impressions", 25520)),
    ];
    expect(kontrolaKanalov(riadky, []).some((x) => x.nadpis.includes("mimo rádu"))).toBe(false);
  });

  it("starý výkyv ale medián nepokazí — rad sa počíta z celej histórie", () => {
    // Keby sa staré mesiace zo série vyhodili, medián by sa posunul a čerstvý
    // mesiac by sa porovnával proti skreslenej norme.
    const riadky = [
      r("2026-01", "Instagram", "Views", 1),
      ...Array.from({ length: 11 }, (_, i) => r(`2026-${String(i + 2).padStart(2, "0")}`, "Instagram", "Views", 100000)),
      r("2026-13", "Instagram", "Views", 100000),
    ];
    // Posledný mesiac je normálny → nič sa nehlási, hoci v rade je odľahlá
    // hodnota z januára.
    expect(kontrolaKanalov(riadky, []).some((x) => x.nadpis.includes("mimo rádu"))).toBe(false);
  });

  it("bežný výkyv sa nehlási — v marketingu je dvojnásobok normálny", () => {
    const riadky = [...rada("Instagram", "Views", 100000), r("2026-13", "Instagram", "Views", 250000)];
    expect(kontrolaKanalov(riadky, []).some((x) => x.nadpis.includes("mimo rádu"))).toBe(false);
  });

  it("krátka rada sa nekontroluje — medián nie je na čom postaviť", () => {
    const v = kontrolaKanalov([
      r("2026-01", "TikTok", "Views", 100),
      r("2026-02", "TikTok", "Views", 90000),
    ], []);
    expect(v).toEqual([]);
  });

  it("nuly rad nezhodia ani nevyrobia delenie nulou", () => {
    const riadky = [...rada("LinkedIn", "Impressions", 0), r("2026-13", "LinkedIn", "Impressions", 5)];
    expect(() => kontrolaKanalov(riadky, [])).not.toThrow();
    expect(kontrolaKanalov(riadky, [])).toEqual([]);
  });
});

describe("poradie", () => {
  it("vysoká závažnosť ide pred strednou", () => {
    const v = kontrolaKanalov([
      r("2026-07", "Instagram", "Impressions", 2994),
      r("2026-07", "Instagram", "Views", 137200),
      r("2026-07", "Meta Ads", "Spent", 3000),
    ], [{ mesiac: "2026-07", spend: 4796 }]);
    expect(v[0].zavaznost).toBe("vysoka");
  });
});

describe("strážca merania", () => {
  const rada12 = (novi: number): MeranieMesiac[] => Array.from({ length: 12 }, (_, i) => ({ m: `2026-${String(i + 1).padStart(2, "0")}`, novi }));
  const gsc12 = (kliky: number) => Array.from({ length: 12 }, (_, i) => ({ m: `2026-${String(i + 1).padStart(2, "0")}`, kliky }));

  it("nájde presne to, čo sa dialo od marca 2026", () => {
    // Search Console drží, GA4 spadlo na nulu.
    const ga4 = rada12(300); ga4[3].novi = 0;
    const v = kontrolaMerania(ga4, gsc12(235));
    expect(v).toHaveLength(1);
    expect(v[0].nadpis).toContain("GA4 ho nemeria");
    expect(v[0].zavaznost).toBe("vysoka");
  });

  it("mesiac, ktorý v GA4 vôbec nie je, je rovnaká správa", () => {
    const ga4 = rada12(300).filter((x) => x.m !== "2026-04");
    expect(kontrolaMerania(ga4, gsc12(235)).some((x) => x.kluc === "meranie|2026-04")).toBe(true);
  });

  it("už označený nemeraný mesiac sa nehlási druhýkrát", () => {
    const ga4 = rada12(300); ga4[3] = { m: "2026-04", novi: 0, chyba: true };
    expect(kontrolaMerania(ga4, gsc12(235))).toEqual([]);
  });

  it("čiastočný mesiac sa tiež nehlási — vie sa o ňom", () => {
    const ga4 = rada12(300); ga4[3] = { m: "2026-04", novi: 21, castocne: true };
    expect(kontrolaMerania(ga4, gsc12(235))).toEqual([]);
  });

  it("keď spadnú OBIDVA zdroje, nie je to chyba merania", () => {
    // Web mal slabý mesiac. To je správa o webe, nie o skripte.
    const ga4 = rada12(300); ga4[3].novi = 10;
    const gsc = gsc12(235); gsc[3].kliky = 12;
    expect(kontrolaMerania(ga4, gsc)).toEqual([]);
  });

  it("bežný pokles sa nehlási — polovica nie je rád", () => {
    const ga4 = rada12(300); ga4[3].novi = 150;
    expect(kontrolaMerania(ga4, gsc12(235))).toEqual([]);
  });

  it("krátka história sa nekontroluje", () => {
    expect(kontrolaMerania([{ m: "2026-01", novi: 300 }], [{ m: "2026-01", kliky: 235 }])).toEqual([]);
  });

  it("malé čísla sa nekontrolujú — tam je výkyv normálny", () => {
    const ga4 = rada12(8); ga4[3].novi = 0;
    expect(kontrolaMerania(ga4, gsc12(235))).toEqual([]);
  });
});
