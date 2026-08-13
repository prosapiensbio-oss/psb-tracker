import { describe, expect, it } from "bun:test";

import { ga4Mesiace, gscMesiace, gscRebricek, mesiacZGa4, narokyJwt, normProperty, normSite, odKedy, prilezitosti, soZamerom, clanky, zariadenia, ga4Strany, zhrnutieWebu } from "./google";

const kanal = (mesiac: string, kanal: string, novi: number) =>
  ({ dimensionValues: [{ value: mesiac }, { value: kanal }], metricValues: [{ value: String(novi) }] });

describe("GA4 → mesiace", () => {
  it("rozdelí kanály do stĺpcov a spočíta nových", () => {
    const [m] = ga4Mesiace({
      rows: [
        kanal("202607", "Organic Search", 120),
        kanal("202607", "Paid Social", 40),
        kanal("202607", "Direct", 30),
      ],
    });
    expect(m.mesiac).toBe("2026-07");
    expect(m.organicSearch).toBe(120);
    expect(m.paidSocial).toBe(40);
    expect(m.direct).toBe(30);
    expect(m.novi).toBe(190);
  });

  it("kanál bez vlastného stĺpca sa do nových napočíta", () => {
    // Ručný export počítal `novi` ako súčet VŠETKÝCH kanálov. Keby sa Email
    // zahodil, API by hlásilo menej návštevníkov než CSV za ten istý mesiac.
    const [m] = ga4Mesiace({ rows: [kanal("202607", "Organic Search", 100), kanal("202607", "Email", 25)] });
    expect(m.novi).toBe(125);
    expect(m.organicSearch).toBe(100);
  });

  it("nezáleží na veľkosti písmen v názve kanála", () => {
    const [m] = ga4Mesiace({ rows: [kanal("202607", "paid social", 40)] });
    expect(m.paidSocial).toBe(40);
  });

  it("kľúčové udalosti sa priradia k správnemu mesiacu", () => {
    const v = ga4Mesiace(
      { rows: [kanal("202606", "Direct", 10), kanal("202607", "Direct", 20)] },
      { rows: [{ dimensionValues: [{ value: "202607" }], metricValues: [{ value: "3" }] }] },
    );
    expect(v.find((x) => x.mesiac === "2026-06")!.udalosti).toBe(0);
    expect(v.find((x) => x.mesiac === "2026-07")!.udalosti).toBe(3);
  });

  it("chýbajúce kľúčové udalosti nie sú chyba", () => {
    const v = ga4Mesiace({ rows: [kanal("202607", "Direct", 10)] });
    expect(v[0].udalosti).toBe(0);
  });

  it("mesiace idú od najstaršieho", () => {
    const v = ga4Mesiace({ rows: [kanal("202607", "Direct", 1), kanal("202601", "Direct", 1)] });
    expect(v.map((x) => x.mesiac)).toEqual(["2026-01", "2026-07"]);
  });

  it("prázdna odpoveď nie je pád", () => {
    expect(ga4Mesiace({})).toEqual([]);
  });

  it("mesiac v inom tvare sa preskočí, nie prevezme", () => {
    expect(mesiacZGa4("2026-07")).toBe("");
    expect(mesiacZGa4("202607")).toBe("2026-07");
    expect(ga4Mesiace({ rows: [kanal("(other)", "Direct", 5)] })).toEqual([]);
  });
});

describe("Search Console", () => {
  it("dni sa zlúčia na mesiace", () => {
    const v = gscMesiace({
      rows: [
        { keys: ["2026-07-01"], clicks: 3, impressions: 100 },
        { keys: ["2026-07-15"], clicks: 2, impressions: 50 },
        { keys: ["2026-08-01"], clicks: 1, impressions: 10 },
      ],
    });
    expect(v).toEqual([
      { mesiac: "2026-07", kliky: 5, zobrazenia: 150 },
      { mesiac: "2026-08", kliky: 1, zobrazenia: 10 },
    ]);
  });

  it("CTR sa prepočíta na percentá a pozícia zaokrúhli", () => {
    const [r] = gscRebricek({ rows: [{ keys: ["fascie"], clicks: 4, impressions: 108, ctr: 0.037, position: 12.44 }] });
    expect(r.kluc).toBe("fascie");
    expect(r.ctr).toBe(3.7);
    expect(r.pozicia).toBe(12.4);
  });

  it("rebríček je zoradený podľa klikov", () => {
    const v = gscRebricek({
      rows: [
        { keys: ["b"], clicks: 1, impressions: 500 },
        { keys: ["a"], clicks: 9, impressions: 20 },
      ],
    });
    expect(v.map((x) => x.kluc)).toEqual(["a", "b"]);
  });

  it("riadok bez kľúča sa zahodí", () => {
    expect(gscRebricek({ rows: [{ keys: [""], clicks: 5 }] })).toEqual([]);
  });
});

describe("adresa webu", () => {
  it("holá doména znamená doménové vlastníctvo", () => {
    expect(normSite("prosapiens.cz")).toBe("sc-domain:prosapiens.cz");
    expect(normSite("www.prosapiens.cz")).toBe("sc-domain:prosapiens.cz");
  });

  it("predponové vlastníctvo si nechá protokol a dostane lomítko", () => {
    expect(normSite("https://prosapiens.cz")).toBe("https://prosapiens.cz/");
    expect(normSite("https://prosapiens.cz/")).toBe("https://prosapiens.cz/");
  });

  it("hotový sc-domain sa nechá tak", () => {
    expect(normSite("sc-domain:prosapiens.cz")).toBe("sc-domain:prosapiens.cz");
  });
});

describe("GA4 property", () => {
  it("prijme holé číslo aj celú cestu", () => {
    expect(normProperty("123456789")).toBe("123456789");
    expect(normProperty("properties/123456789")).toBe("123456789");
  });

  it("meracie ID G-XXXX nie je property — to je iné číslo", () => {
    expect(normProperty("G-ABC123")).toBe("");
  });
});

describe("rozsah a JWT", () => {
  it("odKedy vráti prvý deň mesiaca pred N mesiacmi vrátane tohto", () => {
    expect(odKedy(new Date("2026-08-13T00:00:00Z"), 12)).toBe("2025-09-01");
    expect(odKedy(new Date("2026-08-13T00:00:00Z"), 1)).toBe("2026-08-01");
  });

  it("iat je v minulosti — hodiny Cloudflare a Google nie sú tie isté", () => {
    const teraz = 1_760_000_000_000;
    const n = narokyJwt("sa@projekt.iam.gserviceaccount.com", teraz);
    expect(Number(n.iat)).toBeLessThan(Math.floor(teraz / 1000));
    expect(Number(n.exp) - Number(n.iat)).toBe(3600);
    expect(n.aud).toBe("https://oauth2.googleapis.com/token");
  });
});

describe("zhrnutie webu", () => {
  const m = (mm: string, novi: number, paid = 0, extra = {}) => ({ m: mm, novi, paidSocial: paid, ...extra });

  it("pomenuje podiel platenej reklamy aj jej najsilnejší mesiac", () => {
    const t = zhrnutieWebu([m("2025-04", 694, 197), m("2025-05", 1224, 427), m("2025-06", 716, 231)]);
    expect(t).toContain("855");        // 197 + 427 + 231
    expect(t).toContain("2025-05");
  });

  it("bez reklamy to povie priamo", () => {
    expect(zhrnutieWebu([m("2026-01", 441), m("2026-02", 380)])).toContain("ani koruna");
  });

  it("nemerané mesiace do súčtu nejdú", () => {
    const t = zhrnutieWebu([m("2026-03", 149), m("2026-04", 0, 0, { chyba: true }), m("2026-05", 0, 0, { chyba: true })]);
    expect(t).toContain("149");
  });

  it("čiastočný mesiac nestiahne základ", () => {
    // Jún 2026 mal 21 ľudí, lebo sa meralo len časť mesiaca. Keby vstúpil do
    // mediánu, „základ“ by klesol na hodnotu, ktorá nikdy neplatila.
    const t = zhrnutieWebu([
      m("2025-10", 315), m("2025-11", 272), m("2025-12", 350), m("2026-06", 21, 0, { castocne: true }),
    ]);
    expect(t).toContain("315");
    expect(t).not.toContain("21 nových mesačne");
  });

  it("pri dvoch mesiacoch sa základ netvrdí — nie je z čoho", () => {
    expect(zhrnutieWebu([m("2026-01", 441), m("2026-02", 380)])).not.toContain("základ");
  });

  it("prázdne obdobie nevyrobí vetu", () => {
    expect(zhrnutieWebu([])).toBe("");
    expect(zhrnutieWebu([m("2026-04", 0, 0, { chyba: true })])).toBe("");
  });
});

describe("odvodené pohľady na vyhľadávanie", () => {
  const d = (dopyt: string, kliky: number, zobrazenia: number, ctr: number, pozicia = 5) =>
    ({ dopyt, kliky, zobrazenia, ctr, pozicia });

  it("príležitosť je veľa videní a takmer žiadny preklik", () => {
    const v = prilezitosti([
      d("fasce", 2, 3959, 0.05),
      d("anatomické vlaky", 148, 962, 15.38),   // klikajú → nie je to príležitosť
      d("scm sval", 0, 659, 0),
      d("okrajová téma", 0, 40, 0),             // málo videní → nestojí za obsah
    ]);
    expect(v.map((x) => x.dopyt)).toEqual(["fasce", "scm sval"]);
  });

  it("dopyt so zámerom kúpiť pozná trénera aj Brno", () => {
    const v = soZamerom([
      d("osobní trenér brno", 2, 8, 25),
      d("fascie", 0, 5000, 0),
      d("individuální trénink", 0, 9, 0),
    ]);
    expect(v.map((x) => x.dopyt)).toEqual(["individuální trénink", "osobní trenér brno"]);
  });

  it("články vynechajú servisné stránky", () => {
    const v = clanky([
      { url: "/", kliky: 405, zobrazenia: 9000 },
      { url: "/kontakt/", kliky: 10, zobrazenia: 800 },
      { url: "/spiral-line/", kliky: 120, zobrazenia: 700 },
      { url: "https://www.prosapiens.cz/fascie/?utm=x", kliky: 90, zobrazenia: 600 },
    ]);
    expect(v.map((x) => x.url)).toEqual(["/spiral-line/", "https://www.prosapiens.cz/fascie/?utm=x"]);
  });

  it("zariadenia sa preložia a zoradia podľa klikov", () => {
    const v = zariadenia({ rows: [
      { keys: ["DESKTOP"], clicks: 861, impressions: 40348 },
      { keys: ["MOBILE"], clicks: 1459, impressions: 57035 },
      { keys: ["TABLET"], clicks: 0, impressions: 0 },
    ] });
    expect(v.map((x) => x.zariadenie)).toEqual(["Mobil", "Stolný počítač"]);
    expect(v[0].kliky).toBe(1459);
  });

  it("stránky z GA4 idú od najčítanejšej", () => {
    const v = ga4Strany({ rows: [
      { dimensionValues: [{ value: "/a/" }], metricValues: [{ value: "10" }] },
      { dimensionValues: [{ value: "/b/" }], metricValues: [{ value: "90" }] },
      { dimensionValues: [{ value: "" }], metricValues: [{ value: "5" }] },
    ] });
    expect(v.map((x) => x.url)).toEqual(["/b/", "/a/"]);
  });

  it("prázdny vstup nevyrobí nič a nepadne", () => {
    expect(prilezitosti([])).toEqual([]);
    expect(soZamerom([])).toEqual([]);
    expect(clanky([])).toEqual([]);
    expect(zariadenia({})).toEqual([]);
  });
});
