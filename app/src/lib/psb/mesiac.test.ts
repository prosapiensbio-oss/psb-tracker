import { describe, expect, it } from "bun:test";

import { prirastky, statistiky, suvislosti, zmenaPct } from "./mesiac";

const tok = [
  { m: "2026-01", v: 100 },
  { m: "2026-02", v: 300 },
  { m: "2026-03", v: 200 },
];

describe("statistiky — tok", () => {
  it("priemer, medián a rekordy nad hodnotami", () => {
    const s = statistiky(tok, "tok");
    expect(s.priemer).toBe(200);
    expect(s.median).toBe(200);
    expect(s.najlepsi).toEqual({ m: "2026-02", v: 300 });
    expect(s.najhorsi).toEqual({ m: "2026-01", v: 100 });
    expect(s.sucet).toBe(600);
  });

  it("zmena je oproti predošlému mesiacu", () => {
    // 300 → 200 je -33,3 %.
    expect(Math.round(statistiky(tok).zmena!)).toBe(-33);
  });

  it("odchýlka sa meria voči ZVYŠKU, nie voči priemeru vrátane seba", () => {
    // Zvyšok je 100 a 300, priemer 200; posledný je 200 → nula.
    // Keby sa počítalo voči priemeru všetkých troch, vyšlo by to isté len
    // náhodou — preto druhý prípad nižšie.
    expect(statistiky(tok).odchylka).toBe(0);
    const s = statistiky([{ m: "2026-01", v: 100 }, { m: "2026-02", v: 200 }]);
    expect(s.odchylka).toBe(100); // 200 je o 100 % nad zvyškom (100)
  });

  it("neusporiadaný vstup si zoradí sám", () => {
    const s = statistiky([...tok].reverse());
    expect(s.posledny).toEqual({ m: "2026-03", v: 200 });
  });
});

describe("statistiky — stav", () => {
  const sledovatelia = [
    { m: "2026-01", v: 1400 },
    { m: "2026-02", v: 1450 },
    { m: "2026-03", v: 1455 },
  ];

  it("počíta sa nad prírastkami, nie nad úrovňami", () => {
    // Bez toho by „najlepší mesiac sledovateľov" vyšiel vždy ten posledný.
    const s = statistiky(sledovatelia, "stav");
    expect(s.rad).toEqual([{ m: "2026-02", v: 50 }, { m: "2026-03", v: 5 }]);
    expect(s.najlepsi).toEqual({ m: "2026-02", v: 50 });
    expect(s.najhorsi).toEqual({ m: "2026-03", v: 5 });
  });

  it("prvý mesiac vypadne — nemá sa od čoho odraziť", () => {
    expect(prirastky(sledovatelia)).toHaveLength(2);
  });

  it("pokles sledovateľov je záporný prírastok, nie nula", () => {
    const s = statistiky([{ m: "2026-01", v: 100 }, { m: "2026-02", v: 90 }], "stav");
    expect(s.rad[0].v).toBe(-10);
  });
});

describe("okrajové prípady", () => {
  it("prázdny rad nespadne", () => {
    const s = statistiky([]);
    expect(s).toMatchObject({ mesiacov: 0, najlepsi: null, posledny: null, zmena: null });
  });

  it("jeden mesiac nemá s čím porovnávať", () => {
    const s = statistiky([{ m: "2026-07", v: 5 }]);
    expect(s.zmena).toBeNull();
    expect(s.odchylka).toBeNull();
  });

  it("delenie nulou vráti null, nie nekonečno ani nulu", () => {
    // Nula by znamenala „bez zmeny", a to je iné tvrdenie než „nedá sa povedať".
    expect(zmenaPct(0, 50)).toBeNull();
    expect(zmenaPct(50, 0)).toBe(-100);
  });

  it("stav s jedným mesiacom nemá prírastok", () => {
    expect(statistiky([{ m: "2026-07", v: 1500 }], "stav").mesiacov).toBe(0);
  });
});

describe("suvislosti", () => {
  const zaklad = {
    dopyty: 5, dopytyPriemer: 5, spend: 1000, spendPriemer: 1000,
    dosah: 50000, dosahPriemer: 50000, noviKlienti: 2, prispevkov: 6, prispevkovPriemer: 6,
  };

  it("priemerný mesiac nemá čo hlásiť", () => {
    expect(suvislosti(zaklad)).toEqual([]);
  });

  it("dosah nad priemerom bez reklamy je organický zásah", () => {
    const s = suvislosti({ ...zaklad, dosah: 90000 });
    expect(s[0].tón).toBe("dobrá");
    expect(s[0].text).toContain("organický");
  });

  it("veľa peňazí a málo dopytov je zlá správa", () => {
    const s = suvislosti({ ...zaklad, spend: 4000, dopyty: 2, dopytyPriemer: 8 });
    expect(s.some((x) => x.tón === "zlá" && x.text.includes("dopyt nekúpili"))).toBe(true);
  });

  it("pri malých počtoch dopytov sa o nich mlčí", () => {
    // Tri dopyty oproti štyrom je jeden človek, nie prepad o 25 %.
    const s = suvislosti({ ...zaklad, dopyty: 3, dopytyPriemer: 4, spend: 4000 });
    expect(s.every((x) => !x.text.includes("dopyt"))).toBe(true);
  });

  it("nula klientov pri bežiacej reklame sa povie, ale bez paniky", () => {
    const s = suvislosti({ ...zaklad, noviKlienti: 0 });
    expect(s.some((x) => x.text.includes("pri troch po sebe"))).toBe(true);
  });
});
