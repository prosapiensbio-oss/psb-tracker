// Štyri karty Workspace v bete (Jerry, 4. 10. 2026).
import { describe, expect, it } from "bun:test";

import type { Udalost } from "./klientOsCasu";
import { priebehBalickov } from "./vypisHodin";
import { kandidatiPlatby, klucOtazkyPlatby, navrhNovehoBalicka, otazkyPlatieb, samostatnaHodina, ZNACKA_POSUNU_ZA_DOPLNENIE, zoznamSms, zruseneAutomaty } from "./workspaceKroky";
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
  it("balíček spred 1. 10., ktorý PTminder pozná ako zaplatený, sa nepýta", () => {
    expect(otazky([bal("b1", "6h Balíček", 7790, "2026-09-05")], [{ klient: "A", datum: "2026-09-06", suma: 7011 }], [{ klient: "A", datum: "2026-09-05", suma: 7790 }])).toEqual([]);
  });
  it("od 1. 10. platba len v PTminderi otázku neumlčí — pravdou je Kokpit", () => {
    expect(otazky([bal("b1", "6h Balíček", 7790)], [{ klient: "A", datum: "2026-11-06", suma: 7011 }], [{ klient: "A", datum: "2026-11-05", suma: 7790 }])).toHaveLength(1);
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
    // Faktúra na ďalší balíček (Jan Kral, 8. 11. 2026): na nule bez dlhu netreba písať, mínus a dlh ostávajú.
    const naDalsi = zoznamSms([c("Nula", 0), c("Minus", -1), c("PlusDlh", 2)], { PlusDlh: 7790 }, {}, {}, new Set(), dnes, [], ["Nula", "Minus", "PlusDlh"]);
    expect(naDalsi.map((r) => r.meno).sort()).toEqual(["Minus", "PlusDlh"]);
  });
  it("kto dlho netrénoval a nič nemá objednané, tam nie je", () => {
    expect(zoznamSms([c("Dávno", -1, { lastSession: "2026-06-01" })], {}, {}, {}, new Set(), dnes)).toHaveLength(0);
    expect(zoznamSms([c("Dávno", -1, { lastSession: "2026-06-01" })], {}, {}, {}, new Set(["davno"]), dnes)).toHaveLength(1);
  });
});

describe("zoznam SMS: kto nemá na čo chodiť", () => {
  const dnes = "2026-11-01";
  const c = (name: string, extra: Partial<{ status: string; lastSession: string; packageRemaining: number; packageTotal: number }> = {}) => ({
    name, status: "Aktívny", primaryTrainer: "Terezka", membership: "", packageRemaining: 0, packageTotal: 0, lastSession: "2026-10-20", ...extra,
  });
  const bez = (meno: string, extra: Partial<{ objednanych: number; vMinuse: number }> = {}) =>
    ({ meno, dovod: "hodiny minuté" as const, objednanych: 0, vMinuse: 0, ...extra });

  it("karta 0/0 bez dlhu do zoznamu smie len zo zoznamu Bez balíčka", () => {
    expect(zoznamSms([c("Regina Obrovska")], {}, {}, {}, new Set(), dnes)).toHaveLength(0);
    const [r] = zoznamSms([c("Regina Obrovska")], {}, {}, {}, new Set(), dnes, [bez("Regina Obrovska")]);
    expect(r.stav).toBe("nula");
    expect(r.veta).toBe("na nule — hodiny minuté");
    expect(r.lenBezBalicka).toBe(true);
  });
  it("meno sa páruje bez diakritiky", () => {
    expect(zoznamSms([c("Svetopluk Stoklasko")], {}, {}, {}, new Set(), dnes, [bez("Svetopluk Stokláško")])).toHaveLength(1);
  });
  it("termín je silnejší než stav Neaktívny", () => {
    const n = c("Spiaci", { status: "Neaktívny", lastSession: "2026-03-01" });
    expect(zoznamSms([n], {}, {}, {}, new Set(["spiaci"]), dnes)).toHaveLength(0);
    const [r] = zoznamSms([n], {}, {}, {}, new Set(["spiaci"]), dnes, [bez("Spiaci", { objednanych: 2 })]);
    expect(r.veta).toContain("obj. 2");
  });
  it("mínus z osi ide do riadku, po SMS zmizne, bez termínu a po 60 dňoch tam nie je", () => {
    const [m] = zoznamSms([c("Štigut")], {}, {}, {}, new Set(), dnes, [bez("Štigut", { vMinuse: 2 })]);
    expect([m.stav, m.zostatok]).toEqual(["minus", -2]);
    expect(zoznamSms([c("Štigut")], {}, { "Štigut": "2026-10-20T08:33:00.000Z" }, { "Štigut": "2026-10-20T07:30:00.000Z" }, new Set(), dnes, [bez("Štigut")])).toHaveLength(0);
    expect(zoznamSms([c("Dávny", { lastSession: "2026-06-01" })], {}, {}, {}, new Set(), dnes, [bez("Dávny")])).toHaveLength(0);
  });
  it("kto má balíček alebo dlh, nie je lenBezBalicka a zostáva, ako bol", () => {
    const [a] = zoznamSms([c("Šnirych", { packageTotal: 3 })], {}, {}, {}, new Set(), dnes, [bez("Šnirych", { objednanych: 9 })]);
    expect(a.lenBezBalicka).toBeUndefined();
    const [d] = zoznamSms([c("Dlžník")], { "Dlžník": 1100 }, {}, {}, new Set(), dnes, [bez("Dlžník")]);
    expect(d.stav).toBe("dlh");
    expect(d.lenBezBalicka).toBeUndefined();
  });
  it("platné hodiny ostávajú mimo aj so skončenou platnosťou — tých vybavuje Platnosť v kroku 3", () => {
    expect(zoznamSms([c("Skončil", { packageRemaining: 3, packageTotal: 6 })], {}, {}, {}, new Set(), dnes, [bez("Skončil")])).toHaveLength(0);
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

describe("prenesené hodiny nie sú vzor (Natália Krivdová 19. 10. 2026)", () => {
  it("nový balíček je podľa předplatného, nie podľa prenesených hodín", () => {
    const os = zorad([
      balicek("2026-09-09", 6, "OFF - 6h S viazanostou", "2026-10-08"),
      balicek("2026-10-08", 1, "Prenesené hodiny"),
      ...["2026-09-10", "2026-09-17", "2026-09-24", "2026-09-29", "2026-10-01", "2026-10-06", "2026-10-13", "2026-10-19"].map(trening),
    ]);
    const { stavy } = priebehBalickov(os, -1, "2026-10-20");
    const n = navrhNovehoBalicka("Natalia Krivdova", os, stavy, [{ den: "2026-09-09", cena: 6990 }]);
    expect(n?.nazov).not.toBe("Prenesené hodiny");
    expect(n?.hodiny).toBe(6);
    expect(n?.cena).toBe(6990);
  });
});

describe("samostatná hodina nie je vzor (Marcela Hrůzová 22. 10. 2026)", () => {
  it("po konci online členstva vznikne online 6 h, nie 1h Balíček", () => {
    const os = zorad([
      balicek("2026-08-27", 6, "ON - 6h BEZ viazanosti", "2026-10-21"),
      balicek("2026-09-18", 1, "OFF - 1 hodina offline", "2026-10-15"),
      ...["2026-09-18", "2026-09-24", "2026-10-01", "2026-10-08", "2026-10-22"].map(trening),
    ]);
    const { stavy } = priebehBalickov(os, -1, "2026-10-23");
    const n = navrhNovehoBalicka("Marcela Hruzova", os, stavy, [{ den: "2026-08-27", cena: 6590 }, { den: "2026-09-18", cena: 1450 }]);
    expect(n?.hodiny).toBe(6);
    expect(n?.cena).toBe(6590);
  });
  it("kto kupuje len po hodine, dostane zase hodinu", () => {
    const os = zorad([balicek("2026-10-01", 1, "1h Balíček", "2026-10-29"), trening("2026-10-01"), trening("2026-10-22")]);
    const { stavy } = priebehBalickov(os, -1, "2026-10-23");
    expect(navrhNovehoBalicka("X", os, stavy)?.hodiny).toBe(1);
  });
});

describe("po úvodnom nevznikne druhý úvodný (Lenka Divinová 16. 10. 2026)", () => {
  it("prvý riadny tréning po úvodnom nemá vzor — balíček zakladá tréner", () => {
    const uv = { druh: "trening", den: "2026-08-28", cas: "09:00", uvodny: true } as Udalost;
    const os = zorad([balicek("2026-08-28", 1, "Úvodní trénink", "2026-08-28"), uv, trening("2026-10-16")]);
    const { stavy } = priebehBalickov(os, null, "2026-10-16");
    expect(navrhNovehoBalicka("Lenka Divinova", os, stavy, [{ den: "2026-08-28", cena: 1100 }])).toBe(null);
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

describe("tréning iného druhu než členstvo = samostatná hodina (Veronika 21. 10., Jerry 25. 10. 2026)", () => {
  const off = (den: string) => ({ druh: "trening", den, cas: "18:00", nazov: "OFFLINE - 60min" }) as Udalost;
  const on = (den: string) => ({ druh: "trening", den, cas: "18:00", nazov: "ONLINE - 60min" }) as Udalost;
  it("offline tréning popri online členstve → 1h Balíček za 1 450", () => {
    const os = zorad([balicek("2026-10-06", 6, "6h Balíček online", "2026-11-30"), on("2026-10-06"), off("2026-10-27")]);
    const { stavy } = priebehBalickov(os, null, "2026-10-28");
    expect(navrhNovehoBalicka("Veronika Stoklaskova", os, stavy)).toMatchObject({ odDna: "2026-10-27", nazov: "1h Balíček", hodiny: 1, cena: 1450 });
  });
  it("online tréning popri offline členstve → 1h Balíček online", () => {
    const os = zorad([balicek("2026-10-05", 8, "8h Balíček", "2026-11-29"), off("2026-10-06"), on("2026-10-20")]);
    const { stavy } = priebehBalickov(os, null, "2026-10-21");
    expect(navrhNovehoBalicka("X", os, stavy)).toMatchObject({ odDna: "2026-10-20", nazov: "1h Balíček online", hodiny: 1 });
  });
  it("keď hodina toho druhu v ten deň už je, nenavrhne ďalšiu", () => {
    const os = zorad([
      balicek("2026-10-06", 6, "6h Balíček online", "2026-11-30"),
      balicek("2026-10-27", 1, "1h Balíček", "2026-11-23"),
      on("2026-10-06"), off("2026-10-27"),
    ]);
    const { stavy } = priebehBalickov(os, null, "2026-10-28");
    expect(navrhNovehoBalicka("Veronika Stoklaskova", os, stavy)?.nazov).not.toBe("1h Balíček");
  });
  it("tréning rovnakého druhu ako členstvo nič nezakladá", () => {
    const os = zorad([balicek("2026-10-02", 6, "ON - 6h S viazanostou", "2026-10-29"), on("2026-10-06")]);
    const { stavy } = priebehBalickov(os, null, "2026-10-07");
    expect(navrhNovehoBalicka("Lucie Podolova", os, stavy)).toBeNull();
  });
});

describe("doplnenie z Kokpitu nie je vzor (Jakub Kaňovský 21. 10. 2026)", () => {
  it("nový balíček je podľa posledného predaja, nie podľa doplnenia", () => {
    const os = zorad([
      balicek("2026-08-20", 6, "OFF - 6h BEZ viazanosti", "2026-10-14"),
      balicek("2026-10-15", 1, "Doplnenie členstva"),
      ...["2026-08-21", "2026-08-28", "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-16", "2026-10-21"].map(trening),
    ]);
    const { stavy } = priebehBalickov(os, -1, "2026-10-22");
    const n = navrhNovehoBalicka("Jakub Kaňovský", os, stavy, [{ den: "2026-08-20", cena: 7790 }]);
    expect(n?.nazov).toBe("6h Balíček");
    expect(n?.cena).toBe(7790);
  });
});

describe("doplnenie vzniká len rozhodnutím (Jerry, 21. 10. 2026)", () => {
  it("stráž: doplnenie, prenesené hodiny ani 0 Kč automaticky nevzniknú", async () => {
    const { smieVzniknutAutomaticky } = await import("./workspaceKroky");
    expect(smieVzniknutAutomaticky({ nazov: "Doplnenie členstva", cena: 0, hodiny: 1 })).toBe(false);
    expect(smieVzniknutAutomaticky({ nazov: "Doplnenie členstva", cena: 500, hodiny: 1 })).toBe(false);
    expect(smieVzniknutAutomaticky({ nazov: "Prenesené hodiny", cena: 0, hodiny: 1 })).toBe(false);
    expect(smieVzniknutAutomaticky({ nazov: "SILVER členství", cena: 0, hodiny: 6 })).toBe(false);
    expect(smieVzniknutAutomaticky({ nazov: "6h Balíček", cena: 7790, hodiny: 6 })).toBe(true);
    expect(smieVzniknutAutomaticky({ nazov: "Úvodní trénink", cena: 1100, hodiny: 1 })).toBe(true);
  });
});

describe("doplatí zvyšok — odpoveď sa nevráti (Branislav Široký, 29. 10. 2026)", () => {
  const dlh = [{ klient: "Branislav Široký", den: "2026-10-26", nazov: "Úvodní trénink", cena: 1100, doplatit: 100, zdroj: "kokpit" as const, id: "u1" }];
  it("bez odpovede sa pýta, s odpoveďou mlčí", () => {
    expect(otazkyPlatieb(dlh)).toHaveLength(1);
    expect(otazkyPlatieb(dlh, { [klucOtazkyPlatby({ balicekId: "u1", zaplatene: 1000 })]: { ack: true } })).toHaveLength(0);
  });
  it("iná čiastočná platba je nová otázka", () => {
    expect(otazkyPlatieb([{ ...dlh[0], doplatit: 50 }], { [klucOtazkyPlatby({ balicekId: "u1", zaplatene: 1000 })]: { ack: true } })).toHaveLength(1);
  });
});

describe("zrušený automatický balíček si Kokpit pamätá (Jerry, 1. 11. 2026)", () => {
  const riadok = (klient: string, od: string, poznamka: string | null, zrusene: string | null = "2026-10-19T14:36:45Z", nazov = "6h Balíček") =>
    ({ klient, nazov, platnost_od: od, poznamka, zrusene_at: zrusene });
  const AUTO = "automaticky — vznikol prvým tréningom";

  // Balíček 6 h do 26. 9., potom tri tréningy bez hodín: ten istý tvar ako Knapčok.
  const os = zorad([
    balicek("2026-09-01", 6, "6h Balíček", "2026-10-26"),
    ...["2026-09-02", "2026-09-07", "2026-09-10", "2026-09-14", "2026-09-17", "2026-09-21", "2026-10-19", "2026-10-21", "2026-10-23"].map(trening),
  ]);
  const { stavy } = priebehBalickov(os, -3, "2026-10-24");
  const ceny = [{ den: "2026-09-01", cena: 7790 }];

  it("klient bez zrušeného: prázdna množina nič nemení — ten istý návrh ako bez parametra", () => {
    const zrusene = zruseneAutomaty("Michal Knapčok", [riadok("Iný Klient", "2026-10-19", AUTO), riadok("Michal Knapčok", "2026-10-19", AUTO, null)]);
    expect(zrusene.dni.size).toBe(0);
    expect(navrhNovehoBalicka("Michal Knapčok", os, stavy, ceny, zrusene)).toEqual(navrhNovehoBalicka("Michal Knapčok", os, stavy, ceny));
    expect(navrhNovehoBalicka("Michal Knapčok", os, stavy, ceny)?.odDna).toBe("2026-10-19");
  });

  it("zrušený na 19. 10. sa na ten deň nevráti; založí ho až ďalší tréning", () => {
    const zrusene = zruseneAutomaty("Michal Knapčok", [riadok("Michal Knapčok", "2026-10-19", AUTO)]);
    const n = navrhNovehoBalicka("Michal Knapčok", os, stavy, ceny, zrusene);
    expect(n?.odDna).toBe("2026-10-21");
    expect(n?.nazov).toBe("6h Balíček");
  });

  it("všetky nekryté dni zrušené = nič", () => {
    const zrusene = zruseneAutomaty("X", ["2026-10-19", "2026-10-21", "2026-10-23"].map((d) => riadok("X", d, AUTO)));
    expect(navrhNovehoBalicka("X", os, stavy, ceny, zrusene)).toBeNull();
  });

  it("zrušený ručný balíček automat nebrzdí", () => {
    const zrusene = zruseneAutomaty("X", [riadok("X", "2026-10-19", "dohodnuté s klientom"), riadok("X", "2026-10-19", null)]);
    expect(zrusene.dni.size).toBe(0);
  });

  it("meno sa porovnáva bez diakritiky — zápis pod iným tvarom sa nestratí", () => {
    expect(zruseneAutomaty("Michal Knapcok", [riadok("Michal Knapčok", "2026-10-19", AUTO)]).dni.has("2026-10-19")).toBe(true);
  });

  it("posun za doplnenie rozhodol kód: ten deň ostáva voľný", () => {
    const zrusene = zruseneAutomaty("X", [riadok("X", "2026-10-19", `${AUTO} · ${ZNACKA_POSUNU_ZA_DOPLNENIE}`)]);
    expect(zrusene.dni.size).toBe(0);
    expect(navrhNovehoBalicka("X", os, stavy, ceny, zrusene)?.odDna).toBe("2026-10-19");
  });

  it("zrušený 6 h nebrzdí úvodný na ten deň, zrušený úvodný áno", () => {
    const u = [{ druh: "trening", den: "2026-10-05", cas: "17:00", uvodny: true }] as never[];
    const st = new Map(u.map((x) => [x, { zostatok: null, dlh: 1, usek: "" }])) as never;
    const po6h = zruseneAutomaty("X", [riadok("X", "2026-10-05", AUTO)]);
    expect(navrhNovehoBalicka("X", u, st, [], po6h)?.nazov).toBe("Úvodní trénink");
    const poUvodnom = zruseneAutomaty("X", [riadok("X", "2026-10-05", AUTO, "2026-10-06T10:00:00Z", "Úvodní trénink")]);
    expect(navrhNovehoBalicka("X", u, st, [], poUvodnom)).toBeNull();
  });

  it("samostatná hodina iného druhu: zrušený deň preskočí na ďalší tréning", () => {
    const off = (den: string) => ({ druh: "trening", den, cas: "18:00", nazov: "OFFLINE - 60min" }) as Udalost;
    const hodina = zorad([balicek("2026-10-06", 6, "6h Balíček online", "2026-11-30"), off("2026-10-20"), off("2026-10-27")]);
    expect(samostatnaHodina("X", hodina)?.odDna).toBe("2026-10-20");
    const zrusene = zruseneAutomaty("X", [riadok("X", "2026-10-20", AUTO, "2026-10-21T10:00:00Z", "1h Balíček")]);
    expect(samostatnaHodina("X", hodina, zrusene)?.odDna).toBe("2026-10-27");
  });
});
