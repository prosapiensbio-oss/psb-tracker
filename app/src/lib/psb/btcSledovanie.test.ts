import { describe, expect, it } from "bun:test";

import { btcNaPotvrdenie, dielyZFaktury, idFaktury, kluczKnihy, navrhDielov, satsDielov, type LnFaktura } from "./btcSledovanie";

const rozpis = [{ klient: "Jakub Kaňovský", czk: 7401 }, { klient: "Anna Kadličkova", czk: 7401 }];
const faktura: LnFaktura = { id: "abc", klient: "Jakub Kaňovský", czk: 14802, sats: 875951, vytvorena: "2026-11-02T14:00:00Z", zaplatenaAt: "2026-11-02T15:00:00Z", rozpis };

describe("volatilita: predvyplní sa suma z odkazu", () => {
  it("Jerryho príklad: odkaz 10 000, prišlo za 9 765", () => {
    expect(navrhDielov(9765, "K", [{ klient: "K", czk: 10000 }])).toEqual({ diely: [{ klient: "K", suma: 10000 }], zOdkazu: true });
  });
  it("rast kurzu platí rovnako", () => {
    expect(navrhDielov(10300, "K", [{ klient: "K", czk: 10000 }]).diely[0].suma).toBe(10000);
  });
  it("väčší rozdiel kurz nevysvetlí, predvyplní sa to, čo prišlo", () => {
    expect(navrhDielov(7000, "K", [{ klient: "K", czk: 10000 }])).toEqual({ diely: [{ klient: "K", suma: 7000 }], zOdkazu: false });
  });
  it("celá spoločná platba navrhne oboch", () => {
    expect(navrhDielov(14604, "Jakub Kaňovský", rozpis).diely).toEqual([{ klient: "Jakub Kaňovský", suma: 7401 }, { klient: "Anna Kadličkova", suma: 7401 }]);
  });
  it("riadok už rozdelený v knihe navrhne len jeho diel", () => {
    expect(navrhDielov(7302, "Anna Kadličkova", rozpis).diely).toEqual([{ klient: "Anna Kadličkova", suma: 7401 }]);
  });
  it("bez odkazu ostáva suma z knihy", () => {
    expect(navrhDielov(7302, "K", [])).toEqual({ diely: [{ klient: "K", suma: 7302 }], zOdkazu: false });
  });
});

describe("zhoda riadku knihy s faktúrou", () => {
  it("celá suma pri platiteľovi vráti celý rozpis", () => {
    expect(dielyZFaktury({ klient: "Jakub Kaňovský", datum: "2026-11-02", sats: 875951 }, faktura)).toEqual(rozpis);
  });
  it("kniha rozdelená 50/50 vráti diel klienta", () => {
    expect(dielyZFaktury({ klient: "Anna Kadličkova", datum: "2026-11-02", sats: 437976 }, faktura)).toEqual([rozpis[1]]);
  });
  it("riadok bez mena spozná len celú faktúru", () => {
    expect(dielyZFaktury({ klient: null, datum: "2026-11-02", sats: 875951 }, faktura)).toEqual(rozpis);
    expect(dielyZFaktury({ klient: null, datum: "2026-11-02", sats: 437976 }, faktura)).toBeNull();
  });
  it("iný klient, iná suma, iný týždeň ani nezaplatená faktúra nie", () => {
    expect(dielyZFaktury({ klient: "Peter Gažo", datum: "2026-11-02", sats: 875951 }, faktura)).toBeNull();
    expect(dielyZFaktury({ klient: "Jakub Kaňovský", datum: "2026-11-02", sats: 500000 }, faktura)).toBeNull();
    expect(dielyZFaktury({ klient: "Jakub Kaňovský", datum: "2026-11-12", sats: 875951 }, faktura)).toBeNull();
    expect(dielyZFaktury({ klient: "Jakub Kaňovský", datum: "2026-11-02", sats: 875951 }, { ...faktura, zaplatenaAt: null })).toBeNull();
  });
});

describe("čo čaká na potvrdenie", () => {
  const zaklad = { kniha: [], bezMena: [], faktury: [], zapisane: [], skryte: [], odDna: "2026-10-01" };
  const riadok = { klient: "Jakub Kaňovský", datum: "2026-11-02", czk: 14604, sats: 875951 };

  it("nič sa nezapisuje samo: nový riadok knihy čaká", () => {
    const p = btcNaPotvrdenie({ ...zaklad, kniha: [riadok] });
    expect(p.map((x) => x.kluc)).toEqual(["btc:2026-11-02|Jakub Kaňovský|875951"]);
  });
  it("zapísaný riadok sa neotvára, aj keď je meno v Kokpite iné", () => {
    expect(btcNaPotvrdenie({ ...zaklad, kniha: [riadok], zapisane: ["btc:2026-11-02|Jakub Kanovsky|875951"] })).toEqual([]);
  });
  it("zaplatená faktúra bez riadku v knihe čaká sama", () => {
    const p = btcNaPotvrdenie({ ...zaklad, faktury: [faktura] });
    expect(p[0]).toMatchObject({ zdroj: "faktura", czk: 14802, zFaktury: rozpis });
  });
  it("faktúra s riadkom v knihe je jedna položka, nie dve", () => {
    const p = btcNaPotvrdenie({ ...zaklad, kniha: [riadok], faktury: [faktura] });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ zdroj: "kniha", zFaktury: rozpis });
  });
  it("potvrdená faktúra pokryje aj neskorší riadok v knihe", () => {
    expect(btcNaPotvrdenie({ ...zaklad, kniha: [riadok], faktury: [faktura], zapisane: ["btc:ln:abc"] })).toEqual([]);
  });
  it("nezaplatená faktúra sa neukazuje", () => {
    expect(btcNaPotvrdenie({ ...zaklad, faktury: [{ ...faktura, zaplatenaAt: null }] })).toEqual([]);
  });
  it("platba bez mena čaká, skrytá nie, a staršia než začiatok evidencie tiež nie", () => {
    const b = { id: 381, datum: "2026-10-26", sats: 417553, czk: 7285, poznamka: "Lightning platba" };
    expect(btcNaPotvrdenie({ ...zaklad, bezMena: [b] })[0]).toMatchObject({ zdroj: "bez-mena", idKnihy: 381 });
    expect(btcNaPotvrdenie({ ...zaklad, bezMena: [b], skryte: ["btc:kniha:381"] })).toEqual([]);
    expect(btcNaPotvrdenie({ ...zaklad, bezMena: [{ ...b, datum: "2026-09-01" }] })).toEqual([]);
  });
});

describe("pomôcky", () => {
  it("id faktúry je koniec overovacej adresy", () => {
    expect(idFaktury("https://lnurl.blink.sv/verify/abc123")).toBe("abc123");
  });
  it("kľúč knihy prečíta deň, meno aj satoshi", () => {
    expect(kluczKnihy("btc:2026-10-23|Tomáš Vopalenský|417553")).toEqual({ datum: "2026-10-23", meno: "Tomáš Vopalenský", sats: 417553 });
    expect(kluczKnihy("btc:ln:abc")).toBeNull();
  });
  it("delenie satoshi dá späť celok", () => {
    expect(satsDielov(875951, 2)).toEqual([437976, 437975]);
    expect(satsDielov(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
  });
});
