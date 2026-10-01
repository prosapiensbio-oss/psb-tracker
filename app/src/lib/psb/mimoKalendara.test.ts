import { describe, expect, it } from "bun:test";

import { sedeniaMimoKalendara } from "./mimoKalendara";

const DNES = new Date("2026-10-01T12:00:00Z");
const s = (client: string, date: string, sessionTrainer = "Jerry") => ({ client, date, sessionTrainer });
const u = (zaciatok: string, klient: string | null, typ = "trening", zmizlaAt: string | null = null) =>
  ({ zaciatok, klient, typ, zmizlaAt });

describe("sedeniaMimoKalendara", () => {
  // Pole udalostí musí siahať aspoň tak ďaleko ako sedenie, inak sa nevie nič.
  const OKNO = [u("2026-09-05T08:00:00Z", "Niekto Iny")];

  it("sedenie bez udalosti v kalendári je nález — to je ten smer, čo stráca dáta", () => {
    const von = sedeniaMimoKalendara([s("Lenka Prinosilova", "2026-09-17")], OKNO, DNES);
    expect(von).toHaveLength(1);
    expect(von[0]).toMatchObject({ klient: "Lenka Prinosilova", datum: "2026-09-17", trener: "Jerry" });
  });

  it("keď udalosť v kalendári je, nález nie je", () => {
    const von = sedeniaMimoKalendara(
      [s("Lenka Prinosilova", "2026-09-17")],
      [...OKNO, u("2026-09-17T15:00:00Z", "Lenka Prinosilova")],
      DNES,
    );
    expect(von).toHaveLength(0);
  });

  it("presunutá hodina o deň sa nepočíta ako chýbajúca (±1 deň)", () => {
    expect(sedeniaMimoKalendara(
      [s("Lenka Prinosilova", "2026-09-17")],
      [...OKNO, u("2026-09-18T15:00:00Z", "Lenka Prinosilova")],
      DNES,
    )).toHaveLength(0);
  });

  it("zmiznutá udalosť sa neráta ako pokrytie — tréning sa konal, kalendár o ňom nevie", () => {
    expect(sedeniaMimoKalendara(
      [s("Lenka Prinosilova", "2026-09-17")],
      [...OKNO, u("2026-09-17T15:00:00Z", "Lenka Prinosilova", "trening", "2026-09-18T08:00:00Z")],
      DNES,
    )).toHaveLength(1);
  });

  it("staršie než okno sa nehlási — tam kalendár ešte nemusel byť pripojený", () => {
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-07-01")], OKNO, DNES)).toHaveLength(0);
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-08-20")], OKNO, DNES)).toHaveLength(0);
    // 5. 9. je prvý deň okna a ten sa nesúdi (viď test o tolerancii ±1).
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-09-05")], OKNO, DNES)).toHaveLength(0);
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-09-06")], OKNO, DNES)).toHaveLength(1);
  });

  it("diakritika a medzery meno nerozdelia", () => {
    expect(sedeniaMimoKalendara(
      [s("Anetka Přinosilová", "2026-09-09")],
      [...OKNO, u("2026-09-09T15:00:00Z", "anetka prinosilova")],
      DNES,
    )).toHaveLength(0);
  });

  it("to isté sedenie sa nehlási dvakrát", () => {
    const von = sedeniaMimoKalendara(
      [s("Marcela Hruzova", "2026-09-10"), s("Marcela Hruzova", "2026-09-10")],
      OKNO, DNES,
    );
    expect(von).toHaveLength(1);
  });

  it("ďalej, než siaha pole udalostí, sa NEPÝTA — toto stálo jeden zlý deploy", () => {
    // Pole udalostí má 21 dní dozadu; sedenie spred 25 dní nemá s čím sedieť.
    // Bez tejto hranice appka ohlásila desiatky tréningov, ktoré v kalendári sú.
    const okno21 = [u("2026-09-10T08:00:00Z", "Hocikto")];
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-09-06")], okno21, DNES)).toHaveLength(0);
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-09-12")], okno21, DNES)).toHaveLength(1);
  });

  it("PRVÝ deň okna sa nesúdi — tolerancia ±1 sa tam nemá o čo oprieť", () => {
    // Sedenie 10. 9., udalosť sa posunula na 9. 9. — tá už v okne nie je,
    // takže by vyzeralo ako chýbajúce. Na živých dátach to robilo rozdiel
    // 15 klientov verzus 2 (1. 10. 2026).
    const okno = [u("2026-09-10T08:00:00Z", "Hocikto")];
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-09-10")], okno, DNES)).toHaveLength(0);
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-09-11")], okno, DNES)).toHaveLength(1);
  });

  it("prázdne pole udalostí = nehlási sa nič; chýbajúca udalosť nie je dôkaz", () => {
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-09-20")], [], DNES)).toHaveLength(0);
    expect(sedeniaMimoKalendara([s("Kto Vie", "2026-09-20")], undefined, DNES)).toHaveLength(0);
  });
});
