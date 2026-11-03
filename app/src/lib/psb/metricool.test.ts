import { describe, expect, it } from "bun:test";

import { hodnotaSerie, hodnotySerie, mesacneInstagram, obdobieMesiacaApi, pocetPoloziek, POCET_V_MESIACI, prispevkyZApi, SERIE_API, riadkyNaPrispevky, riadkyZVysledku, riadokPrehladu, rozoberOdpovedMcp, rozsahMesiaca, sondyApi, verdiktKluca, vyzeraAkoKluc } from "./metricool";

describe("Metricool cez MCP", () => {
  it("reels: ID ako v exporte, čas v ms, pomer v %", () => {
    const [r] = riadkyNaPrispevky("reel", [["3972367114673488214_48820570171", "20260826165202", "https://www.instagram.com/reel/DcgrtgjjoFW/", "Text  reelsu\n", "338", "257", "0", "1", "2", "9", null, "24.13", "5.745"]]);
    expect(r).toMatchObject({ id: "3972367114673488214_48820570171", druh: "reel", datum: "2026-08-26", mesiac: "2026-08", views: 338, dosah: 257, zdielania: 1, spend: 0, viewRate: 24.1, watchTime: 5745, hook: "Text reelsu" });
  });

  it("story má ako ID adresu, riadok bez dátumu sa zahodí", () => {
    const s = riadkyNaPrispevky("story", [["https://www.instagram.com/stories/prosapiens.biomechanic/39", "20260831101010", "", "139", "136"], ["x", null, "", "1", "1"]]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: "https://www.instagram.com/stories/prosapiens.biomechanic/39", url: "https://www.instagram.com/stories/prosapiens.biomechanic/39", views: 139, dosah: 136 });
  });

  it("mesačné čísla Instagramu tými istými názvami ako PDF zostava", () => {
    const prispevky = riadkyNaPrispevky("reel", [["a", "20260803100000", "", "", "500", "400", "1", "2", "0", "0", null, "20", "5"], ["b", "20260810100000", "", "", "300", "200", "0", "1", "0", "0", null, "20", "5"]]);
    const m = mesacneInstagram([["1514", "1", "0", "100", "90", "20260801"], ["1509", "0", "6", "50", "40", "20260831"], ["1500", "0", "0", "0", "0", "20260901"]], prispevky, "2026-08");
    const h = Object.fromEntries(m.map((x) => [x.metrika, x.hodnota]));
    expect(h).toMatchObject({ Followers: 1509, "Followers balance": -5, Views: 150, Reels: 2, "Avg reach per reel": 300, Shares: 3, Saved: 1 });
  });

  it("odpoveď MCP ako SSE aj JSON", () => {
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\\"rows\\":[[1]]}"}]}}\n\n';
    const m = rozoberOdpovedMcp(sse, "text/event-stream", 3);
    expect(riadkyZVysledku(m?.result)).toEqual({ rows: [[1]] });
    expect(rozoberOdpovedMcp('{"jsonrpc":"2.0","id":1,"error":{"message":"x"}}', "application/json", 1)?.error?.message).toBe("x");
    expect(riadkyZVysledku({ isError: true, content: [{ type: "text", text: "zlé pole" }] })).toEqual({ chyba: "zlé pole" });
  });

  it("rozsah mesiaca", () => {
    expect(rozsahMesiaca("2026-09")).toEqual({ from: "2026-09-01T00:00:00+02:00", to: "2026-09-30T23:59:59+02:00" });
    expect(rozsahMesiaca("2026-02").to).toBe("2026-02-28T23:59:59+01:00");
  });
});

describe("ostatné siete", () => {
  it("Facebook: stav na konci mesiaca, súčty, nehlásené pole sa nezapíše", async () => {
    const { SIETE, mesacneSiete, poliaSiete } = await import("./metricool");
    const fb = SIETE.find((s) => s.kanal === "Facebook")!;
    const n = poliaSiete(fb).length;
    const riadok = (den: string, sled: number, visits: number) => {
      const r: unknown[] = Array(n).fill(null);
      r[poliaSiete(fb).indexOf("FBEV17")] = String(sled);
      r[poliaSiete(fb).indexOf("FBEV03")] = String(visits);
      return [...r, den];
    };
    const m = Object.fromEntries(mesacneSiete(fb, [riadok("20260901", 330, 2), riadok("20260930", 334, 3), riadok("20261001", 999, 9)], "2026-09").map((x) => [x.metrika, x.hodnota]));
    expect(m).toEqual({ Followers: 334, "Page visits": 5 });
  });

  it("YouTube: prírastok = získaní − stratení; 403 na značku sa spozná", async () => {
    const { SIETE, mesacneSiete, poliaSiete, jeInaZnacka } = await import("./metricool");
    const yt = SIETE.find((s) => s.kanal === "YouTube")!;
    const p = poliaSiete(yt);
    const r = (g: number, l: number, den: string) => { const x: unknown[] = Array(p.length).fill(null); x[p.indexOf("YTEV05")] = g; x[p.indexOf("YTEV06")] = l; return [...x, den]; };
    const m = Object.fromEntries(mesacneSiete(yt, [r(3, 1, "20260905"), r(1, 0, "20260920")], "2026-09").map((x) => [x.metrika, x.hodnota]));
    expect(m["Followers balance"]).toBe(3);
    expect(jeInaZnacka(`Metricool: 403 Forbidden … "Access denied to blog: '2101108'"`)).toBe(true);
  });
});

describe("API Metricoolu: kľúč a prehľad (3. 11. 2026)", () => {
  it("kľúč sa posudzuje podľa odpovede a každá chyba povie, čo robiť", () => {
    expect(verdiktKluca(200)).toEqual({ ok: true });
    expect(verdiktKluca(401)).toMatchObject({ ok: false, chyba: expect.stringContaining("neprijal") });
    expect(verdiktKluca(403)).toMatchObject({ ok: false, chyba: expect.stringContaining("Advanced") });
    expect(verdiktKluca(500)).toMatchObject({ ok: false, chyba: expect.stringContaining("500") });
    expect(vyzeraAkoKluc("abc def ghi")).toBe(false);
    expect(vyzeraAkoKluc("kratky")).toBe(false);
    expect(vyzeraAkoKluc("abcdef123456")).toBe(true);
  });
  it("obdobie je 90 dní dozadu v pražskom čase", () => {
    const s = sondyApi("2026-11-03").find((x) => x.id === "recenzie")!;
    expect(s.parametre.from).toBe("2026-08-05T00:00:00+01:00");
    expect(s.parametre.to).toBe("2026-11-03T23:59:59+01:00");
  });
  it("počet z poľa, z data aj z mapy; nič iné sa netvári ako nula", () => {
    expect(pocetPoloziek([1, 2])).toBe(2);
    expect(pocetPoloziek({ data: [1] })).toBe(1);
    expect(pocetPoloziek({ Brno: 3, Praha: 1 })).toBe(2);
    expect(pocetPoloziek(null)).toBe(null);
  });
  it("riadok: chyba nesie začiatok odpovede, chýbajúce povolenie nie je úspech, obsah sa nevracia", () => {
    const s = sondyApi("2026-11-03").find((x) => x.id === "komentare")!;
    expect(riadokPrehladu(s, 403, null, "Forbidden: plan").poznamka).toContain("403: Forbidden");
    expect(riadokPrehladu(s, 0, null, "").poznamka).toContain("neodpovedal");
    expect(riadokPrehladu(s, 200, { data: [] }, "", ["instagram_manage_comments"])).toMatchObject({ ok: false, pocet: null });
    const ok = riadokPrehladu(s, 200, { data: [{ text: "tajné" }] }, "");
    expect(ok).toMatchObject({ ok: true, pocet: 1 });
    expect(JSON.stringify(ok)).not.toContain("tajné");
  });
});

describe("API Metricoolu: mesiac v tvare, aký Kokpit už má (porovnané s októbrom 2026: 43 z 43 príspevkov, 50 z 50 metrík)", () => {
  it("obdobie má pražský posun, október začína letným a končí zimným", () => {
    expect(obdobieMesiacaApi("2026-10")).toEqual({ from: "2026-10-01T00:00:00+02:00", to: "2026-10-31T23:59:59+01:00", timezone: "Europe/Prague" });
    expect(obdobieMesiacaApi("2026-02").to).toBe("2026-02-28T23:59:59+01:00");
  });
  it("reel: id ako v exporte, view rate z preskočenia, čas v ms", () => {
    const [r] = prispevkyZApi("reel", [{ reelId: "401_488", publishedAt: { dateTime: "2026-10-29T17:01:40" }, url: "u", content: "A  B", views: 391, reach: 293, saved: 0, shares: 1, comments: 2, likes: 8, reelsSkipRate: 52.5, averageWatchTime: 8.583 }]);
    expect(r).toMatchObject({ id: "401_488", druh: "reel", datum: "2026-10-29", mesiac: "2026-10", hook: "A B", views: 391, dosah: 293, viewRate: 47.5, watchTime: 8583 });
  });
  it("príbeh bez adresy sa zahodí, adresa je jeho id", () => {
    const s = prispevkyZApi("story", [{ permalink: "https://x/1", publishedAt: { dateTime: "2026-10-30T11:59:53" }, impressions: 90, reach: 85 }, { publishedAt: { dateTime: "2026-10-30T11:59:53" }, reach: 1 }]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: "https://x/1", url: "https://x/1", views: 90, dosah: 85 });
  });
  it("posledná hodnota je najnovšia, aj keď API radí od nej; prázdna suma je 0, prázdna posledná sa nezapíše", () => {
    const f = SERIE_API.find((s) => s.ako === "posledna")!;
    const g = SERIE_API.find((s) => s.ako === "sucet")!;
    const b = hodnotySerie({ data: [{ values: [{ dateTime: "2026-10-31T12:00:00+0100", value: 1566 }, { dateTime: "2026-10-30T12:00:00+0100", value: 1560 }] }] });
    expect(hodnotaSerie(f, b)).toBe(1566);
    expect(hodnotaSerie(g, b)).toBe(3126);
    expect(hodnotaSerie(g, [])).toBe(0);
    expect(hodnotaSerie(f, [])).toBeNull();
    expect(hodnotySerie({ data: [{ metric: "x", values: [] }] })).toEqual([]);
    expect(hodnotySerie(null)).toEqual([]);
  });
  it("rozdiel: získaní mínus stratení", () => {
    const y = SERIE_API.find((s) => s.minus)!;
    expect(hodnotaSerie(y, [{ dateTime: "d", value: 5 }], [{ dateTime: "d", value: 2 }])).toBe(3);
  });
  it("počet v mesiaci berie len daný mesiac", () => {
    expect(POCET_V_MESIACI([{ publishedAt: { dateTime: "2026-10-02T1" } }, { publishedAt: { dateTime: "2026-09-02T1" } }], "2026-10")).toBe(1);
  });
});
