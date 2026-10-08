// Štyri karty Workspace v bete (Jerry, 4. 10. 2026).
import { describe, expect, it } from "bun:test";

import type { Udalost } from "./klientOsCasu";
import { priebehBalickov } from "./vypisHodin";
import { kandidatiPlatby, navrhNovehoBalicka, otazkyPlatieb, zoznamSms } from "./workspaceKroky";
import { dlhyKlientov } from "./zaplatene";

const trening = (den: string): Udalost => ({ druh: "trening", den, cas: "11:00" });
const balicek = (den: string, hodin = 6, nazov = "OFF - 6h BEZ viazanosti", doDna?: string): Udalost =>
  ({ druh: "balicekOd", den, nazov, hodin, ...(doDna ? { doDna } : {}) });
const zorad = (os: Udalost[]) => os.sort((a, b) => b.den.localeCompare(a.den));

describe("nový balíček z prvého tréningu", () => {
  // Dan Kouřil: 6 h od 2. 9., šesť tréningov, potom ďalšie dva bez balíčka.
  const os = zorad([
    balicek("2026-09-02", 6, "OFF - 6h BEZ viazanosti", "2026-10-27"),
    ...["2026-09-02", "2026-09-10", "2026-09-18", "2026-09-25", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"].map(trening),
  ]);
  const { stavy } = priebehBalickov(os, -2, "2026-10-26");

  it("začína prvým tréningom, na ktorý starý balíček nestačil", () => {
    const n = navrhNovehoBalicka("Dan Kouřil", os, stavy, [{ den: "2026-09-02", cena: 7790 }]);
    expect(n?.odDna).toBe("2026-10-18");
    expect(n?.nekrytych).toBe(2);
    expect(n?.nazov).toBe("6h Balíček");
    expect(n?.hodiny).toBe(6);
    expect(n?.cena).toBe(7790);
    // Platnosť ako v PTminderi: 8 týždňov mínus deň.
    expect(n?.platnostDo).toBe("2026-12-12");
    expect(n?.navrat).toBe(false);
  });

  it("nezaplatený balíček nie je dôvod na ďalší (Martin Vaško)", () => {
    const vasko = zorad([
      { druh: "balicekOd", den: "2026-09-27", nazov: "OFF - 6h S viazanostou", hodin: 6, doDna: "2026-10-26", nezaplatene: true },
      balicek("2026-08-27", 6, "OFF - 6h S viazanostou", "2026-09-26"),
      ...["2026-08-28", "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-22", "2026-09-25", "2026-09-29", "2026-10-02", "2026-10-03"].map(trening),
    ]);
    expect(navrhNovehoBalicka("Martin Vaško", vasko, priebehBalickov(vasko, -3, "2026-10-04").stavy)).toBeNull();
  });

  it("prečerpaný nezaplatený balíček: nový vznikne siedmym tréningom", () => {
    const os2 = zorad([
      { druh: "balicekOd", den: "2026-09-01", nazov: "OFF - 6h BEZ viazanosti", hodin: 6, doDna: "2026-10-26", nezaplatene: true },
      ...["2026-09-01", "2026-09-05", "2026-09-10", "2026-09-15", "2026-09-20", "2026-09-25", "2026-09-30", "2026-10-03"].map(trening),
    ]);
    const n = navrhNovehoBalicka("X", os2, priebehBalickov(os2, -8, "2026-10-04").stavy);
    expect(n?.odDna).toBe("2026-09-30");
    expect(n?.nekrytych).toBe(2);
  });

  it("bez nekrytých tréningov sa nenavrhuje nič", () => {
    const krate = zorad([balicek("2026-09-02"), trening("2026-09-02"), trening("2026-09-10")]);
    expect(navrhNovehoBalicka("X", krate, priebehBalickov(krate, 4, "2026-09-11").stavy)).toBeNull();
  });

  it("po dlhej pauze sa Kokpit pýta, či balíček sedí", () => {
    const pauza = zorad([
      balicek("2026-03-01", 1, "OFF - 1 hodina offline"), trening("2026-03-02"), trening("2026-09-01"),
    ]);
    const n = navrhNovehoBalicka("X", pauza, priebehBalickov(pauza, -1, "2026-09-02").stavy);
    expect(n?.navrat).toBe(true);
    expect(n?.nazov).toBe("1h Balíček");
  });

  it("jednorazová zľava sa neprenáša, stála iná cena áno", () => {
    const os2 = zorad([balicek("2026-07-11"), balicek("2026-05-26"), ...Array.from({ length: 13 }, (_, i) => trening(`2026-08-${String(10 + i).padStart(2, "0")}`))]);
    const st = priebehBalickov(os2, -1, "2026-08-30").stavy;
    expect(navrhNovehoBalicka("Kateřina", os2, st, [{ den: "2026-07-11", cena: 7011 }, { den: "2026-05-26", cena: 7790 }])?.cena).toBe(7790);
    expect(navrhNovehoBalicka("Jarek", os2, st, [{ den: "2026-07-11", cena: 6000 }, { den: "2026-05-26", cena: 6000 }])?.cena).toBe(6000);
  });
});

describe("platba nesedí na balíček", () => {
  const bal = (id: string, nazov: string, cena: number, od = "2026-11-05") => ({ id, klient: "A", nazov, cena, platnostOd: od, zdroj: "rucne" });
  // Otázky sa pýtajú jedného pravidla „zaplatený" — ako v appke.
  const otazky = (b: ReturnType<typeof bal>[], p: { klient: string; datum: string; suma: number }[], ptPlatby: { klient: string; datum: string; suma: number }[] = []) =>
    otazkyPlatieb(dlhyKlientov({ poplatky: [], platby: p, balicky: b, ptPlatby, ptHistoria: [] }).polozky);
  it("7 790 na 18 h: ponúkne 6h Balíček", () => {
    const o = otazky([bal("b1", "18h Balíček", 21150)], [{ klient: "A", datum: "2026-11-06", suma: 7790 }]);
    expect(o).toHaveLength(1);
    expect(o[0].moznosti.find((m) => m.druh === "velkost")).toMatchObject({ nazov: "6h Balíček", hodiny: 6, cena: 7790 });
  });
  it("7 011 na 7 790: zľava 10 %", () => {
    const o = otazky([bal("b1", "6h Balíček", 7790)], [{ klient: "A", datum: "2026-11-06", suma: 7011 }]);
    expect(o[0].veta).toContain("10 %");
    expect(o[0].moznosti.some((m) => m.druh === "cena" && m.dovod.includes("10 %"))).toBe(true);
  });
  it("balíček bez platby nie je otázka, plná platba tiež nie", () => {
    expect(otazky([bal("b1", "6h Balíček", 7790)], [])).toEqual([]);
    expect(otazky([bal("b1", "6h Balíček", 7790)], [{ klient: "A", datum: "2026-11-06", suma: 7790 }])).toEqual([]);
  });
  it("balíček, ktorý PTminder pozná ako zaplatený, sa nepýta", () => {
    expect(otazky([bal("b1", "6h Balíček", 7790)], [{ klient: "A", datum: "2026-11-06", suma: 7011 }], [{ klient: "A", datum: "2026-11-05", suma: 7790 }])).toEqual([]);
  });
});

describe("zoznam SMS", () => {
  const c = (name: string, zostatok: number, extra: Partial<{ lastSession: string; packageTotal: number }> = {}) => ({
    name, status: "Aktívny", primaryTrainer: "Jerry", membership: "6h Balíček",
    packageRemaining: zostatok, packageTotal: extra.packageTotal ?? 6, lastSession: extra.lastSession ?? "2026-10-04",
  });
  const dnes = "2026-10-05";
  it("len nula, mínus a dlh", () => {
    const z = zoznamSms([c("Plus", 3), c("Nula", 0), c("Minus", -2), c("PlusDlh", 2)], { PlusDlh: 7790 }, {}, {}, new Set(), dnes);
    // Najhlbší mínus hore — tam je SMS najpotrebnejšia.
    expect(z.map((x) => x.meno)).toEqual(["Minus", "Nula", "PlusDlh"]);
    expect(z.find((x) => x.meno === "Minus")?.stav).toBe("minus");
  });
  it("po odoslaní zmizne, kým sa stav nezmení", () => {
    const zm = { Minus: "2026-10-04T09:00:00.000Z" };
    expect(zoznamSms([c("Minus", -2)], {}, { Minus: "2026-10-04T10:00:00.000Z" }, zm, new Set(), dnes)).toHaveLength(0);
    expect(zoznamSms([c("Minus", -3)], {}, { Minus: "2026-10-04T10:00:00.000Z" }, { Minus: "2026-10-05T09:00:00.000Z" }, new Set(), dnes)).toHaveLength(1);
  });
  it("kto dlho netrénoval a nič nemá objednané, tam nie je", () => {
    expect(zoznamSms([c("Dávno", -1, { lastSession: "2026-06-01" })], {}, {}, {}, new Set(), dnes)).toHaveLength(0);
    expect(zoznamSms([c("Dávno", -1, { lastSession: "2026-06-01" })], {}, {}, {}, new Set(["davno"]), dnes)).toHaveLength(1);
  });
});

describe("platba z banky k dlžníkovi", () => {
  const nepr = [
    { fioId: "a", datum: "2026-10-06", suma: 6990, text: "Martin Vaško", kandidati: ["Martin Vaško"] },
    { fioId: "b", datum: "2026-10-05", suma: 6990, text: "ProSapiens 6h", kandidati: [] },
    { fioId: "c", datum: "2026-08-01", suma: 6990, text: "stará", kandidati: [] },
    { fioId: "d", datum: "2026-10-05", suma: 1100, text: "iný", kandidati: [] },
  ];
  it("meno a suma hore, potom len suma; staré a iné sumy nie", () => {
    const k = kandidatiPlatby("Martin Vaško", { spolu: 6990, polozky: [{ datum: "2026-09-27", suma: 6990 }] }, nepr);
    expect(k.map((x) => [x.fioId, x.preco])).toEqual([["a", "meno+suma"], ["b", "suma"]]);
  });
  it("bez páru prázdny zoznam", () => {
    expect(kandidatiPlatby("Nikto", { spolu: 500, polozky: [{ datum: "2026-09-27", suma: 500 }] }, nepr)).toEqual([]);
  });
});

describe("úvodný tréning je vlastný balíček", () => {
  it("vznikne aj klientovi, ktorý žiadny balíček nemal", () => {
    // Jerry, 8. 10. 2026: „Petr Baťa by mal mať po úvodnom automaticky dlh
    // 1 100 Kč." Dovtedy návrh potreboval predošlý balíček, z ktorého sa
    // veľkosť odvodzuje — nový klient ho nemá, takže nevzniklo nič.
    const os = [{ druh: "trening", den: "2026-10-05", cas: "17:00", uvodny: true }] as never[];
    const stavy = new Map(os.map((u) => [u, { zostatok: null, dlh: 1, usek: "" }])) as never;
    const n = navrhNovehoBalicka("Petr Baťa", os, stavy);
    expect(n?.nazov).toBe("Úvodní trénink");
    expect(n?.hodiny).toBe(1);
    expect(n?.cena).toBe(1100);
    expect(n?.odDna).toBe("2026-10-05");
    expect(n?.predosly).toBe(null);
  });

  it("bežný prvý tréning bez predošlého balíčka ďalej nevyrába nič", () => {
    const os = [{ druh: "trening", den: "2026-10-05", cas: "17:00" }] as never[];
    const stavy = new Map(os.map((u) => [u, { zostatok: null, dlh: 1, usek: "" }])) as never;
    expect(navrhNovehoBalicka("Kto Vie", os, stavy)).toBe(null);
  });
});

describe("úvodný v deň, keď začína bežný balíček", () => {
  // Luky Kríž: prvý tréning 28. 9. a v ten istý deň kúpených 6 h. Keď Jerry
  // ten tréning prepne na úvodný, hodina nesmie padnúť zo šiestich — úvodný
  // si nesie svoju vlastnú (Jerry, 8. 10. 2026).
  const os = [
    { druh: "trening", den: "2026-09-28", cas: "14:00", uvodny: true },
    { druh: "balicekOd", den: "2026-09-28", nazov: "OFF - 6h BEZ viazanosti", hodin: 6 },
  ] as never[];

  it("úvodný balíček vznikne, aj keď je deň krytý", () => {
    const stavy = new Map([[os[0], { zostatok: 6, dlh: null, usek: "2026-09-28" }]]) as never;
    const n = navrhNovehoBalicka("Luky Kríž", os, stavy);
    expect(n?.nazov).toBe("Úvodní trénink");
    expect(n?.cena).toBe(1100);
    expect(n?.odDna).toBe("2026-09-28");
  });

  it("druhý raz už nevznikne — úvodný balíček ten deň má", () => {
    const sBalickom = [...os, { druh: "balicekOd", den: "2026-09-28", nazov: "Úvodní trénink", hodin: 1 }] as never[];
    const stavy = new Map([[sBalickom[0], { zostatok: 7, dlh: null, usek: "2026-09-28" }]]) as never;
    expect(navrhNovehoBalicka("Luky Kríž", sBalickom, stavy)).toBe(null);
  });
});
