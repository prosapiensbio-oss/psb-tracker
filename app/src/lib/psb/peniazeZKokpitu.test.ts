import { describe, expect, it } from "bun:test";

import { btcEsteNezapisane, btcNaPlatby, mozePrepnut, spojPlatby } from "./peniazeZKokpitu";
import { rozdelPodlaDlhov } from "./platiZa";

const pt = (date: string, amount: number) => ({ date: `${date}T00:00:00.000Z`, client: "A", amount, method: "bank" });

describe("spojPlatby", () => {
  const ptminder = [pt("2026-09-20", 1000), pt("2026-10-02", 2000)];
  const vlastne = [
    { klient: "A", datum: "2026-09-20", suma: 1000, sposob: "banka" },
    { klient: "B", datum: "2026-10-03", suma: 7790, sposob: "hotovost" },
    { klient: "C", datum: "2026-10-04", suma: 500, sposob: "bitcoin" },
    { klient: "D", datum: "2026-10-05", suma: 900, sposob: "banka", zruseneAt: "2026-10-06" },
  ];

  it("bez zvoleného mesiaca je to export bez zmeny", () => {
    expect(spojPlatby(ptminder, vlastne, "")).toBe(ptminder);
  });

  it("pred mesiacom PTminder, od neho Kokpit — bez zrušených", () => {
    const s = spojPlatby(ptminder, vlastne, "2026-10");
    expect(s.map((p) => [p.client, p.amount, p.method])).toEqual([
      ["A", 1000, "bank"], ["B", 7790, "cash"], ["C", 500, "other"],
    ]);
  });
});

describe("mozePrepnut", () => {
  it("sedí a nič nečaká → áno", () => {
    expect(mozePrepnut("2026-10", [{ mesiac: "2026-10", kokpit: 17190, ptminder: 17190 }], []).ok).toBe(true);
  });
  it("tolerancia 200 Kč alebo 1 %", () => {
    expect(mozePrepnut("2026-10", [{ mesiac: "2026-10", kokpit: 99000, ptminder: 100000 }], []).ok).toBe(true);
    expect(mozePrepnut("2026-10", [{ mesiac: "2026-10", kokpit: 98000, ptminder: 100000 }], []).ok).toBe(false);
  });
  it("nepriradený príjem bráni a dôvod povie koľko", () => {
    const r = mozePrepnut("2026-10", [{ mesiac: "2026-10", kokpit: 100, ptminder: 100 }], [{ datum: "2026-10-04", suma: 33580 }]);
    expect(r.ok).toBe(false);
    expect(r.dovody[0]).toContain("33580");
  });
  it("mesiac bez PTminder platieb sa nesúdi — samotný nestačí", () => {
    expect(mozePrepnut("2026-11", [{ mesiac: "2026-11", kokpit: 500, ptminder: 0 }], []).ok).toBe(false);
  });
});

describe("btcNaPlatby", () => {
  const najdi = (m: string) => (m === "Prochazka Matej" || m === "Matej Prochadzka" ? "Matej Prochadzka" : m === "Jan" ? null : null);
  it("zapíše len jednoznačne nájdeného klienta od dňa súbežného chodu", () => {
    const r = btcNaPlatby([
      { klient: "Prochazka Matej", datum: "2026-10-03T10:00:00Z", czk: 6990.4, sats: 3000000 },
      { klient: "Jan", datum: "2026-10-04", czk: 1000 },
      { klient: "Matej Prochadzka", datum: "2026-09-20", czk: 7790 },
      { klient: null, datum: "2026-10-05", czk: 500 },
    ], najdi, "2026-10-01");
    expect(r.zapisat).toEqual([{ klient: "Matej Prochadzka", datum: "2026-10-03", suma: 6990, sats: 3000000, kluc: "btc:2026-10-03|Prochazka Matej|3000000" }]);
    expect(r.nesparovane).toEqual([{ meno: "Jan", datum: "2026-10-04", suma: 1000 }]);
  });
});

describe("btcEsteNezapisane", () => {
  const kanovsky = { klient: "Jakub Kaňovský", datum: "2026-11-05", suma: 14802, sats: 800000, kluc: "btc:2026-11-05|Jakub Kaňovský|800000" };
  const inyDen = { ...kanovsky, datum: "2026-11-20", kluc: "btc:2026-11-20|Jakub Kaňovský|800000" };

  it("prvý import zapíše všetko — prázdna evidencia nič nezablokuje", () => {
    expect(btcEsteNezapisane([kanovsky, inyDen], [])).toEqual([kanovsky, inyDen]);
  });

  it("kľúč, ktorý už má riadok (aj zrušený), sa neotvára; nová platba toho istého klienta áno", () => {
    expect(btcEsteNezapisane([kanovsky, inyDen], [kanovsky.kluc])).toEqual([inyDen]);
  });

  it("tá istá položka v jednej knihe dvakrát sa zapíše raz", () => {
    expect(btcEsteNezapisane([kanovsky, { ...kanovsky }], [])).toEqual([kanovsky]);
  });

  it("existujúcich 5 BTC riadkov z ostrých dát sa znova nezapíše", () => {
    const ostre = ["btc:2026-10-11|Luky Kríž|276606", "btc:2026-10-11|Peter Gažo|1104437", "btc:2026-10-20|Jan Kalmus|477954", "btc:2026-10-21|Michal Knapčok|823654", "btc:2026-10-23|Tomáš Vopalenský|417553"];
    expect(btcEsteNezapisane(ostre.map((kluc) => ({ kluc })), ostre)).toEqual([]);
  });

  it("scenár z rozboru: po vzniku dlhu by rozdelenie dalo 7 401 navyše, kľúč to zastaví", () => {
    // 1. import: Kadličková ešte nedlží, delenie nevznikne, celé ide platiteľovi.
    expect(rozdelPodlaDlhov(14802, [{ klient: "Jakub Kaňovský", dlzi: 7401 }, { klient: "Anna Kadličkova", dlzi: 0 }])).toBeNull();
    // 2. import po jej tréningu: to isté rozdelenie by už vyšlo…
    expect(rozdelPodlaDlhov(14802, [{ klient: "Jakub Kaňovský", dlzi: 7401 }, { klient: "Anna Kadličkova", dlzi: 7401 }])).toEqual([
      { klient: "Jakub Kaňovský", suma: 7401 }, { klient: "Anna Kadličkova", suma: 7401 },
    ]);
    // …ale položka sa k nemu nedostane, lebo kľúč už má riadok.
    expect(btcEsteNezapisane([kanovsky], [kanovsky.kluc])).toEqual([]);
  });
});
