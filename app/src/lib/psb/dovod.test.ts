import { describe, expect, it } from "bun:test";

import { pripomienkaDovodu, DOVODY_ODCHODU } from "./compute";
import type { ClientAgg } from "./compute";

const DNES = new Date("2026-08-17T09:00:00Z");
const klient = (meno: string, uvodny: string, preco = "") => ({
  name: meno,
  sessions: [{ date: uvodny, sessionType: "UVODNE", sessionTrainer: "Jerry" }],
  primaryTrainer: "Jerry",
  precoNeprisiel: preco,
}) as unknown as ClientAgg;
const kl = (...k: ClientAgg[]) => Object.fromEntries(k.map((c) => [c.name, c]));

describe("otázka na dôvod odchodu", () => {
  it("pýta sa pri tom, kto po úvodnom neprišiel a dôvod nemá", () => {
    const [x] = pripomienkaDovodu(kl(klient("Hana Hrdinova", "2026-08-06")), [], [], {}, DNES);
    expect(x.title).toContain("Prečo neprišiel znova");
    expect(x.client).toBe("Hana Hrdinova");
  });

  it("kto dôvod má, sa už nepýta", () => {
    const v = pripomienkaDovodu(kl(klient("Zuzana", "2026-08-06", "cena")), [], [], {}, DNES);
    expect(v).toHaveLength(0);
  });

  it("po 90 dňoch sa nepýta — vtedy si to už nikto nepamätá", () => {
    // Vojta Bartoň zo septembra 2025: otázka na neho by bola len riadok,
    // ktorý sa odklikne bez odpovede, a tým sa register učí ignorovať.
    const v = pripomienkaDovodu(kl(klient("Vojta Bartoň", "2025-09-29")), [], [], {}, DNES);
    expect(v).toHaveLength(0);
  });

  it("kto si kúpil balíček, nie je odídený a neplatí naň otázka", () => {
    const v = pripomienkaDovodu(
      kl(klient("Roman Pavlik", "2026-08-05")),
      [{ client_name: "Roman Pavlik", sessions_remaining: 6, valid_to: "2026-10-07" }],
      [], {}, DNES,
    );
    expect(v).toHaveLength(0);
  });

  it("odpovedaná otázka zostane v registri ako vybavená s odpoveďou", () => {
    const ack = { "dovod|2026-08-06|Hana Hrdinova": { note: "cena" } };
    const [x] = pripomienkaDovodu(kl(klient("Hana Hrdinova", "2026-08-06")), [], [], ack, DNES);
    expect(x.acked).toBe(true);
    expect(x.note).toBe("cena");
  });

  it("ponúkané dôvody sú tie, ktoré sa v PSB naozaj opakujú", () => {
    expect(DOVODY_ODCHODU).toContain("cena");
    expect(DOVODY_ODCHODU.length).toBeLessThanOrEqual(6);
  });
});
