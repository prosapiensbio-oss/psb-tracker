import { describe, expect, it } from "bun:test";
import { zaverUzMaTermin } from "./compute";

/**
 * Pripomienka „ozvať sa a dohodnúť termín“ sa najprv pozrie do kalendára.
 *
 * Jerry, 31. 8. 2026: podľa nej napísal Romanovi Pavlíkovi SMS a Roman
 * odpísal, že sú dohodnutí — mal termín v utorok o 10:30. Falošný poplach je
 * horší než zmeškaný, lebo podľa neho sa koná.
 */
const KLIENTI = ["Roman Pavlik", "Michal Knapčok", "Jan Kral"];
const DNES = new Date("2026-08-31T08:00:00Z");
const u = (klient: string, zaciatok: string, typ = "trening", zmizlaAt: string | null = null) =>
  ({ klient, zaciatok, typ, zmizlaAt });

const ROMAN = { zaver: "Roman Pavlik budúci týždeň nepríde na tréning.", tema: "klienti", overit: "Ozvať sa Romanovi a dohodnúť termín na začiatok septembra." };

describe("záver o termíne sa overuje kalendárom", () => {
  it("keď má budúci termín, vráti ho", () => {
    const r = zaverUzMaTermin(ROMAN, KLIENTI, [u("Roman Pavlik", "2026-09-01T10:30:00Z")], DNES);
    expect(r).toBe("2026-09-01T10:30:00Z");
  });

  it("keď termín nemá, nehlási nič", () => {
    expect(zaverUzMaTermin(ROMAN, KLIENTI, [], DNES)).toBeNull();
  });

  it("minulý tréning termín nenahrádza", () => {
    expect(zaverUzMaTermin(ROMAN, KLIENTI, [u("Roman Pavlik", "2026-08-20T10:30:00Z")], DNES)).toBeNull();
  });

  it("zrušený termín sa neráta — pripomienka sa vráti sama", () => {
    const zruseny = [u("Roman Pavlik", "2026-09-01T10:30:00Z", "trening", "2026-08-30T12:00:00Z")];
    expect(zaverUzMaTermin(ROMAN, KLIENTI, zruseny, DNES)).toBeNull();
  });

  it("záver, ktorý nie je o termíne, kalendár neumlčí", () => {
    const fb = { zaver: "Full Access: žiadosť odoslaná.", tema: "Meta", overit: "Prišlo rozhodnutie?" };
    expect(zaverUzMaTermin(fb, KLIENTI, [u("Roman Pavlik", "2026-09-01T10:30:00Z")], DNES)).toBeNull();
  });

  it("bez rozpoznaného klienta radšej hlási", () => {
    const bezMena = { zaver: "Treba dohodnúť termín stretnutia s dodávateľom.", tema: "", overit: "Dohodnúť termín." };
    expect(zaverUzMaTermin(bezMena, KLIENTI, [u("Roman Pavlik", "2026-09-01T10:30:00Z")], DNES)).toBeNull();
  });

  it("termín iného klienta nestačí", () => {
    expect(zaverUzMaTermin(ROMAN, KLIENTI, [u("Michal Knapčok", "2026-09-01T10:30:00Z")], DNES)).toBeNull();
  });
});
