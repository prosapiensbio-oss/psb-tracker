// Os času klienta — odpoveď na „nevychádzajú mu tréningy".
import { describe, expect, it } from "bun:test";

import { osCasuKlienta, treningovVBalicku } from "./klientOsCasu";

const DNES = "2026-09-23";
const zdroj = {
  sessions: [
    { client: "Barbora Vankova", date: "2026-08-20T00:00:00.000Z", time: "5:00pm", sessionTrainer: "Terezka", sessionName: "OFFLINE - 60min" },
    { client: "Barbora Vankova", date: "2026-09-01T00:00:00.000Z", time: "5:00pm", sessionTrainer: "Terezka", sessionName: "OFFLINE - 60min" },
    { client: "Iny Clovek", date: "2026-09-02T00:00:00.000Z" },
  ],
  payments: [{ client: "Barbora Vankova", date: "2026-08-18T00:00:00.000Z", amount: 6990, method: "bank" }],
  packages: [{ client: "Barbora Vankova", package: "OFF - 6h S viazanostou", total: 6, remaining: 1, validFrom: "2026-08-18", validTo: "2026-09-17" }],
  kalUdalosti: [
    { zaciatok: "2026-09-22T17:00:00Z", klient: "Barbora Vankova", typ: "trening" },
    { zaciatok: "2026-09-01T17:00:00Z", klient: "Barbora Vankova", typ: "trening" },
    { zaciatok: "2026-10-05T17:00:00Z", klient: "Barbora Vankova", typ: "trening" },
  ],
};

describe("osCasuKlienta", () => {
  const os = osCasuKlienta("Barbora Vankova", zdroj, DNES);

  it("nesie platby, tréningy aj platnosť balíčka", () => {
    expect(new Set(os.map((x) => x.druh))).toEqual(new Set(["platba", "trening", "balicekOd", "balicekDo"]));
  });

  it("cudzí klient tam nie je", () => {
    expect(osCasuKlienta("Iny Clovek", zdroj, DNES).filter((x) => x.druh === "trening").length).toBe(1);
  });

  it("meno sa páruje bez diakritiky", () => {
    expect(osCasuKlienta("Barbora Vanková", zdroj, DNES).length).toBe(os.length);
  });

  it("tréning z kalendára sa PRIZNÁ, nie zamlčí", () => {
    // Export chodí raz za čas; keby tréning z 22. 9. chýbal, človek by pri
    // počítaní hodín vynechal to, čo sa už odtrénovalo.
    const zKal = os.filter((x) => x.druh === "trening" && x.zKalendara);
    expect(zKal.map((x) => x.den)).toEqual(["2026-09-22"]);
  });

  it("deň, ktorý je aj v exporte, sa nezdvojí", () => {
    expect(os.filter((x) => x.druh === "trening" && x.den === "2026-09-01").length).toBe(1);
  });

  it("budúci tréning na osi nie je — os hovorí, čo sa stalo", () => {
    expect(os.some((x) => x.den === "2026-10-05")).toBe(false);
  });

  it("najnovšie hore", () => {
    expect(os[0].den).toBe("2026-09-22");
  });

  it("v jeden deň ide začiatok balíčka pred platbu", () => {
    const den18 = os.filter((x) => x.den === "2026-08-18").map((x) => x.druh);
    expect(den18).toEqual(["balicekOd", "platba"]);
  });

  it("balíček bez dátumov na os nejde — deň sa nehádže", () => {
    const bezDatumov = { ...zdroj, packages: [{ client: "Barbora Vankova", package: "Doplnenie členstva", total: 5, remaining: 5 }] };
    expect(osCasuKlienta("Barbora Vankova", bezDatumov, DNES).some((x) => x.druh === "balicekOd")).toBe(false);
  });
});

describe("treningovVBalicku", () => {
  it("spočíta tréningy v platnosti balíčka", () => {
    const os = osCasuKlienta("Barbora Vankova", zdroj, DNES);
    expect(treningovVBalicku(os, "2026-08-18", "2026-09-17")).toBe(2);
  });
  it("bez konca počíta do konca osi", () => {
    const os = osCasuKlienta("Barbora Vankova", zdroj, DNES);
    expect(treningovVBalicku(os, "2026-08-18")).toBe(3);
  });
});

describe("členstvo 0/0 má hodiny v názve", () => {
  // Natália Pečková: PTminder vyváža „OFF - 18 hodín offline" ako 0 z 0.
  // Bez hodín z názvu tvrdila os „bez limitu" a zostatok padol na −1 h.
  const off = {
    ...zdroj,
    packages: [{ client: "Barbora Vankova", package: "OFF - 18 hodín offline", total: 0, remaining: 0, validFrom: "2026-08-18", validTo: "2027-02-17" }],
  };

  it("hodiny sa vezmú z názvu a riadok to prizná", () => {
    const b = osCasuKlienta("Barbora Vankova", off, DNES).find((x) => x.druh === "balicekOd");
    expect(b).toMatchObject({ hodin: 18, odvodene: true });
  });

  it("čo export naozaj hovorí, sa nedopočítava", () => {
    const b = osCasuKlienta("Barbora Vankova", zdroj, DNES).find((x) => x.druh === "balicekOd");
    expect(b?.odvodene).toBeFalsy();
  });
});

describe("dva rovnaké balíčky v jeden deň", () => {
  // Anna Nová má v snímke dva riadky „OFF - 8 hodín offline" s tou istou
  // platnosťou, ale v knihe predajov je v ten deň predaj jeden. Sčítať ich
  // na 16 hodín by bola nepravda.
  const dva = [
    { client: "Barbora Vankova", package: "OFF - 8 hodín offline", total: 8, remaining: 4, validFrom: "2026-09-03", validTo: "2026-10-28" },
    { client: "Barbora Vankova", package: "OFF - 8 hodín offline", total: 8, remaining: 8, validFrom: "2026-09-03", validTo: "2026-10-28" },
  ];

  it("kniha predajov hovorí o jednom — na osi je jeden", () => {
    const z = { ...zdroj, packages: dva, services: [{ client: "Barbora Vankova", date: "2026-09-03", serviceType: "Membership", description: "OFF - 8 hodín offline", price: 9400 }] };
    expect(osCasuKlienta("Barbora Vankova", z as never, DNES).filter((x) => x.druh === "balicekOd")).toHaveLength(1);
  });

  it("kniha predajov hovorí o dvoch — na osi sú dva", () => {
    const sl = { client: "Barbora Vankova", date: "2026-09-03", serviceType: "Membership", description: "OFF - 8 hodín offline", price: 9400 };
    const z = { ...zdroj, packages: dva, services: [sl, { ...sl }] };
    expect(osCasuKlienta("Barbora Vankova", z as never, DNES).filter((x) => x.druh === "balicekOd")).toHaveLength(2);
  });

  it("keď kniha o tom dni nevie, berie sa jeden", () => {
    const z = { ...zdroj, packages: dva, services: [] };
    expect(osCasuKlienta("Barbora Vankova", z as never, DNES).filter((x) => x.druh === "balicekOd")).toHaveLength(1);
  });
});

describe("balíčky nahodené v Kokpite", () => {
  const kokpitovy = {
    klient: "Barbora Vankova", nazov: "OFF - 6h BEZ viazanosti", hodiny: 6,
    platnost_od: "2026-09-20", platnost_do: "2026-11-20", cena_czk: 7790, zdroj: "rucne",
  };

  it("stoja na osi rovnako ako tie z exportu", () => {
    const os = osCasuKlienta("Barbora Vankova", { ...zdroj, balicky: [kokpitovy] } as never, DNES);
    const b = os.find((x) => x.druh === "balicekOd" && x.den === "2026-09-20");
    expect(b).toMatchObject({ nazov: "OFF - 6h BEZ viazanosti", hodin: 6, doDna: "2026-11-20", zKokpitu: true });
  });

  it("zrušený balíček ani ten s budúcou platnosťou na os nejde", () => {
    const z = {
      ...zdroj,
      balicky: [{ ...kokpitovy, zrusene_at: "2026-09-21T10:00:00Z" }, { ...kokpitovy, platnost_od: "2026-12-01" }],
    };
    expect(osCasuKlienta("Barbora Vankova", z as never, DNES).some((x) => x.druh === "balicekOd" && x.zKokpitu)).toBe(false);
  });

  it("nezdvojí sa s tým istým balíčkom z exportu", () => {
    // Akcia „nalej" nakopírovala export do `balicky` — ten istý deň a názov.
    const z = { ...zdroj, balicky: [{ ...kokpitovy, nazov: "OFF - 6h S viazanostou", platnost_od: "2026-08-18" }] };
    expect(osCasuKlienta("Barbora Vankova", z as never, DNES).filter((x) => x.druh === "balicekOd")).toHaveLength(1);
  });

  it("otváracia položka z importu na os nejde", () => {
    // 20. 9. 2026 nalial import do `balicky` zostatky ku dňu exportu. Sú to
    // snímky, nie predaje — na osi by každému otvorili nové obdobie.
    const z = { ...zdroj, balicky: [{ ...kokpitovy, nazov: "Doplnenie členstva", zdroj: "ptminder" }] };
    expect(osCasuKlienta("Barbora Vankova", z as never, DNES).some((x) => x.druh === "balicekOd" && x.zKokpitu)).toBe(false);
  });

  it("bez zapísaných hodín ich vezme z názvu", () => {
    const z = { ...zdroj, balicky: [{ ...kokpitovy, hodiny: null, nazov: "OFF - 18 hodín offline" }] };
    const b = osCasuKlienta("Barbora Vankova", z as never, DNES).find((x) => x.druh === "balicekOd" && x.den === "2026-09-20");
    expect(b).toMatchObject({ hodin: 18 });
  });
});

describe("tréner pri tréningu z kalendára", () => {
  it("nesie sa rovnako ako pri tréningu z exportu", () => {
    // Jerry, 2. 10. 2026: „prečo 29. 9. Jerry nie je, ale 2. 10. je?"
    // Dva riadky o tom istom nemajú vyzerať ako dva druhy záznamu.
    const os = osCasuKlienta("Lukas Hanus", {
      sessions: [], payments: [], packages: [],
      kalUdalosti: [{ zaciatok: "2026-09-29T11:30", klient: "Lukas Hanus", typ: "trening", trener: "Jerry" }],
    } as never, "2026-10-02");
    const t = os.find((u) => u.druh === "trening") as { trener?: string };
    expect(t.trener).toBe("Jerry");
  });

  it("keď kalendár trénera nenesie, pole zostane prázdne — nehádа sa", () => {
    const os = osCasuKlienta("X", {
      sessions: [], payments: [], packages: [],
      kalUdalosti: [{ zaciatok: "2026-09-29T11:30", klient: "X", typ: "trening", trener: null }],
    } as never, "2026-10-02");
    expect((os.find((u) => u.druh === "trening") as { trener?: string }).trener).toBeUndefined();
  });
});

describe("skutočné hodiny minulého členstva sú v histórii z PTmindera, nie v názve", () => {
  // Lukáš Hanus, 4. 10. 2026: júlové „OFF - 6h S viazanostou" malo v PTminderi
  // 8 hodín (8 per month). Z názvu appka počítala šesť, vymyslela deficit −2
  // a ten sa valil cez august a september — v zozname −3 namiesto −1.
  const sl = (date: string, description: string) =>
    ({ client: "Lukas Hanus", date: `${date}T00:00:00.000Z`, serviceType: "Membership", description, price: 6990 });
  const hist = (od: string, doDna: string, naObdobie: number) =>
    ({ client: "Lukas Hanus", package: "OFF - 6h S viazanostou", total: 0, remaining: 0, validFrom: od, validTo: doDna, naObdobie, kind: "membership", stav: "expired" });
  const zdroj = (historia: unknown[]) => ({
    sessions: [], payments: [], packages: [],
    services: [sl("2026-06-29", "OFF - 6h S viazanostou")],
    historia: historia as never,
  });

  it("s históriou má členstvo hodiny aj koniec z PTmindera", () => {
    const b = osCasuKlienta("Lukas Hanus", zdroj([hist("2026-06-29", "2026-07-28", 8)]), "2026-10-04").find((u) => u.druh === "balicekOd");
    expect(b).toMatchObject({ hodin: 8, doDna: "2026-07-28" });
  });

  it("bez histórie zostáva názov — tak ako doteraz", () => {
    const b = osCasuKlienta("Lukas Hanus", zdroj([]), "2026-10-04").find((u) => u.druh === "balicekOd");
    expect(b).toMatchObject({ hodin: 6 });
  });

  it("história iného obdobia (viac než 3 dni od predaja) sa nepoužije", () => {
    const b = osCasuKlienta("Lukas Hanus", zdroj([hist("2026-07-10", "2026-08-09", 8)]), "2026-10-04").find((u) => u.druh === "balicekOd");
    expect(b).toMatchObject({ hodin: 6 });
  });

  it("doplnenie z histórie hodiny NEBERIE — je to zvyšok, nie nové hodiny", () => {
    const z = {
      sessions: [], payments: [], packages: [],
      services: [{ client: "Daniela Šašinkova", date: "2026-09-12T00:00:00.000Z", serviceType: "Package", description: "Doplnenie členstva", price: 0 }],
      historia: [{ client: "Daniela Šašinkova", package: "Doplnenie členstva", total: 1, remaining: 0, added: "2026-09-12", kind: "package", stav: "expired" }] as never,
    };
    const b = osCasuKlienta("Daniela Šašinkova", z, "2026-10-04").find((u) => u.druh === "balicekOd");
    expect(b).toMatchObject({ hodin: 0, doplnenie: true });
  });
});

describe("úvodný tréning na osi", () => {
  it("z kalendára si nesie druh aj uid, aby sa dal prepnúť", () => {
    // Jerry, 7. 10. 2026: Petr Baťa mal 5. 10. úvodný, ale na karte stálo
    // len „tréning 17:00 · Terezka" a nedalo sa to opraviť.
    const os = osCasuKlienta("Petr Baťa", {
      sessions: [], payments: [], packages: [],
      kalUdalosti: [
        { uid: "abc@google.com|2026-10-05T17:00", klient: "Petr Baťa", zaciatok: "2026-10-05T17:00", typ: "uvodny", trener: "Terezka" },
        { uid: "def@google.com|2026-10-12T17:00", klient: "Petr Baťa", zaciatok: "2026-10-12T17:00", typ: "trening", trener: "Terezka" },
      ],
    } as never, "2026-10-13");
    const t = os.filter((x) => x.druh === "trening") as { den: string; uvodny?: boolean; uid?: string }[];
    expect(t.find((x) => x.den === "2026-10-05")?.uvodny).toBe(true);
    expect(t.find((x) => x.den === "2026-10-05")?.uid).toBe("abc@google.com|2026-10-05T17:00");
    expect(t.find((x) => x.den === "2026-10-12")?.uvodny).toBeUndefined();
  });

  it("z exportu sa úvodný pozná podľa názvu sedenia", () => {
    const os = osCasuKlienta("Kto Vie", {
      sessions: [{ client: "Kto Vie", date: "2026-09-01", sessionName: "Uvodny trenink OFFLINE", duration: 60 }],
      payments: [], packages: [],
    } as never, "2026-10-01");
    expect((os[0] as { uvodny?: boolean }).uvodny).toBe(true);
  });
});

describe("ručne určený druh tréningu", () => {
  it("prebije kalendár aj export — oboma smermi", () => {
    // Jerry, 8. 10. 2026: „vždy by mala byť možnosť zmeniť to z úvodného na
    // normálny alebo z normálneho na úvodný."
    const zdroj = {
      sessions: [{ client: "Luky Križ", date: "2026-09-28", sessionName: "OFFLINE - 60min", duration: 60 }],
      payments: [], packages: [],
      kalUdalosti: [{ uid: "x@google.com", klient: "Petr Baťa", zaciatok: "2026-10-05T17:00", typ: "uvodny", trener: "Terezka" }],
      druhyTreningov: { "Luky Križ|2026-09-28": "uvodny", "Petr Baťa|2026-10-05": "trening" },
    } as never;

    const syn = osCasuKlienta("Luky Križ", zdroj, "2026-10-08");
    expect((syn.find((x) => x.den === "2026-09-28") as { uvodny?: boolean }).uvodny).toBe(true);

    const bata = osCasuKlienta("Petr Baťa", zdroj, "2026-10-08");
    expect((bata.find((x) => x.den === "2026-10-05") as { uvodny?: boolean }).uvodny).toBeUndefined();
  });
});
