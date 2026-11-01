import { describe, expect, it } from "bun:test";

import { vysledokSmsManagera } from "./smsBrana.server";

describe("vysledokSmsManagera — 200 ešte neznamená odoslané", () => {
  it("prijatá správa: id správy", () => {
    expect(vysledokSmsManagera(true, 200, { request_id: "r1", accepted: [{ message_id: "m1" }], rejected: [] })).toEqual({ ok: true, id: "m1" });
  });
  it("prijatá bez message_id: id požiadavky", () => {
    expect(vysledokSmsManagera(true, 200, { request_id: "r1", accepted: [{}] })).toEqual({ ok: true, id: "r1" });
  });
  it("200 s prázdnym accepted a plným rejected je chyba s dôvodom", () => {
    const v = vysledokSmsManagera(true, 200, { request_id: "r1", accepted: [], rejected: [{ reason: "invalid number" }] });
    expect(v.ok).toBe(false);
    expect(v.chyba).toContain("invalid number");
  });
  it("odmietnutie bez známeho poľa sa aj tak prezradí", () => {
    const v = vysledokSmsManagera(true, 200, { request_id: "r1", accepted: [], rejected: [{ kod: 7 } as never] });
    expect(v.ok).toBe(false);
    expect(v.chyba).toContain("kod");
  });
  it("200 s prázdnym accepted aj rejected nie je odoslané", () => {
    expect(vysledokSmsManagera(true, 200, { request_id: "r1", accepted: [], rejected: [] }).ok).toBe(false);
  });
  it("starý tvar bez polí accepted: stačí request_id", () => {
    expect(vysledokSmsManagera(true, 200, { request_id: "r1" })).toEqual({ ok: true, id: "r1" });
  });
  it("200 bez čohokoľvek a nečitateľné telo sú chyba", () => {
    expect(vysledokSmsManagera(true, 200, {}).ok).toBe(false);
    expect(vysledokSmsManagera(true, 200, null).ok).toBe(false);
  });
  it("401 nesie správu brány", () => {
    expect(vysledokSmsManagera(false, 401, { message: "bad key" })).toEqual({ ok: false, chyba: "bad key" });
    expect(vysledokSmsManagera(false, 500, null)).toEqual({ ok: false, chyba: "brána odpovedala 500" });
  });
});
