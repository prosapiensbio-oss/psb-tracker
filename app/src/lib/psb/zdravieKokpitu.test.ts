import { describe, expect, it } from "bun:test";

import {
  OCAKAVANE_AUTOMATY, sekciaAutomatov, sekciaChyb, sekciaRozporov,
  stavAutomatu, suhrnZdravia, vek, zdravieKokpitu, type VstupZdravia,
} from "./zdravieKokpitu";

const TERAZ = "2026-10-11T10:00:00.000Z";
const beh = (automat: string, poslednyOk: string | null, ok = true, chyba?: string) => ({
  automat, kedy: poslednyOk || TERAZ, ok, poslednyOk, chyba,
});
const ZAKLAD: VstupZdravia = { teraz: TERAZ, behy: [], chybyPrehliadaca: [], rozpory: [] };

describe("stavAutomatu", () => {
  it("rozhoduje posledný ÚSPECH, nie posledná chyba", () => {
    // Spadol teraz, ale ráno prešiel — jedna chyba nie je rozbitý automat.
    expect(stavAutomatu(beh("kalendar", "2026-10-11T06:00:00.000Z", false, "HTTP 500"), TERAZ)).toBe("ok");
  });
  it("dva dni bez úspechu je nález", () => {
    expect(stavAutomatu(beh("kalendar", "2026-10-10T09:00:00.000Z"), TERAZ)).toBe("ok");   // 25 h
    expect(stavAutomatu(beh("kalendar", "2026-10-09T09:00:00.000Z"), TERAZ)).toBe("pozor"); // 49 h
  });
  it("automat, ktorý ani raz neprešiel, je nález", () => {
    expect(stavAutomatu(beh("kalendar", null, false, "spadlo"), TERAZ)).toBe("pozor");
  });
  it("automat, o ktorom appka nevie, je NEVIEM — nie v poriadku", () => {
    expect(stavAutomatu(undefined, TERAZ)).toBe("nevie");
  });
});

describe("sekciaAutomatov", () => {
  it("vymenuje aj tie, ktoré mlčia — inak by chýbajúci automat nebolo vidieť", () => {
    const s = sekciaAutomatov({ ...ZAKLAD, behy: [beh("kalendar", TERAZ)] });
    expect(s.riadky).toHaveLength(OCAKAVANE_AUTOMATY.length);
    expect(s.riadky.find((r) => r.nazov === "Snímka kalendára")?.stav).toBe("ok");
    expect(s.riadky.filter((r) => r.stav === "nevie").length).toBe(OCAKAVANE_AUTOMATY.length - 1);
    expect(s.stav).toBe("nevie");
  });

  it("chybu posledného behu ukáže ako detail", () => {
    const s = sekciaAutomatov({ ...ZAKLAD, behy: [beh("push", "2026-10-11T06:00:00.000Z", false, "HTTP 500: padlo")] });
    expect(s.riadky.find((r) => r.nazov === "Notifikácie na telefón")?.detail).toContain("HTTP 500");
  });

  it("mená sú po ľudsky, nie kľúče", () => {
    const s = sekciaAutomatov({ ...ZAKLAD, behy: [beh("kontrola-webu-formulare", TERAZ)] });
    expect(s.riadky.some((r) => r.nazov === "Kontrola webu — formuláre")).toBe(true);
    expect(s.riadky.some((r) => r.nazov.includes("kontrola-webu"))).toBe(false);
  });
});

describe("vek", () => {
  it("hovorí po ľudsky", () => {
    expect(vek(0.5)).toBe("pred chvíľou");
    expect(vek(5)).toBe("pred 5 h");
    expect(vek(50)).toBe("pred 2 dňami");
  });
});

describe("sekciaChyb a sekciaRozporov", () => {
  it("žiadny pád je v poriadku, pády sú nález aj s ukážkou", () => {
    expect(sekciaChyb(ZAKLAD).riadky[0].stav).toBe("ok");
    const s = sekciaChyb({ ...ZAKLAD, chybyPrehliadaca: [{ kedy: "2026-10-10T08:00:00Z", sprava: "undefined is not a function" }] });
    expect(s.riadky[0].stav).toBe("pozor");
    expect(s.riadky[0].detail).toContain("undefined is not a function");
  });

  it("neporovnané NIE JE sediace", () => {
    const s = sekciaRozporov({ ...ZAKLAD, rozpory: [{ nazov: "Balíčky", pocet: null }, { nazov: "Dochádzka", pocet: 0 }, { nazov: "Platby", pocet: 3 }] });
    expect(s.riadky.map((r) => r.stav)).toEqual(["nevie", "ok", "pozor"]);
    expect(s.riadky[0].hodnota).toBe("neporovnané");
    expect(s.stav).toBe("pozor");
  });
});

describe("suhrnZdravia", () => {
  it("nález prebije neznáme, neznáme prebije ticho", () => {
    const vsetkoOk = zdravieKokpitu({
      ...ZAKLAD,
      behy: OCAKAVANE_AUTOMATY.map((a) => beh(a, TERAZ)),
      rozpory: [{ nazov: "Balíčky", pocet: 0 }],
    });
    expect(suhrnZdravia(vsetkoOk)).toEqual({ veta: "všetko beží", stav: "ok" });

    const chyba = zdravieKokpitu({ ...ZAKLAD, behy: OCAKAVANE_AUTOMATY.map((a) => beh(a, TERAZ)), chybyPrehliadaca: [{ kedy: TERAZ, sprava: "x" }] });
    expect(suhrnZdravia(chyba).stav).toBe("pozor");
    expect(suhrnZdravia(chyba).veta).toContain("1 vec");
  });
});
