// Jeden prevod za dvoch klientov — Dan Kouřil a Monika Schonwalderova (4. 10. 2026).
import { describe, expect, it } from "bun:test";

import { navrhniRozdelenie, nepriradene, rozdelenieZFaktury, spolocniPlatitelia, type FioRiadok, type Platba, type PtPlatba } from "./platbyEvidencia";

const DAN = "Dan Kouřil";
const MONIKA = "Monika Schonwalderova";
const fio = (o: Partial<FioRiadok> & { id: string }): FioRiadok => ({
  id: o.id, date: o.date ?? "2026-05-15T00:00:00.000Z", amount_czk: o.amount_czk ?? 15580,
  counterparty: o.counterparty ?? "20260018 MGR. FILIP STRANAVSKY · DK CONS", note: o.note ?? null, typ: "Bezhotovostní příjem",
});
const pl = (klient: string, fioId: string, sumaCzk = 7790, datum = "2026-04-03"): Platba => ({
  id: `${klient}-${fioId}`, klient, datum, sumaCzk, sposob: "banka", fioId, zruseneAt: null,
});
// Prvý spoločný prevod 3. 4. Jerry rozdelil ručne — odtiaľ appka vie, že sú dvojica.
const ROZDELENE = [pl(DAN, "f-0403"), pl(MONIKA, "f-0403")];
const PT_1505: PtPlatba[] = [
  { klient: DAN, datum: "2026-05-15", suma: 7790, metoda: "bank" },
  { klient: MONIKA, datum: "2026-05-15", suma: 7790, metoda: "bank" },
  // Ďalší 7 790 v okne — bez histórie dvojice by appka nevedela, kto je druhý.
  { klient: "Alexej Bajkalov", datum: "2026-05-13", suma: 7790, metoda: "bank" },
  { klient: "Iva Stoklaskova", datum: "2026-05-18", suma: 7790, metoda: "bank" },
];

describe("spoloční platitelia", () => {
  it("dvojica vznikne z rozdeleného pohybu", () => {
    const m = spolocniPlatitelia(ROZDELENE);
    expect([...(m.get("dan kouril") || [])]).toEqual([MONIKA]);
  });
  it("zrušený diel dvojicu nerobí", () => {
    expect(spolocniPlatitelia([pl(DAN, "x"), { ...pl(MONIKA, "x"), zruseneAt: "2026-05-01" }]).size).toBe(0);
  });
});

describe("navrhniRozdelenie", () => {
  const s = spolocniPlatitelia(ROZDELENE);
  it("15. 5. 15 580 z DK Consulting → Dan 7 790 + Monika 7 790", () => {
    const n = navrhniRozdelenie(fio({ id: "a" }), [DAN], PT_1505, s);
    expect(n?.zdroj).toBe("spolocne");
    expect(n?.diely).toEqual([{ klient: DAN, suma: 7790 }, { klient: MONIKA, suma: 7790 }]);
  });
  it("bez histórie dvojice a s troma ďalšími 7 790 v okne sa nehádá", () => {
    expect(navrhniRozdelenie(fio({ id: "a" }), [DAN], PT_1505, new Map())).toBeNull();
  });
  it("Dan zaplatil sám celú sumu → nedelí sa", () => {
    const pt: PtPlatba[] = [{ klient: DAN, datum: "2026-05-15", suma: 7790, metoda: "bank" }];
    expect(navrhniRozdelenie(fio({ id: "a", amount_czk: 7790 }), [DAN], pt, s)).toBeNull();
  });
  it("po odchode z PTmindera rozhodnú ceny balíčkov", () => {
    const ceny = [
      { klient: DAN, od: "2026-11-01", cena: 7790 },
      { klient: MONIKA, od: "2026-10-25", cena: 7790 },
    ];
    const n = navrhniRozdelenie(fio({ id: "a", date: "2026-10-30" }), [DAN], [], s, ceny);
    expect(n?.diely.map((d) => d.suma)).toEqual([7790, 7790]);
  });
  it("bez mena v platbe ceny balíčkov nestačia — len PTminder", () => {
    const ceny = [{ klient: DAN, od: "2026-11-01", cena: 7790 }, { klient: MONIKA, od: "2026-10-25", cena: 7790 }];
    expect(navrhniRozdelenie(fio({ id: "a", date: "2026-10-30" }), [], [], s, ceny)).toBeNull();
    const n = navrhniRozdelenie(fio({ id: "a" }), [], PT_1505, s);
    expect(n?.diely.map((d) => d.klient).sort()).toEqual([DAN, MONIKA].sort());
  });
  it("PTminder sám: zvyšok má v okne jediný človek", () => {
    const pt: PtPlatba[] = [
      { klient: DAN, datum: "2026-07-26", suma: 7790, metoda: "bank" },
      { klient: MONIKA, datum: "2026-07-26", suma: 7790, metoda: "bank" },
    ];
    const n = navrhniRozdelenie(fio({ id: "a", date: "2026-07-26" }), [DAN], pt, new Map());
    expect(n?.zdroj).toBe("ptminder");
  });
});

describe("faktúra s položkami za dvoch", () => {
  const faktury = [{ cislo: "20261010", klient: DAN, diely: [{ klient: DAN, suma: 7790 }, { klient: MONIKA, suma: 7790 }] }];
  it("celá úhrada sa rozdelí podľa položiek", () => {
    expect(rozdelenieZFaktury("20261010 DK CONSULTING", 15580, faktury)?.length).toBe(2);
  });
  it("čiastočná úhrada sa nedelí", () => {
    expect(rozdelenieZFaktury("20261010 DK CONSULTING", 7790, faktury)).toBeNull();
  });
  it("nepriradene ponúkne rozdelenie z faktúry", () => {
    const n = nepriradene([fio({ id: "z", counterparty: "20261010 MGR. FILIP STRANAVSKY · DK CONS", date: "2026-11-02" })], [], {}, new Set(), [DAN, MONIKA], [], faktury);
    expect(n[0].zdrojRozdelenia).toBe("faktura");
    expect(n[0].rozdelenie?.map((d) => d.suma)).toEqual([7790, 7790]);
  });
});

describe("PTminder hovorí iné meno", () => {
  it("12. 3. 1 100 z DK Consulting: firma → Dan, PTminder → Monika; obaja do výberu", () => {
    const n = nepriradene(
      [fio({ id: "u", date: "2026-03-12", amount_czk: 1100, counterparty: "ProSapiens Úvodní školení · DK CONSULTIN", note: "ProSapiens Úvodní školení · DK CONSULTING, S.R.O" })],
      [], {}, new Set(), [DAN, MONIKA],
      [{ klient: MONIKA, datum: "2026-03-12", suma: 1100, metoda: "bank" }],
      [], [{ klient: DAN, firma: "DK Consulting, s.r.o.", ico: "29211441" }],
    );
    expect(n[0].kandidati).toEqual([DAN, MONIKA]);
    expect(n[0].poznamka).toContain(MONIKA);
  });
  it("keď PTminder má platbu aj pri navrhnutom, nič sa nemení", () => {
    const n = nepriradene(
      [fio({ id: "u", date: "2026-03-12", amount_czk: 1100, counterparty: "ProSapiens Úvodní školení · DK CONSULTIN", note: "ProSapiens Úvodní školení · DK CONSULTING, S.R.O" })],
      [], {}, new Set(), [DAN, MONIKA],
      [{ klient: MONIKA, datum: "2026-03-12", suma: 1100, metoda: "bank" }, { klient: DAN, datum: "2026-03-11", suma: 1100, metoda: "bank" }],
      [], [{ klient: DAN, firma: "DK Consulting, s.r.o.", ico: "29211441" }],
    );
    expect(n[0].kandidati).toEqual([DAN]);
  });
});
