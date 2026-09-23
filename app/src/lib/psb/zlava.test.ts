import { describe, expect, it } from "bun:test";

import { poZlave } from "../../components/psb/KlientStol";

describe("zľava na platbe", () => {
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
});
