import { describe, expect, it } from "bun:test";

import type { ClientAgg } from "./compute";
import { polozkyHodin, prahaNaUtc } from "./notifikaciaHodin";

/**
 * Jerry, 9. 10. 2026: „upozornenie, že klient má poslednú hodinu alebo je
 * v mínuse, a pridaj tam poslať SMS" — a hneď potom „len v deň, keď má ten
 * klient tréning, nech mi tam nesvieti 10 ľudí len tak".
 */
const k = (name: string, zostatok: number, o: Partial<ClientAgg> = {}) =>
  ({ name, status: "Aktívny", primaryTrainer: "Jerry", membership: "", packageRemaining: zostatok, packageTotal: 6, lastSession: "2026-10-07", ...o }) as unknown as ClientAgg;
const DNES = new Date("2026-10-09T10:00:00Z"); // 12:00 v Prahe
const ud = (klient: string, zaciatok: string) => ({ klient, zaciatok, typ: "trening" });
const dnes = (mena: string[]) => mena.map((m) => ud(m, "2026-10-09T18:00"));

describe("posledná hodina / mínus", () => {
  const clients = { "Eva A": k("Eva A", 1), "Ola B": k("Ola B", 0), "Ian C": k("Ian C", -2), "Plny D": k("Plny D", 4) };
  const vsetciDnes = dnes(Object.keys(clients));

  it("hlási poslednú hodinu, nulu aj mínus — plný balíček nie", () => {
    const p = polozkyHodin(clients, vsetciDnes, [], [], {}, {}, DNES);
    expect(p.map((x) => x.key).sort()).toEqual(["hodiny|Eva A|posledna", "hodiny|Ian C|minus", "hodiny|Ola B|minus"]);
    expect(p.find((x) => x.key === "hodiny|Ian C|minus")?.title).toContain("v mínuse -2 h");
    expect(p.find((x) => x.key === "hodiny|Eva A|posledna")?.title).toContain("posledná hodina");
    expect(p.every((x) => x.sms?.meno)).toBe(true);
  });

  it("LEN V DEŇ TRÉNINGU — bez dnešného tréningu mlčí", () => {
    expect(polozkyHodin(clients, [], [], [], {}, {}, DNES)).toEqual([]);
    expect(polozkyHodin(clients, [ud("Ian C", "2026-10-10T18:00")], [], [], {}, {}, DNES)).toEqual([]);
    // ranný tréning, ktorý už prebehol, sa počíta tiež
    expect(polozkyHodin(clients, [ud("Ian C", "2026-10-09T08:00")], [], [], {}, {}, DNES).length).toBe(1);
  });

  const ian = (r: unknown[]) => (r as { key: string }[]).some((x) => x.key.startsWith("hodiny|Ian C"));

  it("po SMS mlčí, kým nepríde platba alebo balíček", () => {
    const sms = { "Ian C": "2026-10-08T16:30:00.000Z" };
    expect(ian(polozkyHodin(clients, vsetciDnes, [], [], sms, {}, DNES))).toBe(false);
    const stara = { "Ian C": "2026-10-01T16:30:00.000Z" };
    expect(ian(polozkyHodin(clients, vsetciDnes, [{ klient: "Ian C", datum: "2026-10-05" }], [], stara, {}, DNES))).toBe(true);
  });

  it("„Vybavené“ pri poslednej hodine neumlčí prechod do mínusu", () => {
    const ack = { "hodiny|Eva A|posledna": { note: "vybavené", ackedAt: "2026-10-08T10:00:00.000Z" } };
    expect(polozkyHodin({ "Eva A": k("Eva A", 1) }, dnes(["Eva A"]), [], [], {}, ack, DNES)[0].acked).toBe(true);
    expect(polozkyHodin({ "Eva A": k("Eva A", -1) }, dnes(["Eva A"]), [], [], {}, ack, DNES)[0].acked).toBe(false);
  });

  it("odpoveď spred posledného nákupu neplatí (pásma: platba je pražský deň)", () => {
    const ack = { "hodiny|Ian C|minus": { note: "vybavené", ackedAt: "2026-10-04T21:30:00.000Z" } }; // 23:30 Praha 4. 10.
    const p = polozkyHodin(clients, vsetciDnes, [{ klient: "Ian C", datum: "2026-10-05" }], [], {}, ack, DNES).find((x) => x.key === "hodiny|Ian C|minus");
    expect(p?.acked).toBe(false);
  });

  it("neaktívny a pauza sa nehlásia ani v deň tréningu", () => {
    const iny = { a: k("a", 0, { status: "Neaktívny" }), b: k("b", 0, { status: "Pauza" }) };
    expect(polozkyHodin(iny, dnes(["a", "b"]), [], [], {}, {}, DNES)).toEqual([]);
  });

  it("pražský čas → UTC aj cez letný čas", () => {
    expect(prahaNaUtc("2026-10-08T18:00")).toBe("2026-10-08T16:00:00.000Z");
    expect(prahaNaUtc("2026-12-08T18:00")).toBe("2026-12-08T17:00:00.000Z");
  });
});
