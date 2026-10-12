import { describe, expect, it } from "bun:test";
import { polozkyFotiek } from "./fotkyOdkazy";

describe("odpovede klientov na fotky v notifikáciách", () => {
  it("každá odpoveď je vlastná položka trénerovi, ktorý odkaz poslal", () => {
    const p = polozkyFotiek({
      odpovede: [{ id: 7, token: "t1", klient: "Tomáš Novák", kedy: "2026-10-12T10:00:00Z", trener: "Terezka", text: "Super, díky!" }],
      suhlasy: [],
    });
    expect(p).toHaveLength(1);
    expect(p[0].key).toBe("fotky|odpoved|7");
    expect(p[0].trener).toBe("Terezka");
    expect(p[0].detail).toContain("Super, díky!");
  });
  it("súhlas „ano“ sa oznámi, „ne“ nie", () => {
    const p = polozkyFotiek({ odpovede: [], suhlasy: [
      { token: "a", klient: "X", kedy: "2026-10-12", suhlas: "ano", trener: null },
      { token: "b", klient: "Y", kedy: "2026-10-12", suhlas: "ne", trener: null },
    ] });
    expect(p.map((x) => x.key)).toEqual(["fotky|suhlas|a"]);
  });
  it("bez dát nič", () => expect(polozkyFotiek(undefined)).toEqual([]));
});
