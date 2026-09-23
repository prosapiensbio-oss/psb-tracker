import { describe, expect, it } from "bun:test";

import { cenaPoZlave, poZlave } from "../../components/psb/KlientStol";

describe("zľava na balíčku", () => {
  it("bez zľavy sa suma nemení", () => {
    expect(poZlave({ suma: "7790", zlava: "" }).suma).toBe("7790");
  });

  it("15 % z 7 790 je 6 622 — presne Dominikin balíček", () => {
    expect(poZlave({ suma: "7790", zlava: "15" }).suma).toBe("6622");
  });

  it("zľava sa zapíše do poznámky aj so základom", () => {
    // Bez toho by o mesiac nikto nevedel, prečo je tam 6 622 a nie 7 790.
    expect(poZlave({ suma: "7790", zlava: "15" }).poznamka).toContain("15 % zľava z");
  });

  it("vlastná poznámka sa nestratí", () => {
    const v = poZlave({ suma: "1000", zlava: "10", poznamka: "za september" });
    expect(v.poznamka.startsWith("za september")).toBe(true);
    expect(v.suma).toBe("900");
  });

  it("počíta sa VŽDY zo základu, nikdy zo zľavnenej sumy", () => {
    // Keby tlačidlo prepisovalo priamo sumu, dva kliky by dali 27,75 %.
    const raz = poZlave({ suma: "1000", zlava: "15" });
    const znova = poZlave({ suma: "1000", zlava: "15" });
    expect(raz.suma).toBe(znova.suma);
    expect(raz.suma).toBe("850");
  });

  it("na balíčku zľavňuje cenu, nie sumu platby", () => {
    // Zľava je vlastnosť PREDAJA, nie úhrady (Jerry, 23. 9. 2026). Keby sedela
    // pri platbe, musela by sa zadávať znova pri každej splátke.
    const v = cenaPoZlave({ cenaCzk: "7790", zlava: "15" });
    expect(v.cenaCzk).toBe("6622");
    expect(v.poznamka).toContain("15 % zľava z");
  });

  it("balíček bez zľavy si cenu nechá", () => {
    expect(cenaPoZlave({ cenaCzk: "7790" }).cenaCzk).toBe("7790");
  });
});
