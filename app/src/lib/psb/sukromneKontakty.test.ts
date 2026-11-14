import { describe, expect, it } from "bun:test";

import { citajSukromne, najdiSukromny, upravSukromne } from "./sukromneKontakty";

describe("súkromné kontakty", () => {
  it("prečíta uložený zoznam, aj dvakrát zabalený JSON, a nezrúti sa na nezmysle", () => {
    const z = JSON.stringify([{ meno: "Leon Box", telefon: "+420 776 192 222", aktivita: "Box" }]);
    expect(citajSukromne(z)[0].aktivita).toBe("Box");
    expect(citajSukromne(JSON.stringify(z))[0].meno).toBe("Leon Box");
    expect(citajSukromne("nezmysel")).toEqual([]);
    expect(citajSukromne(null)).toEqual([]);
  });
  it("nájde kontakt bez ohľadu na diakritiku a veľkosť písmen", () => {
    const z = [{ meno: "Leon Box", telefon: "", aktivita: "Box" }];
    expect(najdiSukromny("leon box", z)?.aktivita).toBe("Box");
    expect(najdiSukromny("Leon", z)).toBeNull();
  });
  it("úprava prepíše kontakt podľa mena, prázdna aktivita = meno, zmazanie ho odstráni", () => {
    let z = upravSukromne([], { meno: "Leon Box", telefon: "1", aktivita: "" });
    expect(z[0].aktivita).toBe("Leon Box");
    z = upravSukromne(z, { meno: "LEON BOX", telefon: "2", aktivita: "Box" });
    expect(z).toHaveLength(1);
    expect(z[0].telefon).toBe("2");
    expect(upravSukromne(z, { meno: "Leon Box", telefon: "", aktivita: "" }, true)).toEqual([]);
  });
});
