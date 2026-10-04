import { describe, expect, it } from "bun:test";

import { historiaPreMail, popisPreKlienta } from "./historiaMail";
import type { Udalost } from "./klientOsCasu";
import { mailKlientovi } from "./mailKlientovi";

const os: Udalost[] = [
  { druh: "trening", den: "2026-03-20" },
  { druh: "platba", den: "2026-03-20", suma: 1100, metoda: "prevodom" },
  { druh: "balicekOd", den: "2026-03-27", nazov: "OFF - 6h S viazanostou", hodin: 6 },
  { druh: "platba", den: "2026-03-27", suma: 6990, metoda: "prevodom" },
  { druh: "trening", den: "2026-03-27", cas: "10:00" },
  { druh: "trening", den: "2026-04-01" },
];
const klient = {
  packageRemaining: 4, packageTotal: 6, firstSession: "2026-03-20T00:00:00.000Z",
  sessions: [{ date: "2026-03-20" }, { date: "2026-03-27" }, { date: "2026-04-01" }] as never,
  primaryTrainer: "Jerry",
};

describe("historiaPreMail — automat skladá to isté, čo panel", () => {
  const v = historiaPreMail("Lukas Hanus", os, klient, "2026-04-05", "2026-04-08T10:00");

  it("os je od najstaršieho, v jazyku klienta, s platbami", () => {
    expect(v.os[0]).toMatchObject({ den: "2026-03-20", druh: "trening", popis: "tréning" });
    expect(v.os.some((b) => b.popis.startsWith("zaplatené 6 990"))).toBe(true);
    // Interné „OFF - 6h S viazanostou" ide klientovi ako „Předplatné 6 h".
    expect(v.os.some((b) => b.popis === "6h Předplatné")).toBe(true);
  });

  it("je to úplná história so zaplatenou sumou a termínom", () => {
    expect(v.uplna).toBe(true);
    expect(v.zaplateneSpolu).toBe(8090);
    expect(v.hodinSpolu).toBe(3);
    expect(v.dalsi).toBe("2026-04-08T10:00");
    // Bez platby — automat nemá odkiaľ vziať sumu ďalšieho balíčka.
    expect(v.platba).toBeUndefined();
  });

  it("výsledok prejde rovno do mailu", () => {
    const m = mailKlientovi(v);
    expect(m.predmet).toBe("Tvoje tréningy a platby — ProSapiens");
    expect(m.text).toContain("8 090 Kč");
  });
});

describe("popisPreKlienta", () => {
  it("interné popisy prekladá do jazyka klienta", () => {
    expect(popisPreKlienta({ druh: "trening", den: "", popis: "tréning 10:00 · Jerry", zostatok: null, dlh: null } as never)).toBe("tréning");
    expect(popisPreKlienta({ druh: "platba", den: "", popis: "platba 6 990 Kč · prevodom", zostatok: null, dlh: null } as never)).toBe("zaplatené 6 990 Kč");
  });

  it("bez `uplna` vráti LEN posledný balíček — riadky idú od najnovšieho", () => {
    // Pozor na smer: `vypisHodin` vracia riadky od najnovšieho. Hľadanie
    // z opačného konca našlo NAJSTARŠÍ balíček a stránka ukázala február.
    const os: Udalost[] = [
      { den: "2026-02-15", druh: "balicekOd", popis: "6h Balíček", hodin: 6 },
      { den: "2026-02-18", druh: "trening", popis: "tréning · 08:30" },
      { den: "2026-09-09", druh: "balicekOd", popis: "8h Balíček", hodin: 8 },
      { den: "2026-09-15", druh: "trening", popis: "tréning · 08:30" },
    ] as unknown as Udalost[];
    const k = { packageRemaining: 7, packageTotal: 8, firstSession: "2026-02-15", sessions: [], primaryTrainer: "Jerry" };
    const posledny = historiaPreMail("Kto Vie", os, k as never, "2026-10-01", undefined, false);
    const dni = posledny.os.map((b) => b.den);
    expect(dni).toContain("2026-09-09");
    expect(dni).not.toContain("2026-02-15");
    expect(dni).not.toContain("2026-02-18");

    const cela = historiaPreMail("Kto Vie", os, k as never, "2026-10-01", undefined, true);
    expect(cela.os.map((b) => b.den)).toContain("2026-02-15");
  });

  it("posledný balíček berie aj tréningy, ktoré si prevzal", () => {
    // Jerry, 3. 10. 2026: odpočet 6, 5, 4… sa nesmie pretrhnúť. Hodiny 6 a 5
    // minuli tréningy spred balíčka — bez nich sa os otvorí šestkou
    // a pokračuje štvorkou, čo vyzerá ako chýbajúca hodina.
    const os: Udalost[] = [
      // Platí do 28. 8., takže nový balíček z 10. 8. si z neho tréningy prevezme.
      { den: "2026-06-29", druh: "balicekOd", popis: "6h Balíček", hodin: 2, doDna: "2026-08-28" },
      { den: "2026-06-29", druh: "trening", popis: "tréning" },
      { den: "2026-07-02", druh: "trening", popis: "tréning" },
      { den: "2026-07-24", druh: "trening", popis: "tréning" },
      { den: "2026-07-26", druh: "trening", popis: "tréning" },
      { den: "2026-08-10", druh: "balicekOd", popis: "6h Balíček", hodin: 6 },
      { den: "2026-08-12", druh: "trening", popis: "tréning" },
    ] as unknown as Udalost[];
    const k = { packageRemaining: 3, packageTotal: 6, firstSession: "2026-06-29", sessions: [], primaryTrainer: "Jerry" };
    const v = historiaPreMail("Kto Vie", os, k as never, "2026-10-01", undefined, false);
    const dni = v.os.map((b) => b.den);
    expect(dni).toContain("2026-07-24");
    expect(dni).toContain("2026-07-26");
    // Staršie tréningy, ktoré balíček neprevzal, tam ale nie sú.
    expect(dni).not.toContain("2026-06-29");
    // A odpočet ide bez diery: 6, 5, potom 4 po balíčku.
    const hodiny = v.os.filter((b) => b.druh === "trening").map((b) => b.zostatok);
    expect(hodiny).toEqual([6, 5, 4]);
  });

  it("vie vrátiť viac posledných balíčkov naraz", () => {
    // Jerry, 3. 10. 2026 nad Hanusom: komu sa mínus prenáša z balíčka do
    // balíčka, tomu jeden balíček nevysvetlí, kam sa hodiny podeli.
    const os: Udalost[] = [
      { den: "2026-02-15", druh: "balicekOd", popis: "6h Balíček", hodin: 6 },
      { den: "2026-02-18", druh: "trening", popis: "tréning · 08:30" },
      { den: "2026-06-01", druh: "balicekOd", popis: "6h Balíček", hodin: 6 },
      { den: "2026-06-05", druh: "trening", popis: "tréning · 08:30" },
      { den: "2026-09-09", druh: "balicekOd", popis: "8h Balíček", hodin: 8 },
      { den: "2026-09-15", druh: "trening", popis: "tréning · 08:30" },
    ] as unknown as Udalost[];
    const k = { packageRemaining: 7, packageTotal: 8, firstSession: "2026-02-15", sessions: [], primaryTrainer: "Jerry" };

    const dva = historiaPreMail("Kto Vie", os, k as never, "2026-10-01", undefined, false, 2);
    expect(dva.os.map((b) => b.den)).toContain("2026-06-01");
    expect(dva.os.map((b) => b.den)).not.toContain("2026-02-15");
    expect(dva.balickov).toBe(2);

    // Keď balíčkov toľko nie je, vráti sa všetko — nie prázdna os.
    const devat = historiaPreMail("Kto Vie", os, k as never, "2026-10-01", undefined, false, 9);
    expect(devat.os.map((b) => b.den)).toContain("2026-02-15");
  });
});
