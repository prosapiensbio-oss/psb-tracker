import { describe, expect, it } from "bun:test";

import { dlhJednehoKlienta, dlznici } from "./dlznici";
import { dlhyKlientov, type VstupDlhov } from "./zaplatene";

const DNES = "2026-09-28";
const pop = (klient: string, datum: string, suma: number, popis = "OFF - 6h") => ({ klient, datum, suma, popis });
const bal = (klient: string, platnostOd: string, cena: number, zdroj = "rucne") => ({ klient, nazov: "6h Balíček", cena, platnostOd, zdroj, zruseneAt: null });
/** Celé pravidlo „zaplatený" nad vymyslenými dátami — tak, ako ho volá `loadData`. */
const dlhy = (v: Partial<VstupDlhov>) => dlhyKlientov({ poplatky: [], platby: [], balicky: [], ptPlatby: [], ptHistoria: [], ...v }).polozky;

describe("dlznici", () => {
  it("zlúči poplatky jedného človeka do jedného riadku", () => {
    const v = dlznici(dlhy({ poplatky: [pop("Lucie Podolova", "2026-08-07", 6990), pop("Lucie Podolova", "2026-09-04", 6990)] }), {}, DNES);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ meno: "Lucie Podolova", spolu: 13980, najstarsi: "2026-08-07", dni: 52 });
    expect(v[0].polozky).toHaveLength(2);
  });

  it("nezaplatený balíček z Kokpitu sa pripočíta k poplatkom", () => {
    const v = dlznici(dlhy({ poplatky: [pop("Dan Kouřil", "2026-09-02", 7790)], balicky: [bal("Dan Kouřil", "2026-09-25", 7790)] }), {}, DNES);
    expect(v[0]).toMatchObject({ spolu: 15580, zPoplatkov: 7790, zBalickov: 7790 });
  });

  it("kto dlží len za balíček, v zozname tiež je — aj s dňom predaja", () => {
    const v = dlznici(dlhy({ balicky: [bal("Janka šnirychova", "2026-09-22", 3990)] }), {}, DNES);
    expect(v[0]).toMatchObject({ meno: "Janka šnirychova", spolu: 3990, zPoplatkov: 0, najstarsi: "2026-09-22", dni: 6 });
  });

  it("zaplatený balíček dlh nerobí", () => {
    const v = dlznici(dlhy({ balicky: [bal("Martin Vaško", "2026-09-27", 7790)], platby: [{ klient: "Martin Vaško", suma: 7790, datum: "2026-09-27" }] }), {}, DNES);
    expect(v).toHaveLength(0);
  });

  it("balíček naliaty z PTmindera sa do dlhu neráta", () => {
    // Stará história bola zaplatená v starom svete; platby k nej v Kokpite
    // nie sú a appka by každému dlhoročnému klientovi vyrobila dlh.
    const v = dlznici(dlhy({ balicky: [bal("Peter Gažo", "2026-05-18", 9400, "ptminder")] }), {}, DNES);
    expect(v).toHaveLength(0);
  });

  it("najvyšší dlh je hore a tréner sa doplní", () => {
    const v = dlznici(dlhy({ poplatky: [pop("Malý", "2026-09-20", 1100), pop("Veľký", "2026-09-20", 9400)] }), { "Veľký": "Terezka", "Malý": "Jerry" }, DNES);
    expect(v.map((x) => [x.meno, x.trener])).toEqual([["Veľký", "Terezka"], ["Malý", "Jerry"]]);
  });

  it("dlžník sa pomenuje menom z karty, nie tvarom z poplatku", () => {
    const v = dlznici(dlhy({ poplatky: [pop("Janka snirychova", "2026-09-20", 1100)] }), { "Janka šnirychova": "Terezka" }, DNES);
    expect(v[0]).toMatchObject({ meno: "Janka šnirychova", trener: "Terezka" });
  });
});

describe("ten istý predaj v oboch systémoch", () => {
  it("sa do dlhu nepočíta dvakrát", () => {
    // Martin Vaško, 3. 10. 2026: predaj za 6 990 Kč z 27. 9. mal zapísaný
    // ručne v Kokpite aj otvorený ako poplatok v PTminderi — stránka mu
    // pýtala 13 980 Kč.
    const d = dlhy({ poplatky: [pop("Martin Vaško", "2026-09-27", 6990)], balicky: [bal("Martin Vaško", "2026-09-27", 6990)] });
    expect(dlhJednehoKlienta(d, "Martin Vaško").dlzi).toBe(6990);
    expect(d).toHaveLength(1);
    expect(d[0].zdroj).toBe("kokpit");
  });

  it("iný deň alebo iná suma sú dva rôzne predaje", () => {
    const d = dlhy({ poplatky: [pop("X", "2026-09-20", 6990)], balicky: [bal("X", "2026-09-27", 6990)] });
    expect(dlhJednehoKlienta(d, "X").dlzi).toBe(13980);
  });

  it("balíček z importu poplatok neumazáva — dlh z neho nevzniká", () => {
    const d = dlhy({ poplatky: [pop("X", "2026-09-27", 6990)], balicky: [bal("X", "2026-09-27", 6990, "ptminder")] });
    expect(dlhJednehoKlienta(d, "X").dlzi).toBe(6990);
  });

  it("zaplatený balíček z Kokpitu zhasne aj poplatok toho istého predaja", () => {
    // Platba v dvoch častiach: poplatok z PTmindera ju v kroku 1 nespáruje
    // (suma musí sedieť na korunu), balíček z Kokpitu áno — a poplatok mu
    // v kroku 4 ustúpi. Pred jedným pravidlom ho Dnes a profil ukazovali.
    const v = dlhyKlientov({
      poplatky: [pop("X", "2026-09-26", 6990)], balicky: [bal("X", "2026-09-27", 6990)],
      platby: [{ klient: "X", suma: 3000, datum: "2026-09-27" }, { klient: "X", suma: 3990, datum: "2026-09-30" }],
      ptPlatby: [], ptHistoria: [],
    });
    expect(v.polozky).toHaveLength(0);
    // Deň poplatku ostáva bez hodín — pod ním je v PTminderi dvojča predaja.
    expect(v.dvojcata).toEqual([{ klient: "X", den: "2026-09-26" }]);
  });

  it("balíček z Kokpitu nesie svoje id — podľa neho sa pýta „suma nesedí“", () => {
    const v = dlhyKlientov({
      poplatky: [], balicky: [{ ...bal("X", "2026-09-27", 7790), id: "b-1" }],
      platby: [{ klient: "X", suma: 7011, datum: "2026-09-28" }], ptPlatby: [], ptHistoria: [],
    });
    expect(v.polozky[0]).toMatchObject({ id: "b-1", zdroj: "kokpit", doplatit: 779 });
  });
});

describe("poistka z PTmindera", () => {
  it("balíček, ktorý PTminder pozná ako zaplatený, dlhom nie je", () => {
    const d = dlhy({ balicky: [bal("Vítězslav Papiež", "2026-09-29", 6990)], ptPlatby: [{ klient: "Vitezslav Papiež", datum: "2026-09-29", suma: 6990 }] });
    expect(d).toHaveLength(0);
  });
});

describe("hodiny čítajú to isté pravidlo", () => {
  it("loadData berie id balíčka a karta dostane dni bez hodín", async () => {
    const zdroj = require("fs").readFileSync(require("path").join(__dirname, "db.server.ts"), "utf8") as string;
    // Bez `id` v SELECTe by otázka „suma nesedí" nevznikla nikdy (nález 5. 10. 2026).
    expect(zdroj).toMatch(/SELECT id, klient, nazov, zdroj, platnost_od, platnost_do, hodiny, cena_czk, zrusene_at, poznamka FROM balicky/);
    expect(zdroj).toContain("data.bezHodin = [...polozky.map(");
  });
});
