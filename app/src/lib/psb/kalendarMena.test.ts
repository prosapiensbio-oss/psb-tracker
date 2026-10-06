import { describe, expect, it } from "bun:test";

import { casUdalosti, nejednoznacneMena, vyberMapu, type Mapa } from "./kalendarMena";

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
});
