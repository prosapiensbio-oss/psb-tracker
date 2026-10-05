import { describe, expect, it } from "bun:test";

import { CENNIK, platnostDo } from "./cennik";
import { nazovProduktu } from "./nazvyProduktov";

describe("cenník", () => {
  it("názvy sú v novom slovníku — Balíček a Předplatné", () => {
    // Jerry, 29. 9. 2026: „nemôže to byť bez viazanosti a s viazanosťou, ale
    // Balíček a Předplatné." Staré názvy chodia ďalej z PTmindera; `nazovProduktu`
    // ich prekladá na tieto, takže sa slovník zjednotí sám.
    for (const n of ["6h Balíček", "6h Předplatné", "8h Balíček", "18h Balíček", "Doplnenie členstva"]) {
      expect(CENNIK.some((s) => s.nazov === n)).toBe(true);
    }
    expect(CENNIK.some((s) => /viazanost/i.test(s.nazov))).toBe(false);
  });

  it("každý názov z exportu sa preloží na niektorý z cenníka", () => {
    // Keby sa preklad a cenník rozišli, klient by na faktúre videl jeden
    // názov a v appke iný.
    const vExporte = ["OFF - 6h BEZ viazanosti", "OFF - 6h S viazanostou", "OFF - 18 hodín offline", "OFF - 8 hodín offline", "OFF - 1 hodina offline", "ON - 6h BEZ viazanosti"];
    for (const n of vExporte) {
      expect(CENNIK.some((s) => s.nazov === nazovProduktu(n))).toBe(true);
    }
  });

  it("doplnenie členstva nemá pevný počet hodín ani platnosť", () => {
    const d = CENNIK.find((s) => s.nazov === "Doplnenie členstva")!;
    expect(d.hodiny).toBeNull();
    expect(d.tyzdnov).toBeNull();
  });

  it("vyradené produkty v ponuke nie sú", () => {
    // Jerry, 23. 9. 2026: TC, ČLENSTVÍ ONE/SILVER, DYNAMIKA a MFR sa už
    // nepredávajú a v roletke len predlžujú zoznam.
    for (const n of ["TC - 1 hodina", "TC - 4 hodiny", "TC - 4 hodiny + call", "ČLENSTVÍ ONE", "ČLENSTVÍ SILVER", "DYNAMIKA", "MFR/KOREKCIA"]) {
      expect(CENNIK.some((s) => s.nazov === n)).toBe(false);
    }
  });

  it("žiadne dva rovnaké názvy", () => {
    expect(new Set(CENNIK.map((s) => s.nazov)).size).toBe(CENNIK.length);
  });
});

describe("platnostDo", () => {
  it("osem týždňov od 1. 9.", () => {
    expect(platnostDo("2026-09-01", 8)).toBe("2026-10-26");
  });
  it("bez týždňov nepredvypĺňa nič — doplnenie členstva platnosť nemá", () => {
    expect(platnostDo("2026-09-01", null)).toBe("");
  });
  it("nezmyselný dátum nevyrobí nezmyselný koniec", () => {
    expect(platnostDo("", 8)).toBe("");
  });
});

describe("platnosť ako v PTminderi", () => {
  it("8 týždňov: Dan Kouřil 2. 9. → 27. 10.", () => {
    expect(platnostDo("2026-09-02", 8)).toBe("2026-10-27");
  });
  it("4 týždne: +27 dní", () => {
    expect(platnostDo("2026-02-17", 4)).toBe("2026-03-16");
  });
  it("mesiac: 24. 3. → 23. 4.", () => {
    expect(platnostDo("2026-03-24", 4, 1)).toBe("2026-04-23");
  });
  it("pol roka: 12. 2. → 11. 8.", () => {
    expect(platnostDo("2026-02-12", 26, 6)).toBe("2026-08-11");
  });
  it("31. 1. + mesiac sa zarazí na konci februára", () => {
    expect(platnostDo("2026-01-31", 4, 1)).toBe("2026-02-27");
  });
});
