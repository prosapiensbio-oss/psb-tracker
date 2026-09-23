import { describe, expect, it } from "bun:test";

import { zjednotOverrides } from "./zjednotOverrides";

describe("zjednotOverrides", () => {
  it("zápis pod menom bez mäkčeňa sa nájde pod menom z exportu", () => {
    // Presne Dominika: Jarvis písal „Krizova", PTminder exportuje „Križova".
    const v = zjednotOverrides(
      [{ meno: "Dominika Krizova", ov: { specialRate: true, primaryTrainer: "Jerry", updatedAt: "2026-09-14" } }],
      ["Dominika Križova"],
    );
    expect(Object.keys(v)).toEqual(["Dominika Križova"]);
    expect(v["Dominika Križova"].primaryTrainer).toBe("Jerry");
  });

  it("dva riadky o tom istom človeku sa zlúčia po políčkach", () => {
    const v = zjednotOverrides(
      [
        { meno: "Dominika Krizova", ov: { specialRate: true, trainerNote: "prvá klientka", updatedAt: "2026-09-14" } },
        { meno: "Dominika Križova", ov: { narodeniny: "1990-05-01", updatedAt: "2026-09-20" } },
      ],
      ["Dominika Križova"],
    );
    expect(Object.keys(v).length).toBe(1);
    expect(v["Dominika Križova"].trainerNote).toBe("prvá klientka");
    expect(v["Dominika Križova"].narodeniny).toBe("1990-05-01");
    expect(v["Dominika Križova"].updatedAt).toBe("2026-09-20");
  });

  it("pri spore rozhodne novší zápis", () => {
    const v = zjednotOverrides(
      [
        { meno: "X Y", ov: { status: "Pauza", updatedAt: "2026-08-01" } },
        { meno: "X Y", ov: { status: "Neaktívny", updatedAt: "2026-09-01" } },
      ],
      ["X Y"],
    );
    expect(v["X Y"].status).toBe("Neaktívny");
  });

  it("prázdne pole novšieho riadku neprepíše vyplnené staršie", () => {
    const v = zjednotOverrides(
      [
        { meno: "X Y", ov: { trainerNote: "dôležité", updatedAt: "2026-08-01" } },
        { meno: "X Y", ov: { trainerNote: "", status: "Pauza", updatedAt: "2026-09-01" } },
      ],
      ["X Y"],
    );
    expect(v["X Y"].trainerNote).toBe("dôležité");
    expect(v["X Y"].status).toBe("Pauza");
  });

  it("klient, ktorý v exporte ešte nie je, si meno ponechá", () => {
    const v = zjednotOverrides([{ meno: "Nový Človek", ov: { primaryTrainer: "Terezka" } }], ["Iný Klient"]);
    expect(Object.keys(v)).toEqual(["Nový Človek"]);
  });
});
