import { describe, expect, it } from "bun:test";

import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

import { DNI_OKNA, type FetchPodobne, meranieZGa4, stiahniMeranie } from "./webKontrolaMeranie.server";

/**
 * GA4 sa tu nevolá — kontroluje sa TVAR dopytu a to, čo modul urobí
 * s odpoveďou, ktorú nečakal.
 *
 * Práve toto je miesto, kde chyba nič nezhodí: kontrola by vrátila prázdno,
 * tabuľka by sa naplnila nulami a nočná kontrola by o pokazenom meraní
 * mlčala rovnako spoľahlivo, ako o ňom mlčal web dva týždne v septembri.
 */

type Zachytene = { url: string; telo: Record<string, unknown> };

/** Sieť, ktorá vracia pripravené odpovede po poradí a pamätá si dopyty. */
function siet(odpovede: { stav: number; telo: string }[]): { f: FetchPodobne; dopyty: Zachytene[] } {
  const dopyty: Zachytene[] = [];
  let i = 0;
  const f: FetchPodobne = async (url, init) => {
    dopyty.push({ url, telo: JSON.parse(String(init?.body || "{}")) });
    const o = odpovede[Math.min(i++, odpovede.length - 1)];
    return { ok: o.stav >= 200 && o.stav < 300, status: o.stav, text: async () => o.telo };
  };
  return { f, dopyty };
}

const ok = (telo: unknown) => ({ stav: 200, telo: JSON.stringify(telo) });
const chyba = (stav: number, sprava: string) => ({ stav, telo: JSON.stringify({ error: { message: sprava } }) });

const UDALOSTI_ODPOVED = {
  dimensionHeaders: [{ name: "date" }, { name: "eventName" }, { name: "pagePath" }],
  metricHeaders: [{ name: "eventCount" }],
  rows: [{
    dimensionValues: [{ value: "20261006" }, { value: "formular_zlyhal" }, { value: "/test-postury/" }],
    metricValues: [{ value: "2" }],
  }],
};
const NAVSTEVY_ODPOVED = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: [{ name: "sessions" }],
  rows: [{ dimensionValues: [{ value: "20261006" }], metricValues: [{ value: "120" }] }],
};

const NEREGISTROVANY = "Field customEvent:duvod is not a valid dimension.";

describe("tvar dopytu", () => {
  it("okno končí včera a začína sedem dní dozadu — dnešok je neúplný", async () => {
    const s = siet([ok(UDALOSTI_ODPOVED), ok(NAVSTEVY_ODPOVED)]);
    await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(DNI_OKNA).toBe(7);
    expect(s.dopyty[0].telo.dateRanges).toEqual([{ startDate: "2026-09-30", endDate: "2026-10-06" }]);
    expect(s.dopyty[0].url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123:runReport");
  });

  it("pýta si práve tie štyri udalosti, nie celú prevádzku webu", async () => {
    const s = siet([ok(UDALOSTI_ODPOVED), ok(NAVSTEVY_ODPOVED)]);
    await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(JSON.stringify(s.dopyty[0].telo.dimensionFilter)).toContain("formular_zlyhal");
    expect(JSON.stringify(s.dopyty[0].telo.dimensionFilter)).toContain("cta_formular");
  });

  it("druhý dopyt sú návštevy — bez nich sa ticho nedá vyhodnotiť", async () => {
    const s = siet([ok(UDALOSTI_ODPOVED), ok(NAVSTEVY_ODPOVED)]);
    const d = await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(JSON.stringify(s.dopyty[1].telo.metrics)).toContain("sessions");
    expect(d.navstevy).toEqual([{ den: "2026-10-06", pocet: 120 }]);
    expect(d.udalosti).toHaveLength(1);
    expect(d.chyba).toBe("");
  });
});

describe("neregistrovaný rozmer", () => {
  it("ustúpi po rebríku a povie, čo sa nakoniec čítať nedalo", async () => {
    const s = siet([
      chyba(400, NEREGISTROVANY),
      chyba(400, NEREGISTROVANY),
      ok(UDALOSTI_ODPOVED),
      ok(NAVSTEVY_ODPOVED),
    ]);
    const d = await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(d.chyba).toBe("");
    expect(d.chybajuceRozmery).toEqual(["duvod", "pole"]);
    expect(d.udalosti[0].duvod).toBe("");
    expect(d.udalosti[0].stranka).toBe("/test-postury/");
    // Prvý dopyt si o bohaté rozmery pýta — v deň, keď ich Jerry zaregistruje,
    // začne kontrola hlásiť dôvod bez zásahu do kódu.
    expect(JSON.stringify(s.dopyty[0].telo.dimensions)).toContain("customEvent:duvod");
    expect(JSON.stringify(s.dopyty[2].telo.dimensions)).not.toContain("customEvent");
  });

  it("odobraný prístup NIE JE dôvod na ústup — opakovanie by zahodilo pravú hlášku", async () => {
    const s = siet([chyba(403, "User does not have sufficient permissions for this property.")]);
    const d = await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(s.dopyty).toHaveLength(1);
    expect(d.chyba).toContain("HTTP 403");
    expect(d.chyba).toContain("sufficient permissions");
    expect(d.udalosti).toEqual([]);
  });
});

describe("odpoveď, ktorú nikto nečakal", () => {
  it("nerozobrateľné telo ide von aj so svojím začiatkom, nie len so stavom", async () => {
    const s = siet([{ stav: 502, telo: "<html><head><title>502 Bad Gateway</title></head>" }]);
    const d = await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(d.chyba).toContain("502");
    expect(d.chyba).toContain("502 Bad Gateway");
  });

  it("HTTP 200 s telom, ktoré nie je JSON, nie je úspech", async () => {
    const s = siet([{ stav: 200, telo: "nie som JSON" }]);
    const d = await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(d.chyba).toContain("nie som JSON");
    expect(d.udalosti).toEqual([]);
  });

  it("spadnuté spojenie je dôvod, nie výnimka pre volajúceho", async () => {
    const f: FetchPodobne = async () => { throw new Error("Network connection lost"); };
    const d = await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: f });
    expect(d.chyba).toContain("spojenie s GA4 zlyhalo");
    expect(d.chyba).toContain("Network connection lost");
  });

  it("padnuté návštevy nezahodia zlyhania, ktoré už máme v ruke — ani svoj dôvod", async () => {
    const s = siet([ok(UDALOSTI_ODPOVED), chyba(400, "Did you mean sessions?")]);
    const d = await meranieZGa4({ property: "123", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(d.chyba).toBe("");
    expect(d.udalosti).toHaveLength(1);
    expect(d.navstevy).toEqual([]);
    // Hotová veta ide von celá. Holá značka „navstevy“ v `chybajuceRozmery`
    // nechala v detaile nálezu stáť len to, že sa návštevy prečítať nedali —
    // bez stavového kódu a bez hlášky, teda bez toho, čo sa dá vyšetriť.
    expect(d.navstevyChyba).toContain("HTTP 400");
    expect(d.navstevyChyba).toContain("Did you mean sessions?");
    expect(d.chybajuceRozmery).not.toContain("navstevy");
  });

  it("bez property ID sa nikam nevolá a hovorí sa, čo doplniť", async () => {
    const s = siet([ok(UDALOSTI_ODPOVED)]);
    const d = await meranieZGa4({ property: "", token: "T", dnes: "2026-10-07", fetch: s.f });
    expect(s.dopyty).toHaveLength(0);
    expect(d.chyba).toContain("google_ga4_property");
  });
});

describe("databáza, ktorá padne", () => {
  /**
   * D1 pri chybe VYHADZUJE a `servisnyUcet`/`nastavenie` ju nezachytávajú.
   *
   * Prečo nie `as unknown as D1Database`: pretypovanie by umlčalo presne tú
   * kontrolu, ktorá povie, že fiktívna databáza má tvar tej skutočnej. Všetko
   * vyhadzuje, lebo tento test nič iné než pád neskúša.
   */
  const padajucaDb = (sprava: string): D1Database => {
    const padni = async (): Promise<never> => { throw new Error(sprava); };
    const vyrok: D1PreparedStatement = { bind: () => vyrok, first: padni, run: padni, all: padni, raw: padni };
    // `withSession` vracia objekt, nie prísľub — preto hádže synchrónne.
    const padniHned = (): never => { throw new Error(sprava); };
    return { prepare: () => vyrok, batch: padni, exec: padni, withSession: padniHned, dump: padni };
  };

  it("chyba z D1 je dôvod v „neviem“, nie výnimka pre nočnú kontrolu", async () => {
    const d = await stiahniMeranie(padajucaDb("D1_ERROR: Network connection lost"));
    expect(d.chyba).toContain("nastavenia Google sa z databázy nedali prečítať");
    expect(d.chyba).toContain("Network connection lost");
    expect(d.udalosti).toEqual([]);
    expect(d.navstevy).toEqual([]);
  });

  it("nepustí výnimku von — inak by s ňou spadli aj body 1 a 3", async () => {
    // Bez obalu v `stiahniMeranie` tu `expect(...).rejects` prešlo a do
    // `web_kontroly` by sa v ten beh nezapísalo NIČ, ani to, čo fungovalo.
    const beh = stiahniMeranie(padajucaDb("D1_ERROR: Too many API requests by single worker invocation."));
    await expect(beh).resolves.toBeDefined();
  });
});
