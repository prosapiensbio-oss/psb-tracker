import { describe, expect, it } from "bun:test";

import type { PdfRiadok } from "./pdftext";
import { parseFaktura } from "./faktura";

// Prvé testy parsera faktúr vôbec — vznikli 20. 8. 2026, keď revízia našla
// položku s ks = 25 531 (zle prečítaný chvost riadku). Peniaze to nekazilo,
// lebo cena je celá suma riadku, ale číslo bolo nezmysel.

const r = (text: string, y = 0): PdfRiadok => ({ strana: 1, y, text });

const doklad = (polozkovyRiadok: string): PdfRiadok[] => [
  r("Faktura - 4026719545", 10),
  r("Prodávající: Alza.cz a.s.", 20),
  r("Datum vystavení: 25. 7. 2026", 30),
  r(polozkovyRiadok, 40),
  r("Celkem: 319,00 Kč", 50),
];

describe("parseFaktura", () => {
  it("bežný riadok: ks aj cena (predposledné číslo chvosta) sa prečítajú", () => {
    const f = parseFaktura(doklad("ABC123 Mísa TESCOMA GrandCHEF 2 263,64 527,27 110,73 21 638,00 24"));
    expect(f).not.toBeNull();
    expect(f!.polozky).toHaveLength(1);
    expect(f!.polozky[0].ks).toBe(2);
    expect(f!.polozky[0].cena).toBe(638);
  });

  it("absurdné ks (zle prečítaný chvost) sa zrazí na 1, cena zostáva", () => {
    const f = parseFaktura(doklad("XYZ Chladicí podložka pro psy 25531 263,64 263,64 55,36 21 319,00 24"));
    expect(f).not.toBeNull();
    expect(f!.polozky[0].ks).toBe(1);
    expect(f!.polozky[0].cena).toBe(319);
  });

  it("hlavička dokladu: číslo, dodávateľ, dátum, celkom", () => {
    const f = parseFaktura(doklad("ABC123 Mísa 1 263,64 263,64 55,36 21 319,00 24"));
    expect(f!.cislo).toBe("4026719545");
    expect(f!.dodavatel).toBe("Alza.cz a.s.");
    expect(f!.datum).toBe("2026-07-25");
    expect(f!.celkom).toBe(319);
  });
});
