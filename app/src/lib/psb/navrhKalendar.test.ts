// Návrh priradenia názvu z kalendára — jednoznačné na jeden klik.
//
// Jerry, 3. 9. 2026: „nech to navrhne v notifikácii."
import { describe, expect, it } from "bun:test";

import { navrhniKlientaKandidati, vyzeraNaMeno } from "./compute";

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

// 22. 9. 2026: kontrola kalendára proti PTminderu ukázala štrnásť tréningov
// z 31. 8. – 3. 9., v ktorých appka nevidela nikoho. Neboli to chýbajúce
// udalosti — boli v databáze celý čas, len Terezka ich v tých dňoch písala
// ako zdrobneninu + iniciálu priezviska a to pravidlo appka nepoznala.
describe("zdrobnenina + iniciála priezviska", () => {
  const c = {
    "Petra Bambúšková": { status: "Aktívny", primaryTrainer: "Terezka" },
    "Kateřina Stoklásková": { status: "Aktívny", primaryTrainer: "Terezka" },
    "Lucie Podolova": { status: "Aktívny", primaryTrainer: "Terezka" },
    "Lenka Prinosilova": { status: "Aktívny", primaryTrainer: "Jerry" },
    "Katarina Tchuřova": { status: "Aktívny", primaryTrainer: "Terezka" },
    "Radek Balaž": { status: "Aktívny", primaryTrainer: "Jerry" },
  } as any;

  it("„Peťa B“ je Petra Bambúšková", () => {
    expect(navrhniKlientaKandidati("Peťa B", c).kandidati).toEqual(["Petra Bambúšková"]);
  });

  it("„Katka S“ je Kateřina Stoklásková, nie Katarina Tchuřova", () => {
    expect(navrhniKlientaKandidati("Katka S", c).kandidati).toEqual(["Kateřina Stoklásková"]);
  });

  it("„Lucka P“ je Lucie Podolova, nie Lenka Prinosilova", () => {
    // Obe majú priezvisko na P — rozhoduje spoločný začiatok krstného mena.
    expect(navrhniKlientaKandidati("Lucka P", c).kandidati).toEqual(["Lucie Podolova"]);
  });

  it("holá zdrobnenina BEZ iniciály nedá nikoho", () => {
    // Iniciála je celá poistka tohto pravidla. Bez nej by „Peťa“ sadla na
    // každú Petru v štúdiu a appka by tréning pripísala cudziemu človeku.
    expect(navrhniKlientaKandidati("Peťa", c).kandidati).toEqual([]);
  });

  it("pri dvoch zhodách zostanú obaja — appka nevyberie ani jedného", () => {
    const dvaja = {
      "Petra Bambúšková": { status: "Aktívny", primaryTrainer: "Terezka" },
      "Petr Baťa": { status: "Aktívny", primaryTrainer: "Jerry" },
    } as any;
    expect(navrhniKlientaKandidati("Peťa B", dvaja).kandidati.length).toBe(2);
  });

  it("presná zhoda vyhráva nad zdrobneninou", () => {
    const oba = {
      "Petra Bambúšková": { status: "Aktívny", primaryTrainer: "Terezka" },
      "Peta Bartova": { status: "Aktívny", primaryTrainer: "Terezka" },
    } as any;
    expect(navrhniKlientaKandidati("Peťa B", oba).kandidati[0]).toBe("Peta Bartova");
  });
});

// Poznámka prilepená k menu robila z tréningu neznámy názov.
describe("poznámka za menom sa odreže", () => {
  const c = {
    "Veronika Stoklaskova": { status: "Aktívny", primaryTrainer: "Terezka" },
    "Regina Obrovska": { status: "Aktívny", primaryTrainer: "Terezka" },
    "Marcela Hruzova": { status: "Aktívny", primaryTrainer: "Terezka" },
  } as any;

  it("„Veronika-online“ je Veronika Stoklaskova", () => {
    expect(navrhniKlientaKandidati("Veronika-online", c).kandidati).toEqual(["Veronika Stoklaskova"]);
  });

  it("„Regina-dať zdarma“ je Regina Obrovska", () => {
    expect(navrhniKlientaKandidati("Regina-dať zdarma", c).kandidati).toEqual(["Regina Obrovska"]);
  });

  it("„Marcela Hrůzová online“ je Marcela Hruzova", () => {
    expect(navrhniKlientaKandidati("Marcela Hrůzová online", c).kandidati).toEqual(["Marcela Hruzova"]);
  });

  it("názov, ktorý je CELÝ poznámka, nenavrhne nikoho", () => {
    expect(navrhniKlientaKandidati("online", c).kandidati).toEqual([]);
  });
});

// „Janka Šnyrychová" v kalendári verzus „Janka šnirychova" v PTminderi —
// jedno písmeno a appka v nej nevidela klientku, hoci meno tam stálo celé.
describe("y a i sa v priezvisku nerozlišujú", () => {
  const c = {
    "Janka šnirychova": { status: "Aktívny", primaryTrainer: "Terezka" },
    "Lukas Kriz": { status: "Aktívny", primaryTrainer: "Jerry" },
  } as any;

  it("„Janka Šnyrychová“ je Janka šnirychova", () => {
    expect(navrhniKlientaKandidati("Janka Šnyrychová", c).kandidati).toEqual(["Janka šnirychova"]);
  });

  it("„Luky Kriz“ je Lukas Kriz — zdrobnenina aj s celým priezviskom", () => {
    expect(navrhniKlientaKandidati("Luky Kriz", c).kandidati).toEqual(["Lukas Kriz"]);
  });
});

// Hromadné „toto nie sú tréningy" nesmie zhltnúť meno, ktoré appka len nepozná.
describe("vyzeraNaMeno — čo sa NESMIE odložiť hromadne", () => {
  const mena = ["Sofia Resnerová", "Lucie Podolova", "Veronika Stoklaskova", "Jan Kalmus"];

  it("„Sofia B“ vyzerá na meno, hoci priezvisko appka nepozná", () => {
    expect(vyzeraNaMeno("Sofia B", mena)).toBe(true);
  });

  it("„Lucka-onliena“ tiež — preklep v poznámke na tom nič nemení", () => {
    expect(vyzeraNaMeno("Lucka-onliena", mena)).toBe(true);
  });

  it("„Veterina“ menom nie je", () => {
    expect(vyzeraNaMeno("Veterina", mena)).toBe(false);
  });

  it("„Napisat zuzke“ menom nie je", () => {
    expect(vyzeraNaMeno("Napisat zuzke", mena)).toBe(false);
  });

  it("dvojpísmenová skratka sa za meno nepovažuje", () => {
    expect(vyzeraNaMeno("TR", mena)).toBe(false);
  });
});

it("holý „Trening“ je tréning bez mena — hromadne sa odložiť nesmie", () => {
  expect(vyzeraNaMeno("Trening", ["Jan Kalmus"])).toBe(true);
});
