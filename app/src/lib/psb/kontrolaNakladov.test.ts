// Dve kontroly, ktoré by chytili chybu z augusta 2026.
//
// Pri importe 5. 9. 2026 sa domáci nájom „najom pradlacka" (23 000) zaradil
// odhadom podľa slova „najom" do nájmu štúdia. August mal 52 750 namiesto
// 29 750, 7. 10. sa naučilo pravidlo najom pradlacka → Spoločné · Nájom
// a v ten istý deň hromadné potvrdenie „história" pohyb skrylo. Jerry si to
// všimol sám 25. 10. a pýtal sa, prečo ho nikto neupozornil.
import { describe, expect, it } from "bun:test";

import { chybajuceNaklady, nesediSPravidlom, type PohybNaKontrolu } from "./kontrolaNakladov";

const NAJOM = "fixne.prevadzka.najom";

describe("chybajuceNaklady — náklad, ktorý vyskočil", () => {
  // Skutočné čísla: apr–júl 2026 po 29 750 (júl bez nájmu, Radek), august
  // s domácim nájmom navyše.
  const august = {
    "2026-04": { [NAJOM]: 29750 },
    "2026-05": { [NAJOM]: 29750 },
    "2026-06": { [NAJOM]: 29750 },
    "2026-07": {},
    "2026-08": { [NAJOM]: 52750 },
  };

  it("augustový scenár: nájom štúdia 52 750 namiesto 29 750 sa ozve", () => {
    const n = chybajuceNaklady(august, "2026-08");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ druh: "vyskocil", kategoria: NAJOM, obvykle: 29750, teraz: 52750, mesiac: "2026-08" });
    expect(n[0].kluc).toBe(`vyskocil|${NAJOM}|2026-08`);
  });

  it("po oprave (29 750) mlčí", () => {
    expect(chybajuceNaklady({ ...august, "2026-08": { [NAJOM]: 29750 } }, "2026-08")).toEqual([]);
  });

  it("o 30 % viac, ale menej než 3 000 Kč, mlčí — zdražené predplatné nie je nález", () => {
    const m = { "2026-05": { apps: 5000 }, "2026-06": { apps: 5000 }, "2026-07": { apps: 5000 }, "2026-08": { apps: 7900 } };
    expect(chybajuceNaklady(m, "2026-08")).toEqual([]);
  });

  it("o 3 000 Kč viac, ale menej než 30 %, mlčí — veľká kategória kolíše", () => {
    const m = { "2026-05": { x: 20000 }, "2026-06": { x: 20000 }, "2026-07": { x: 20000 }, "2026-08": { x: 25000 } };
    expect(chybajuceNaklady(m, "2026-08")).toEqual([]);
  });

  it("nepravidelná kategória sa nesúdi ani smerom hore", () => {
    const m = { "2026-05": { x: 3000 }, "2026-06": {}, "2026-07": {}, "2026-08": { x: 30000 } };
    expect(chybajuceNaklady(m, "2026-08")).toEqual([]);
  });

  it("chýbajúci a klesnutý náklad sa hlási ďalej ako predtým", () => {
    const m = { "2026-05": { a: 10000, b: 10000 }, "2026-06": { a: 10000, b: 10000 }, "2026-07": { a: 10000, b: 10000 }, "2026-08": { b: 3000 } };
    expect(chybajuceNaklady(m, "2026-08").map((n) => n.druh).sort()).toEqual(["chyba", "kleslo"]);
  });
});

describe("nesediSPravidlom — nové pravidlo vs. staršie zaradenie", () => {
  const pohyb = (o: Partial<PohybNaKontrolu> & { datum: string; suma: number; kategoria: string }): PohybNaKontrolu => ({
    kluc: `k-${o.datum}-${o.suma}`, protistrana: "Jerry najom · Jerry najom pradlacka", poznamka: "", typ: "", ...o,
  });
  // Pravidlo zo 7. 10. 2026 a pohyby s rovnakým textom: tri zaradené správne,
  // augustový (importovaný 5. 9.) do nájmu štúdia.
  const pravidla = [{ vzor: "najom pradlacka", kategoria: "spolocne.Nájom", vytvorene: "2026-10-07T10:00:00.000Z" }];
  const pohyby = [
    pohyb({ datum: "2026-06-15", suma: -23000, kategoria: "spolocne.Nájom", vlozene: "2026-08-05T08:00:00Z" }),
    pohyb({ datum: "2026-07-15", suma: -23000, kategoria: "spolocne.Nájom", vlozene: "2026-08-05T08:00:00Z" }),
    pohyb({ datum: "2026-08-24", suma: -23000, kategoria: NAJOM, vlozene: "2026-09-05T08:00:00Z", kluc: "august" }),
    pohyb({ datum: "2026-09-15", suma: -23000, kategoria: "spolocne.Nájom", vlozene: "2026-10-01T08:00:00Z" }),
  ];

  it("augustový scenár: pohyb spred pravidla v nájme štúdia sa ukáže na potvrdenie", () => {
    const n = nesediSPravidlom(pohyby, pravidla);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ vzor: "najom pradlacka", kategoria: "spolocne.Nájom", zhoda: 3, spolu: 4, sumaSpolu: 23000 });
    expect(n[0].pohyby.map((p) => p.kluc)).toEqual(["august"]);
    expect(n[0].pohyby[0]).toMatchObject({ kategoria: NAJOM, mesiac: "2026-08" });
    expect(n[0].kluc).toBe("pravidlo|najom pradlacka|spolocne.Nájom");
    // Odpoveď v registri platí od najneskôr vloženého pohybu zo skupiny —
    // nie od pravidla, ktoré sa pri každom importe zapisuje nanovo.
    expect(n[0].platneOd).toBe("2026-09-05T08:00:00Z");
  });

  it("nepreraďuje — vstup zostane nedotknutý", () => {
    const kopia = JSON.parse(JSON.stringify(pohyby));
    nesediSPravidlom(pohyby, pravidla);
    expect(pohyby).toEqual(kopia);
  });

  it("po ručnej oprave mlčí", () => {
    const opravene = pohyby.map((p) => (p.kluc === "august" ? { ...p, kategoria: "spolocne.Nájom" } : p));
    expect(nesediSPravidlom(opravene, pravidla)).toEqual([]);
  });

  it("pohyb zapísaný PO vzniku pravidla a predsa inak = rozhodnutie človeka, mlčí", () => {
    const neskor = [...pohyby, pohyb({ datum: "2026-10-15", suma: -23000, kategoria: "mimo", vlozene: "2026-10-20T08:00:00Z" })];
    expect(nesediSPravidlom(neskor, pravidla)[0].pohyby.map((p) => p.kluc)).toEqual(["august"]);
  });

  it("keď kategória pravidla neprevažuje, mlčí — pravidlo nesie len posledné rozhodnutie (APPLE.COM/BILL)", () => {
    const apple = [
      pohyb({ datum: "2026-05-01", suma: -1699, kategoria: "fixne.apps.ine", protistrana: "APPLE.COM/BILL", vlozene: "2026-08-05" }),
      pohyb({ datum: "2026-06-01", suma: -1699, kategoria: "fixne.apps.ine", protistrana: "APPLE.COM/BILL", vlozene: "2026-08-05" }),
      pohyb({ datum: "2026-09-01", suma: -1699, kategoria: "vyplaty.jerry", protistrana: "APPLE.COM/BILL", vlozene: "2026-09-13" }),
    ];
    expect(nesediSPravidlom(apple, [{ vzor: "apple.com/bill", kategoria: "vyplaty.jerry", vytvorene: "2026-10-03T00:00:00Z" }])).toEqual([]);
  });

  it("drobnosti pod prahom sa nepýtajú", () => {
    const wolt = [
      ...[1, 2, 3].map((d) => pohyb({ datum: `2026-05-0${d}`, suma: -400, kategoria: "spolocne.Potraviny", protistrana: "Wolt", vlozene: "2026-08-05" })),
      pohyb({ datum: "2026-05-09", suma: -800, kategoria: "spolocne.Iné", protistrana: "Wolt", vlozene: "2026-08-05" }),
    ];
    expect(nesediSPravidlom(wolt, [{ vzor: "wolt", kategoria: "spolocne.Potraviny", vytvorene: "2026-09-20T00:00:00Z" }])).toEqual([]);
  });

  it("vyhráva prvé pravidlo v poradí priority, rovnako ako pri importe", () => {
    const p2 = [{ vzor: "jerry najom", kategoria: NAJOM, vytvorene: "2026-10-08T00:00:00Z" }, ...pravidla];
    // Prvé pravidlo hovorí nájom štúdia — augustový pohyb mu sedí, tri ostatné nie,
    // ale tam pravidlo neprevažuje (1 zo 4), takže ticho.
    expect(nesediSPravidlom(pohyby, p2)).toEqual([]);
  });

  it("príjmy, nezaradené pohyby a pravidlá bez dátumu vzniku sa nesúdia", () => {
    const ine = [
      pohyb({ datum: "2026-08-01", suma: 23000, kategoria: NAJOM, vlozene: "2026-09-05" }),
      pohyb({ datum: "2026-08-02", suma: -23000, kategoria: "", vlozene: "2026-09-05" }),
    ];
    expect(nesediSPravidlom(ine, pravidla)).toEqual([]);
    expect(nesediSPravidlom(pohyby, [{ vzor: "najom pradlacka", kategoria: "spolocne.Nájom" }])).toEqual([]);
  });
});
