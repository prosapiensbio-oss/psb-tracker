import { describe, expect, it } from "bun:test";
import { jeAutomatickaOdpoved, klucAdresy, orezCitaciu, overPodpis, rozoberOdosielatela, vypocitajPodpis } from "./resendPodpis";

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

describe("odpoveď bez citácie", () => {
  it("odreže citovaný mail v slovenskom Gmaile", () => {
    const t = "Super\n\npi 6. 11. 2026 o 8:11 ProSapiens Biomechanic <prosapiens@news.prosapiens.cz>\nnapísal(a):\n\n> Koleno není viník.";
    expect(orezCitaciu(t)).toBe("Super");
  });
  it("odreže anglickú a českú hlavičku", () => {
    expect(orezCitaciu("Díky\n\nOn Thu, Nov 6, 2026 at 8:11 AM ProSapiens <x@y.cz> wrote:\n> a")).toBe("Díky");
    expect(orezCitaciu("Ahoj\nOd: ProSapiens <x@y.cz>\nPředmět: a")).toBe("Ahoj");
  });
  it("bez citácie nechá celý text a prázdny výsledok nevráti", () => {
    expect(orezCitaciu("Bolí mě koleno.\nFilip")).toBe("Bolí mě koleno.\nFilip");
    expect(orezCitaciu("> len citácia")).toBe("> len citácia");
  });
  it("Gmail s bodkou a bez je jedna adresa", () => {
    expect(klucAdresy("Prosapiens.Bio@gmail.com")).toBe("prosapiensbio@gmail.com");
    expect(klucAdresy("jana+psb@gmail.com")).toBe("jana@gmail.com");
    expect(klucAdresy("jana.nova@seznam.cz")).toBe("jana.nova@seznam.cz");
  });
});
