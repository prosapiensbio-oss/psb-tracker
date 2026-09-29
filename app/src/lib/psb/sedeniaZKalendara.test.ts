import { describe, expect, it } from "bun:test";

import { casPtminder, cenaHodiny, doplnHodinySpolu, sedeniaZKalendara, spojDochadzku, type BalicekKokpitu, type UdalostKalendara } from "./sedeniaZKalendara";
import type { SessionRow } from "./types";

const u = (klient: string | null, zaciatok: string, extra: Partial<UdalostKalendara> = {}): UdalostKalendara => ({
  klient, trener: "Jerry", zaciatok, koniec: `${zaciatok.slice(0, 11)}${String(Number(zaciatok.slice(11, 13)) + 1).padStart(2, "0")}${zaciatok.slice(13)}`,
  nazov: klient || "?", typ: "trening", ...extra,
});
const bal = (klient: string, od: string, doDna: string | null, hodiny: number, cena: number): BalicekKokpitu =>
  ({ klient, platnost_od: od, platnost_do: doDna, hodiny, cena_czk: cena });

describe("casPtminder", () => {
  it("prevedie 24-hodinový čas na tvar PTmindera", () => {
    expect(casPtminder("07:30")).toBe("7:30am");
    expect(casPtminder("12:00")).toBe("12:00pm");
    expect(casPtminder("17:00")).toBe("5:00pm");
    expect(casPtminder("00:15")).toBe("12:15am");
  });
});

describe("cenaHodiny — rovnako ako PTminder", () => {
  it("cena balíčka delená hodinami (overené 29. 9. 2026)", () => {
    expect(cenaHodiny([bal("A", "2026-09-10", "2026-10-09", 6, 6990)], "A", "2026-10-02")).toBe(1165);
    expect(cenaHodiny([bal("A", "2026-09-10", "2026-11-09", 18, 14805)], "A", "2026-10-02")).toBe(822.5);
  });

  it("pri dvoch platných rozhoduje najnovší", () => {
    const b = [bal("A", "2026-08-01", "2027-01-31", 18, 21150), bal("A", "2026-09-20", "2026-11-14", 8, 9400)];
    expect(cenaHodiny(b, "A", "2026-10-02")).toBe(1175);
  });

  it("bez balíčka, bez ceny alebo po platnosti je 0 — ako v PTminderi", () => {
    expect(cenaHodiny([], "A", "2026-10-02")).toBe(0);
    expect(cenaHodiny([bal("A", "2026-09-01", "2026-09-30", 6, 6990)], "A", "2026-10-02")).toBe(0);
    expect(cenaHodiny([bal("A", "2026-09-20", null, 3, 0)], "A", "2026-10-02")).toBe(0);
  });
});

describe("sedeniaZKalendara", () => {
  const teraz = "2026-10-06T12:00";
  const b = [bal("Anna Nová", "2026-09-03", "2026-10-28", 8, 9400)];

  it("tréning z kalendára nesie čas, trénera, dĺžku aj cenu", () => {
    const [s] = sedeniaZKalendara([u("Anna Nová", "2026-10-02T07:00")], b, teraz);
    expect(s).toEqual({
      date: "2026-10-02T00:00:00.000Z", time: "7:00am", client: "Anna Nová", sessionTrainer: "Jerry",
      sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 1175,
    });
  });

  it("pred 1. 10. nič — tam platí PTminder", () => {
    expect(sedeniaZKalendara([u("Anna Nová", "2026-09-30T07:00")], b, teraz)).toEqual([]);
  });

  it("budúci tréning sa ešte nepočíta", () => {
    expect(sedeniaZKalendara([u("Anna Nová", "2026-10-06T17:00")], b, teraz)).toEqual([]);
  });

  it("neznámy klient ani súkromná udalosť nie je tréning — nehádá sa", () => {
    expect(sedeniaZKalendara([u(null, "2026-10-02T07:00"), u("Anna Nová", "2026-10-02T09:00", { typ: "sukromne" })], b, teraz)).toEqual([]);
  });

  it("úvodný má pevnú cenu, online sa pozná z názvu", () => {
    const s = sedeniaZKalendara([
      u("Nový Klient", "2026-10-02T10:00", { typ: "uvodny", nazov: "Úvodný Nový Klient" }),
      u("Anna Nová", "2026-10-03T10:00", { nazov: "Anna online" }),
    ], b, teraz);
    expect(s[0]).toMatchObject({ sessionType: "UVODNE", price: 1100 });
    expect(s[1]).toMatchObject({ sessionType: "ONLINE", sessionName: "ONLINE - 60min" });
  });

  it("90-minútový tréning má dĺžku 90 — do odpočtu ide 1,5 h", () => {
    const [s] = sedeniaZKalendara([u("Anna Nová", "2026-10-02T07:00", { koniec: "2026-10-02T08:30" })], b, teraz);
    expect(s.duration).toBe(90);
  });
});

describe("spojDochadzku", () => {
  const s = (d: string, k: string): SessionRow => ({ date: `${d}T00:00:00.000Z`, time: "9:00am", client: k, sessionTrainer: "Jerry", sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 1165 });
  it("pred 1. 10. PTminder, od 1. 10. kalendár; PTminder od 1. 10. ide na kontrolu", () => {
    const v = spojDochadzku([s("2026-09-29", "A"), s("2026-10-02", "A")], [s("2026-10-02", "A")]);
    expect(v.sessions.map((x) => x.date.slice(0, 10))).toEqual(["2026-09-29", "2026-10-02"]);
    expect(v.kontrola).toHaveLength(1);
  });
});

describe("cena ako v PTminderi aj pri naliatych a vyčerpaných balíčkoch", () => {
  const teraz = "2026-12-31T23:59";

  it("ročný balíček naliaty so zostatkom delí cenu celkom, nie zostatkom (Broskva)", () => {
    const b: BalicekKokpitu[] = [{ klient: "B", platnost_od: "2026-09-20", platnost_do: null, hodiny: 50, hodinySpolu: 78, cena_czk: 54522 }];
    const [s] = sedeniaZKalendara([u("B", "2026-10-02T07:00")], b, teraz);
    expect(s.price).toBe(699);
  });

  it("tréning nad rámec balíčka je za 0 Kč — kryje ho doplnenie alebo dlh", () => {
    const b = [bal("A", "2026-10-01", "2026-11-30", 2, 2330)];
    const s = sedeniaZKalendara(["2026-10-02T07:00", "2026-10-05T07:00", "2026-10-08T07:00"].map((z) => u("A", z)), b, teraz);
    expect(s.map((x) => x.price)).toEqual([1165, 1165, 0]);
  });
});

describe("doplnHodinySpolu", () => {
  const zNazvu = (n: string) => Number(/(\d+)\s*h/i.exec(n)?.[1] || 0);
  it("naliaty ročný balíček: celok z exportu (78), nie zostatok (50)", () => {
    const [b] = doplnHodinySpolu(
      [{ klient: "B", nazov: "ONE YEAR", zdroj: "ptminder", platnost_od: "2026-09-20", platnost_do: null, hodiny: 50, cena_czk: 54522 }],
      [{ client: "B", package: "ONE YEAR", total: 78 }], zNazvu,
    );
    expect(b.hodinySpolu).toBe(78);
  });
  it("členstvo s prenesenými hodinami: počet na obdobie (8)", () => {
    const [b] = doplnHodinySpolu(
      [{ klient: "K", nazov: "OFF - 6h S viazanostou", zdroj: "ptminder", platnost_od: "2026-09-17", platnost_do: "2026-10-16", hodiny: 8, cena_czk: 6990 }],
      [{ client: "K", package: "OFF - 6h S viazanostou", total: 0, naObdobie: 8 }], zNazvu,
    );
    expect(b.hodinySpolu).toBe(8);
  });
  it("zapísaný v Kokpite má celok v hodinách", () => {
    const [b] = doplnHodinySpolu([{ klient: "A", nazov: "Balíček 6 h", zdroj: "rucne", platnost_od: "2026-10-01", platnost_do: null, hodiny: 6, cena_czk: 7790 }], [], zNazvu);
    expect(b.hodinySpolu).toBe(6);
  });
});

describe("online tréning ide z online balíčka (Marcela Hrůzová)", () => {
  it("pri dvoch platných členstvách rozhoduje typ, nie dátum", () => {
    const b = [
      { ...bal("M", "2026-08-27", "2026-10-21", 6, 6590), nazov: "ON - 6h BEZ viazanosti" },
      { ...bal("M", "2026-09-18", "2026-10-15", 1, 1450), nazov: "OFF - 1 hodina offline" },
    ];
    const [on, off] = sedeniaZKalendara([u("M", "2026-10-02T10:00", { nazov: "Marcela online" }), u("M", "2026-10-03T10:00")], b, "2026-12-31T23:59");
    expect(on.price).toBe(1098.33);
    expect(off.price).toBe(1450);
  });
});
