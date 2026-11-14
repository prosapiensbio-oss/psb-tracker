// Workspace — jedna karta = jeden DRUH práce, a patrí tomu, kto je prihlásený.
import { describe, expect, it } from "bun:test";

import { BEZ_FRONTY, dniZmeny, krokyBety, popisZmeny, postavKarty, type Zmena, rozdelAnamnezy, type AnamnezaRiadok, prijmyUInehoTrenera, hromadnePresuny, odpovedPresunu, zapisPoJednom, anamnezyPodlaStavu, indexKartyPoZmene } from "./workspaceKarty";

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
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "zmluvy", "editor", "reklamy", "zmeny", "mena", "platby"]);
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
    // Zmluvy 6M hneď za anamnézami (10. 11. 2026) — tá istá kartotéka.
    expect(k[3].druh).toBe("zmluvy");
    // Editor za nimi (6. 10. 2026) — tiež nástroj, nie fronta.
    expect(k[4].druh).toBe("editor");
    // Dozor reklám za editorom (19. 10. 2026) — nástroj, nie fronta.
    expect(k[5].druh).toBe("reklamy");
    expect(k[8].druh).toBe("platby");
  });

  it("prázdna kategória kartu nevyrobí", () => {
    const k = postavKarty({ ...zdroje, zmeny: [], nezname: [], ktoSom: null });
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "zmluvy", "editor", "reklamy", "platby"]);
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
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "zmluvy", "editor", "reklamy", "zmeny", "mena"]);
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

describe("dniZmeny", () => {
  it("premenovanie nesie názvy, nie čas: žiadny deň, žiadny pád appky", () => {
    expect(dniZmeny({ pred: "Lukad Hanus", po: "Lukas Hanus" })).toEqual([]);
  });
  it("presun a zmiznutie dajú svoje dni", () => {
    expect(dniZmeny({ pred: "2026-09-22T16:00", po: "2026-09-24T14:00" })).toEqual(["2026-09-22T16:00", "2026-09-24T14:00"]);
    expect(dniZmeny({ pred: "2026-09-22T16:00", po: null })).toEqual(["2026-09-22T16:00"]);
  });
});

describe("popisZmeny", () => {
  it("zrušený tréning povie, z ktorého dňa zmizol", () => {
    expect(popisZmeny(zmena({ id: "z", trener: "Jerry" }))).toBe("zmizol tréning z 22. 9.");
  });
  it("presun povie odkiaľ a kam", () => {
    expect(popisZmeny(zmena({ id: "z", trener: "Jerry", druh: "posunute", pred: "2026-09-22T16:00", po: "2026-09-24T14:00" })))
      .toBe("presun z 22. 9. 16:00 na 24. 9. 14:00");
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
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "zmluvy", "editor", "reklamy", "zmeny", "mena"]);
  });

  it("„app“ (spoločné prihlásenie) nefiltruje", () => {
    expect(postavKarty({ ...zdroje, ktoSom: "app" }).find((x) => x.druh === "zmeny")!.polozky.length).toBe(2);
  });
});

describe("karta klienta je stôl, nie fronta", () => {
  it("stôl, faktúry aj anamnézy sú tam vždy, aj keď nič nečaká", () => {
    // Ostatné karty sú zoznamy toho, čo čaká, a keď sa vyprázdnia, zmiznú.
    // Tieto nie — sú to miesta, kam sa chodí robiť (od 6. 10. aj Editor).
    const k = postavKarty({ zmeny: [], nezname: [], platby: [], navrhMena: () => "", ktoSom: "Jerry" });
    expect(k.map((x) => x.druh)).toEqual(["klient", "faktury", "anamnezy", "zmluvy", "editor", "reklamy"]);
    // „krok" je karta bety (4. 10. 2026) — prázdna povie „Všetko vybavené".
    expect(BEZ_FRONTY).toEqual(["klient", "email", "dochadzka", "faktury", "anamnezy", "zmluvy", "editor", "reklamy", "krok"]);
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

describe("beta: tri kroky", () => {
  it("staré karty sa zložia do krokov v poradí týždňa a kroky nemiznú", () => {
    const k = postavKarty({ zmeny: [zmena({ id: "z1", trener: "Jerry" })], nezname: [], platby: [], navrhMena: () => "", ktoSom: "Jerry" });
    const b = krokyBety(k);
    expect(b.map((x) => (x.druh === "krok" ? x.krok : x.druh))).toEqual(["kalendar", "sms", "platby", "faktury", "anamnezy", "zmluvy", "editor", "reklamy", "klient"]);
    const kal = b.find((x) => x.druh === "krok" && x.krok === "kalendar");
    expect(kal && kal.druh === "krok" ? kal.sekcie.map((s) => s.druh) : []).toEqual(["zmeny"]);
  });
});

describe("beta: peniaze podľa trénera klienta", () => {
  const platba = (fioId: string, kandidati: string[]) => ({ fioId, datum: "2026-10-03", suma: 6990, text: "x", kandidati, klientsky: true });
  const dlznik = (meno: string, trener: string) => ({ meno, trener, spolu: 6990, zPoplatkov: 6990, zBalickov: 0, polozky: [], najstarsi: "", dni: 1 });
  const zdroj = (trener: "Jerry" | "Terezka") => ({
    zmeny: [], nezname: [], navrhMena: () => "", ktoSom: trener, trener,
    platby: [platba("a", ["Lukas Hanus"]), platba("b", ["Daniela Šašinkova"]), platba("c", [])],
    dlznici: [dlznik("Lukas Hanus", "Jerry"), dlznik("Daniela Šašinkova", "Terezka")],
    rozdelPeniaze: true,
    trenerKlienta: (m: string) => (m === "Daniela Šašinkova" ? "Terezka" : "Jerry"),
  });
  const polozky = (k: ReturnType<typeof postavKarty>, druh: string) => (k.find((x) => x.druh === druh)?.polozky || []) as { fioId?: string; meno?: string }[];
  it("Terezka vidí platby a dlžníkov svojich klientov", () => {
    const k = postavKarty(zdroj("Terezka"));
    expect(polozky(k, "platby").map((p) => p.fioId)).toEqual(["b"]);
    expect(polozky(k, "dlznici").map((p) => p.meno)).toEqual(["Daniela Šašinkova"]);
  });
  it("Jerry svojich a platbu, pri ktorej sa nevie, kto poslal", () => {
    const k = postavKarty(zdroj("Jerry"));
    expect(polozky(k, "platby").map((p) => p.fioId)).toEqual(["a", "c"]);
    expect(polozky(k, "dlznici").map((p) => p.meno)).toEqual(["Lukas Hanus"]);
  });
  it("mesačné karty sú len v bete", () => {
    const k = postavKarty(zdroj("Jerry"));
    const ids = (b: ReturnType<typeof krokyBety>) => b.filter((x) => x.druh === "krok").map((x) => (x.druh === "krok" ? x.krok : ""));
    expect(ids(krokyBety(k))).toEqual(["kalendar", "sms", "platby"]);
    // Mesačné kontroly sú od 9. 10. 2026 krok uzávierky; od 27. 10. je „kontroly"
    // karta Kontrola peňazí — len Jerryho (náklady, pravidlá, dvojité zápisy).
    // Od 8. 11. 2026 stojí pred uzávierkou: najprv potvrdiť, potom zamknúť.
    expect(ids(krokyBety(k, { mesacne: true }))).toEqual(["kalendar", "sms", "platby", "dopyty", "kontroly", "uzavierka"]);
    // Dopyty len Terezke, uzávierka obom (Terezka v nej má svoje kroky).
    expect(ids(krokyBety(k, { mesacne: true, ja: "Terezka" }))).toEqual(["kalendar", "sms", "platby", "dopyty", "uzavierka"]);
    expect(ids(krokyBety(k, { mesacne: true, ja: "Jerry" }))).toEqual(["kalendar", "sms", "platby", "kontroly", "uzavierka"]);
  });
});

describe("príjmy bez klienta v kroku 3", () => {
  const riadok = (fioId: string, kandidati: string[], x: Record<string, unknown> = {}) => ({ fioId, datum: "2026-10-30", suma: 1100, text: "t", kandidati, klientsky: true, ...x });
  const zaklad = {
    zmeny: [], nezname: [], navrhMena: () => "", ktoSom: null, rozdelPeniaze: true,
    trenerKlienta: (m: string) => (m === "Radka Kovaříková" ? "Terezka" : "Jerry"),
  };
  const platbyKarty = (k: ReturnType<typeof postavKarty>) => k.find((x) => x.druh === "platby")?.polozky || [];

  it("vrátka z e-shopu je v zozname a v počte, ide posledná", () => {
    const k = postavKarty({ ...zaklad, trener: "Jerry", platby: [riadok("dual", [], { klientsky: false }), riadok("a", ["Ján Novák"])] } as never);
    const p = platbyKarty(k) as { fioId: string; nevyzeraNaKlienta?: boolean }[];
    expect(p.map((x) => x.fioId)).toEqual(["a", "dual"]);
    expect(p[1].nevyzeraNaKlienta).toBe(true);
  });
  it("Terezkina platba je v Jerryho počte nie, u Terezky áno; Jerry ju vidí v riadku", () => {
    const platby = [riadok("r", ["Radka Kovaříková"])];
    expect(platbyKarty(postavKarty({ ...zaklad, trener: "Jerry", platby } as never))).toEqual([]);
    expect(platbyKarty(postavKarty({ ...zaklad, trener: "Terezka", platby } as never)).length).toBe(1);
    const u = prijmyUInehoTrenera(platby as never, "Jerry", zaklad.trenerKlienta);
    expect(u.map((x) => [x.trener, x.riadky.map((y) => y.fioId)])).toEqual([["Terezka", ["r"]]]);
  });
  it("Terezke sa Jerryho peniaze neukazujú", () => {
    expect(prijmyUInehoTrenera([riadok("a", ["Ján Novák"])] as never, "Terezka", zaklad.trenerKlienta)).toEqual([]);
    expect(prijmyUInehoTrenera([riadok("a", ["Ján Novák"])] as never, null, zaklad.trenerKlienta)).toEqual([]);
  });
  it("faktúra s inou sumou sa nepredvyplní, istá áno", () => {
    const k = postavKarty({ ...zaklad, trener: "Jerry", platby: [
      riadok("o", ["Ján Novák"], { faktura: { istota: "otazka", cislo: "1", dovod: "x" } }),
      riadok("j", ["Ján Novák"], { faktura: { istota: "jedna", cislo: "2", klient: "Ján Novák", suma: 1100, dovod: "y" } }),
    ] } as never);
    const p = platbyKarty(k) as { fioId: string; navrh: string }[];
    expect(p.find((x) => x.fioId === "o")?.navrh).toBe("");
    expect(p.find((x) => x.fioId === "j")?.navrh).toBe("Ján Novák");
  });
});

describe("hromadné „presunuli sme“", () => {
  const z = (id: string, druh: string, pred = "2026-10-28T10:00") => ({ id, druh, klient: `K${id}`, nazov: null, pred, po: null, kedy: "2026-10-27", trener: "Jerry" });
  const presuny = {
    b: { zaciatok: "2026-10-30T15:00", kandidatov: 1 },
    c: { zaciatok: "2026-10-30T15:00", kandidatov: 2 },
  };
  it("„zmizlo\" bez nájdeného termínu do hromadnej odpovede nikdy nepatrí", () => {
    const v = hromadnePresuny([z("a", "zrusene")] as never, presuny);
    expect(v.posuny).toEqual([]);
    expect(v.vyzeraNaPresun).toEqual([]);
  });
  it("viac kandidátov je otázka — hromadne nie", () => {
    expect(hromadnePresuny([z("c", "zrusene")] as never, presuny).vyzeraNaPresun).toEqual([]);
  });
  it("posun a jednoznačný presun dostanú presne tú vetu, čo štítok pri riadku", () => {
    const v = hromadnePresuny([z("p", "posunute"), z("b", "zrusene")] as never, presuny);
    expect(v.posuny[0].poznamka).toBe(odpovedPresunu(null));
    expect(v.posuny[0].poznamka).toBe("presunuli sme");
    expect(v.vyzeraNaPresun[0].poznamka).toBe(odpovedPresunu(presuny.b));
    expect(v.vyzeraNaPresun[0].poznamka).toContain("15:00");
  });
  it("posun s novým časom nesie termín — do denníka klienta aj bez karty", () => {
    const v = hromadnePresuny([{ ...z("p", "posunute"), po: "2026-10-29T07:30" }] as never, presuny);
    expect(v.posuny[0].poznamka).toContain("7:30");
  });
  it("po jednom: chyba jedného nezhodí ostatné a povie sa", async () => {
    const zapisane: string[] = [];
    const v = await zapisPoJednom(["a", "b", "c"], async (x) => {
      if (x === "b") throw new Error("spojenie");
      zapisane.push(x);
    });
    expect(zapisane).toEqual(["a", "c"]);
    expect(v.hotovo).toBe(2);
    expect(v.chyby).toEqual([{ polozka: "b", chyba: "spojenie" }]);
  });
});

describe("anamnézy podľa stavu", () => {
  const a = (klient: string, x: Partial<{ klientVyplnilAt: string; zapisAt: string; uzBol: boolean; odkaz: string }>) => ({
    klient, trener: "Jerry", uvodny: "2026-11-02", stav: "ceka", odkaz: null, klientVyplnilAt: null, zapisAt: null, uzBol: false, ...x,
  });
  it("hotové, čaká na trénera, čaká na klienta", () => {
    const v = anamnezyPodlaStavu([
      a("hotova", { zapisAt: "x" }),
      a("vyplnil", { klientVyplnilAt: "x" }),
      a("bol", { uzBol: true }),
      a("pride", { odkaz: "u" }),
    ] as never);
    expect(v.hotove.map((x) => x.klient)).toEqual(["hotova"]);
    expect(v.naTrenera.map((x) => x.klient)).toEqual(["vyplnil", "bol"]);
    expect(v.naKlienta.map((x) => x.klient)).toEqual(["pride"]);
  });
});

describe("výber karty po zmene zoznamu (preskok na Uzávierku, 1. 11. 2026)", () => {
  const jerry = ["krok:kalendar", "krok:sms", "krok:platby", "krok:uzavierka", "krok:kontroly", "klient"];
  const vsetko = ["krok:kalendar", "krok:sms", "krok:platby", "krok:dopyty", "krok:uzavierka", "krok:kontroly", "klient"];
  it("pribudla karta pred otvorenou: ostávam na tej istej, nie na susednej", () => {
    expect(indexKartyPoZmene(jerry, vsetko, 3)).toBe(4);
    expect(vsetko[indexKartyPoZmene(jerry, vsetko, 3)]).toBe("krok:uzavierka");
  });
  it("ubudla karta pred otvorenou: to isté opačne", () => {
    expect(indexKartyPoZmene(vsetko, jerry, 5)).toBe(4);
  });
  it("otvorená karta zmizla: ostávam na jej mieste, nie za koncom", () => {
    expect(indexKartyPoZmene(["a", "b", "c"], ["a", "c"], 1)).toBe(1);
    expect(indexKartyPoZmene(["a", "b", "c"], ["a", "b"], 2)).toBe(1);
  });
  it("zoznam sa nezmenil: ostáva index, teda nič sa neprekresľuje", () => {
    expect(indexKartyPoZmene(jerry, jerry, 2)).toBe(2);
  });
  it("po obnovení stránky platí meno karty, nie číslo spred zmeny kopy", () => {
    expect(indexKartyPoZmene([], vsetko, 3, "krok:uzavierka")).toBe(4);
    expect(indexKartyPoZmene([], jerry, 3, "krok:dopyty")).toBe(3);
    expect(indexKartyPoZmene([], jerry, 99, null)).toBe(5);
  });
  it("prázdny zoznam (ešte sa nenačítal) index nemení", () => {
    expect(indexKartyPoZmene(jerry, [], 3)).toBe(3);
  });
});

