import { describe, expect, test } from "bun:test";

import {
  hodnotenie, poradieMerania, prilezitostiZLighthouse, riadokZOdpovede, skore,
  type PsRiadok,
} from "./pagespeed";

/**
 * Odpoveď z Lighthouse je hlboko zanorená a pri zlyhaní príde HTTP 200
 * s chybou vnútri. Kód napísaný „ako to asi vyzerá" uloží samé nuly — a nula
 * vyzerá ako nameraný výsledok, nie ako chýbajúce meranie.
 */

const odpoved = (o: Record<string, unknown> = {}) => ({
  lighthouseResult: {
    categories: {
      performance: { score: 0.47 },
      seo: { score: 0.92 },
      accessibility: { score: 0.8 },
      "best-practices": { score: 1 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: 4318.4 },
      "cumulative-layout-shift": { numericValue: 0.0123 },
      "total-blocking-time": { numericValue: 610 },
      "first-contentful-paint": { numericValue: 1902 },
      "uses-optimized-images": { title: "Obrázky v modernom formáte", details: { overallSavingsMs: 2400 } },
      "unused-css-rules": { title: "Nepoužitý CSS", details: { overallSavingsMs: 300 } },
      "sum": { title: "Drobnosť", details: { overallSavingsMs: 20 } },
    },
    ...o,
  },
});

describe("čítanie odpovede", () => {
  test("skóre 0–1 sa prepočíta na 0–100, chýbajúce zostane null", () => {
    // Nula a „nemeralo sa" musia byť rozoznateľné — inak sa nezmeraná stránka
    // tvári ako najpomalšia na webe.
    expect(skore(0.47)).toBe(47);
    expect(skore(1)).toBe(100);
    expect(skore(0)).toBe(0);
    expect(skore(undefined)).toBeNull();
    expect(skore("0.5")).toBeNull();
  });

  test("celý riadok z reálneho tvaru odpovede", () => {
    const r = riadokZOdpovede(odpoved(), "https://x.cz/a/", "mobile", "2026-08-15");
    expect(r.vykon).toBe(47);
    expect(r.seo).toBe(92);
    expect(r.postupy).toBe(100);
    expect(r.lcpMs).toBe(4318);
    expect(r.cls).toBe(0.012);
    expect(r.tbtMs).toBe(610);
    expect(r.chyba).toBe("");
  });

  test("chyba pri HTTP 200 sa nesie ďalej, nie ako nuly", () => {
    const r = riadokZOdpovede({ error: { message: "Lighthouse returned error: ERRORED_DOCUMENT_REQUEST" } }, "https://x.cz/a/", "mobile", "2026-08-15");
    expect(r.chyba).toContain("ERRORED_DOCUMENT_REQUEST");
    expect(r.vykon).toBeNull();
  });

  test("odpoveď bez lighthouseResult sa pozná", () => {
    expect(riadokZOdpovede({}, "https://x.cz/a/", "mobile", "2026-08-15").chyba).toContain("lighthouseResult");
  });

  test("príležitosti: najväčšia prvá, drobnosti von", () => {
    const p = prilezitostiZLighthouse(odpoved().lighthouseResult as Record<string, unknown>);
    expect(p[0]).toEqual({ nazov: "Obrázky v modernom formáte", usetriMs: 2400 });
    expect(p.map((x) => x.nazov)).not.toContain("Drobnosť");
  });
});

describe("čo z toho vyplýva", () => {
  const r = (o: Partial<PsRiadok> = {}): PsRiadok => ({
    url: "https://x.cz/a/", strategia: "mobile", meraneAt: "2026-08-15",
    vykon: 50, seo: 90, pristupnost: 80, postupy: 100,
    lcpMs: 1800, cls: 0.02, tbtMs: 100, fcpMs: 900,
    prilezitosti: [], chyba: "", ...o,
  });

  test("dobrý LCP nehlási problém", () => {
    expect(hodnotenie(r()).stav).toBe("dobre");
  });

  test("LCP nad 4 s je zle a veta hovorí, koľko človek čaká", () => {
    const h = hodnotenie(r({ lcpMs: 4318 }));
    expect(h.stav).toBe("zle");
    expect(h.veta).toContain("4,3 s");
    expect(h.veta).toContain("mobile");
  });

  test("hraničné pásmo medzi 2,5 a 4 s", () => {
    expect(hodnotenie(r({ lcpMs: 3100 })).stav).toBe("hranicne");
  });

  test("poskakujúci obsah zhorší verdikt aj pri dobrom čase", () => {
    const h = hodnotenie(r({ lcpMs: 1500, cls: 0.4 }));
    expect(h.stav).toBe("zle");
    expect(h.veta).toContain("poskakuje");
  });

  test("nezmerané sa nevydáva za výsledok", () => {
    expect(hodnotenie(r({ chyba: "spadlo" })).stav).toBe("nezmerane");
    expect(hodnotenie(r({ lcpMs: null })).stav).toBe("nezmerane");
  });

  test("najväčšia príležitosť je vo vete, keď stojí aspoň pol sekundy", () => {
    const h = hodnotenie(r({ prilezitosti: [{ nazov: "Obrázky", usetriMs: 2400 }] }));
    expect(h.veta).toContain("Obrázky");
    expect(h.veta).toContain("2,4 s");
    const bez = hodnotenie(r({ prilezitosti: [{ nazov: "Drobnosť", usetriMs: 200 }] }));
    expect(bez.veta).not.toContain("Drobnosť");
  });
});

describe("poradie merania", () => {
  test("najviac videné stránky idú prvé", () => {
    // Merať 79 stránok je 40 minút čakania za niečo, čo pri stránke bez
    // jediného zobrazenia nikoho nezaujíma.
    const p = poradieMerania(
      [{ url: "https://x.cz/a/" }, { url: "https://x.cz/b/" }, { url: "https://x.cz/c/" }],
      [{ url: "https://x.cz/b/", zobrazenia: 15777 }, { url: "https://x.cz/a/", zobrazenia: 200 }],
      2,
    );
    expect(p).toEqual(["https://x.cz/b/", "https://x.cz/a/"]);
  });

  test("stránka bez zobrazení nevypadne, len ide dozadu", () => {
    const p = poradieMerania([{ url: "https://x.cz/c/" }], [], 5);
    expect(p).toEqual(["https://x.cz/c/"]);
  });

  test("lomka na konci nesmie rozhodovať o spárovaní", () => {
    const p = poradieMerania(
      [{ url: "https://x.cz/a/" }, { url: "https://x.cz/b/" }],
      [{ url: "https://x.cz/b", zobrazenia: 9000 }],
      1,
    );
    expect(p).toEqual(["https://x.cz/b/"]);
  });
});
