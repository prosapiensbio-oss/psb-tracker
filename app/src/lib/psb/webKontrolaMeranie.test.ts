import { describe, expect, it } from "bun:test";

import {
  denZGa4, navstevyZGa4, odpovedZJson, pocty, skontrolujMeranie, udalostiZGa4,
  type MeranieData, type UdalostRiadok,
} from "./webKontrolaMeranie";

/**
 * Testy sú na SPRÁVANIE: aký vstup → aký nález.
 *
 * Vstupy sú vybrané tak, aby pokryli to, čo sa v živej GA4 stane raz za rok
 * a práve vtedy na tom záleží: prázdna odpoveď, chýbajúci rozmer, nula.
 * Jadro bodu 4 je jediná veta — ticho sa nesmie čítať ako úspech.
 */

const DNES = "2026-10-07";
const VCERA = "2026-10-06";

const u = (o: Partial<UdalostRiadok> & { udalost: string; den: string }): UdalostRiadok =>
  ({ stranka: "", duvod: "", pole: "", pocet: 1, ...o });

const data = (o: Partial<MeranieData> = {}): MeranieData =>
  ({ udalosti: [], navstevy: [], chybajuceRozmery: [], chyba: "", ...o });

const najdi = (n: ReturnType<typeof skontrolujMeranie>, kluc: string) => {
  const x = n.find((y) => y.kluc === kluc);
  if (!x) throw new Error(`nález ${kluc} chýba`);
  return x;
};
const zlyhania = (d: MeranieData) => najdi(skontrolujMeranie(d, DNES), "meranie:zlyhania");
const ticho = (d: MeranieData) => najdi(skontrolujMeranie(d, DNES), "meranie:ticho");

/** Bežná prevádzka: ľudia chodia, formuláre sa odosielajú, nič nepadá. */
const ZDRAVY = data({
  udalosti: [
    u({ udalost: "cta_formular", den: VCERA, stranka: "/uvodni-trenink/", pocet: 9 }),
    u({ udalost: "formular_start", den: VCERA, stranka: "/uvodni-trenink/", pocet: 4 }),
    u({ udalost: "formular_odoslany", den: VCERA, stranka: "/uvodni-trenink/", pocet: 2 }),
  ],
  navstevy: [{ den: VCERA, pocet: 120 }, { den: "2026-10-05", pocet: 90 }],
});

describe("zlyhania za okno", () => {
  it("jedno zlyhanie je chyba a v detaile je počet, stránka, dôvod aj pole", () => {
    const n = zlyhania(data({
      udalosti: [
        ...ZDRAVY.udalosti,
        u({ udalost: "formular_zlyhal", den: VCERA, stranka: "/test-postury/", duvod: "neplatne_pole", pole: "psb-call", pocet: 2 }),
        u({ udalost: "formular_zlyhal", den: VCERA, stranka: "/kontakt/", duvod: "bez_odpovede", pocet: 1 }),
      ],
      navstevy: ZDRAVY.navstevy,
    }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("3×");
    expect(n.detail).toContain("/test-postury/ 2×");
    expect(n.detail).toContain("neplatne_pole");
    expect(n.detail).toContain("pole psb-call");
    expect(n.detail).toContain("/kontakt/ 1×");
    // Veta pre človeka, nie kód chyby.
    expect(n.detail).toContain("stratený dopyt");
  });

  it("stránka s najviac zlyhaniami je prvá — telefonovať sa začína tam", () => {
    const n = zlyhania(data({
      udalosti: [
        ...ZDRAVY.udalosti,
        u({ udalost: "formular_zlyhal", den: VCERA, stranka: "/kontakt/", pocet: 1 }),
        u({ udalost: "formular_zlyhal", den: VCERA, stranka: "/test-postury/", pocet: 5 }),
      ],
      navstevy: ZDRAVY.navstevy,
    }));
    expect(n.detail.indexOf("/test-postury/")).toBeLessThan(n.detail.indexOf("/kontakt/"));
  });

  it("zlyhanie z predvčera je chyba, aj keď včera nepadlo nič", () => {
    // Pôvodne bolo toto „ok“: riadok sa súdil len za včera a osemdesiat
    // stratených dopytov stálo ako číslo vo vete zeleného riadku. Cron vie
    // beh vynechať, takže o tých dňoch by neohlásil nikto nič.
    const n = zlyhania(data({
      udalosti: [
        ...ZDRAVY.udalosti,
        u({ udalost: "formular_zlyhal", den: "2026-10-03", stranka: "/test-postury/", pocet: 50 }),
        u({ udalost: "formular_zlyhal", den: "2026-10-04", stranka: "/test-postury/", pocet: 30 }),
      ],
      navstevy: ZDRAVY.navstevy,
    }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("80×");
    // Deň po dni, najnovší prvý — inak sa nedá povedať, či porucha ešte žije.
    expect(n.detail).toContain("Naposledy 2026-10-04");
    expect(n.detail).toContain("2026-10-04 30×");
    expect(n.detail).toContain("2026-10-03 50×");
    expect(n.detail.indexOf("2026-10-04 30×")).toBeLessThan(n.detail.indexOf("2026-10-03 50×"));
    // A povie, prečo svieti nad starším dňom.
    expect(n.detail).toContain(`Včera (${VCERA}) nepadlo ani jedno`);
  });

  it("zlyhanie staršie než okno sa nepočíta", () => {
    const n = zlyhania(data({
      udalosti: [...ZDRAVY.udalosti, u({ udalost: "formular_zlyhal", den: "2026-09-20", stranka: "/test-postury/", pocet: 9 })],
      navstevy: ZDRAVY.navstevy,
    }));
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("ani jedno zlyhanie");
  });

  it("pri zlyhaní včera sa veta o vynechanom behu nepíše", () => {
    const n = zlyhania(data({
      udalosti: [...ZDRAVY.udalosti, u({ udalost: "formular_zlyhal", den: VCERA, stranka: "/test-postury/", pocet: 2 })],
      navstevy: ZDRAVY.navstevy,
    }));
    expect(n.stav).toBe("chyba");
    expect(n.detail).not.toContain("nepadlo ani jedno");
  });

  it("zlyhanie s počtom 0 nie je zlyhanie — nula sa nesmie čítať ako výskyt", () => {
    const n = zlyhania(data({
      udalosti: [...ZDRAVY.udalosti, u({ udalost: "formular_zlyhal", den: VCERA, stranka: "/test-postury/", pocet: 0 })],
      navstevy: ZDRAVY.navstevy,
    }));
    expect(n.stav).toBe("ok");
  });

  it("o dnešnom stave merania riadok zlyhaní netvrdí nič", () => {
    // Pôvodne tu stálo „takže meranie samo beží“ — veta o dnešku z riadku,
    // ktorý mohol byť týždeň starý. Odkedy sa vek posudzuje v druhom riadku,
    // tento ho nemá odkiaľ vedieť a nehovorí o ňom.
    const n = zlyhania(data({
      udalosti: [
        u({ udalost: "cta_formular", den: "2026-10-01", pocet: 6 }),
        u({ udalost: "formular_odoslany", den: "2026-10-01", pocet: 1 }),
      ],
      navstevy: [{ den: VCERA, pocet: 120 }],
    }));
    expect(n.detail).not.toContain("meranie samo beží");
  });

  it("týždeň s klikmi na odkaz nedokazuje, že meranie beží", () => {
    const n = zlyhania(data({
      udalosti: [u({ udalost: "cta_formular", den: "2026-10-03", pocet: 6 })],
      navstevy: [{ den: VCERA, pocet: 120 }],
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).not.toContain("meranie samo beží");
    expect(n.detail).toContain("len kliky na odkaz");
  });

  it("keď mlčí celý týždeň, zlyhania pošlú človeka na ten druhý riadok", () => {
    const n = zlyhania(data({ navstevy: [{ den: VCERA, pocet: 120 }] }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("Meranie formulárov nemlčí");
  });

  it("ok nesie čísla za okno, nie len slovo v poriadku", () => {
    const n = zlyhania(ZDRAVY);
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("9 klikov na formulár");
    expect(n.detail).toContain("2 odoslaných");
    // Menovateľ je POKUSOV, nie všetkých udalostí — inak je to nula z nuly.
    expect(n.detail).toContain("2 pokusoch o odoslanie");
  });

  it("nula zlyhaní z nuly POKUSOV je „neviem“, hoci udalosti prišli", () => {
    // Naživo 7. 10. 2026: včera 9× kliknutie a 4× začatý formulár, nula
    // odoslaných aj zlyhaných. Starý menovateľ (všetky udalosti) z toho robil
    // zelené „ani jedno zlyhanie pri 13 udalostiach“.
    const n = zlyhania(data({
      udalosti: [
        u({ udalost: "cta_formular", den: VCERA, pocet: 9 }),
        u({ udalost: "formular_start", den: VCERA, pocet: 4 }),
      ],
      navstevy: [{ den: VCERA, pocet: 120 }],
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("neviem");
    expect(n.detail).toContain("nikto ani nepokúsil");
    expect(n.detail).toContain("nič nedokazuje");
    // Čísla zostávajú tie isté, mení sa stav a prvá veta.
    expect(n.detail).toContain("9 klikov na formulár");
    expect(n.detail).toContain("4 začatých");
  });

  it("jedno odoslanie stačí na ok — vtedy je nula zlyhaní zistenie", () => {
    const n = zlyhania(data({
      udalosti: [
        u({ udalost: "cta_formular", den: VCERA, pocet: 9 }),
        u({ udalost: "formular_odoslany", den: VCERA, pocet: 1 }),
      ],
      navstevy: [{ den: VCERA, pocet: 120 }],
    }));
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("1 pokusoch o odoslanie");
  });
});

describe("neregistrovaný rozmer nesmie kontrolu zastaviť", () => {
  const sZlyhanim = (chybajuceRozmery: string[], riadok: Partial<UdalostRiadok> = {}) => data({
    udalosti: [
      ...ZDRAVY.udalosti,
      u({ udalost: "formular_zlyhal", den: VCERA, stranka: "/test-postury/", pocet: 2, ...riadok }),
    ],
    navstevy: ZDRAVY.navstevy,
    chybajuceRozmery,
  });

  it("bez duvod a pole stále povie koľko a kde, a prečo dôvod chýba", () => {
    const n = zlyhania(sZlyhanim(["duvod", "pole"]));
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("/test-postury/ 2×");
    expect(n.detail).toContain("nemá registrované vlastné rozmery duvod ani pole");
    expect(n.detail).toContain("Vlastné definície");
  });

  it("keď chýba len pole, hovorí o ňom jednom", () => {
    const n = zlyhania(sZlyhanim(["pole"], { duvod: "chyba_suhlas" }));
    expect(n.detail).toContain("chyba_suhlas");
    expect(n.detail).toContain("rozmer pole");
    expect(n.detail).not.toContain("ani pole");
  });

  it("keď GA4 nedá ani stránku, povie to namiesto prázdneho miesta", () => {
    const n = zlyhania(sZlyhanim(["duvod", "pole", "stranka"], { stranka: "" }));
    expect(n.detail).toContain("(stránku GA4 nedala)");
  });

  it("„(not set)“ nie je dôvod a do detailu sa nepíše", () => {
    const n = zlyhania(sZlyhanim([], { duvod: "(not set)", pole: "(not set)" }));
    expect(n.detail).not.toContain("not set");
  });
});

describe("meranie mlčí", () => {
  it("návštevy sú a udalosti nie → varovanie o pokazenom meraní, nie ok", () => {
    const n = ticho(data({ navstevy: [{ den: VCERA, pocet: 200 }, { den: "2026-10-05", pocet: 212 }] }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("412 návštev");
    expect(n.detail).toContain("pravdepodobne sa pokazilo meranie");
    expect(n.detail).toContain("formulare.js");
  });

  it("udalosti chodia → ok s číslami za celý týždeň", () => {
    const n = ticho(ZDRAVY);
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("15 udalostí");
    expect(n.detail).toContain("210 návštevách");
  });

  it("prázdne dáta sú „neviem“, nie ticho na webe", () => {
    const n = ticho(data());
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("neviem");
    expect(n.detail).toContain("property ID");
  });

  it("keď sa návštevy nedali prečítať, nula návštev sa nevydáva za prázdny web — a dôvod sa nesie", () => {
    const n = ticho(data({ navstevyChyba: "GA4 odmietla dopyt (HTTP 429): Exhausted property tokens" }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("neviem");
    expect(n.detail).toContain("návštevy sa z GA4 prečítať nedali");
    expect(n.detail).not.toContain("0 návštev");
    // Bez dôvodu sa pátranie zastaví na tom, čo o ňom nehovorí nič.
    expect(n.detail).toContain("HTTP 429");
    expect(n.detail).toContain("Exhausted property tokens");
  });

  it("udalosti chodia a návštevy chýbajú → ok, ale bez vymysleného počtu návštev a s dôvodom", () => {
    const n = ticho(data({ udalosti: ZDRAVY.udalosti, navstevyChyba: "GA4 odmietla dopyt (HTTP 400): Did you mean sessions?" }));
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("15 udalostí");
    expect(n.detail).toContain("návštevy sa z GA4 tentoraz prečítať nedali");
    expect(n.detail).toContain("Did you mean sessions?");
    expect(n.detail).not.toContain("0 návštevách");
  });

  it("len kliky na odkaz NIE SÚ dôkaz, že sa meria formulár", () => {
    // Naživo 7. 10. 2026: 40× cta_formular za tri dni, nula začatých,
    // odoslaných aj zlyhaných, 580 návštev. Starý súčet z toho robil „ok“.
    const n = ticho(data({
      udalosti: [
        u({ udalost: "cta_formular", den: VCERA, pocet: 15 }),
        u({ udalost: "cta_formular", den: "2026-10-05", pocet: 15 }),
        u({ udalost: "cta_formular", den: "2026-10-04", pocet: 10 }),
      ],
      navstevy: [{ den: VCERA, pocet: 580 }],
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("40 klikov na formulár");
    expect(n.detail).toContain("580 návštevách");
    expect(n.detail).toContain("formulare.js");
    expect(n.detail).toContain("značka formulára");
  });

  it("jeden začatý formulár stačí na ok — start visí na tom istom moste", () => {
    const n = ticho(data({
      udalosti: [
        u({ udalost: "cta_formular", den: VCERA, pocet: 9 }),
        u({ udalost: "formular_start", den: VCERA, pocet: 1 }),
      ],
      navstevy: [{ den: VCERA, pocet: 120 }],
    }));
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("10 udalostí");
  });

  it("kliky bez formulára sú varovanie aj vtedy, keď návštevy nepoznáme", () => {
    const n = ticho(data({
      udalosti: [u({ udalost: "cta_formular", den: VCERA, pocet: 7 })],
      navstevyChyba: "GA4 odmietla dopyt (HTTP 429): Exhausted property tokens",
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("7 klikov na formulár");
    expect(n.detail).not.toContain("0 návštevách");
    expect(n.detail).toContain("HTTP 429");
  });

  it("stará udalosť z formulára nedrží riadok zeleno — rozhoduje VEK, nie súčet", () => {
    // Presne tvar poruchy, pre ktorý bod 4 vznikol, len rozložený v čase:
    // 1. 10. ešte formulár meral, odvtedy chodia len kliky na odkaz. Súčet za
    // okno z toho robil „ok“ ešte šesť dní po tom, čo sa most rozbil.
    const n = ticho(data({
      udalosti: [
        u({ udalost: "formular_start", den: "2026-10-01", pocet: 4 }),
        u({ udalost: "formular_odoslany", den: "2026-10-01", pocet: 2 }),
        u({ udalost: "cta_formular", den: "2026-10-05", pocet: 20 }),
      ],
      navstevy: [{ den: "2026-10-05", pocet: 600 }],
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("naposledy 2026-10-01");
    expect(n.detail).toContain("20 klikov na odkaz");
    expect(n.detail).toContain("600 návštevách");
    expect(n.detail).toContain("formulare.js");
  });

  it("udalosť z formulára spred dvoch dní ešte na ok stačí — nedeľa nie je porucha", () => {
    const n = ticho(data({
      udalosti: [u({ udalost: "formular_start", den: "2026-10-05", pocet: 1 })],
      navstevy: [{ den: VCERA, pocet: 120 }],
    }));
    expect(n.stav).toBe("ok");
    expect(n.detail).toContain("Posledná udalosť z formulára 2026-10-05");
  });

  it("tri dni ticha pri bežiacich návštevách sú už varovanie", () => {
    const n = ticho(data({
      udalosti: [u({ udalost: "formular_start", den: "2026-10-04", pocet: 1 })],
      navstevy: [{ den: VCERA, pocet: 120 }, { den: "2026-10-05", pocet: 90 }],
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("naposledy 2026-10-04");
    // Návštevy sa počítajú LEN odvtedy — inak by číslo z dní, keď meranie
    // ešte fungovalo, nafúklo dôkaz o tichu.
    expect(n.detail).toContain("210 návštevách");
  });

  it("keď po poslednej udalosti nikto neprišiel, je to „neviem“, nie porucha", () => {
    const n = ticho(data({
      udalosti: [u({ udalost: "formular_odoslany", den: "2026-10-02", pocet: 1 })],
      navstevy: [{ den: "2026-10-01", pocet: 80 }],
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("neviem");
    expect(n.detail).toContain("ani jednu návštevu");
    expect(n.detail).not.toContain("formulare.js");
  });

  it("stará udalosť a neznáme návštevy → varovanie, ktoré nesie dôvod", () => {
    const n = ticho(data({
      udalosti: [
        u({ udalost: "formular_start", den: "2026-10-01", pocet: 2 }),
        u({ udalost: "cta_formular", den: "2026-10-05", pocet: 11 }),
      ],
      navstevyChyba: "GA4 odmietla dopyt (HTTP 429): Exhausted property tokens",
    }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("naposledy 2026-10-01");
    expect(n.detail).toContain("11 klikov na odkaz");
    expect(n.detail).toContain("HTTP 429");
    expect(n.detail).not.toContain("0 návštevách");
  });

  it("návštevy mimo okna sa nepočítajú — inak by staré číslo zakrylo ticho", () => {
    const n = ticho(data({ navstevy: [{ den: "2026-08-01", pocet: 900 }] }));
    expect(n.stav).toBe("varovanie");
    expect(n.detail).toContain("neviem");
  });
});

describe("keď dáta z GA4 vôbec neprišli", () => {
  const n = skontrolujMeranie(data({ chyba: "GA4 odmietla dopyt (HTTP 403): User does not have access" }), DNES);

  it("oba nálezy sú varovanie s dôvodom a ani jeden nie je ok", () => {
    expect(n.map((x) => x.stav)).toEqual(["varovanie", "varovanie"]);
    for (const x of n) {
      expect(x.detail).toContain("neviem");
      expect(x.detail).toContain("HTTP 403");
      expect(x.detail).toContain("User does not have access");
    }
  });

  it("kľúče sú tie isté ako pri zdravom behu — inak sa nedá povedať odkedy to nefunguje", () => {
    expect(n.map((x) => x.kluc)).toEqual(skontrolujMeranie(ZDRAVY, DNES).map((x) => x.kluc));
  });
});

describe("kľúče a názvy sú stabilné", () => {
  it("každý beh vracia tie isté dva kľúče", () => {
    const stavy = [ZDRAVY, data(), data({ chyba: "x" }), data({ navstevy: [{ den: VCERA, pocet: 5 }] })];
    for (const d of stavy) {
      expect(skontrolujMeranie(d, DNES).map((x) => x.kluc)).toEqual(["meranie:zlyhania", "meranie:ticho"]);
    }
  });
});

describe("čítanie odpovede GA4", () => {
  const odpoved = (dimenzie: string[], riadky: (string | number)[][]) => ({
    dimensionHeaders: dimenzie.map((name) => ({ name })),
    metricHeaders: [{ name: "eventCount" }],
    rows: riadky.map((r) => ({
      dimensionValues: r.slice(0, -1).map((value) => ({ value })),
      metricValues: [{ value: String(r[r.length - 1]) }],
    })),
  });

  it("rozmery sa čítajú podľa MIEN, takže ústup od duvod nerozhodí stránku", () => {
    const bohata = udalostiZGa4(odpovedZJson(odpoved(
      ["date", "eventName", "pagePath", "customEvent:duvod", "customEvent:pole"],
      [["20261006", "formular_zlyhal", "/test-postury/", "neplatne_pole", "psb-call", 2]],
    )));
    expect(bohata).toEqual([{ udalost: "formular_zlyhal", den: "2026-10-06", stranka: "/test-postury/", duvod: "neplatne_pole", pole: "psb-call", pocet: 2 }]);

    const chuda = udalostiZGa4(odpovedZJson(odpoved(
      ["date", "eventName", "pagePath"],
      [["20261006", "formular_zlyhal", "/test-postury/", 2]],
    )));
    expect(chuda[0].stranka).toBe("/test-postury/");
    expect(chuda[0].duvod).toBe("");
  });

  it("prázdna odpoveď dá prázdny zoznam, nie výnimku", () => {
    expect(udalostiZGa4(odpovedZJson({}))).toEqual([]);
    expect(udalostiZGa4(odpovedZJson(null))).toEqual([]);
    expect(navstevyZGa4(odpovedZJson({ rows: [] }))).toEqual([]);
  });

  it("riadok bez metriky má nulu a riadok bez dňa alebo udalosti vypadne", () => {
    const o = odpovedZJson({
      dimensionHeaders: [{ name: "date" }, { name: "eventName" }],
      rows: [
        { dimensionValues: [{ value: "20261006" }, { value: "cta_formular" }] },
        { dimensionValues: [{ value: "" }, { value: "cta_formular" }], metricValues: [{ value: "9" }] },
        { dimensionValues: [{ value: "20261006" }], metricValues: [{ value: "9" }] },
      ],
    });
    const r = udalostiZGa4(o);
    expect(r).toHaveLength(1);
    expect(r[0].pocet).toBe(0);
  });

  it("návštevy sa čítajú z rozmeru date a prvej metriky", () => {
    expect(navstevyZGa4(odpovedZJson({
      dimensionHeaders: [{ name: "date" }],
      rows: [{ dimensionValues: [{ value: "20261006" }], metricValues: [{ value: "120" }] }],
    }))).toEqual([{ den: "2026-10-06", pocet: 120 }]);
  });

  it("denZGa4 zvláda oba tvary a nezmysel zahodí", () => {
    expect(denZGa4("20261006")).toBe("2026-10-06");
    expect(denZGa4("2026-10-06")).toBe("2026-10-06");
    expect(denZGa4("(other)")).toBe("");
    expect(denZGa4("")).toBe("");
  });

  it("pocty sčítajú len tie štyri udalosti", () => {
    expect(pocty([
      u({ udalost: "cta_formular", den: VCERA, pocet: 3 }),
      u({ udalost: "page_view", den: VCERA, pocet: 500 }),
      u({ udalost: "formular_zlyhal", den: VCERA, pocet: 0 }),
    ])).toEqual({ cta: 3, start: 0, odoslany: 0, zlyhal: 0, spolu: 3 });
  });
});
