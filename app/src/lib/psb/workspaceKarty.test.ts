// Workspace — jedna karta = jeden DRUH práce, a patrí tomu, kto je prihlásený.
import { describe, expect, it } from "bun:test";

import { BEZ_FRONTY, popisZmeny, postavKarty, type Zmena, rozdelAnamnezy, type AnamnezaRiadok } from "./workspaceKarty";

const zmena = (o: Partial<Zmena> & { id: string; trener: string }): Zmena => ({
  id: o.id, druh: o.druh ?? "zrusene", klient: o.klient ?? "Martin Vaško", nazov: null,
  pred: o.pred ?? "2026-09-22T18:00", po: o.po ?? null, kedy: "2026-09-22T10:00:00Z", trener: o.trener,
});

const zdroje = {
  zmeny: [zmena({ id: "z1", trener: "Jerry" }), zmena({ id: "z2", trener: "Terezka", klient: "Barbora Vankova" })],
  nezname: [
    { nazov: "Trening", trener: "Terezka", pocet: 1, najblizsi: "2026-09-09T12:00" },
    { nazov: "Luky Kriz", trener: "Jerry", pocet: 1, najblizsi: "2026-09-28T17:00" },
  ],
  platby: [{ fioId: "p1", datum: "2026-09-16", suma: 21150, text: "Prosapiens 18h · Natália Pecková", kandidati: ["Natalia Peckova"] }],
  navrhMena: () => "",
};

describe("karta je kategória, nie položka", () => {
  it("tri kategórie dajú tri karty, nie päť", () => {
    // Prvá verzia dávala jednu kartu na jednu vec a z troch zmien boli tri
    // karty. Jerry 23. 9. 2026: „predstavoval som si celé kategórie."
    // Karta „klient" je navyše — nie je to fronta, je to pracovný stôl.
    const k = postavKarty({ ...zdroje, ktoSom: null });
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "zmeny", "mena", "platby"]);
    expect(k.find((x) => x.druh === "zmeny")!.polozky.length).toBe(2);
  });

  it("poradie je klient → faktúry → zmeny → mená → peniaze", () => {
    // Zmeny prvé, kým si človek pamätá, prečo hodina zmizla. Peniaze
    // posledné — je ich veľa a idú mechanicky. Faktúry hneď za klientom:
    // vznikajú pri balíčku, ktorý sa nahadzuje o kartu vedľa.
    const k = postavKarty({ ...zdroje, ktoSom: null });
    expect(k[1].druh).toBe("faktury");
    // Anamnézy sú tretie — kartotéka bez fronty, stavia sa vždy.
    expect(k[2].druh).toBe("anamnezy");
    expect(k[5].druh).toBe("platby");
  });

  it("prázdna kategória kartu nevyrobí", () => {
    const k = postavKarty({ ...zdroje, zmeny: [], nezname: [], ktoSom: null });
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "platby"]);
  });
});

describe("karta patrí prihlásenému", () => {
  it("Jerry vidí svoje zmeny a svoje názvy", () => {
    const k = postavKarty({ ...zdroje, ktoSom: "jerry" });
    expect(k.find((x) => x.druh === "zmeny")!.polozky.map((p) => (p as Zmena).id)).toEqual(["z1"]);
    expect(k.find((x) => x.druh === "mena")!.polozky.length).toBe(1);
  });

  it("Terezka vidí svoje — front platieb nie, faktúry áno", () => {
    // Front príjmov z banky trénera nemá a je Jerryho (pravidlo z 31. 8.
    // 2026: „nech Terezku nerozptyľujú"). Faktúra pre vlastného klienta je
    // ale jej robota — a bez karty tlačidlo „Vystaviť faktúru" na karte
    // klienta ticho nerobilo nič (28. 9. 2026, Janka šnirychova).
    const k = postavKarty({ ...zdroje, ktoSom: "terezka" });
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "zmeny", "mena"]);
    expect(k.find((x) => x.druh === "zmeny")!.polozky.map((p) => (p as Zmena).id)).toEqual(["z2"]);
  });

  it("bez prihlásenia sa nefiltruje nič", () => {
    expect(postavKarty({ ...zdroje, ktoSom: null }).find((x) => x.druh === "zmeny")!.polozky.length).toBe(2);
  });

  it("kartu Faktúry má každý — tlačidlo na karte klienta ju hľadá", () => {
    // „Vystaviť faktúru" v profile klienta prepne kopu na kartu Faktúry.
    // Keď tá karta v kope nie je, klik neurobí nič a nič ani nepovie —
    // presne to sa stalo Terezke 28. 9. 2026.
    for (const kto of ["jerry", "Jerry", "terezka", "Terezka", "app", null]) {
      expect(postavKarty({ ...zdroje, ktoSom: kto }).some((x) => x.druh === "faktury")).toBe(true);
    }
  });

  it("bez balíčka je karta každého, dlhy sú Jerryho", () => {
    // Predať ďalší balíček svojmu klientovi je robota toho, kto ho vedie.
    // Dlhy zostávajú Jerryho, rovnako ako front príjmov z banky.
    const zdrojeNavyse = {
      ...zdroje,
      bezBalicka: [{ meno: "Richard Matl", trener: "Jerry", membership: "OFF - 6h", dovod: "hodiny minuté" as const, platnostDo: "", poslednyTrening: "2026-09-23", dni: 5, objednanych: 0, vMinuse: 1 }],
      dlznici: [{ meno: "Dan Kouřil", trener: "Jerry", spolu: 7790, zPoplatkov: 7790, zBalickov: 0, polozky: [], najstarsi: "2026-09-02", dni: 26 }],
    };
    const u = postavKarty({ ...zdrojeNavyse, ktoSom: "jerry" }).map((x) => x.druh);
    expect(u).toContain("bezBalicka");
    expect(u).toContain("dlznici");

    const t = postavKarty({ ...zdrojeNavyse, ktoSom: "terezka" }).map((x) => x.druh);
    expect(t).not.toContain("dlznici");
    // Jerryho klient sa Terezke neukáže ani v „Bez balíčka" — má trénera v sebe.
    expect(t).not.toContain("bezBalicka");
  });

  it("prázdna fronta kartu nevyrobí", () => {
    const u = postavKarty({ ...zdroje, bezBalicka: [], dlznici: [], ktoSom: "jerry" }).map((x) => x.druh);
    expect(u).not.toContain("bezBalicka");
    expect(u).not.toContain("dlznici");
  });

  it("Jerry vidí peniaze", () => {
    expect(postavKarty({ ...zdroje, ktoSom: "jerry" }).some((x) => x.druh === "platby")).toBe(true);
  });
});

describe("popisZmeny", () => {
  it("zrušený tréning povie, z ktorého dňa zmizol", () => {
    expect(popisZmeny(zmena({ id: "z", trener: "Jerry" }))).toBe("zmizol tréning z 22. 9.");
  });
  it("presun povie odkiaľ a kam", () => {
    expect(popisZmeny(zmena({ id: "z", trener: "Jerry", druh: "posunute", pred: "2026-09-22T16:00", po: "2026-09-24T14:00" })))
      .toBe("presun z 22. 9. na 24. 9.");
  });
});

describe("prihlásenie sa porovnáva bez ohľadu na veľkosť písmen", () => {
  it("„Jerry“ zo session filtruje rovnako ako „jerry“", () => {
    // Session nesie `users.name`, teda „Jerry" s veľkým J. Prvá verzia
    // porovnávala s „jerry", nesedelo to nikdy a filter ticho prepúšťal
    // všetko — Jerry videl aj Terezkine veci.
    const k = postavKarty({ ...zdroje, ktoSom: "Jerry" });
    expect(k.find((x) => x.druh === "zmeny")!.polozky.map((p) => (p as Zmena).id)).toEqual(["z1"]);
  });

  it("aj „Terezka“ s veľkým T", () => {
    const k = postavKarty({ ...zdroje, ktoSom: "Terezka" });
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "zmeny", "mena"]);
  });

  it("„app“ (spoločné prihlásenie) nefiltruje", () => {
    expect(postavKarty({ ...zdroje, ktoSom: "app" }).find((x) => x.druh === "zmeny")!.polozky.length).toBe(2);
  });
});

describe("karta klienta je stôl, nie fronta", () => {
  it("stôl, faktúry aj anamnézy sú tam vždy, aj keď nič nečaká", () => {
    // Ostatné karty sú zoznamy toho, čo čaká, a keď sa vyprázdnia, zmiznú.
    // Tieto tri nie — sú to miesta, kam sa chodí robiť.
    const k = postavKarty({ zmeny: [], nezname: [], platby: [], navrhMena: () => "", ktoSom: "Jerry" });
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy"]);
    expect(BEZ_FRONTY).toEqual(["klient", "faktury", "anamnezy"]);
  });

  it("nemá položky, takže sa nedá „vybaviť“", () => {
    const k = postavKarty({ ...zdroje, ktoSom: null }).find((x) => x.druh === "klient")!;
    expect(k.polozky).toEqual([]);
  });
});

describe("čie veci sa ukazujú", () => {
  const zmeny = [
    { id: "1", kedy: "2026-09-20", trener: "Jerry", druh: "zrusene", nazov: "Anetka", klient: "Anetka", pred: "", po: "" },
    { id: "2", kedy: "2026-09-20", trener: "Terezka", druh: "zrusene", nazov: "Sofia", klient: "Sofia", pred: "", po: "" },
  ] as never[];
  const postav = (ktoSom: string | null, trener?: "Jerry" | "Terezka" | null) =>
    postavKarty({ zmeny, nezname: [], platby: [], ktoSom, trener, navrhMena: () => "" })
      .find((k) => k.druh === "zmeny")?.polozky ?? [];

  it("prihlásený tréner vidí len svoje", () => {
    expect(postav("Jerry").map((p) => (p as { trener: string }).trener)).toEqual(["Jerry"]);
  });

  it("bez identity (zdieľané heslo) vidí všetko — a to je stav, ktorý treba povedať nahlas", () => {
    // Presne toto Jerry hlásil dvakrát: v kope boli Terezkine udalosti.
    // Filter nebol pokazený, len sa prihlásenie nedalo preložiť na trénera.
    expect(postav("app").length).toBe(2);
  });

  it("ručná voľba prebije prihlásenie", () => {
    expect(postav("Jerry", "Terezka").map((p) => (p as { trener: string }).trener)).toEqual(["Terezka"]);
  });

  it("null znamená všetko, undefined znamená „nechaj to na prihlásenie“", () => {
    expect(postav("Jerry", null).length).toBe(2);
    expect(postav("Jerry", undefined).length).toBe(1);
  });
});

describe("rozdelAnamnezy", () => {
  const r = (klient: string, uvodny: string | null, zapisAt: string | null = "2026-09-01"): AnamnezaRiadok => ({
    klient, trener: "Terezka", uvodny, stav: zapisAt ? "hotova" : "ceka",
    odkaz: null, klientVyplnilAt: null, zapisAt, uzBol: false,
  });

  it("úvodný pred nami zostáva na karte", () => {
    const { aktualne, archiv } = rozdelAnamnezy([r("Petr Baťa", "2026-10-05T17:00")], "2026-10-02");
    expect(aktualne.map((x) => x.klient)).toEqual(["Petr Baťa"]);
    expect(archiv).toHaveLength(0);
  });

  it("úvodný spred týždňa tiež — zápis sa píše PO tréningu", () => {
    // Keby riadok zmizol o minútu po začiatku úvodného, stratil by sa presne
    // vtedy, keď ho tréner potrebuje.
    const { aktualne } = rozdelAnamnezy([r("Josef Pávek", "2026-09-28T09:00")], "2026-10-02");
    expect(aktualne.map((x) => x.klient)).toEqual(["Josef Pávek"]);
  });

  it("starý úvodný ide do archívu", () => {
    const { aktualne, archiv } = rozdelAnamnezy([r("Albert Matl", "2026-09-14T18:00")], "2026-10-02");
    expect(aktualne).toHaveLength(0);
    expect(archiv.map((x) => x.klient)).toEqual(["Albert Matl"]);
  });

  it("nedokončená zostáva navrchu bez ohľadu na dátum", () => {
    const { aktualne } = rozdelAnamnezy([r("Stará Rozrobená", "2025-03-01T10:00", null)], "2026-10-02");
    expect(aktualne.map((x) => x.klient)).toEqual(["Stará Rozrobená"]);
  });

  it("anamnéza bez úvodného v kalendári a hotová patrí do archívu", () => {
    // 56 doimportovaných z roku 2025 nemá v kalendári nič.
    const { aktualne, archiv } = rozdelAnamnezy([r("Dávny Klient", null)], "2026-10-02");
    expect(aktualne).toHaveLength(0);
    expect(archiv).toHaveLength(1);
  });
});
