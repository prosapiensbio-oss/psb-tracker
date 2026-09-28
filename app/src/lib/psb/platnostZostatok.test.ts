import { describe, expect, it } from "bun:test";

import { vetaPlatnosti, zostavaPoPlatnosti, type KlientPlatnost } from "./platnostZostatok";

const DNES = "2026-09-28";

const kl = (o: Partial<KlientPlatnost> & { name: string }): KlientPlatnost => ({
  status: "Aktívny", primaryTrainer: "Jerry", membership: "OFF - 6h BEZ viazanosti",
  packageRemaining: 2, packageValidTo: "2026-09-26", clientType: "Balíček", ...o,
});

describe("zostavaPoPlatnosti", () => {
  it("vezme toho, komu platnosť skončila a hodiny zostali", () => {
    const v = zostavaPoPlatnosti([kl({ name: "Jakub Gerich" })], DNES);
    expect(v[0]).toMatchObject({ meno: "Jakub Gerich", hodin: 2, dni: 2, platnostDo: "2026-09-26" });
  });

  it("kto hodiny nemá, sa nehlási", () => {
    expect(zostavaPoPlatnosti([kl({ name: "A", packageRemaining: 0 })], DNES)).toHaveLength(0);
  });

  it("členstvo bez zapísanej platnosti sa nehlási", () => {
    expect(zostavaPoPlatnosti([kl({ name: "A", packageValidTo: "" })], DNES)).toHaveLength(0);
  });

  it("neaktívny klient sa nehlási", () => {
    expect(zostavaPoPlatnosti([kl({ name: "A", status: "Neaktívny" })], DNES)).toHaveLength(0);
  });

  it("hlási sa aj tri dni VOPRED — vtedy sa s tým ešte dá niečo spraviť", () => {
    const v = zostavaPoPlatnosti([kl({ name: "A", packageValidTo: "2026-10-01" })], DNES);
    expect(v[0].dni).toBe(-3);
  });

  it("o týždeň dopredu je ešte ticho", () => {
    expect(zostavaPoPlatnosti([kl({ name: "A", packageValidTo: "2026-10-06" })], DNES)).toHaveLength(0);
  });

  it("pri balíčku sa presun neponúka, pri predplatnom áno", () => {
    const balicek = zostavaPoPlatnosti([kl({ name: "A" })], DNES)[0];
    const predplatne = zostavaPoPlatnosti([kl({ name: "B", clientType: "6M Predplatné" })], DNES)[0];
    expect(balicek.presunHodin).toBe(0);
    expect(predplatne.presunHodin).toBe(2);
  });

  it("preniesť sa dajú najviac dve hodiny", () => {
    // Jerry, 28. 9. 2026: „max 2 hodiny sa môžu presunúť do ďalšieho balíčka."
    // Päť nedočerpaných hodín neznamená päť prenesených — inak by platnosť
    // neznamenala nič.
    const v = zostavaPoPlatnosti([kl({ name: "A", clientType: "6M Predplatné", packageRemaining: 5 })], DNES);
    expect(v[0]).toMatchObject({ hodin: 5, presunHodin: 2 });
  });

  it("najviac hodín je hore", () => {
    const v = zostavaPoPlatnosti([
      kl({ name: "Málo", packageRemaining: 1 }),
      kl({ name: "Veľa", packageRemaining: 4 }),
    ], DNES);
    expect(v.map((x) => x.meno)).toEqual(["Veľa", "Málo"]);
  });
});

describe("vetaPlatnosti", () => {
  it("po platnosti povie, koľko dní to už visí", () => {
    const v = zostavaPoPlatnosti([kl({ name: "Jakub Gerich" })], DNES)[0];
    expect(vetaPlatnosti(v)).toContain("platnosť skončila pred 2 dňami");
    expect(vetaPlatnosti(v)).toContain("zostáva 2 h");
  });

  it("pred platnosťou hovorí, koľko času zostáva", () => {
    const v = zostavaPoPlatnosti([kl({ name: "A", packageValidTo: "2026-10-01" })], DNES)[0];
    expect(vetaPlatnosti(v)).toContain("platnosť končí o 3 dni");
  });

  it("predplatnému ponúkne aj presun, balíčku nie", () => {
    const b = zostavaPoPlatnosti([kl({ name: "A" })], DNES)[0];
    const p = zostavaPoPlatnosti([kl({ name: "B", clientType: "6M Predplatné" })], DNES)[0];
    expect(vetaPlatnosti(b)).not.toContain("preniesť");
    expect(vetaPlatnosti(p)).toContain("preniesť 2 h");
  });
});
