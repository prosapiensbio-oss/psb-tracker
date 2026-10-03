import { describe, expect, it } from "bun:test";

import { chybaOdpovede, datumPohybu, pohybyZOdpovede, poznamkaPohybu, protistranaPohybu, urlNove, urlObdobie, zostatokZOdpovede } from "./fioApi";

const st = (value: unknown, name = "", id = 0) => ({ value: value as string | number | null, name, id });

// Pohyb v tvare, v akom ho vracia Fio (dokumentácia, verzia 16. 10. 2025).
const pohyb = {
  column22: st(1148734530, "ID pohybu", 22),
  column0: st("2026-09-27+0200", "Datum", 0),
  column1: st(6990, "Objem", 1),
  column14: st("CZK", "Měna", 14),
  column2: st("2900233333", "Protiúčet", 2),
  column3: st("2010", "Kód banky", 3),
  column10: st("Vaško, Martin", "Název protiúčtu", 10),
  column5: st("2026", "VS", 5),
  column16: st("platba za balicek", "Zpráva pro příjemce", 16),
  column8: st("Příjem převodem uvnitř banky", "Typ", 8),
};

describe("pohyby z Fio API", () => {
  it("prečíta ID, deň, sumu, protistranu aj správu", () => {
    const r = pohybyZOdpovede({ accountStatement: { transactionList: { transaction: [pohyb] } } })[0];
    expect(r.id).toBe("1148734530");
    expect(r.datum).toBe("2026-09-27");
    expect(r.suma).toBe(6990);
    expect(r.protistrana).toBe("Vaško, Martin");
    expect(r.poznamka).toContain("platba za balicek");
    expect(r.poznamka).toContain("VS 2026");
  });

  it("dátum sa neprepočítava cez časovú zónu", () => {
    // „2026-09-27+0200" cez new Date() vyjde v UTC ako 26. 9. — a pohyb by
    // spadol do predošlého dňa aj do predošlého mesiaca v P&L.
    expect(datumPohybu(st("2026-09-27+0200"))).toBe("2026-09-27");
    expect(datumPohybu(st(1340661600000))).toBe("2012-06-25");
    expect(datumPohybu(st(null))).toBe("");
  });

  it("bez názvu protiúčtu vezme číslo účtu s kódom banky", () => {
    expect(protistranaPohybu({ ...pohyb, column10: null })).toBe("2900233333/2010");
    expect(poznamkaPohybu({ ...pohyb, column16: null, column5: st("0") })).toBe("");
  });

  it("pohyby idú od najstaršieho a bez dátumu sa zahodia", () => {
    const o = { accountStatement: { transactionList: { transaction: [
      { ...pohyb, column0: st("2026-09-28+0200") },
      { ...pohyb, column0: st("2026-09-20+0200") },
      { ...pohyb, column0: null },
    ] } } };
    expect(pohybyZOdpovede(o).map((r) => r.datum)).toEqual(["2026-09-20", "2026-09-28"]);
  });

  it("prázdny zoznam nespadne", () => {
    expect(pohybyZOdpovede({})).toEqual([]);
    expect(pohybyZOdpovede({ accountStatement: { transactionList: null } })).toEqual([]);
    expect(zostatokZOdpovede({ accountStatement: { info: { closingBalance: 123.45 } } })).toBe(123.45);
    expect(zostatokZOdpovede({})).toBe(null);
  });

  it("adresy sedia s dokumentáciou", () => {
    expect(urlObdobie("TOKEN", "2026-09-01", "2026-09-30"))
      .toBe("https://fioapi.fio.cz/v1/rest/periods/TOKEN/2026-09-01/2026-09-30/transactions.json");
    expect(urlNove("TOKEN")).toBe("https://fioapi.fio.cz/v1/rest/last/TOKEN/transactions.json");
  });

  it("409 je odstup 30 sekúnd, nie neplatný token", () => {
    expect(chybaOdpovede(409)).toContain("30 sekúnd");
    expect(chybaOdpovede(404)).toContain("Token");
  });
});
