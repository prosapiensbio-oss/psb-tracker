import { describe, expect, it } from "bun:test";

import { dalsiTreningPoUvodnom, poslednyUvodny } from "./smsPoUvodnom";

const u = (zaciatok: string, typ = "trening", klient = "Linda Muth", zmizlaAt: string | null = null) => ({ zaciatok, klient, typ, zmizlaAt, trener: "Terezka" });

describe("SMS po úvodnom (Linda Muth, 28. 10. 2026)", () => {
  const ud = [u("2026-10-26T16:00", "uvodny"), u("2026-10-30T16:00", "trening", "Linda Muth", "2026-10-28"), u("2026-11-02T16:00"), u("2026-11-03T08:00", "trening", "Iný Klient")];
  it("ďalší tréning je najbližší živý po úvodnom; zrušený a cudzí sa neráta", () => {
    expect(dalsiTreningPoUvodnom(ud, "Linda Muth", "2026-10-26T16:00")).toBe("2026-11-02T16:00");
    expect(dalsiTreningPoUvodnom([u("2026-10-26T16:00", "uvodny")], "Linda Muth", "2026-10-26T16:00")).toBeNull();
  });
  it("posledný úvodný za 30 dní, budúci ani starý nie", () => {
    expect(poslednyUvodny(ud, "linda muth", "2026-10-28")?.zaciatok).toBe("2026-10-26T16:00");
    expect(poslednyUvodny(ud, "Linda Muth", "2026-10-20")).toBeNull();
    expect(poslednyUvodny(ud, "Linda Muth", "2026-12-20")).toBeNull();
  });
});
