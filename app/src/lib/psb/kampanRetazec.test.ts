import { describe, expect, it } from "bun:test";

import { retazecKampani, verdikt, type DopytRiadok, type KampanRiadok } from "./kampanRetazec";

const k = (o: Partial<KampanRiadok> & { id: string; nazov: string }): KampanRiadok =>
  ({ ciel: "OUTCOME_LEADS", spend: 1000, vysledkyMeta: 0, ...o });
const d = (o: Partial<DopytRiadok> & { id: string; name: string }): DopytRiadok =>
  ({ date: "2026-09-10", kampan: "", source: "reklama", ...o });

describe("retazecKampani", () => {
  it("spojí kampaň → dopyt → klient a dopočíta ceny", () => {
    const v = retazecKampani(
      [k({ id: "1", nazov: "IG_Lead_09", spend: 6000 })],
      [d({ id: "a", name: "Jan Kral", kampan: "IG_Lead_09" }),
       d({ id: "b", name: "Eva Nova", kampan: "IG_Lead_09" })],
      { "Jan Kral": { zaplatil: true, trzba: 9900 }, "Eva Nova": { zaplatil: false, trzba: 0 } },
    );
    expect(v.spolu).toMatchObject({ dopytov: 2, klientov: 1, trzba: 9900 });
    expect(v.spolu.cenaZaDopyt).toBe(3000);
    expect(v.spolu.cenaZaKlienta).toBe(6000);
    expect(v.prekazky).toEqual([]);
  });

  it("klient je ten, kto ZAPLATIL — nie ten, kto prišiel", () => {
    // Inak by cena za klienta bola cena za úvodný tréning.
    const v = retazecKampani(
      [k({ id: "1", nazov: "X", spend: 3000 })],
      [d({ id: "a", name: "Kto Neplatil", kampan: "X" })],
      { "Kto Neplatil": { zaplatil: false, trzba: 0 } },
    );
    expect(v.spolu.klientov).toBe(0);
    expect(v.spolu.cenaZaKlienta).toBeNull();
  });

  it("mená sa párujú bez ohľadu na diakritiku", () => {
    const v = retazecKampani(
      [k({ id: "1", nazov: "X" })],
      [d({ id: "a", name: "Eva Dolezalova", kampan: "X" })],
      { "Eva Doležalová": { zaplatil: true, trzba: 5000 } },
    );
    expect(v.spolu.klientov).toBe(1);
  });

  it("kampaň v UTM sa páruje presne, nie podreťazcom", () => {
    // „IG_Reels_2025_1" nesmie zobrať dopyty kampane „IG_Reels_2025_10".
    const v = retazecKampani(
      [k({ id: "1", nazov: "IG_Reels_2025_1" }), k({ id: "2", nazov: "IG_Reels_2025_10" })],
      [d({ id: "a", name: "A", kampan: "IG_Reels_2025_10" })],
      {},
    );
    expect(v.clanky.find((c) => c.kampan.id === "1")!.dopyty).toHaveLength(0);
    expect(v.clanky.find((c) => c.kampan.id === "2")!.dopyty).toHaveLength(1);
  });

  it("veľkosť písmen a medzery na okrajoch nerozhodujú", () => {
    const v = retazecKampani(
      [k({ id: "1", nazov: "IG_Lead_09" })],
      [d({ id: "a", name: "A", kampan: "  ig_lead_09 " })],
      {},
    );
    expect(v.spolu.dopytov).toBe(1);
  });

  it("radí podľa výdavku — najdrahšia kampaň je prvé rozhodnutie", () => {
    const v = retazecKampani(
      [k({ id: "malá", nazov: "m", spend: 100 }), k({ id: "veľká", nazov: "v", spend: 9000 })], [], {},
    );
    expect(v.clanky.map((c) => c.kampan.id)).toEqual(["veľká", "malá"]);
  });
});

describe("prekážky — kde sa reťaz trhá", () => {
  it("žiadna kampaň nepýtala dopyt", () => {
    const v = retazecKampani([k({ id: "1", nazov: "x", ciel: "OUTCOME_AWARENESS" })], [], {});
    expect(v.prekazky[0]).toContain("cieľ");
  });

  it("dopyty nemajú kampaň → chýbajú UTM", () => {
    const v = retazecKampani(
      [k({ id: "1", nazov: "x" })],
      [d({ id: "a", name: "A" }), d({ id: "b", name: "B" })],
      {},
    );
    expect(v.prekazky.some((p) => p.includes("utm_campaign"))).toBe(true);
  });

  it("kampaň v UTM sa nezhoduje so žiadnou z Mety", () => {
    const v = retazecKampani(
      [k({ id: "1", nazov: "IG_Lead_09" })],
      [d({ id: "a", name: "A", kampan: "uplne_ina" })],
      {},
    );
    expect(v.prekazky.some((p) => p.includes("nezhoduje"))).toBe(true);
  });

  it("dopyty sú, klienti zatiaľ nie", () => {
    const v = retazecKampani(
      [k({ id: "1", nazov: "x" })],
      [d({ id: "a", name: "A", kampan: "x" })],
      { A: { zaplatil: false, trzba: 0 } },
    );
    expect(v.prekazky.some((p) => p.includes("platiacim klientom"))).toBe(true);
  });

  it("celý reťazec drží → žiadne prekážky", () => {
    const v = retazecKampani(
      [k({ id: "1", nazov: "x" })],
      [d({ id: "a", name: "A", kampan: "x" })],
      { A: { zaplatil: true, trzba: 5000 } },
    );
    expect(v.prekazky).toEqual([]);
  });

  it("prázdny vstup nespadne a nehlási nezmysly", () => {
    const v = retazecKampani([], [], {});
    expect(v.spolu.cenaZaKlienta).toBeNull();
    expect(v.prekazky[0]).toContain("nie sú stiahnuté");
  });
});

describe("verdikt proti stropu", () => {
  it("pod stropom u Terezky je to najlepší prípad", () => {
    expect(verdikt(1800)).toMatchObject({ tón: "dobrá" });
  });
  it("nad stropom mixu sa už vypláca len u Jerryho", () => {
    expect(verdikt(7000).text).toContain("Jerryho");
  });
  it("nad všetkým je to zlé", () => {
    expect(verdikt(15000)).toMatchObject({ tón: "zlá" });
  });
  it("bez klienta sa verdikt nevydáva", () => {
    expect(verdikt(null).tón).toBe("neutrálna");
  });
});
