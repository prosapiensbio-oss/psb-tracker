// Pravidelný klient bez dohodnutého termínu.
//
// Jerry, 31. 8. 2026: „niektorých klientov mám fixne a pravidelne sú
// v kalendári, ale niektorí sú variabilní a tých si tam musím vložiť každý
// týždeň — a každý týždeň zabudnem."
import { describe, expect, it } from "bun:test";

import { bezDohodnutehoTerminu, zaverKryjeKlienta } from "./compute";

const DNES = new Date("2026-08-31T09:00:00Z");

const sedenie = (date: string) => ({
  date, time: "10:00", client: "X", sessionTrainer: "Jerry",
  sessionName: "Trénink", sessionType: "", duration: 60, price: 900,
});

/** Klient so sedeniami v zadaných dňoch. */
const klient = (meno: string, dni: string[], extra: Record<string, unknown> = {}) => ({
  [meno]: {
    name: meno, primaryTrainer: "Jerry", status: "Aktívny",
    sessions: dni.map((d) => ({ ...sedenie(d), client: meno })),
    sessionCount: dni.length, lastSession: dni[dni.length - 1],
    firstSession: dni[0], ...extra,
  },
} as any);

const udalost = (klientMeno: string, zaciatok: string) =>
  ({ zaciatok, klient: klientMeno, typ: "trening", zmizlaAt: null });

// Chodí každý utorok, posledný 20. 8. — 11 dní ticha, nič dopredu.
const ROBIN = klient("Robin", ["2026-07-14", "2026-07-21", "2026-07-28", "2026-08-06", "2026-08-13", "2026-08-20"]);

describe("bezDohodnutehoTerminu", () => {
  it("týždenný klient bez termínu sa ozve a povie svoj rytmus", () => {
    const von = bezDohodnutehoTerminu(ROBIN, [], { dnes: DNES });
    expect(von.length).toBe(1);
    expect(von[0].meno).toBe("Robin");
    expect(von[0].dni).toBe(11);
    expect(von[0].rytmus).toBeGreaterThanOrEqual(6);
    expect(von[0].rytmus).toBeLessThanOrEqual(8);
  });

  it("fixný klient s termínom dopredu sa neozve — a nikto ho nemusel označiť", () => {
    const von = bezDohodnutehoTerminu(ROBIN, [udalost("Robin", "2026-09-02T10:00")], { dnes: DNES });
    expect(von).toEqual([]);
  });

  it("zrušený budúci termín sa nepočíta ako dohodnutý", () => {
    const zmeny = [{ id: 1, kedy: "2026-08-30T08:00", druh: "zrusene", klient: "Robin", pred: "2026-09-02T10:00", po: null }] as any;
    const von = bezDohodnutehoTerminu(ROBIN, [udalost("Robin", "2026-09-02T10:00")], { dnes: DNES, zmeny });
    expect(von.map((v) => v.meno)).toEqual(["Robin"]);
  });

  it("kto trénoval včera, sa neozve — rytmus ešte beží", () => {
    const cerstvy = klient("Cerstvy", ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-30"]);
    expect(bezDohodnutehoTerminu(cerstvy, [], { dnes: DNES })).toEqual([]);
  });

  it("klient trikrát do týždňa nezačne kričať po dvoch dňoch", () => {
    // Medzera dva dni, ale podlaha je päť — po troch dňoch ticho.
    const casty = klient("Casty", ["2026-08-18", "2026-08-20", "2026-08-22", "2026-08-24", "2026-08-26", "2026-08-28"]);
    expect(bezDohodnutehoTerminu(casty, [], { dnes: new Date("2026-08-31T09:00:00Z") }).length).toBe(0);
    // O tri dni neskôr už áno.
    expect(bezDohodnutehoTerminu(casty, [], { dnes: new Date("2026-09-03T09:00:00Z") }).length).toBe(1);
  });

  it("nad štrnásť dní mlčí — tam už hovorí odmlčaný", () => {
    const dlho = klient("Dlho", ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"]);
    expect(bezDohodnutehoTerminu(dlho, [], { dnes: DNES })).toEqual([]);
  });

  it("klient bez rytmu (málo sedení) sa neozve", () => {
    const novy = klient("Novy", ["2026-08-05", "2026-08-19"]);
    expect(bezDohodnutehoTerminu(novy, [], { dnes: DNES })).toEqual([]);
  });

  it("neaktívny klient a klient na pauze sa neozvú", () => {
    const dni = ["2026-07-14", "2026-07-21", "2026-07-28", "2026-08-06", "2026-08-13", "2026-08-20"];
    expect(bezDohodnutehoTerminu(klient("Pauza", dni, { status: "Pauza" }), [], { dnes: DNES })).toEqual([]);
    expect(bezDohodnutehoTerminu(klient("Preč", dni, { status: "Neaktívny" }), [], { dnes: DNES })).toEqual([]);
  });

  // Jerry, 31. 8. 2026: „tu by mi ideálne mala vyskočiť aj poznámka, ktorú
  // som Jarvisovi ponúkol, keď som si zapísal, prečo sa jeho tréning zrušil."
  it("nesie vysvetlenie, ktoré Jerry zapísal pri zrušení", () => {
    const zmeny = [
      { id: 1, kedy: "2026-08-18T18:00:30Z", druh: "zrusene", klient: "Robin", pred: "2026-08-18T15:00", po: null, poznamka: "necitil sa dobre" },
      { id: 2, kedy: "2026-08-24T11:31:20Z", druh: "zrusene", klient: "Robin", pred: "2026-08-24T15:00", po: null, poznamka: "dostal nejaky zapal ide k lekarovi " },
    ] as any;
    const von = bezDohodnutehoTerminu(ROBIN, [], { dnes: DNES, zmeny });
    expect(von.length).toBe(1);
    // Novšie vysvetlenie vyhráva — staršie by poslalo volať s neaktuálnym dôvodom.
    // Text sa oreže už pri čítaní — do vety nemá tiecť koncová medzera.
    expect(von[0].poznamka?.text).toBe("dostal nejaky zapal ide k lekarovi");
    expect(von[0].poznamka?.kedy).toBe("2026-08-24");
  });

  it("staré vysvetlenie (nad 21 dní) sa už nepripomína", () => {
    const zmeny = [
      { id: 1, kedy: "2026-07-01T10:00:00Z", druh: "zrusene", klient: "Robin", pred: "2026-07-01T15:00", po: null, poznamka: "vtedy bol chorý" },
    ] as any;
    expect(bezDohodnutehoTerminu(ROBIN, [], { dnes: DNES, zmeny })[0].poznamka).toBe(null);
  });

  it("prázdna poznámka sa netvári ako vysvetlenie", () => {
    const zmeny = [{ id: 1, kedy: "2026-08-24T11:00:00Z", druh: "zrusene", klient: "Robin", pred: "2026-08-24T15:00", po: null, poznamka: "   " }] as any;
    expect(bezDohodnutehoTerminu(ROBIN, [], { dnes: DNES, zmeny })[0].poznamka).toBe(null);
  });

  it("jedna dovolenka uprostred rytmus neposunie — medián, nie priemer", () => {
    // Šesť týždňov po týždni, medzitým jedna trojtýždňová diera.
    const sDovolenkou = klient("Dovol", ["2026-06-15", "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-20"]);
    const von = bezDohodnutehoTerminu(sDovolenkou, [], { dnes: DNES });
    expect(von.length).toBe(1);
    expect(von[0].rytmus).toBeLessThanOrEqual(8);
  });
});

// Jerry, 31. 8. 2026: „s Jarvisom v chate som riešil, čo je s Robinom — to by
// mi teda malo automaticky vymazať tú notifikáciu, pretože už je to vyriešené."
describe("otvorený záver umlčí otázku o tom istom klientovi", () => {
  const ZAVER_ROBIN = [{
    id: "zmth3z17m", datum: "2026-08-31", tema: "klienti", stav: "otvoreny",
    zaver: "Robin Martinek je chorý, treba sa mu ozvať cez víkend 5.–6. 9. 2026 a dohodnúť ďalší tréning.",
    overit: "Ozval si sa Robinovi a je dohodnutý termín?", overitDo: "2026-09-07",
  }];

  it("kým záver platí, kryje klienta", () => {
    const kryje = zaverKryjeKlienta(ZAVER_ROBIN, "Robin Martinek", DNES);
    expect(kryje?.plati_do).toBe("2026-09-07");
  });

  it("po dni overenia sa otázka vráti — záver ju neumlčí navždy", () => {
    expect(zaverKryjeKlienta(ZAVER_ROBIN, "Robin Martinek", new Date("2026-09-08T09:00:00Z"))).toBe(null);
  });

  it("zavretý záver nekryje nič", () => {
    const zavrety = [{ ...ZAVER_ROBIN[0], stav: "zabralo" }];
    expect(zaverKryjeKlienta(zavrety, "Robin Martinek", DNES)).toBe(null);
  });

  it("záver o inom človeku Robina nekryje", () => {
    expect(zaverKryjeKlienta(ZAVER_ROBIN, "Jakub Gerich", DNES)).toBe(null);
  });

  it("záver, ktorý nie je o termíne, neumlčí otázku o tréningu", () => {
    const oReklame = [{
      id: "x", datum: "2026-08-31", tema: "marketing", stav: "otvoreny",
      zaver: "Robin Martinek zdieľal náš reel.", overit: "Prišla odpoveď z Facebooku?", overitDo: "2026-09-07",
    }];
    expect(zaverKryjeKlienta(oReklame, "Robin Martinek", DNES)).toBe(null);
  });

  it("bez dátumu overenia platí záver dva týždne od zápisu", () => {
    const bezDatumu = [{ ...ZAVER_ROBIN[0], overitDo: null }];
    expect(zaverKryjeKlienta(bezDatumu, "Robin Martinek", new Date("2026-09-10T09:00:00Z"))?.plati_do).toBe("2026-09-14");
    expect(zaverKryjeKlienta(bezDatumu, "Robin Martinek", new Date("2026-09-16T09:00:00Z"))).toBe(null);
  });
});
