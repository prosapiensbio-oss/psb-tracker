import { describe, expect, it } from "bun:test";
import { kampanDopytu, navrhni, polozkyDozoru, stavKampane, type DozorData, type DozorKampan, type DozorDen } from "./reklamaDozor";

const kamp = (id: string, o: Partial<DozorKampan> = {}): DozorKampan => ({
  id, nazov: `K${id}`, ciel: "OUTCOME_TRAFFIC", stav: "ACTIVE", zaciatok: "2026-09-08T10:00:00+0200",
  dennyRozpocet: 120, sady: [{ id: `${id}0`, nazov: "sada", stav: "ACTIVE", denny: 120 }], problemy: [], updatedAt: "2026-10-10T04:20:00Z", ...o,
});
const dni = (id: string, od: string, pocet: number, spend = 120, kliky = 50, naStranke = 10): DozorDen[] =>
  Array.from({ length: pocet }, (_, i) => ({
    kampanId: id, den: new Date(Date.parse(`${od}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10), spend, kliky, naStranke,
  }));
const data = (kampane: DozorKampan[], d: DozorDen[], o: Partial<DozorData> = {}): DozorData => ({
  kampane, dni: d, vyhodnotenia: [], nastavenie: { stropMesiac: null, cielDopyt: null }, aktualizovane: "2026-10-10T04:20:00Z", ...o,
});
const DNES = "2026-10-10";

describe("kedy sa dozor ozve", () => {
  it("kampaň bez rozhodnutia po 7 dňoch je splatná", () => {
    const d = data([kamp("1")], dni("1", "2026-10-01", 9));
    const s = stavKampane(d.kampane[0], d, [], {}, DNES);
    expect(s.od).toBe("2026-09-08");
    expect(s.splatne).toBe(true);
  });

  it("čerstvá kampaň s malou útratou mlčí", () => {
    const d = data([kamp("1", { zaciatok: "2026-10-08T10:00:00Z" })], dni("1", "2026-10-08", 3));
    expect(stavKampane(d.kampane[0], d, [], {}, DNES).splatne).toBe(false);
  });

  it("1 500 Kč spustí vyhodnotenie skôr než 7 dní", () => {
    const d = data([kamp("1", { zaciatok: "2026-10-08T10:00:00Z" })], dni("1", "2026-10-08", 3, 600));
    expect(stavKampane(d.kampane[0], d, [], {}, DNES).splatne).toBe(true);
  });

  it("po „nechať“ sa pýta až o 14 dní — nové kolo má nový kľúč", () => {
    const d = data([kamp("1")], dni("1", "2026-10-01", 9, 50), {
      vyhodnotenia: [{ kampanId: "1", kedy: "2026-10-02T09:00:00Z", rozhodnutie: "nechat", minuteKc: 900, dopyty: 1, dm: null, rozpocetPo: null, poznamka: "" }],
    });
    const s = stavKampane(d.kampane[0], d, [], {}, DNES);
    expect(s.od).toBe("2026-10-02");
    expect(s.splatne).toBe(false); // 8 dní, 400 Kč
    expect(polozkyDozoru(d, [], {}, "2026-10-17").some((p) => p.key === "reklama|vyhodnot|1|2026-10-02")).toBe(true);
  });

  it("holé „Vybavené“ platí ako nechať — ďalšie kolo príde, nezamrzne navždy", () => {
    const d = data([kamp("1")], dni("1", "2026-09-08", 33, 50));
    const ack = { "reklama|vyhodnot|1|2026-09-08": { ackedAt: "2026-10-01T08:00:00Z", note: "vybavené" } };
    const s = stavKampane(d.kampane[0], d, [], ack, DNES);
    expect(s.od).toBe("2026-10-01");
    expect(s.splatne).toBe(false);
    expect(stavKampane(d.kampane[0], d, [], ack, "2026-10-16").splatne).toBe(true);
  });

  it("odloženie nie je rozhodnutie", () => {
    const d = data([kamp("1")], dni("1", "2026-09-08", 33, 50));
    const ack = { "reklama|vyhodnot|1|2026-09-08": { ackedAt: "2026-10-09T08:00:00Z", note: "odlozene|2026-10-12|" } };
    expect(stavKampane(d.kampane[0], d, [], ack, DNES).od).toBe("2026-09-08");
  });

  it("vypnutá alebo nedoručujúca kampaň sa nevyhodnocuje", () => {
    const d = data([kamp("1", { sady: [{ id: "10", nazov: "s", stav: "PAUSED", denny: 120 }] })], dni("1", "2026-09-08", 30));
    expect(polozkyDozoru(d, [], {}, DNES)).toEqual([]);
  });
});

describe("dopyt patrí kampani podľa utm_term (ID sady)", () => {
  const k = [kamp("5260301"), kamp("5260302")];
  it("term = ID sady", () => {
    expect(kampanDopytu({ date: DNES, source: "reklama", utm: "source=meta · campaign=x · content=regina · term=52603020" }, k)).toBe("5260302");
  });
  it("bez termu nepatrí nikomu", () => {
    expect(kampanDopytu({ date: DNES, source: "reklama", utm: "" }, k)).toBe(null);
  });
});

describe("návrh", () => {
  const n = { stropMesiac: null, cielDopyt: null };
  it("1 500+ Kč bez jediného dopytu → vypnúť", () => {
    expect(navrhni({ ciel: "OUTCOME_TRAFFIC" }, { minuteOd: 2000, klikyOd: 50, naStrankeOd: 30, dopytyOd: 0, bezOdkazuOd: 0, cenaZaDopyt: null }, n).akcia).toBe("vypnut");
  });
  it("dopyty bez odkazu → nesúdi, pýta sa", () => {
    expect(navrhni({ ciel: "OUTCOME_TRAFFIC" }, { minuteOd: 2000, klikyOd: 50, naStrankeOd: 30, dopytyOd: 0, bezOdkazuOd: 2, cenaZaDopyt: null }, n).akcia).toBe("nechat");
  });
  it("interakcie → pýta počet DM", () => {
    expect(navrhni({ ciel: "OUTCOME_ENGAGEMENT" }, { minuteOd: 2000, klikyOd: 500, naStrankeOd: 0, dopytyOd: 0, bezOdkazuOd: 0, cenaZaDopyt: null }, n).akcia).toBe("dm");
  });
  it("lacný dopyt pod cieľom → pridať rozpočet", () => {
    expect(navrhni({ ciel: "OUTCOME_TRAFFIC" }, { minuteOd: 1000, klikyOd: 50, naStrankeOd: 30, dopytyOd: 2, bezOdkazuOd: 0, cenaZaDopyt: 500 }, { stropMesiac: null, cielDopyt: 1000 }).akcia).toBe("rozpocet");
  });
  it("omylom ťuknuté kliky sa dopíšu", () => {
    const v = navrhni({ ciel: "OUTCOME_TRAFFIC" }, { minuteOd: 1000, klikyOd: 400, naStrankeOd: 80, dopytyOd: 1, bezOdkazuOd: 0, cenaZaDopyt: 1000 }, n).veta;
    expect(v).toContain("len 80 (20 %)");
  });
});

describe("peniaze bez dopytu", () => {
  it("každá ďalšia tisícka od posledného dopytu je nová otázka", () => {
    const d = data([kamp("1"), kamp("2")], [...dni("1", "2026-10-06", 5, 120), ...dni("2", "2026-10-06", 5, 120)]);
    const dop = [{ date: "2026-10-07", source: "reklama" }];
    const p = polozkyDozoru(d, dop, {}, DNES).find((x) => x.key.startsWith("reklama|bezdopytu|"));
    // po 7. 10.: 8., 9., 10. × 240 = 720 → ešte nie
    expect(p).toBeUndefined();
    const p2 = polozkyDozoru(d, [{ date: "2026-10-05", source: "reklama" }], {}, DNES).find((x) => x.key.startsWith("reklama|bezdopytu|"));
    expect(p2?.key).toBe("reklama|bezdopytu|2026-10-05|1");
  });
});

describe("problémy a strop", () => {
  it("zamietnutá reklama je červená aj keď kampaň nevyhodnocujeme", () => {
    const d = data([kamp("1", { problemy: [{ druh: "zamietnuta-5", text: "zamietnutá reklama „A“ — text" }] })], dni("1", "2026-10-09", 1));
    const p = polozkyDozoru(d, [], {}, DNES).find((x) => x.key === "reklama|problem|1|zamietnuta-5");
    expect(p?.tone).toBe("red");
  });
  it("prognóza nad strop sa ozve vopred", () => {
    const d = data([kamp("1", { dennyRozpocet: 300 })], dni("1", "2026-10-01", 10, 300), { nastavenie: { stropMesiac: 5000, cielDopyt: null } });
    expect(polozkyDozoru(d, [{ date: DNES, source: "reklama" }], {}, DNES).some((x) => x.key === "reklama|strop|2026-10|prognoza")).toBe(true);
  });
  it("bez bežiacej kampane mlčí aj strop", () => {
    const d = data([kamp("1", { stav: "PAUSED" })], dni("1", "2026-10-01", 10, 300), { nastavenie: { stropMesiac: 100, cielDopyt: null } });
    expect(polozkyDozoru(d, [], {}, DNES)).toEqual([]);
  });
  it("starý dozor sa prizná", () => {
    const d = data([kamp("1")], dni("1", "2026-10-01", 3, 10), { aktualizovane: "2026-10-05T04:20:00Z" });
    expect(polozkyDozoru(d, [{ date: DNES, source: "reklama" }], {}, DNES).some((x) => x.key.startsWith("reklama|stary|"))).toBe(true);
  });
});
