import { describe, expect, it } from "bun:test";

import { menoZNazvuUvodneho } from "./kalendar";
import { bezDovetkuMena, casUdalosti, nejednoznacneMena, vyberMapu, type Mapa } from "./kalendarMena";

const m = (nazov: string, cas: string, klient: string): Mapa => ({ nazov, trener: "Terezka", cas, klient, typ: "trening" });

describe("mapovanie s časom", () => {
  const mapy = [m("Marketa", "", "Marketa Lozias"), m("Marketa", "08:30", "Marketa Resnerová")];

  it("presný čas vyhráva nad všeobecným", () => {
    expect(vyberMapu(mapy, "Marketa", "Terezka", "08:30")?.klient).toBe("Marketa Resnerová");
  });
  it("iný čas berie všeobecné mapovanie", () => {
    expect(vyberMapu(mapy, "Marketa", "Terezka", "14:00")?.klient).toBe("Marketa Lozias");
  });
  it("cudzí tréner nesiaha na mapovanie", () => {
    expect(vyberMapu(mapy, "Marketa", "Jerry", "08:30")).toBeNull();
  });
  it("čas sa číta z ISO začiatku", () => {
    expect(casUdalosti("2026-09-17T08:30:00+02:00")).toBe("08:30");
    expect(casUdalosti("")).toBe("");
  });
});

describe("mená, ktoré sedia na viacerých", () => {
  const klienti = ["Marketa Resnerová", "Marketa Lozias", "Janka šnirychova", "Peter Gažo"];

  it("krstné meno dvoch klientok je nejednoznačné", () => {
    const v = nejednoznacneMena(["Marketa", "Peter"], klienti);
    expect(v).toHaveLength(1);
    expect(v[0].kandidati.sort()).toEqual(["Marketa Lozias", "Marketa Resnerová"]);
  });

  it("„Marketa R“ už rozlišuje, nehlási sa", () => {
    expect(nejednoznacneMena(["Marketa R", "Marketa L"], klienti)).toEqual([]);
  });

  it("meno, ktoré má jeden klient, je v poriadku", () => {
    expect(nejednoznacneMena(["Janka"], klienti)).toEqual([]);
  });
});

import { klientPodlaCelehoMena } from "./kalendarMena";

describe("istá zhoda celého mena (6. 10. 2026)", () => {
  const klienti = ["Jarek Heinrich", "Naďa Khamaziuk", "Barbora Vankova", "Marketa Lozias", "Marketa Resnerová", "Jan Novák", "Jan  Novák"];
  it("celé meno bez ohľadu na diakritiku a veľkosť", () => {
    expect(klientPodlaCelehoMena("Jarek Heinrich", klienti)).toBe("Jarek Heinrich");
    expect(klientPodlaCelehoMena("nada khamaziuk", klienti)).toBe("Naďa Khamaziuk");
  });
  it("krstné meno, prezývka ani preklep nie", () => {
    expect(klientPodlaCelehoMena("Marketa", klienti)).toBeNull();
    expect(klientPodlaCelehoMena("Barborka Vankova", klienti)).toBeNull();
    expect(klientPodlaCelehoMena("Jarek Heinrichh", klienti)).toBeNull();
  });
  it("dvaja klienti s tým istým menom = nikto", () => {
    expect(klientPodlaCelehoMena("Jan Novak", ["Jan Novák", "Jan Novak"])).toBeNull();
  });
  it("dovetok online/offline nie je časť mena (Veronika, 21. 10. 2026)", () => {
    const k = [...klienti, "Veronika Stoklaskova"];
    expect(klientPodlaCelehoMena("Veronika Stoklásková-online", k)).toBe("Veronika Stoklaskova");
    expect(klientPodlaCelehoMena("Jarek Heinrich (online)", k)).toBe("Jarek Heinrich");
    expect(klientPodlaCelehoMena("ONLINE - Marketa Lozias", k)).toBe("Marketa Lozias");
    expect(klientPodlaCelehoMena("Jarek Heinrich offline", k)).toBe("Jarek Heinrich");
    expect(klientPodlaCelehoMena("Veronika-online", k)).toBeNull();
  });
});

import { tvarZnamehoKlienta } from "./kalendarMena";

describe("klient z pravidla dostane tvar známeho klienta (28. 10. 2026)", () => {
  const znami = ["Branislav Široký", "Marketa Nová"];
  it("„Široky\" z pravidla je „Široký\" s balíčkom", () => {
    expect(tvarZnamehoKlienta("Branislav Široky", znami)).toBe("Branislav Široký");
  });
  it("neznámy, krstné meno a prázdno ostanú", () => {
    expect(tvarZnamehoKlienta("Jan Novák", znami)).toBe("Jan Novák");
    expect(tvarZnamehoKlienta("Marketa", znami)).toBe("Marketa");
    expect(tvarZnamehoKlienta(null, znami)).toBeNull();
  });
});

describe("dovetok z názvu udalosti nie je meno", () => {
  it("odreže diagnostiku a úvodný", () => {
    expect(bezDovetkuMena("Romana Prochádzková- diagnostika")).toBe("Romana Prochádzková");
    expect(bezDovetkuMena("Romana Prochádzková-uvodná diagnostika")).toBe("Romana Prochádzková");
    expect(bezDovetkuMena("Linda Muth-uvodny trening")).toBe("Linda Muth");
    expect(bezDovetkuMena("Petr Baťa -uvodný tréning")).toBe("Petr Baťa");
    expect(bezDovetkuMena("Veronika Stoklásková-online")).toBe("Veronika Stoklásková");
    expect(bezDovetkuMena("Šiková Dita-uvodny lekce")).toBe("Šiková Dita");
  });
  it("meno bez dovetku ostane, aj dvojité priezvisko", () => {
    for (const m of ["Roman Pavlik", "Radka Kovaříková", "Jana Nováková-Svobodová", "Anna-Marie Dvořáková", "Michaela J Dumbrovska"]) {
      expect(bezDovetkuMena(m)).toBe(m);
    }
  });
});

describe("meno z názvu úvodného bez nálepky", () => {
  it("diagnostika a lekce nie sú súčasť mena", () => {
    expect(menoZNazvuUvodneho("Romana Prochádzková-uvodná diagnostika")).toBe("Romana Prochádzková");
    expect(menoZNazvuUvodneho("Šiková Dita-uvodny lekce")).toBe("Šiková Dita");
    expect(menoZNazvuUvodneho("Jitka Heinrichova-uvodna diagnostika")).toBe("Jitka Heinrichova");
    expect(menoZNazvuUvodneho("Linda Muth-uvodny trening")).toBe("Linda Muth");
  });
});
