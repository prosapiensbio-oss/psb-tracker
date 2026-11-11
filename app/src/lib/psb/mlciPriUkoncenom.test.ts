import { describe, expect, it } from "bun:test";

import { mlciPriUkoncenom } from "./kalendarZmeny";
import { normName } from "./format";

const neaktivni = new Set([normName("Radek Balaž")]);
describe("mlciPriUkoncenom", () => {
  it("budúci termín ukončeného klienta sa nehlási", () => {
    expect(mlciPriUkoncenom({ druh: "zrusene", klient: "Radek Balaž", pred: "2026-11-24T13:30" }, "2026-11-10T19:00", neaktivni, normName)).toBe(true);
  });
  it("minulý tréning ukončeného klienta sa hlási ďalej", () => {
    expect(mlciPriUkoncenom({ druh: "zrusene", klient: "Radek Balaž", pred: "2026-10-01T13:30" }, "2026-11-10T19:00", neaktivni, normName)).toBe(false);
  });
  it("aktívny klient sa hlási vždy", () => {
    expect(mlciPriUkoncenom({ druh: "zrusene", klient: "Jan Kral", pred: "2026-11-24T13:30" }, "2026-11-10T19:00", neaktivni, normName)).toBe(false);
  });
  it("posun ani pridanie sa netýka", () => {
    expect(mlciPriUkoncenom({ druh: "posunute", klient: "Radek Balaž", pred: "2026-11-24T13:30" }, "2026-11-10T19:00", neaktivni, normName)).toBe(false);
  });
});
