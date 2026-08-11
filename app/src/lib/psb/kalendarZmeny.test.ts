import { describe, expect, test } from "bun:test";

import { ohlasitZmenu } from "./kalendarZmeny";

/**
 * Michal Knapčok, 11. 8.: „mal tréning v stredu o 15, zrušil, program to
 * nezachytil." Appka to zachytila — `zmizla_at` sa zapísalo pri synchronizácii
 * v pondelok o 17:23 — ale záznam zahodila, lebo streda bola v budúcnosti.
 * A keďže udalosť je odvtedy označená ako zmiznutá, rozdiel ju už nikdy
 * nevyrobí: ticho bolo trvalé.
 */
const DNES = "2026-08-10";
const MINULOST = "2026-08-07T15:00";
const BUDUCNOST = "2026-08-12T15:00";

describe("ohlasitZmenu", () => {
  test("zrušená BUDÚCA hodina sa hlási — presne Michalov prípad", () => {
    expect(ohlasitZmenu("zrusene", BUDUCNOST, null, DNES)).toBe(true);
  });

  test("zrušená minulá hodina sa hlási tiež", () => {
    expect(ohlasitZmenu("zrusene", MINULOST, null, DNES)).toBe(true);
  });

  test("posun do budúcnosti sa hlási — je to voľné okno", () => {
    expect(ohlasitZmenu("posunute", BUDUCNOST, "2026-08-13T15:00", DNES)).toBe(true);
  });

  test("NOVÝ termín do budúcna sa nehlási — to je plán, nie otázka", () => {
    expect(ohlasitZmenu("pridane", null, BUDUCNOST, DNES)).toBe(false);
  });

  test("tréning dopísaný spätne sa hlási", () => {
    expect(ohlasitZmenu("pridane", null, MINULOST, DNES)).toBe(true);
  });

  test("premenovanie budúcej udalosti je šum", () => {
    expect(ohlasitZmenu("premenovane", BUDUCNOST, BUDUCNOST, DNES)).toBe(false);
  });

  test("dnešok sa ešte ráta ako minulosť", () => {
    expect(ohlasitZmenu("pridane", null, `${DNES}T09:00`, DNES)).toBe(true);
  });

  test("zmena bez termínu sa nehlási — nie je o čom", () => {
    expect(ohlasitZmenu("pridane", null, null, DNES)).toBe(false);
  });
});
