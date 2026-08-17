import { describe, expect, it } from "bun:test";

import { poUvodnomNikdy } from "./compute";
import type { ClientAgg } from "./compute";

const klient = (meno: string, uvodny: string, extra: Partial<ClientAgg> = {}) => ({
  name: meno,
  sessions: [{ date: uvodny, sessionType: "UVODNE", sessionTrainer: "Jerry" }],
  primaryTrainer: "Jerry",
  precoNeprisiel: "",
  ...extra,
}) as unknown as ClientAgg;

const klienti = (...k: ClientAgg[]) => Object.fromEntries(k.map((c) => [c.name, c]));

describe("po úvodnom nikdy", () => {
  it("kto prišiel raz a nič ďalšie nemá, v zozname je", () => {
    const v = poUvodnomNikdy(klienti(klient("Jiri Kubik", "2026-05-02")), [], []);
    expect(v.map((x) => x.meno)).toEqual(["Jiri Kubik"]);
  });

  it("kto si kúpil balíček, sa NERÁTA — aj keď sedenie ešte nie je v exporte", () => {
    // Roman Pavlik, 17. 8. 2026: úvodný 5. 8., 13. 8. zaplatil 7 790 Kč za
    // balíček a trénoval, ale PTminder to ešte neposlal.
    const v = poUvodnomNikdy(
      klienti(klient("Roman Pavlik", "2026-08-05")),
      [{ client_name: "Roman Pavlik", sessions_remaining: 6, valid_to: "2026-10-07" }],
      [],
    );
    expect(v).toHaveLength(0);
  });

  it("kto má po úvodnom tréning v kalendári, sa nerátá", () => {
    const v = poUvodnomNikdy(
      klienti(klient("Roman Pavlik", "2026-08-05")),
      [],
      [{ klient: "Roman Pavlik", zaciatok: "2026-08-13T10:00:00Z", typ: "trening", zmizlaAt: null }],
    );
    expect(v).toHaveLength(0);
  });

  it("zrušený tréning pokračovanie nedokazuje", () => {
    const v = poUvodnomNikdy(
      klienti(klient("Kto", "2026-08-05")),
      [],
      [{ klient: "Kto", zaciatok: "2026-08-13T10:00:00Z", typ: "trening", zmizlaAt: "2026-08-12" }],
    );
    expect(v).toHaveLength(1);
  });

  it("tréning PRED úvodným nič nedokazuje", () => {
    const v = poUvodnomNikdy(
      klienti(klient("Kto", "2026-08-05")),
      [],
      [{ klient: "Kto", zaciatok: "2026-07-30T10:00:00Z", typ: "trening", zmizlaAt: null }],
    );
    expect(v).toHaveLength(1);
  });

  it("inak písané meno v balíčku sa spáruje", () => {
    const v = poUvodnomNikdy(
      klienti(klient("Zuzana Sopoligová", "2026-08-06")),
      [{ client_name: "zuzana sopoligova", sessions_remaining: 6, valid_to: "2026-10-07" }],
      [],
    );
    expect(v).toHaveLength(0);
  });
});
