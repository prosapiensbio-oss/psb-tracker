import { describe, expect, it } from "bun:test";
import { jeAutomatickaOdpoved, overPodpis, rozoberOdosielatela, vypocitajPodpis } from "./resendPodpis";

const TAJ = "whsec_" + btoa("tajomstvo-na-test-1234");
const T = 1_800_000_000;

describe("webhook z Resendu", () => {
  it("správny podpis prejde, zmenené telo nie", async () => {
    const p = await vypocitajPodpis(TAJ, "msg_1", String(T), '{"a":1}');
    const zaklad = { tajomstvo: TAJ, id: "msg_1", cas: String(T), terazS: T };
    expect(await overPodpis({ ...zaklad, podpisy: `v1,${p}`, telo: '{"a":1}' })).toBe(true);
    expect(await overPodpis({ ...zaklad, podpisy: `v1,zly v1,${p}`, telo: '{"a":1}' })).toBe(true);
    expect(await overPodpis({ ...zaklad, podpisy: `v1,${p}`, telo: '{"a":2}' })).toBe(false);
  });
  it("starý podpis a chýbajúce hlavičky sa odmietnu", async () => {
    const p = await vypocitajPodpis(TAJ, "msg_1", String(T), "x");
    expect(await overPodpis({ tajomstvo: TAJ, id: "msg_1", cas: String(T), podpisy: `v1,${p}`, telo: "x", terazS: T + 301 })).toBe(false);
    expect(await overPodpis({ tajomstvo: TAJ, id: null, cas: String(T), podpisy: `v1,${p}`, telo: "x", terazS: T })).toBe(false);
    expect(await overPodpis({ tajomstvo: "", id: "a", cas: String(T), podpisy: `v1,${p}`, telo: "x", terazS: T })).toBe(false);
  });
  it("rozoberie odosielateľa a spozná automat", () => {
    expect(rozoberOdosielatela('"Jana Nová" <Jana@X.cz>')).toEqual({ meno: "Jana Nová", email: "jana@x.cz" });
    expect(rozoberOdosielatela("jana@x.cz")).toEqual({ meno: "", email: "jana@x.cz" });
    expect(jeAutomatickaOdpoved("Automatická odpověď: Jak ti je")).toBe(true);
    expect(jeAutomatickaOdpoved("Re: Jak ti je")).toBe(false);
  });
});
