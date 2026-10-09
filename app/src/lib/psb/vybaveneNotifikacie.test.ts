import { describe, expect, it } from "bun:test";

import { nezapisaneDoRegistra, stavPolozkyRegistra } from "./compute";

/**
 * „VYBAVENÉ" PLATÍ NA TO, ČO BOLO, KEĎ PADLO (9. 10. 2026).
 *
 * Jerry: „vyskakujú mi notifikácie, ktoré sú už vybavené, a iné zas nie."
 * Zoskupené položky mali stály kľúč — jedno „je to hotové" z 29. 8. schovalo
 * 51 nevysvetlených zmien v kalendári, ktoré prišli až potom.
 */
describe("odpoveď staršia než obsah položky", () => {
  const ack = { "kalendar|zmeny|Jerry": { note: "je to hotové", ackedAt: "2026-08-29T10:00:00.000Z", actor: "Jerry" } };

  it("nová vec po odpovedi položku vráti — aj s tým, čo sa odpovedalo", () => {
    const s = stavPolozkyRegistra("kalendar|zmeny|Jerry", ack, undefined, new Date(), "2026-10-08T21:00:48.816Z");
    expect(s.acked).toBe(false);
    expect(s.predchadzajuca?.text).toBe("je to hotové");
  });

  it("keď nič nové neprišlo, odpoveď drží", () => {
    expect(stavPolozkyRegistra("kalendar|zmeny|Jerry", ack, undefined, new Date(), "2026-08-28T08:00:00.000Z").acked).toBe(true);
  });

  it("bez platneOd sa správa ako doteraz", () => {
    expect(stavPolozkyRegistra("kalendar|zmeny|Jerry", ack).acked).toBe(true);
  });

  it("umlčaná rodina platí ďalej", () => {
    const mute = { ...ack, "mute|kalendar": { note: "nehlásiť", ackedAt: "2026-08-01T00:00:00Z" } };
    expect(stavPolozkyRegistra("kalendar|zmeny|Jerry", mute, "kalendar", new Date(), "2026-10-08T21:00:00Z").acked).toBe(true);
  });

  it("holý deň (posledný tréning) sa porovnáva s časom odpovede", () => {
    const g = { "gone|Anna Nova": { note: "vybavené", ackedAt: "2026-08-20T09:00:00.000Z" } };
    expect(stavPolozkyRegistra("gone|Anna Nova", g, undefined, new Date(), "2026-09-15").acked).toBe(false);
    expect(stavPolozkyRegistra("gone|Anna Nova", g, undefined, new Date(), "2026-08-01").acked).toBe(true);
  });
});

describe("zoskupené položky nesú čas najnovšej veci", () => {
  const polozky = nezapisaneDoRegistra({
    leads: [
      { id: "a", name: "Eva", date: "2026-09-01", dovod: "", status: "novy", odpovedaneAt: "x", createdAt: "2026-09-01T08:00:00Z", druh: "dopyt" },
      { id: "b", name: "Ola", date: "2026-10-07", dovod: "", status: "novy", odpovedaneAt: "x", createdAt: "2026-10-07T08:00:00Z", druh: "dopyt" },
    ],
    dnes: "2026-10-09",
    menaKlientov: [],
    zmeny: [
      { druh: "zmizla", trener: "Jerry", kedy: "2026-10-01T06:00:00Z" },
      { druh: "presun", trener: "Jerry", kedy: "2026-10-08T21:00:00Z" },
      { druh: "zmizla", trener: "Terezka", kedy: "2026-09-30T06:00:00Z" },
      { druh: "zmizla", trener: "Terezka", kedy: "2026-09-02T06:00:00Z" },
    ],
  });
  const k = (key: string) => polozky.find((p) => p.key === key);

  it("zmeny v kalendári po trénerovi", () => {
    expect(k("kalendar|zmeny|Jerry")?.platneOd).toBe("2026-10-08T21:00:00Z");
    expect(k("kalendar|zmeny|Terezka")?.platneOd).toBe("2026-09-30T06:00:00Z");
  });

  it("zmeny staršie než 14 dní sa do počtu nerátajú, detail ich spomenie", () => {
    expect(k("kalendar|zmeny|Terezka")?.title).toContain("(1)");
    expect(k("kalendar|zmeny|Terezka")?.detail).toContain("Ďalších 1 starších");
  });
});
