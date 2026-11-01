import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DozorReklamKarta, MetrikyReklamy } from "./ReklamaDozor";
import { dnesPraha } from "../../lib/psb/cas";
import type { PSBData } from "../../lib/psb/types";

/**
 * Bežiaca kampaň sa na živej appke overiť nedá, kým žiadna nebeží (kontrola po
 * nasadení, 1. 11. 2026). Rozbor našiel „Cena za dopyt" raz 7 327 a raz ako dva
 * riadky s rovnakým číslom; toto stráži, že sa pri jednom dopyte vykreslí jedna.
 */
const dnes = dnesPraha();
const dozor = {
  kampane: [{ id: "k1", nazov: "Skúšobná kampaň", ciel: "OUTCOME_LEADS", stav: "ACTIVE", dennyRozpocet: 200, zaciatok: `${dnes}T08:00:00.000Z`, sady: [{ id: "s1", nazov: "Sada", stav: "ACTIVE", denny: 200 }], problemy: [], updatedAt: `${dnes}T08:00:00.000Z` }],
  dni: [{ den: dnes, kampanId: "k1", spend: 1500, kliky: 40, naStranke: 30 }],
  nastavenie: { stropMesiac: null, cielDopyt: null },
  vyhodnotenia: [],
  aktualizovane: `${dnes}T08:00:00.000Z`,
};
const data = (leads: unknown[]) => ({ reklamaDozor: dozor, leads, anomalyAck: {} }) as unknown as PSBData;
const pocet = (html: string, co: string) => html.split(co).length - 1;

describe("Dozor reklám s bežiacou kampaňou", () => {
  it("jeden dohodnutý dopyt: jeden riadok ceny, nie dva s rovnakým číslom", () => {
    const html = renderToStaticMarkup(<MetrikyReklamy data={data([{ date: dnes, name: "P", source: "reklama", status: "dohodnuty" }])} />);
    expect(pocet(html, "Cena za dopyt aj dohodnutý úvodný")).toBe(1);
    expect(pocet(html, "Cena za dohodnutý úvodný (30 dní)")).toBe(0);
    expect(pocet(html, "Cena za dopyt (30 dní)")).toBe(0);
    expect(html).not.toContain("Teraz nebeží žiadna kampaň");
  });
  it("dva dopyty, jeden dohodnutý: dve rôzne ceny s vlastným názvom", () => {
    const html = renderToStaticMarkup(<MetrikyReklamy data={data([
      { date: dnes, name: "P", source: "reklama", status: "dohodnuty" },
      { date: dnes, name: "Q", source: "reklama", status: "novy" },
    ])} />);
    expect(pocet(html, "Cena za dohodnutý úvodný (30 dní)")).toBe(1);
    expect(pocet(html, "Cena za dopyt (30 dní)")).toBe(1);
  });
  it("karta dozoru vykreslí bežiacu kampaň, nie „nič nebeží“", () => {
    const html = renderToStaticMarkup(<DozorReklamKarta data={data([])} />);
    expect(html).toContain("Skúšobná kampaň");
    expect(html).not.toContain("Žiadna kampaň práve nebeží");
  });
});
