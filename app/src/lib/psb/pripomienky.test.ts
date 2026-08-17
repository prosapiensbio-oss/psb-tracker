import { describe, expect, it } from "bun:test";

import { pripomienkySlubov } from "./compute";

const DNES = new Date("2026-08-17T09:00:00Z");
const u = (zaciatok: string, klient: string | null, typ = "uvodny", zmizlaAt: string | null = null) =>
  ({ zaciatok, klient, typ, zmizlaAt });
const l = (date: string, name: string, source: string, referrer = "") => ({ date, name, source, referrer });

describe("SMS po úvodnom", () => {
  it("pripomenie sa po úvodnom tréningu", () => {
    const [x] = pripomienkySlubov([u("2026-08-11T10:00:00Z", "Tereza Pehalova")], [], {}, DNES);
    expect(x.title).toContain("SMS po úvodnom");
    expect(x.client).toBe("Tereza Pehalova");
    expect(x.acked).toBe(false);
  });

  it("budúci úvodný sa nepripomína — ešte sa nekonal", () => {
    expect(pripomienkySlubov([u("2026-08-25T10:00:00Z", "Kto")], [], {}, DNES)).toHaveLength(0);
  });

  it("zrušený tréning SMS nepotrebuje", () => {
    expect(pripomienkySlubov([u("2026-08-11T10:00:00Z", "Kto", "uvodny", "2026-08-10")], [], {}, DNES)).toHaveLength(0);
  });

  it("bežný tréning ani udalosť bez mena sa neráta", () => {
    expect(pripomienkySlubov([u("2026-08-11T10:00:00Z", "Kto", "trening")], [], {}, DNES)).toHaveLength(0);
    expect(pripomienkySlubov([u("2026-08-11T10:00:00Z", null)], [], {}, DNES)).toHaveLength(0);
  });

  it("po troch týždňoch je to už len šum", () => {
    expect(pripomienkySlubov([u("2026-07-01T10:00:00Z", "Kto")], [], {}, DNES)).toHaveLength(0);
  });

  it("odklepnutá pripomienka sa hlási ako vybavená, nie zmizne", () => {
    const ack = { "sms|2026-08-11|Kto": { note: "SMS poslaná" } };
    const [x] = pripomienkySlubov([u("2026-08-11T10:00:00Z", "Kto")], [], ack, DNES);
    expect(x.acked).toBe(true);
    expect(x.note).toBe("SMS poslaná");
  });
});

describe("odmena za odporúčanie", () => {
  it("pripomenie 10 % tomu, KTO odporučil — nie novému dopytu", () => {
    const [x] = pripomienkySlubov([], [l("2026-08-04", "Dan Kouřil", "referencia", "Natalia Peckova")], {}, DNES);
    expect(x.title).toContain("Natalia Peckova");
    expect(x.detail).toContain("10 %");
    expect(x.client).toBe("Natalia Peckova");
  });

  it("bez mena odporúčateľa žiada doplniť meno, nie dať zľavu", () => {
    const [x] = pripomienkySlubov([], [l("2026-08-04", "Dan", "referencia")], {}, DNES);
    expect(x.title).toContain("bez mena");
    expect(x.detail).not.toContain("10 %");
    expect(x.detail).toContain("Dopíš");
  });

  it("iný zdroj dopytu odmenu nespúšťa", () => {
    for (const z of ["google", "instagram", "web", "ine"]) {
      expect(pripomienkySlubov([], [l("2026-08-04", "X", z)], {}, DNES)).toHaveLength(0);
    }
  });

  it("staré odporúčania register nezaplavia", () => {
    // Deväť referencií za rok naraz by bolo presne to „svieti všetko,
    // teda nesvieti nič", pred ktorým varuje pravidlo o registri.
    expect(pripomienkySlubov([], [l("2026-02-06", "Jakub", "referencia", "Regina")], {}, DNES)).toHaveLength(0);
  });

  it("celá rodina sa dá umlčať naraz", () => {
    const ack = { "mute|odmena": { note: "nehlásiť" } };
    const [x] = pripomienkySlubov([], [l("2026-08-04", "Dan", "referencia", "Natalia")], ack, DNES);
    expect(x.acked).toBe(true);
  });
});
