import { describe, expect, it } from "bun:test";
import { rozborVydavkov } from "./vydavkyReportu";

const k = (kat: string, suma: number, priemer: number, mesiacov = 6) => ({ kat, nazov: kat, suma, priemer, mesiacov });

describe("výdavky v uzávierke", () => {
  it("najväčšie sú len firemné, bez výplat, domácnosti a rezervy", () => {
    const r = rozborVydavkov([k("fixne.prevadzka.najom", 29750, 30000), k("vyplaty.jerry", 54381, 50000), k("spolocne.Potraviny", 30893, 24000), k("rezerva", 4741, 0, 0), k("mimo", 15500, 3000)]);
    expect(r.najvacsie.map((x) => x.kat)).toEqual(["fixne.prevadzka.najom"]);
  });
  it("neštandardné: o 30 % nad priemerom alebo prvýkrát, nad 1 000 Kč, zoradené podľa rozdielu", () => {
    const r = rozborVydavkov([
      k("fixne.prevadzka.najom", 29750, 32000),
      k("fixne.apps.ai", 7694, 5638),
      k("fixne.prevadzka.splatkaJarek", 10000, 2833, 2),
      k("variabilne.prevadzka2.pomocky", 2416, 0, 0),
      k("variabilne.sluzby.ine", 900, 100, 3),
    ]);
    expect(r.nestandardne.map((x) => x.kat)).toEqual(["fixne.prevadzka.splatkaJarek", "variabilne.prevadzka2.pomocky", "fixne.apps.ai"]);
    expect(r.nestandardne[0].nasobok).toBe(3.5);
    expect(r.nestandardne[1].nasobok).toBeNull();
    expect(r.nestandardne[1].dovod).toBe("za posledné mesiace prvýkrát");
  });
});
