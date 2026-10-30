import { describe, expect, test } from "bun:test";

import { klucPlatbyMesiaca, platbyNaZaplatenie, stavPlatieb, type PohybPlatby } from "./platbyMesiaca";

const p = (datum: string, suma: number, kategoria: string, text = ""): PohybPlatby => ({ datum, suma, kategoria, text });

// Október 2026 tak, ako bol vo výpise 29. 10.: všetko okrem nájmu Fanderlíková a Jarka.
const oktober = [
  p("2026-10-23", -9761, "fixne.prevadzka.statJerry", "2323438014/3030"),
  p("2026-10-23", -1595, "fixne.prevadzka.statTerezka", "21012-7929621/0710 VS 7722288334"),
  p("2026-10-23", -3024, "fixne.prevadzka.statTerezka", "TERÉZIA Zdravotka"),
  p("2026-10-23", -23000, "spolocne.Nájom", "2323438014/3030 najom pradlacka"),
  p("2026-10-23", -2750, "spolocne.Domácnosť", "Upratovanie Fanderlíková 70 · Fanderlíková 70"),
];
const stav = (s: ReturnType<typeof stavPlatieb>, id: string) => s.find((x) => x.platba.id === id)!;

describe("platby mesiaca", () => {
  test("október: nájom Fanderlíková chýba, upratovanie ho nekryje", () => {
    const s = stavPlatieb("2026-10", oktober, {}, "2026-10-30");
    expect(stav(s, "najom-fanderlikova").zaplatene).toBeNull();
    expect(stav(s, "najom-pradlacka").zaplatene).toBe("banka");
    expect(stav(s, "stat-jerry").zaplatene).toBe("banka");
    expect(stav(s, "stat-terezka").zaplatene).toBe("banka");
    expect(platbyNaZaplatenie(oktober, {}, "2026-10-30").map((x) => x.platba.id).sort()).toEqual(["najom-fanderlikova", "splatka-jarek"]);
  });

  test("kaucia nie je nájom", () => {
    const s = stavPlatieb("2026-09", [p("2026-09-03", -25000, "fixne.prevadzka.najom", "Kauce Fanderlíkova")], {}, "2026-09-30");
    expect(stav(s, "najom-fanderlikova").zaplatene).toBeNull();
  });

  test("štát Terezky chce obe platby", () => {
    const s = stavPlatieb("2026-10", [oktober[1]], {}, "2026-10-30");
    expect(stav(s, "stat-terezka").zaplatene).toBeNull();
    expect(stav(s, "stat-terezka").pohyby).toHaveLength(1);
  });

  test("pred dňom pripomenutia sa nepýta, odklik zatvára", () => {
    expect(platbyNaZaplatenie([], {}, "2026-11-14").filter((x) => x.mesiac === "2026-11")).toHaveLength(0);
    expect(platbyNaZaplatenie([], {}, "2026-11-15").filter((x) => x.mesiac === "2026-11").map((x) => x.platba.id)).toEqual(["stat-jerry"]);
    const ack = { [klucPlatbyMesiaca("stat-jerry", "2026-11")]: { note: "zaplatené" } };
    expect(platbyNaZaplatenie([], ack, "2026-11-15").filter((x) => x.mesiac === "2026-11")).toHaveLength(0);
  });

  test("nezaplatené z minulého mesiaca sa pýta ďalej, starší nie a pred októbrom nikdy", () => {
    const nov = platbyNaZaplatenie(oktober, {}, "2026-11-02");
    expect(nov.filter((x) => x.mesiac === "2026-10").map((x) => x.platba.id).sort()).toEqual(["najom-fanderlikova", "splatka-jarek"]);
    expect(platbyNaZaplatenie([], {}, "2026-12-30").some((x) => x.mesiac === "2026-10")).toBe(false);
    expect(platbyNaZaplatenie([], {}, "2026-10-01").some((x) => x.mesiac === "2026-09")).toBe(false);
  });

  test("mesiac sa počíta po svojom — zaplatené 28. 9. nekryje október", () => {
    const s = stavPlatieb("2026-10", [p("2026-09-28", -29750, "fixne.prevadzka.najom", "Měsíčni nájem Fanderlíkova")], {}, "2026-10-30");
    expect(stav(s, "najom-fanderlikova").zaplatene).toBeNull();
  });
});
