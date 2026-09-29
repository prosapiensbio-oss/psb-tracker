import { describe, expect, it } from "bun:test";

import { icsUid, pripravTrening } from "./nahodTrening";

describe("pripravTrening", () => {
  it("poskladá udalosť s koncom o hodinu a kalendárom trénera", () => {
    const v = pripravTrening({ klient: "Lukas Hanus", den: "2026-10-02", cas: "10:00", trener: "Jerry" });
    expect(v).toEqual({ ok: true, t: { kalendar: "jerrystranavsky@gmail.com", nazov: "Lukas Hanus", zaciatok: "2026-10-02T10:00", koniec: "2026-10-02T11:00", trener: "Jerry" } });
  });

  it("90 minút a Terezkin kalendár", () => {
    const v = pripravTrening({ klient: "A", den: "2026-10-02", cas: "17:30", minut: 90, trener: "Terezka" });
    if (!v.ok) throw new Error(v.chyba);
    expect(v.t.koniec).toBe("2026-10-02T19:00");
    expect(v.t.kalendar).toBe("teres.zat@gmail.com");
  });

  it("odmietne neznámeho trénera, zlý čas aj tréning cez polnoc", () => {
    expect(pripravTrening({ klient: "A", den: "2026-10-02", cas: "10:00", trener: "Matyáš" }).ok).toBe(false);
    expect(pripravTrening({ klient: "A", den: "2026-10-02", cas: "25:00", trener: "Jerry" }).ok).toBe(false);
    expect(pripravTrening({ klient: "A", den: "2026-10-02", cas: "23:30", trener: "Jerry" }).ok).toBe(false);
  });

  it("ics uid je google id s doménou — snímka udalosť spozná ako tú istú", () => {
    expect(icsUid("abc123")).toBe("abc123@google.com");
  });
});
