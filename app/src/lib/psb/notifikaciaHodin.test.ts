import { describe, expect, it } from "bun:test";

import type { ClientAgg } from "./compute";
import { polozkyHodin, prahaNaUtc } from "./notifikaciaHodin";

/** Jerry, 9. 10. 2026: „upozornenie, že klient má poslednú hodinu alebo je v mínuse, a pridaj tam poslať SMS." */
const k = (name: string, zostatok: number, o: Partial<ClientAgg> = {}) =>
  ({ name, status: "Aktívny", primaryTrainer: "Jerry", membership: "", packageRemaining: zostatok, packageTotal: 6, lastSession: "2026-10-07", ...o }) as unknown as ClientAgg;
const DNES = new Date("2026-10-09T10:00:00Z"); // 12:00 v Prahe
const ud = (klient: string, zaciatok: string) => ({ klient, zaciatok, typ: "trening" });

describe("posledná hodina / mínus", () => {
  const clients = { "Eva A": k("Eva A", 1), "Ola B": k("Ola B", 0), "Ian C": k("Ian C", -2), "Plny D": k("Plny D", 4) };

  it("hlási poslednú hodinu, nulu aj mínus — plný balíček nie", () => {
    const p = polozkyHodin(clients, [], [], [], {}, {}, DNES);
    expect(p.map((x) => x.key).sort()).toEqual(["hodiny|Eva A|posledna", "hodiny|Ian C|minus", "hodiny|Ola B|minus"]);
    expect(p.find((x) => x.key === "hodiny|Ian C|minus")?.title).toContain("v mínuse -2 h");
    expect(p.find((x) => x.key === "hodiny|Eva A|posledna")?.title).toContain("posledná hodina");
    expect(p.every((x) => x.sms?.meno)).toBe(true);
  });

  const ian = (r: unknown[]) => (r as { key: string }[]).some((x) => x.key.startsWith("hodiny|Ian C"));

  it("po SMS mlčí aj cez ďalšie tréningy — neotravuje po každej hodine", () => {
    const sms = { "Ian C": "2026-10-08T16:30:00.000Z" };
    expect(ian(polozkyHodin(clients, [ud("Ian C", "2026-10-09T08:00")], [], [], sms, {}, DNES))).toBe(false);
  });

  it("platba alebo balíček po SMS otvára novú epizódu", () => {
    const sms = { "Ian C": "2026-10-01T16:30:00.000Z" };
    expect(ian(polozkyHodin(clients, [], [{ klient: "Ian C", datum: "2026-10-05" }], [], sms, {}, DNES))).toBe(true);
  });

  it("„Vybavené“ pri poslednej hodine neumlčí prechod do mínusu", () => {
    const ack = { "hodiny|Eva A|posledna": { note: "vybavené", ackedAt: "2026-10-08T10:00:00.000Z" } };
    expect(polozkyHodin({ "Eva A": k("Eva A", 1) }, [], [], [], {}, ack, DNES)[0].acked).toBe(true);
    expect(polozkyHodin({ "Eva A": k("Eva A", -1) }, [], [], [], {}, ack, DNES)[0].acked).toBe(false);
  });

  it("odpoveď spred posledného nákupu neplatí (pásma: platba je pražský deň)", () => {
    const ack = { "hodiny|Ian C|minus": { note: "vybavené", ackedAt: "2026-10-04T21:30:00.000Z" } }; // 23:30 Praha 4. 10.
    const p = polozkyHodin(clients, [], [{ klient: "Ian C", datum: "2026-10-05" }], [], {}, ack, DNES).find((x) => x.key === "hodiny|Ian C|minus");
    expect(p?.acked).toBe(false);
  });

  it("neaktívny, pauza a dlho nechodiaci bez termínu sa nehlásia", () => {
    const iny = { a: k("a", 0, { status: "Neaktívny" }), b: k("b", 0, { status: "Pauza" }), c: k("c", 0, { lastSession: "2026-09-10" }) };
    expect(polozkyHodin(iny, [], [], [], {}, {}, DNES)).toEqual([]);
    // …ale s objednaným termínom áno
    expect(polozkyHodin({ c: iny.c }, [ud("c", "2026-10-12T10:00")], [], [], {}, {}, DNES).length).toBe(1);
  });

  it("pražský čas → UTC aj cez letný čas", () => {
    expect(prahaNaUtc("2026-10-08T18:00")).toBe("2026-10-08T16:00:00.000Z");
    expect(prahaNaUtc("2026-12-08T18:00")).toBe("2026-12-08T17:00:00.000Z");
  });
});
