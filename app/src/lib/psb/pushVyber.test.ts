import { describe, expect, it } from "bun:test";

import { maIstNaTelefon, ROZOSTUP_HODIN } from "./pushVyber";

const TERAZ = new Date("2026-11-10T12:00:00.000Z");
const poslane = (k: string, kedy: string) => new Map([[k, kedy]]);

describe("maIstNaTelefon", () => {
  it("nová položka ide", () => {
    expect(maIstNaTelefon({ key: "a" }, new Map(), {}, TERAZ)).toBe(true);
  });
  it("raz poslaná bez zmeny mlčí — ani po týždňoch nezvoní znova", () => {
    expect(maIstNaTelefon({ key: "a" }, poslane("a", "2026-10-20T09:00:00.000Z"), {}, TERAZ)).toBe(false);
  });

  describe("platneOd", () => {
    it("novšie než posledné odoslanie = ide znova", () => {
      const r = { key: "hodiny|X|minus", platneOd: "2026-11-05T08:00:00.000Z" };
      expect(maIstNaTelefon(r, poslane(r.key, "2026-10-01T09:00:00.000Z"), {}, TERAZ)).toBe(true);
    });
    it("staršie = mlčí", () => {
      const r = { key: "gone|X", platneOd: "2026-09-01" };
      expect(maIstNaTelefon(r, poslane(r.key, "2026-10-01T09:00:00.000Z"), {}, TERAZ)).toBe(false);
    });
    it("holý deň sa porovná s časom — ďalší deň je novší, ten istý nie", () => {
      const k = "bezbalicka|X";
      expect(maIstNaTelefon({ key: k, platneOd: "2026-11-08" }, poslane(k, "2026-11-08T09:00:00.000Z"), {}, TERAZ)).toBe(false);
      expect(maIstNaTelefon({ key: k, platneOd: "2026-11-09" }, poslane(k, "2026-11-08T09:00:00.000Z"), {}, TERAZ)).toBe(true);
    });
    it("z budúcnosti sa nepočíta — inak by zvonila každý deň", () => {
      const r = { key: "b", platneOd: "2026-12-24" };
      expect(maIstNaTelefon(r, poslane("b", "2026-11-01T09:00:00.000Z"), {}, TERAZ)).toBe(false);
    });
    it("nezvoní opakovane: po znovuposlaní je čas odoslania novší a mlčí", () => {
      const r = { key: "c", platneOd: "2026-11-05T08:00:00.000Z" };
      expect(maIstNaTelefon(r, poslane("c", "2026-11-01T09:00:00.000Z"), {}, TERAZ)).toBe(true);
      const potom = poslane("c", TERAZ.toISOString());
      for (const h of [3, 6, 24, 72, 24 * 30]) {
        expect(maIstNaTelefon(r, potom, {}, new Date(TERAZ.getTime() + h * 3600000))).toBe(false);
      }
    });
    it("do rozostupu nezvoní ani s novým obsahom, po ňom áno", () => {
      const r = { key: "d", platneOd: "2026-11-10T11:00:00.000Z" };
      const pred = poslane("d", "2026-11-10T06:00:00.000Z");
      expect(maIstNaTelefon(r, pred, {}, TERAZ)).toBe(false);
      expect(maIstNaTelefon(r, pred, {}, new Date(Date.parse("2026-11-10T06:00:00Z") + ROZOSTUP_HODIN * 3600000))).toBe(true);
    });
  });

  describe("uplynulé odloženie", () => {
    const ack = { e: { note: "odlozene|2026-11-08|volat" } };
    it("odoslané pred dňom odloženia = vrátená ide znova", () => {
      expect(maIstNaTelefon({ key: "e", vratene: true }, poslane("e", "2026-11-01T09:00:00.000Z"), ack, TERAZ)).toBe(true);
    });
    it("poslaná v deň návratu už mlčí — aj zajtra", () => {
      const po = poslane("e", "2026-11-08T08:00:00.000Z");
      expect(maIstNaTelefon({ key: "e", vratene: true }, po, ack, TERAZ)).toBe(false);
      expect(maIstNaTelefon({ key: "e", vratene: true }, po, ack, new Date("2026-11-20T12:00:00Z"))).toBe(false);
    });
    it("bez odloženia sa príznak nepočíta", () => {
      expect(maIstNaTelefon({ key: "e", vratene: true }, poslane("e", "2026-11-01T09:00:00.000Z"), {}, TERAZ)).toBe(false);
    });
  });

  it("nečitateľný čas odoslania = radšej raz navyše než nikdy", () => {
    expect(maIstNaTelefon({ key: "f" }, poslane("f", "nezmysel"), {}, TERAZ)).toBe(true);
  });
});
