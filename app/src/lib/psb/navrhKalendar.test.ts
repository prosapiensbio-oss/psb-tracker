// Návrh priradenia názvu z kalendára — jednoznačné na jeden klik.
//
// Jerry, 3. 9. 2026: „nech to navrhne v notifikácii."
import { describe, expect, it } from "bun:test";

import { navrhniKlientaKandidati } from "./compute";

const clients = {
  "Marketa Resnerová": { status: "Aktívny", primaryTrainer: "Terezka" },
  "Lukas Hanus": { status: "Aktívny", primaryTrainer: "Jerry" },
  "Tomaš Krčmar": { status: "Aktívny", primaryTrainer: "Jerry" },
  "Tomaš Vopalenský": { status: "Aktívny", primaryTrainer: "Jerry" },
  "Tomas Martinec": { status: "Neaktívny", primaryTrainer: "Jerry" },
} as any;

describe("navrhniKlientaKandidati", () => {
  it("jednoznačná skratka dá práve jedného kandidáta", () => {
    const v = navrhniKlientaKandidati("Marketa R", clients);
    expect(v.kandidati).toEqual(["Marketa Resnerová"]);
    expect(v.typ).toBe("trening");
  });

  it("„Lukas H“ trafí Lukasa Hanusa", () => {
    expect(navrhniKlientaKandidati("Lukas H", clients).kandidati).toEqual(["Lukas Hanus"]);
  });

  it("„Tomaš“ dá VIAC kandidátov — nie je na jeden klik", () => {
    // Presne ten prípad, kvôli ktorému appka nehádže: priradenie k zlému by
    // pokazilo históriu.
    expect(navrhniKlientaKandidati("Tomaš", clients).kandidati.length).toBeGreaterThan(1);
  });

  it("úvodný sa rozpozná a meno sa vytiahne z názvu", () => {
    const v = navrhniKlientaKandidati("Úvodný Hana Nová", clients);
    expect(v.typ).toBe("uvodny");
    expect(v.meno).toBe("Hana Nová");
  });

  it("neznáme meno nedá kandidáta", () => {
    expect(navrhniKlientaKandidati("Veterina", clients).kandidati).toEqual([]);
  });
});

// Jerry, 3. 9. 2026: „mám tam Monika Č., je to dosť jednoznačné?" Malo byť —
// iniciála priezviska odlišuje dve Moniky. Predtým sa zahadzovala.
describe("jednopísmenová iniciála priezviska rozlišuje", () => {
  const dveMoniky = {
    "Monika Schonwalderova": { status: "Aktívny", primaryTrainer: "Terezka" },
    "Monika Čechova": { status: "Aktívny", primaryTrainer: "Jerry" },
  } as any;

  it("„Monika Č.“ trafí Čechovú, nie Schonwalderovú", () => {
    expect(navrhniKlientaKandidati("Monika Č.", dveMoniky).kandidati).toEqual(["Monika Čechova"]);
  });

  it("„Monika S“ trafí Schonwalderovú", () => {
    expect(navrhniKlientaKandidati("Monika S", dveMoniky).kandidati).toEqual(["Monika Schonwalderova"]);
  });

  it("holé „Monika“ zostáva dvojznačné — dve Moniky, nehádať", () => {
    expect(navrhniKlientaKandidati("Monika", dveMoniky).kandidati.length).toBe(2);
  });

  it("„Jan K“ trafí Krala aj s jednopísmenovým priezviskom", () => {
    const c = { "Jan Kral": { status: "Aktívny", primaryTrainer: "Jerry" }, "Jan Novak": { status: "Aktívny", primaryTrainer: "Jerry" } } as any;
    expect(navrhniKlientaKandidati("Jan K", c).kandidati).toEqual(["Jan Kral"]);
  });
});
