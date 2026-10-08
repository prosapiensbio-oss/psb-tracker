import { describe, expect, it } from "bun:test";

import { mesacneInstagram, riadkyNaPrispevky, riadkyZVysledku, rozoberOdpovedMcp, rozsahMesiaca } from "./metricool";

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
