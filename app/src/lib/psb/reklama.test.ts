import { describe, expect, it } from "bun:test";

import { reklamaSuhrn, zReklamy, type ReklamaVstup } from "./reklama";

/**
 * Štyri karty odpovedali na „čo priniesla reklama" štyrmi výpočtami a žiadne
 * dve sa nezhodli. Testy strážia pravidlá, na ktorých stojí ten jeden.
 */

const zaklad = (o: Partial<ReklamaVstup> = {}): ReklamaVstup => ({
  mesiace: ["2026-07"],
  kanaly: [],
  mktMesacne: [],
  kampane: [],
  dopyty: [],
  menaKlientov: [],
  trzbaKlienta: () => 0,
  novychSpolu: 0,
  ...o,
});

describe("výdavok", () => {
  it("zdroje sa NESČÍTAVAJÚ — popisujú tie isté peniaze", () => {
    // Toto bola tá najdrahšia možná chyba: dvojnásobný výdavok znamená
    // dvojnásobnú cenu za klienta a rozhodnutie reklamu vypnúť.
    const v = reklamaSuhrn(zaklad({
      kanaly: [{ mesiac: "2026-07", metrika: "Spent", hodnota: 5000 }],
      mktMesacne: [{ m: "2026-07", spend: 5000 }],
    }));
    expect(v.spend).toBe(5000);
  });

  it("kampane z API majú prednosť pred zostavou", () => {
    const v = reklamaSuhrn(zaklad({
      kampane: [{ id: "k1", nazov: "A", mesiac: "2026-07", ciel: "traffic", spend: 1800 }],
      kanaly: [{ mesiac: "2026-07", metrika: "Spent", hodnota: 5000 }],
    }));
    expect(v.spend).toBe(1800);
    expect(v.zdrojVydavku).toBe("kampane");
  });

  it("bez jediného zdroja je nula a je to povedané", () => {
    expect(reklamaSuhrn(zaklad()).zdrojVydavku).toBe("ziadny");
  });

  it("mesiace mimo okna sa nerátajú", () => {
    const v = reklamaSuhrn(zaklad({ kanaly: [{ mesiac: "2026-06", metrika: "Spent", hodnota: 9000 }] }));
    expect(v.spend).toBe(0);
  });
});

describe("platená cesta verzus zmiešaná cena", () => {
  const vstup = zaklad({
    kanaly: [{ mesiac: "2026-07", metrika: "Spent", hodnota: 6000 }],
    dopyty: [
      { date: "2026-07-03", name: "Jan Novak", source: "reklama" },
      { date: "2026-07-10", name: "Petra Mala", source: "reklama" },
      { date: "2026-07-12", name: "Kto Odporucil", source: "referencia" },
    ],
    menaKlientov: ["Jan Novak"],
    trzbaKlienta: () => 7790,
    novychSpolu: 6,
  });

  it("platená cesta počíta LEN dopyty z reklamy", () => {
    const v = reklamaSuhrn(vstup);
    expect(v.platena.dopytov).toBe(2);
    expect(v.platena.klientov).toBe(1);
    expect(v.platena.cenaZaDopyt).toBe(3000);
    expect(v.platena.cenaZaKlienta).toBe(6000);
  });

  it("zmiešaná cena je NIŽŠIA a je to iné číslo", () => {
    const v = reklamaSuhrn(vstup);
    expect(v.zmiesana.cenaZaKlienta).toBe(1000);
    // Práve tento rozdiel bol dôvod, prečo štyri karty tvrdili štyri veci.
    expect(v.zmiesana.cenaZaKlienta!).toBeLessThan(v.platena.cenaZaKlienta!);
  });

  it("návratnosť je tržba ÷ výdavok", () => {
    expect(reklamaSuhrn(vstup).platena.navratnost).toBeCloseTo(7790 / 6000, 5);
  });

  it("bez výdavku nie je cena nula, ale nič", () => {
    const v = reklamaSuhrn(zaklad({ dopyty: [{ date: "2026-07-01", name: "X", source: "reklama" }] }));
    expect(v.platena.cenaZaDopyt).toBe(0);
    expect(v.platena.navratnost).toBe(null);
  });
});

describe("párovanie mien", () => {
  it("ten istý človek dvakrát je jeden dopyt", () => {
    const v = reklamaSuhrn(zaklad({
      dopyty: [
        { date: "2026-07-01", name: "Jan Novak", source: "reklama" },
        { date: "2026-07-20", name: "jan novak", source: "reklama" },
      ],
    }));
    expect(v.platena.dopytov).toBe(1);
  });

  it("diakritika nerobí z jedného človeka dvoch", () => {
    const v = reklamaSuhrn(zaklad({
      dopyty: [{ date: "2026-07-01", name: "Lukáš Hanus", source: "reklama" }],
      menaKlientov: ["Lukas Hanus"],
    }));
    expect(v.platena.klientov).toBe(1);
  });
});

describe("rozpad po kampaniach", () => {
  it("dopyt sa páruje cez UTM, nie pomerom výdavku", () => {
    // Rozpočítať dopyty medzi kampane podľa výdavku by vyrobilo čísla, ktoré
    // vyzerajú presne a nie sú ničím podložené.
    const v = reklamaSuhrn(zaklad({
      kampane: [
        { id: "k1", nazov: "Traffic — Dýchání", mesiac: "2026-07", ciel: "traffic", spend: 1800 },
        { id: "k2", nazov: "Engagement", mesiac: "2026-07", ciel: "engagement", spend: 3000 },
      ],
      dopyty: [{ date: "2026-07-05", name: "Jan Novak", source: "reklama", kampan: "Traffic — Dýchání" }],
      menaKlientov: ["Jan Novak"],
    }));
    const k1 = v.poKampaniach.find((k) => k.id === "k1")!;
    const k2 = v.poKampaniach.find((k) => k.id === "k2")!;
    expect(k1.dopytov).toBe(1);
    expect(k1.klientov).toBe(1);
    expect(k2.dopytov).toBe(0);
  });
});

describe("zReklamy", () => {
  it("zdroj reklama alebo vyplnená kampaň", () => {
    expect(zReklamy({ source: "reklama" })).toBe(true);
    expect(zReklamy({ source: "instagram", kampan: "Leto 2026" })).toBe(true);
    expect(zReklamy({ source: "instagram" })).toBe(false);
    expect(zReklamy({ source: "referencia", kampan: "  " })).toBe(false);
  });
});
