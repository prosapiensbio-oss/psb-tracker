import { describe, expect, it } from "bun:test";

import { dlhJednehoKlienta, dlznici } from "./dlznici";

const DNES = "2026-09-28";
const pop = (klient: string, datum: string, suma: number, popis = "OFF - 6h") => ({ klient, datum, suma, popis });

describe("dlznici", () => {
  it("zlúči poplatky jedného človeka do jedného riadku", () => {
    const v = dlznici([pop("Lucie Podolova", "2026-08-07", 6990), pop("Lucie Podolova", "2026-09-04", 6990)], {}, {}, {}, DNES);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ meno: "Lucie Podolova", spolu: 13980, najstarsi: "2026-08-07", dni: 52 });
    expect(v[0].polozky).toHaveLength(2);
  });

  it("nezaplatený balíček z Kokpitu sa pripočíta k poplatkom", () => {
    const v = dlznici(
      [pop("Dan Kouřil", "2026-09-02", 7790)],
      { "Dan Kouřil": [{ cena: 7790, platnostOd: "2026-09-25", zdroj: "rucne" }] },
      {},
      {}, DNES,
    );
    expect(v[0]).toMatchObject({ spolu: 15580, zPoplatkov: 7790, zBalickov: 7790 });
  });

  it("kto dlží len za balíček, v zozname tiež je", () => {
    const v = dlznici([], { "Janka šnirychova": [{ cena: 3990, platnostOd: "2026-09-22", zdroj: "rucne" }] }, {}, {}, DNES);
    expect(v[0]).toMatchObject({ meno: "Janka šnirychova", spolu: 3990, zPoplatkov: 0, najstarsi: "", dni: -1 });
  });

  it("zaplatený balíček dlh nerobí", () => {
    const v = dlznici(
      [],
      { "Martin Vaško": [{ cena: 7790, platnostOd: "2026-09-27", zdroj: "rucne" }] },
      { "Martin Vaško": [{ suma: 7790, datum: "2026-09-27" }] },
      {}, DNES,
    );
    expect(v).toHaveLength(0);
  });

  it("balíček naliaty z PTmindera sa do dlhu neráta", () => {
    // Stará história bola zaplatená v starom svete; platby k nej v Kokpite
    // nie sú a appka by každému dlhoročnému klientovi vyrobila dlh.
    const v = dlznici([], { "Peter Gažo": [{ cena: 9400, platnostOd: "2026-05-18", zdroj: "ptminder" }] }, {}, {}, DNES);
    expect(v).toHaveLength(0);
  });

  it("najvyšší dlh je hore a tréner sa doplní", () => {
    const v = dlznici(
      [pop("Malý", "2026-09-20", 1100), pop("Veľký", "2026-09-20", 9400)],
      {}, {}, { "Veľký": "Terezka", "Malý": "Jerry" }, DNES,
    );
    expect(v.map((x) => [x.meno, x.trener])).toEqual([["Veľký", "Terezka"], ["Malý", "Jerry"]]);
  });
});

describe("ten istý predaj v oboch systémoch", () => {
  it("sa do dlhu nepočíta dvakrát", () => {
    // Martin Vaško, 3. 10. 2026: predaj za 6 990 Kč z 27. 9. mal zapísaný
    // ručne v Kokpite aj otvorený ako poplatok v PTminderi — stránka mu
    // pýtala 13 980 Kč.
    const poplatky = [{ datum: "2026-09-27", klient: "Martin Vaško", popis: "OFF - 6h S viazanostou", suma: 6990 }];
    const balicky = [{ cena: 6990, platnostOd: "2026-09-27", zdroj: "rucne", zruseneAt: null }];
    expect(dlhJednehoKlienta(poplatky, balicky, []).dlzi).toBe(6990);
  });

  it("iný deň alebo iná suma sú dva rôzne predaje", () => {
    const poplatky = [{ datum: "2026-09-20", klient: "X", popis: "balíček", suma: 6990 }];
    const balicky = [{ cena: 6990, platnostOd: "2026-09-27", zdroj: "rucne", zruseneAt: null }];
    expect(dlhJednehoKlienta(poplatky, balicky, []).dlzi).toBe(13980);
  });

  it("balíček z importu poplatok neumazáva — dlh z neho nevzniká", () => {
    const poplatky = [{ datum: "2026-09-27", klient: "X", popis: "balíček", suma: 6990 }];
    const balicky = [{ cena: 6990, platnostOd: "2026-09-27", zdroj: "ptminder", zruseneAt: null }];
    expect(dlhJednehoKlienta(poplatky, balicky, []).dlzi).toBe(6990);
  });
});
