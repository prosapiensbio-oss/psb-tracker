import { describe, expect, it } from "bun:test";

import { dlhJednehoKlienta, dlznici } from "./dlznici";
import { bezZdvojenych, dlhyKlientov, type VstupDlhov } from "./zaplatene";

const DNES = "2026-09-28";
const pop = (klient: string, datum: string, suma: number, popis = "OFF - 6h") => ({ klient, datum, suma, popis });
const bal = (klient: string, platnostOd: string, cena: number, zdroj = "rucne", poznamka: string | null = null) => ({ klient, nazov: "6h Balíček", cena, platnostOd, zdroj, zruseneAt: null, poznamka });
/** Celé pravidlo „zaplatený" nad vymyslenými dátami — tak, ako ho volá `loadData`. */
const dlhy = (v: Partial<VstupDlhov>) => dlhyKlientov({ poplatky: [], platby: [], balicky: [], ptPlatby: [], ptHistoria: [], ...v }).polozky;

describe("dlznici", () => {
  it("zlúči poplatky jedného človeka do jedného riadku", () => {
    const v = dlznici(dlhy({ poplatky: [pop("Lucie Podolova", "2026-08-07", 6990), pop("Lucie Podolova", "2026-09-04", 6990)] }), {}, DNES);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ meno: "Lucie Podolova", spolu: 13980, najstarsi: "2026-08-07", dni: 52 });
    expect(v[0].polozky).toHaveLength(2);
  });

  it("nezaplatený balíček z Kokpitu sa pripočíta k poplatkom", () => {
    const v = dlznici(dlhy({ poplatky: [pop("Dan Kouřil", "2026-09-02", 7790)], balicky: [bal("Dan Kouřil", "2026-09-25", 7790)] }), {}, DNES);
    expect(v[0]).toMatchObject({ spolu: 15580, zPoplatkov: 7790, zBalickov: 7790 });
  });

  it("kto dlží len za balíček, v zozname tiež je — aj s dňom predaja", () => {
    const v = dlznici(dlhy({ balicky: [bal("Janka šnirychova", "2026-09-22", 3990)] }), {}, DNES);
    expect(v[0]).toMatchObject({ meno: "Janka šnirychova", spolu: 3990, zPoplatkov: 0, najstarsi: "2026-09-22", dni: 6 });
  });

  it("zaplatený balíček dlh nerobí", () => {
    const v = dlznici(dlhy({ balicky: [bal("Martin Vaško", "2026-09-27", 7790)], platby: [{ klient: "Martin Vaško", suma: 7790, datum: "2026-09-27" }] }), {}, DNES);
    expect(v).toHaveLength(0);
  });

  it("balíček naliaty z PTmindera sa do dlhu RÁTA — Kokpit je zdroj", () => {
    // Jerry, 12. 10. 2026. Dovtedy rozhodoval `zdroj = rucne`, a tak zmena
    // veľkosti balíčka naliateho z PTmindera nevstúpila do peňazí nikam.
    const v = dlznici(dlhy({ balicky: [bal("Peter Gažo", "2026-05-18", 9400, "ptminder")] }), {}, DNES);
    expect(v).toHaveLength(1);
    expect(v[0].spolu).toBe(9400);
  });

  it("ale PTminder ho odpustí, keď o platbe vie — zostal kontrolou", () => {
    const v = dlznici(dlhy({
      balicky: [bal("Peter Gažo", "2026-05-18", 9400, "ptminder")],
      ptPlatby: [{ klient: "Peter Gažo", datum: "2026-05-20", suma: 9400 }],
    }), {}, DNES);
    expect(v).toHaveLength(0);
  });

  it("otvárací zostatok z naliatia dlh nerobí — prevzaté hodiny nie sú predaj", () => {
    const v = dlznici(dlhy({
      balicky: [bal("Tomaš Krčmar", "2026-09-20", 77240, "ptminder", "zostatok prevzatý z PTmindera k 2026-09-20 — pokračuje")],
    }), {}, DNES);
    expect(v).toHaveLength(0);
  });

  it("najvyšší dlh je hore a tréner sa doplní", () => {
    const v = dlznici(dlhy({ poplatky: [pop("Malý", "2026-09-20", 1100), pop("Veľký", "2026-09-20", 9400)] }), { "Veľký": "Terezka", "Malý": "Jerry" }, DNES);
    expect(v.map((x) => [x.meno, x.trener])).toEqual([["Veľký", "Terezka"], ["Malý", "Jerry"]]);
  });

  it("dlžník sa pomenuje menom z karty, nie tvarom z poplatku", () => {
    const v = dlznici(dlhy({ poplatky: [pop("Janka snirychova", "2026-09-20", 1100)] }), { "Janka šnirychova": "Terezka" }, DNES);
    expect(v[0]).toMatchObject({ meno: "Janka šnirychova", trener: "Terezka" });
  });
});

describe("ten istý predaj v oboch systémoch", () => {
  it("sa do dlhu nepočíta dvakrát", () => {
    // Martin Vaško, 3. 10. 2026: predaj za 6 990 Kč z 27. 9. mal zapísaný
    // ručne v Kokpite aj otvorený ako poplatok v PTminderi — stránka mu
    // pýtala 13 980 Kč.
    const d = dlhy({ poplatky: [pop("Martin Vaško", "2026-09-27", 6990)], balicky: [bal("Martin Vaško", "2026-09-27", 6990)] });
    expect(dlhJednehoKlienta(d, "Martin Vaško").dlzi).toBe(6990);
    expect(d).toHaveLength(1);
    expect(d[0].zdroj).toBe("kokpit");
  });

  it("iný deň alebo iná suma sú dva rôzne predaje", () => {
    const d = dlhy({ poplatky: [pop("X", "2026-09-20", 6990)], balicky: [bal("X", "2026-09-27", 6990)] });
    expect(dlhJednehoKlienta(d, "X").dlzi).toBe(13980);
  });

  it("balíček z importu poplatok neumazáva — dlh z neho nevzniká", () => {
    const d = dlhy({ poplatky: [pop("X", "2026-09-27", 6990)], balicky: [bal("X", "2026-09-27", 6990, "ptminder")] });
    expect(dlhJednehoKlienta(d, "X").dlzi).toBe(6990);
  });

  it("zaplatený balíček z Kokpitu zhasne aj poplatok toho istého predaja", () => {
    // Platba v dvoch častiach: poplatok z PTmindera ju v kroku 1 nespáruje
    // (suma musí sedieť na korunu), balíček z Kokpitu áno — a poplatok mu
    // v kroku 4 ustúpi. Pred jedným pravidlom ho Dnes a profil ukazovali.
    const v = dlhyKlientov({
      poplatky: [pop("X", "2026-09-26", 6990)], balicky: [bal("X", "2026-09-27", 6990)],
      platby: [{ klient: "X", suma: 3000, datum: "2026-09-27" }, { klient: "X", suma: 3990, datum: "2026-09-30" }],
      ptPlatby: [], ptHistoria: [],
    });
    expect(v.polozky).toHaveLength(0);
    // Deň poplatku ostáva bez hodín — pod ním je v PTminderi dvojča predaja.
    expect(v.dvojcata).toEqual([{ klient: "X", den: "2026-09-26" }]);
  });

  it("balíček z Kokpitu nesie svoje id — podľa neho sa pýta „suma nesedí“", () => {
    const v = dlhyKlientov({
      poplatky: [], balicky: [{ ...bal("X", "2026-09-27", 7790), id: "b-1" }],
      platby: [{ klient: "X", suma: 7011, datum: "2026-09-28" }], ptPlatby: [], ptHistoria: [],
    });
    expect(v.polozky[0]).toMatchObject({ id: "b-1", zdroj: "kokpit", doplatit: 779 });
  });
});

describe("bitcoin — rozhoduje suma v korunách, nie kurz", () => {
  it("platba bitcoinom o pár percent nižšia (kurz) zaplatí balíček celý (Gažo 15. 10. 2026)", () => {
    expect(dlhy({ balicky: [bal("Gažo", "2026-10-09", 20093)], platby: [{ klient: "Gažo", suma: 19682, datum: "2026-10-11", sposob: "bitcoin" }] })).toEqual([]);
  });
  it("Gažo naostro: staré členstvá zaplatené v PTminderi, októbrová BTC platba o 411 Kč nižšia → bez dlhu", () => {
    const v = dlhy({
      balicky: [bal("Gažo", "2026-05-18", 21150, "ptminder"), bal("Gažo", "2026-07-24", 20093, "ptminder"), bal("Gažo", "2026-10-09", 20093)],
      platby: [{ klient: "Gažo", suma: 19682, datum: "2026-10-11", sposob: "bitcoin" }],
      ptPlatby: [{ klient: "Gažo", suma: 21150, datum: "2026-05-19" }, { klient: "Gažo", suma: 8000, datum: "2026-08-07" }, { klient: "Gažo", suma: 12081, datum: "2026-08-17" }],
    });
    expect(v).toEqual([]);
  });
  it("prebytok z rastúceho kurzu sa neprenesie na ďalší balíček", () => {
    const v = dlhy({ balicky: [bal("X", "2026-09-01", 6990), bal("X", "2026-10-01", 6990)], platby: [{ klient: "X", suma: 7300, datum: "2026-09-02", sposob: "bitcoin" }] });
    expect(v.map((x) => x.doplatit)).toEqual([6990]);
  });
  it("polovičná platba bitcoinom nie je kurz — dlh svieti", () => {
    expect(dlhy({ balicky: [bal("X", "2026-10-01", 6990)], platby: [{ klient: "X", suma: 3500, datum: "2026-10-02", sposob: "bitcoin" }] }).map((x) => x.doplatit)).toEqual([3490]);
  });
  it("bankový prevod o 411 Kč nižší ostáva dlhom — kurz je len pri bitcoine", () => {
    expect(dlhy({ balicky: [bal("X", "2026-10-09", 20093)], platby: [{ klient: "X", suma: 19682, datum: "2026-10-11", sposob: "banka" }] }).map((x) => x.doplatit)).toEqual([411]);
  });
});

describe("poistka z PTmindera", () => {
  it("staré členstvo zaplatené v PTminderi si nezoberie novú platbu z Kokpitu (Gažo 15. 10. 2026)", () => {
    const v = dlhy({
      balicky: [bal("Gažo", "2026-05-18", 21150, "ptminder"), bal("Gažo", "2026-10-09", 20093)],
      platby: [{ klient: "Gažo", suma: 20093, datum: "2026-10-11" }],
      ptPlatby: [{ klient: "Gažo", suma: 21150, datum: "2026-05-20" }],
    });
    expect(v).toEqual([]);
  });
  it("platba z obdobia starého členstva sa naň započíta aj keď ho PTminder pozná — nezaplatí nový predaj", () => {
    const v = dlhy({
      balicky: [bal("Kral", "2026-09-10", 6990, "ptminder"), bal("Kral", "2026-10-09", 6990)],
      platby: [{ klient: "Kral", suma: 6990, datum: "2026-09-12" }],
      ptPlatby: [{ klient: "Kral", suma: 6990, datum: "2026-09-12" }],
    });
    expect(v.map((x) => [x.den, x.doplatit])).toEqual([["2026-10-09", 6990]]);
  });
  it("dva rovnaké balíčky, PTminder pozná platbu len za jeden — druhý ostáva dlhom raz (nezávislá kontrola 15. 10.)", () => {
    const v = dlhy({
      balicky: [bal("X", "2026-05-10", 6990), bal("X", "2026-05-10", 6990)],
      ptPlatby: [{ klient: "X", suma: 6990, datum: "2026-05-11" }],
    });
    expect(v.map((x) => x.doplatit)).toEqual([6990]);
  });
  it("dva rovnaké staré balíčky a jedna platba v PTminderi — nová platba z Kokpitu nezmaže dlh za druhý (nezávislá kontrola 15. 10.)", () => {
    const v = dlhy({
      balicky: [bal("X", "2026-05-10", 6990), bal("X", "2026-05-10", 6990), bal("X", "2026-10-09", 6990)],
      platby: [{ klient: "X", suma: 6990, datum: "2026-10-10" }],
      ptPlatby: [{ klient: "X", suma: 6990, datum: "2026-05-11" }],
    });
    expect(v.reduce((a, x) => a + x.doplatit, 0)).toBe(6990);
  });
  it("zrušený balíček nezoberie platbu PTmindera náhradnému (nezávislá kontrola 15. 10.)", () => {
    const v = dlhy({
      balicky: [{ ...bal("X", "2026-10-02", 6990), zruseneAt: "2026-10-02" }, bal("X", "2026-10-02", 6990)],
      ptPlatby: [{ klient: "X", suma: 6990, datum: "2026-10-02" }],
    });
    expect(v).toEqual([]);
  });
  it("balíček zaplatený v Kokpite nezoberie platbu PTmindera, ktorá patrí ďalšiemu (nezávislá kontrola 15. 10.)", () => {
    const v = dlhy({
      balicky: [bal("X", "2026-09-10", 6990), bal("X", "2026-10-09", 6990)],
      platby: [{ klient: "X", suma: 6990, datum: "2026-09-12" }],
      ptPlatby: [{ klient: "X", suma: 6990, datum: "2026-10-10" }],
    });
    expect(v).toEqual([]);
  });

  it("balíček, ktorý PTminder pozná ako zaplatený, dlhom nie je", () => {
    const d = dlhy({ balicky: [bal("Vítězslav Papiež", "2026-09-29", 6990)], ptPlatby: [{ klient: "Vitezslav Papiež", datum: "2026-09-29", suma: 6990 }] });
    expect(d).toHaveLength(0);
  });
});

describe("hodiny čítajú to isté pravidlo", () => {
  it("loadData berie id balíčka a karta dostane dni bez hodín", async () => {
    const zdroj = require("fs").readFileSync(require("path").join(__dirname, "db.server.ts"), "utf8") as string;
    // Bez `id` v SELECTe by otázka „suma nesedí" nevznikla nikdy (nález 5. 10. 2026).
    expect(zdroj).toMatch(/SELECT id, klient, nazov, zdroj, platnost_od, platnost_do, hodiny, cena_czk, zrusene_at, poznamka FROM balicky/);
    expect(zdroj).toContain("data.bezHodin = bezHodinZDlhov(polozky, dvojcata);");
  });
});

describe("splátky — Markéta Lozias, 17. 10. 2026", () => {
  // Balíček 7 790 Kč, v Kokpite prvá polovica 3 895. PTminder má členstvo
  // bez otvoreného poplatku — poistka ho nesmie odpustiť; dlh je zvyšok.
  const vstup = {
    poplatky: [],
    balicky: [{ id: "b1", klient: "Marketa Lozias", nazov: "6h Balíček", cena: 7790, platnostOd: "2026-10-09", zdroj: "rucne" }],
    platby: [{ klient: "Marketa Lozias", datum: "2026-10-06", suma: 3895, vopred: 1 }],
    ptPlatby: [{ klient: "Marketa Lozias", datum: "2026-10-06", suma: 3895 }],
    ptHistoria: [{ klient: "Marketa Lozias", od: "2026-10-09" }],
  };

  it("zvyšok ostáva dlhom aj keď PTminder poplatok nemá", () => {
    const { polozky } = dlhyKlientov(vstup as never);
    expect(polozky.map((p) => [p.klient, p.doplatit])).toEqual([["Marketa Lozias", 3895]]);
  });

  it("čiastočne zaplatený balíček hodiny dáva, nezaplatený nie", async () => {
    const { bezHodinZDlhov } = await import("./zaplatene");
    const { polozky, dvojcata } = dlhyKlientov(vstup as never);
    expect(bezHodinZDlhov(polozky, dvojcata)).toEqual([]);
    const nic = dlhyKlientov({ ...vstup, platby: [], ptPlatby: [], ptHistoria: [] } as never);
    expect(bezHodinZDlhov(nic.polozky, nic.dvojcata)).toEqual([{ klient: "Marketa Lozias", den: "2026-10-09" }]);
  });

  it("celá platba položená FIFO na starší balíček nevyrobí falošnú splátku", () => {
    // Nález kontroly 17. 10.: A (25. 9., 3 990) zaplatený len v PTminderi,
    // B (10. 10., 7 790) zaplatený celý v Kokpite. FIFO dá peniaze na A,
    // B vyzerá čiastočne zaplatený — poistka ho musí ďalej odpustiť.
    const { polozky } = dlhyKlientov({
      poplatky: [],
      balicky: [
        { id: "a", klient: "X Y", nazov: "A", cena: 3990, platnostOd: "2026-09-25", zdroj: "ptminder" },
        { id: "b", klient: "X Y", nazov: "B", cena: 7790, platnostOd: "2026-10-10", zdroj: "rucne" },
      ],
      platby: [{ klient: "X Y", datum: "2026-10-10", suma: 7790 }],
      ptPlatby: [{ klient: "X Y", datum: "2026-09-25", suma: 3990 }],
      ptHistoria: [{ klient: "X Y", od: "2026-09-25" }, { klient: "X Y", od: "2026-10-10" }],
    } as never);
    expect(polozky).toEqual([]);
  });

  it("zvyšok 10 Kč z preplatku hodiny nedá", async () => {
    const { bezHodinZDlhov } = await import("./zaplatene");
    expect(bezHodinZDlhov([{ klient: "X", den: "2026-10-20", nazov: "6h", cena: 7790, doplatit: 7780, zdroj: "kokpit" }], [])).toHaveLength(1);
  });

  it("dve polovice v PTminderi poistka uzná ďalej", () => {
    const { polozky } = dlhyKlientov({ ...vstup, platby: [], ptPlatby: [{ klient: "Marketa Lozias", datum: "2026-10-06", suma: 3895 }, { klient: "Marketa Lozias", datum: "2026-11-03", suma: 3895 }] } as never);
    expect(polozky).toEqual([]);
  });
});

describe("BTC platba v deň nového balíčka — Jan Kalmus, 20. 10. 2026", () => {
  it("starý balíček zaplatený v PTminderi si ju nevezme", () => {
    const { polozky } = dlhyKlientov({
      poplatky: [],
      balicky: [
        { id: "sep", klient: "Jan Kalmus", nazov: "OFF - 8 hodín offline", cena: 8460, platnostOd: "2026-09-15", zdroj: "ptminder" },
        { id: "okt", klient: "Jan Kalmus", nazov: "8h Balíček", cena: 8460, platnostOd: "2026-10-20", zdroj: "rucne" },
      ],
      platby: [{ klient: "Jan Kalmus", datum: "2026-10-20", suma: 8436, sposob: "bitcoin" }],
      ptPlatby: [],
      ptHistoria: [{ klient: "Jan Kalmus", od: "2026-09-15" }],
    } as never);
    expect(polozky).toEqual([]);
  });

  it("to isté o mesiac neskôr: BTC platba za nový balíček nie je splátka starého", () => {
    const { polozky } = dlhyKlientov({
      poplatky: [],
      balicky: [
        { id: "a", klient: "Jan Kalmus", nazov: "8h Balíček", cena: 8460, platnostOd: "2026-10-02", zdroj: "rucne" },
        { id: "b", klient: "Jan Kalmus", nazov: "8h Balíček", cena: 8460, platnostOd: "2026-10-25", zdroj: "rucne" },
      ],
      platby: [{ klient: "Jan Kalmus", datum: "2026-10-25", suma: 8436, sposob: "bitcoin" }],
      ptPlatby: [],
      ptHistoria: [{ klient: "Jan Kalmus", od: "2026-10-02" }],
    } as never);
    expect(polozky).toEqual([]);
  });
});

describe("ten istý predaj so zľavou — Peter Gažo, 11. 10. 2026", () => {
  // Gažo si 9. 10. kúpil jeden 18h balíček. PTminder ho vedie za cenníkových
  // 21 150 Kč, Kokpit si ho založil sám za 20 093 (5 % zľava za bitcoin).
  // Pravidlo „rovnaká cena" ich nespojilo a QR v SMS znel na 41 243 Kč.
  const poplatok = (suma: number, datum = "2026-10-09") => [{ datum, suma }];
  const balicek = (cena: number, platnostOd = "2026-10-09") =>
    [{ cena, platnostOd, zdroj: "rucne" }];

  it("zľavnený balíček pohltí cenníkový poplatok", () => {
    expect(bezZdvojenych(poplatok(21150), balicek(20093))).toHaveLength(0);
  });

  it("rovnaká cena funguje ďalej", () => {
    expect(bezZdvojenych(poplatok(6990), balicek(6990))).toHaveLength(0);
  });

  it("drahší balíček V TEN ISTÝ DEŇ je zväčšenie, nie iný predaj", () => {
    // Dominika Križová, 12. 10. 2026: namiesto 6 h si zobrala 18 h. V Kokpite
    // je 17 978 Kč, v PTminderi stále poplatok za 6 622 — jeden predaj,
    // len PTminder drží jeho starú podobu.
    expect(bezZdvojenych(poplatok(6622), balicek(17978))).toHaveLength(0);
    expect(bezZdvojenych(poplatok(20093), balicek(21150))).toHaveLength(0);
  });

  it("o iný deň drahší balíček ten istý predaj nie je", () => {
    expect(bezZdvojenych(poplatok(6622, "2026-10-01"), balicek(17978, "2026-10-09"))).toHaveLength(1);
  });

  it("polovičná suma je doplatok, nie zľava", () => {
    expect(bezZdvojenych(poplatok(21150), balicek(10000))).toHaveLength(1);
  });

  it("tretina dole je hranica", () => {
    expect(bezZdvojenych(poplatok(21000), balicek(14000))).toHaveLength(0);
    expect(bezZdvojenych(poplatok(21000), balicek(13900))).toHaveLength(1);
  });

  it("jeden balíček pohltí najviac jeden poplatok", () => {
    const dva = [{ datum: "2026-10-09", suma: 21150 }, { datum: "2026-10-09", suma: 21150 }];
    expect(bezZdvojenych(dva, balicek(20093))).toHaveLength(1);
  });

  it("týždeň od seba je iný predaj aj so zľavou", () => {
    expect(bezZdvojenych(poplatok(21150, "2026-10-01"), balicek(20093, "2026-10-09"))).toHaveLength(1);
  });
});
