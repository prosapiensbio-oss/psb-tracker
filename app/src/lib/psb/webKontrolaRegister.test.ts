import { describe, expect, it } from "bun:test";

import { registerZoServera } from "./registerServer";
import { EMPTY_DATA, type PSBData } from "./types";

/**
 * Kľúč položky „Web nefunguje" nesie deň posledného zlyhania (9. 10. 2026).
 * Odklepnutie je trvalé — bez dňa by „Vybavené" nad jedným starým pádom
 * umlčalo aj každú budúcu poruchu toho istého druhu.
 */
const sKontrolou = (detail: string, ack: PSBData["anomalyAck"] = {}): PSBData => ({
  ...EMPTY_DATA,
  anomalyAck: ack,
  webKontroly: [{ kluc: "meranie:zlyhania", nazov: "Zlyhané odoslania", stav: "chyba", detail, beh: "2026-10-09T04:00:00Z" }],
});
const web = (d: PSBData) => registerZoServera(d, { udalosti: [], zmeny: [] }).filter((r) => r.key.startsWith("web-kontrola|"));

describe("položka kontroly webu", () => {
  it("kľúč nesie deň posledného zlyhania z vety kontroly", () => {
    const [r] = web(sKontrolou("… Naposledy 2026-10-08, po dňoch: 2026-10-08 3× …"));
    expect(r.key).toBe("web-kontrola|meranie:zlyhania|2026-10-08");
  });

  it("vybavené staré zlyhanie neumlčí nové", () => {
    const ack = { "web-kontrola|meranie:zlyhania|2026-10-08": { note: "vybavené", ackedAt: "2026-10-09" } };
    expect(web(sKontrolou("Naposledy 2026-10-08, …", ack))[0].acked).toBe(true);
    expect(web(sKontrolou("Naposledy 2026-10-12, …", ack))[0].acked).toBe(false);
  });
});
