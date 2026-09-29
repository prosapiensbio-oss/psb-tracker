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
    expect(v.os.some((b) => b.popis === "Předplatné 6 h")).toBe(true);
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
});
