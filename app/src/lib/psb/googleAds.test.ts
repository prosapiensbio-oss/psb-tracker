import { describe, expect, test } from "bun:test";

import {
  adsDopyty, adsKampane, adsMesiace, adsRiadky, adsUcty, cenaZaKlik, chybaZOdpovede, cislo,
  gaqlDopyty, gaqlKampane, mesiacZo, mikroNaKc, normCustomer, zhrnutieAds,
} from "./googleAds";

/**
 * Google Ads má tri zvláštnosti, na ktorých sa dá tvrdo naletieť: peniaze
 * v mikrách, celé čísla ako reťazce a odpoveď zabalenú do polí. Každá z nich
 * má vlastný test, lebo každá zlyhá tichým nezmyslom, nie chybou.
 */

describe("ID účtu", () => {
  test("znesie tvar s pomlčkami aj bez nich", () => {
    expect(normCustomer("410-571-5629")).toBe("4105715629");
    expect(normCustomer("4105715629")).toBe("4105715629");
    expect(normCustomer(" 410 571 5629 ")).toBe("4105715629");
  });

  test("preklep vráti prázdno, neuhádne", () => {
    // Uhádnuté ID by sa ťahalo do každého ďalšieho dopytu a Google by
    // odpovedal chybou o účte, ktorý Jerry nikdy nezadal.
    expect(normCustomer("410-571-562")).toBe("");
    expect(normCustomer("")).toBe("");
    expect(normCustomer("abc")).toBe("");
  });
});

describe("mikrá na peniaze", () => {
  test("delí miliónom", () => {
    expect(mikroNaKc("1080000000")).toBe(1080);
    expect(mikroNaKc(2180000)).toBe(2.18);
  });

  test("prázdno je nula, nie NaN", () => {
    // NaN v súčte nakladov by nakazil celý riadok a v tabuľke by svietilo
    // „NaN Kč" namiesto čísla.
    expect(mikroNaKc(undefined)).toBe(0);
    expect(mikroNaKc(null)).toBe(0);
    expect(mikroNaKc("")).toBe(0);
  });
});

describe("celé čísla ako reťazce", () => {
  test("int64 v JSON-e prichádza ako text", () => {
    expect(cislo("494")).toBe(494);
    expect(cislo(494)).toBe(494);
    expect(cislo("abc")).toBe(0);
  });
});

describe("mesiac zo segmentu", () => {
  test("'YYYY-MM-01' → 'YYYY-MM'", () => {
    expect(mesiacZo("2023-05-01")).toBe("2023-05");
    expect(mesiacZo("2026-08-01")).toBe("2026-08");
  });

  test("nezmysel vráti prázdno", () => {
    expect(mesiacZo(undefined)).toBe("");
    expect(mesiacZo("máj")).toBe("");
  });
});

describe("GAQL", () => {
  test("dopyt na kampane nesie dátum aj metriky", () => {
    const q = gaqlKampane("2025-01-01");
    expect(q).toContain("FROM campaign");
    expect(q).toContain("2025-01-01");
    expect(q).toContain("metrics.cost_micros");
    expect(q).toContain("segments.month");
  });

  test("dopyt na hľadané výrazy ide do search_term_view", () => {
    expect(gaqlDopyty("2025-01-01")).toContain("FROM search_term_view");
  });
});

describe("searchStream vracia pole dávok", () => {
  test("riadky sa vyberú zo všetkých dávok", () => {
    // Toto je tá tichá pasca: `data.results` na poli je `undefined` a kód by
    // ohlásil „žiadne dáta" pri odpovedi plnej riadkov.
    const odpoved = [
      { results: [{ campaign: { id: "1" } }, { campaign: { id: "2" } }] },
      { results: [{ campaign: { id: "3" } }] },
    ];
    expect(adsRiadky(odpoved)).toHaveLength(3);
  });

  test("znesie aj obyčajný objekt a prázdno", () => {
    expect(adsRiadky({ results: [{ a: 1 }] })).toHaveLength(1);
    expect(adsRiadky([])).toEqual([]);
    expect(adsRiadky(null)).toEqual([]);
  });
});

const riadokKampane = (id: string, mesiac: string, klikov: number, mikro: string) => ({
  campaign: { id, name: `Kampaň ${id}`, advertisingChannelType: "SEARCH", status: "PAUSED" },
  segments: { month: `${mesiac}-01` },
  metrics: { clicks: String(klikov), impressions: "1000", costMicros: mikro, conversions: 0 },
});

describe("kampane a mesiace", () => {
  test("prečíta kampaň vrátane typu a stavu", () => {
    const [k] = adsKampane([riadokKampane("11", "2023-05", 494, "1080000000")]);
    expect(k.campaignId).toBe("11");
    expect(k.typ).toBe("SEARCH");
    expect(k.stav).toBe("PAUSED");
    expect(k.naklad).toBe(1080);
    expect(k.kliky).toBe(494);
    expect(k.mesiac).toBe("2023-05");
  });

  test("riadok bez mesiaca alebo ID sa zahodí", () => {
    expect(adsKampane([{ campaign: {}, segments: {}, metrics: {} }])).toEqual([]);
  });

  test("mesiace sa sčítajú z kampaní, nie zvlášť", () => {
    // Jedna definícia na jednom mieste: keby mesiace prišli druhým dopytom,
    // prvý rozdiel medzi súčtom a rozpadom by nikto nevysvetlil.
    const m = adsMesiace(adsKampane([
      riadokKampane("11", "2023-05", 100, "200000000"),
      riadokKampane("12", "2023-05", 50, "100000000"),
      riadokKampane("11", "2023-04", 20, "50000000"),
    ]));
    expect(m).toHaveLength(2);
    expect(m[0].mesiac).toBe("2023-04");
    expect(m[1].naklad).toBe(300);
    expect(m[1].kliky).toBe(150);
  });
});

describe("hľadané výrazy", () => {
  const r = (dopyt: string, mesiac: string, klikov: number, zobrazeni: number) => ({
    searchTermView: { searchTerm: dopyt },
    segments: { month: `${mesiac}-01` },
    metrics: { clicks: String(klikov), impressions: String(zobrazeni), costMicros: "1000000", conversions: 0 },
  });

  test("ten istý výraz z dvoch skupín sa zlúči", () => {
    // Bez zlúčenia by sa jedna veta tvárila ako niekoľko rôznych dopytov
    // a rebríček by klamal.
    const v = adsDopyty([
      r("osobní trenér brno", "2023-05", 3, 40),
      r("osobní trenér brno", "2023-05", 2, 10),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].kliky).toBe(5);
    expect(v[0].zobrazenia).toBe(50);
  });

  test("radí sa podľa zobrazení", () => {
    const v = adsDopyty([r("malý", "2023-05", 1, 5), r("veľký", "2023-05", 1, 500)]);
    expect(v[0].dopyt).toBe("veľký");
  });

  test("rozdielny mesiac je rozdielny riadok", () => {
    const v = adsDopyty([r("trenér", "2023-04", 1, 10), r("trenér", "2023-05", 1, 10)]);
    expect(v).toHaveLength(2);
  });
});

describe("účty pod manažérom", () => {
  test("prečíta menu a príznak manažéra", () => {
    const u = adsUcty([
      { customerClient: { id: "4105715629", descriptiveName: "Jerry", currencyCode: "CZK", manager: true } },
      { customerClient: { id: "7933270125", descriptiveName: "PSB", currencyCode: "CZK", manager: false } },
    ]);
    expect(u).toHaveLength(2);
    expect(u[0].jeManager).toBe(true);
    expect(u[1].valuta).toBe("CZK");
  });
});

describe("cena za klik", () => {
  test("počíta z celého obdobia", () => {
    const m = [{ mesiac: "2023-05", naklad: 1080, kliky: 494, zobrazenia: 5010, konverzie: 0 }];
    expect(cenaZaKlik(m)).toBe(2.19);
  });

  test("nula klikov je pomlčka, nie nula", () => {
    // Delenie nulou by dalo Infinity a v tabuľke by svietilo „∞ Kč za klik".
    expect(cenaZaKlik([{ mesiac: "2026-08", naklad: 0, kliky: 0, zobrazenia: 0, konverzie: 0 }])).toBeNull();
  });
});

describe("zhrnutie", () => {
  const mesiac = (naklad: number, kliky: number, konverzie = 0) =>
    ({ mesiac: "2023-05", naklad, kliky, zobrazenia: 5010, konverzie });

  test("bez výdaja to povie rovno", () => {
    expect(zhrnutieAds([mesiac(0, 0)])).toContain("nič neutratilo");
  });

  test("nula konverzií sa hlási ako chýbajúce meranie, nie ako neúspech", () => {
    // Kampaň s 494 klikmi a nulou konverzií neznamená, že nikto nekonvertoval.
    // Znamená, že sa to nemeralo — a ticho by z toho urobilo zlý záver.
    const s = zhrnutieAds([mesiac(1080, 494)], "CZK");
    expect(s).toContain("1080 Kč");
    expect(s).toContain("2.19 Kč za klik");
    expect(s).toContain("nemerali");
  });

  test("s konverziami nemoralizuje", () => {
    const s = zhrnutieAds([mesiac(1080, 494, 12)], "CZK");
    expect(s).toContain("12 konverzií");
    expect(s).not.toContain("nemerali");
  });

  test("mesiace bez výdaja sa do počtu nezapočítajú", () => {
    const s = zhrnutieAds([mesiac(1080, 494), mesiac(0, 0)], "CZK");
    expect(s).toContain("1 mesiac s výdajom");
  });
});

describe("dôvod chyby sa nesmie zahodiť", () => {
  test("chyba zabalená v poli sa prečíta", () => {
    // Toto je presne to, čo 14. 8. 2026 vrátilo len „HTTP 400": searchStream
    // balí do poľa aj chyby a `data.error` na poli je undefined.
    const telo = [{
      error: {
        code: 400,
        message: "Request contains an invalid argument.",
        details: [{
          errors: [{
            errorCode: { requestError: "REQUESTED_METRICS_FOR_MANAGER" },
            message: "Metrics cannot be requested for a manager account.",
          }],
        }],
      },
    }];
    const v = chybaZOdpovede(telo, JSON.stringify(telo), 400);
    expect(v).toContain("Metrics cannot be requested for a manager account.");
    expect(v).toContain("REQUESTED_METRICS_FOR_MANAGER");
  });

  test("obalová veta sa použije, len keď nie je konkrétnejšia", () => {
    const telo = { error: { message: "Request had invalid authentication credentials." } };
    expect(chybaZOdpovede(telo, "", 401)).toContain("invalid authentication");
  });

  test("nerozobrateľná odpoveď ukáže surový text, nie len kód", () => {
    // Nerozobraná odpoveď je stále stopa. „HTTP 400" nie je nič.
    const v = chybaZOdpovede(null, "<html>Bad Request</html>", 400);
    expect(v).toContain("Bad Request");
    expect(v).toContain("400");
  });

  test("prázdne telo to povie rovno", () => {
    expect(chybaZOdpovede(null, "", 502)).toContain("bez tela odpovede");
  });
});
