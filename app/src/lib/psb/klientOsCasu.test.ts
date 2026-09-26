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
