import { describe, expect, it } from "bun:test";

import { GA4_MESACNE, nastavWebZImportu, type Ga4Mesiac } from "./marketing";

/**
 * Import z GA4 API a značky o nemeraných mesiacoch.
 *
 * Apríl a máj 2026 nemá GA4 ani jeden riadok, hoci Search Console za tie isté
 * mesiace hlási 235 klikov mesačne — najlepšie čísla, aké web mal. Nie je to
 * výpadok návštevnosti, je to výpadok merania. Nula by tvrdila opak.
 */

const mes = (m: string, novi: number): Ga4Mesiac =>
  ({ m, novi, organicSearch: novi, paidSocial: 0, organicSocial: 0, direct: 0, referral: 0, udalosti: 0 });

const najdi = (m: string) => GA4_MESACNE.find((x) => x.m === m);

describe("import GA4 a nemerané mesiace", () => {
  it("mesiac, ktorý API vôbec nepošle, si značku nechá", () => {
    nastavWebZImportu([mes("2026-07", 181)], [], [], []);
    expect(najdi("2026-04")?.chyba).toBe(true);
    expect(najdi("2026-05")?.chyba).toBe(true);
  });

  it("čiastočný mesiac ostane čiastočný aj po importe", () => {
    // Jún 2026: 21 ľudí za celý mesiac, meranie sa rozbehlo v jeho priebehu.
    // API o tom nevie a pošle len číslo.
    nastavWebZImportu([mes("2026-06", 21)], [], [], []);
    expect(najdi("2026-06")?.castocne).toBe(true);
    expect(najdi("2026-06")?.novi).toBe(21);
  });

  it("nula z API nemeraný mesiac nepremení na meraný", () => {
    nastavWebZImportu([mes("2026-04", 0)], [], [], []);
    expect(najdi("2026-04")?.chyba).toBe(true);
  });

  it("skutočné čísla značku zrušia — mesiac meraný BOL", () => {
    nastavWebZImportu([mes("2026-05", 212)], [], [], []);
    expect(najdi("2026-05")?.chyba).toBeUndefined();
    expect(najdi("2026-05")?.novi).toBe(212);
  });

  it("nový mesiac pribudne a séria ostane zoradená", () => {
    nastavWebZImportu([mes("2026-09", 200)], [], [], []);
    const m = GA4_MESACNE.map((x) => x.m);
    expect(m).toEqual([...m].sort());
    expect(najdi("2026-09")?.novi).toBe(200);
  });
});
