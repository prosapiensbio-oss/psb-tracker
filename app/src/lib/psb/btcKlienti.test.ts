// Koľko kto zaplatil v bitcoine a čo to má za hodnotu dnes.
//
// Jerry, 2. 9. 2026: „pýtal som sa Jarvisa, koľko Knapčok platil v CZK, a
// povedal mi správne. Keď som sa spýtal, koľko to bolo v BTC, nevedel."
import { describe, expect, it } from "bun:test";

import { btcPodlaKlientov } from "./btcKontrola";

const KURZ = 2_400_000; // Kč za 1 BTC

describe("btcPodlaKlientov", () => {
  it("sčíta satoshi aj koruny cez všetky platby jedného človeka", () => {
    const v = btcPodlaKlientov([
      { klient: "Michal Knapčok", czk: 9000, sats: 400_000 },
      { klient: "Michal Knapčok", czk: 6000, sats: 250_000 },
    ], KURZ);
    expect(v.length).toBe(1);
    expect(v[0].sats).toBe(650_000);
    expect(v[0].czkVtedy).toBe(15000);
    expect(v[0].platieb).toBe(2);
  });

  it("dnešná hodnota je satoshi krát kurz", () => {
    // 650 000 sats = 0,0065 BTC × 2 400 000 = 15 600 Kč
    const v = btcPodlaKlientov([{ klient: "X Y", czk: 15000, sats: 650_000 }], KURZ);
    expect(v[0].czkDnes).toBe(15600);
    expect(v[0].rozdielCzk).toBe(600);
    expect(v[0].rozdielPct).toBe(4);
  });

  it("bez kurzu sa dnešná hodnota NETVRDÍ", () => {
    // Vymyslené číslo o peniazoch je horšie než „neviem".
    const v = btcPodlaKlientov([{ klient: "X Y", czk: 15000, sats: 650_000 }], null);
    expect(v[0].czkDnes).toBe(null);
    expect(v[0].rozdielPct).toBe(null);
  });

  it("prepis mena z BTC knihy sa spáruje na meno z PTmindera", () => {
    // BTC kniha píše „Procházka", PTminder „Prochadzka" — je to jeden človek.
    const v = btcPodlaKlientov(
      [{ klient: "Matej Procházka", czk: 5000, sats: 200_000 }],
      KURZ, ["Matej Prochadzka"],
    );
    expect(v[0].klient).toBe("Matej Prochadzka");
  });

  it("platba bez mena sa ignoruje a nulové koruny nedajú nekonečné percento", () => {
    const v = btcPodlaKlientov([
      { klient: null, czk: 1000, sats: 50_000 },
      { klient: "Barter Klient", czk: 0, sats: 100_000 },
    ], KURZ);
    expect(v.length).toBe(1);
    expect(v[0].rozdielPct).toBe(null);
    expect(Number.isFinite(v[0].czkDnes as number)).toBe(true);
  });

  it("zoradené od najväčšieho podielu v satoshi", () => {
    const v = btcPodlaKlientov([
      { klient: "Malý", czk: 1000, sats: 10_000 },
      { klient: "Veľký", czk: 9000, sats: 900_000 },
    ], KURZ);
    expect(v.map((x) => x.klient)).toEqual(["Veľký", "Malý"]);
  });
});

// Jerry, 3. 9. 2026: „chcel by som, aby vedel zistiť aj za poslednú platbu."
describe("btcPlatbyJednotlivo", () => {
  const KURZ2 = 1_645_102;
  const PLATBY = [
    { klient: "Peter Gažo", datum: "2026-08-07T10:00:00Z", czk: 7999, sats: 591_480 },
    { klient: "Peter Gažo", datum: "2026-08-17T09:00:00Z", czk: 12081, sats: 911_117 },
    { klient: null, datum: "2026-08-01", czk: 500, sats: 30_000 },
  ];

  it("vráti platby jednotlivo, najnovšiu prvú", async () => {
    const { btcPlatbyJednotlivo } = await import("./btcKontrola");
    const v = btcPlatbyJednotlivo(PLATBY, KURZ2);
    expect(v.map((x) => x.datum)).toEqual(["2026-08-17", "2026-08-07"]);
  });

  it("ku každej platbe dá hodnotu vtedy aj dnes", async () => {
    const { btcPlatbyJednotlivo } = await import("./btcKontrola");
    const posledna = btcPlatbyJednotlivo(PLATBY, KURZ2)[0];
    expect(posledna.czkVtedy).toBe(12081);
    // 911 117 sats = 0,00911117 BTC × 1 645 102 ≈ 14 990 Kč
    expect(posledna.czkDnes).toBe(Math.round((911_117 / 1e8) * KURZ2));
    expect(posledna.sats).toBe(911_117);
  });

  it("bez kurzu sa dnešná hodnota netvrdí ani pri jednotlivej platbe", async () => {
    const { btcPlatbyJednotlivo } = await import("./btcKontrola");
    expect(btcPlatbyJednotlivo(PLATBY, null)[0].czkDnes).toBe(null);
  });

  it("súčet jednotlivých platieb sedí so súčtom za klienta", async () => {
    const { btcPlatbyJednotlivo, btcPodlaKlientov } = await import("./btcKontrola");
    const jedn = btcPlatbyJednotlivo(PLATBY, KURZ2);
    const spolu = btcPodlaKlientov(PLATBY, KURZ2)[0];
    expect(jedn.reduce((a, x) => a + x.sats, 0)).toBe(spolu.sats);
    expect(jedn.reduce((a, x) => a + x.czkVtedy, 0)).toBe(spolu.czkVtedy);
  });
});
