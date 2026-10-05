import { describe, expect, it } from "bun:test";

import { denVTyzdniPraha, dnesPraha, mesiacPraha, polnocPrahaUtc, posunDen, terazPraha } from "./cas";
import { neznameUdalosti } from "./compute";
import { ritualy } from "./rituals";

/**
 * DEŇ PODĽA PRAHY, NIE UTC (Jerry, 5. 10. 2026).
 *
 * Server beží v UTC, Praha je o hodinu (zima) alebo dve (leto) vpredu. Medzi
 * polnocou a druhou ráno bola appka ešte vo včerajšku: ranná pripomienka
 * v piatok o pol jednej hlásila štvrtok, týždeň sa začínal o dve hodiny
 * neskôr, „dnešné" tréningy boli včerajšie.
 */
describe("pražský deň okolo polnoci", () => {
  it("leto: 22:30 UTC je už ďalší deň", () => {
    expect(dnesPraha(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
    expect(terazPraha(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06T00:30");
  });
  it("zima: 23:30 UTC je už ďalší deň, 22:30 ešte nie", () => {
    expect(dnesPraha(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
    expect(dnesPraha(new Date("2026-01-15T22:30:00Z"))).toBe("2026-01-15");
  });
  it("deň v týždni a mesiac podľa Prahy", () => {
    // Štvrtok 27. 8. 2026 22:30 UTC = piatok 28. 8. 00:30 v Prahe.
    expect(denVTyzdniPraha(new Date("2026-08-27T22:30:00Z"))).toBe(5);
    // 31. 10. 23:30 UTC = 1. 11. v Prahe → predošlý mesiac je október.
    expect(mesiacPraha(new Date("2026-10-31T23:30:00Z"), -1)).toBe("2026-10");
    // `setMonth` z 31. 12. mínus 3 dával október („31. 9." = 1. 10.).
    expect(mesiacPraha(new Date("2026-12-31T12:00:00Z"), -3)).toBe("2026-09");
    expect(posunDen("2026-03-28", 1)).toBe("2026-03-29");
  });
});

describe("pripomienky a register po polnoci", () => {
  it("piatková vyťaženosť sa ozve už o pol jednej v noci", () => {
    const r = ritualy(new Date("2026-08-27T22:30:00Z"), {}, {}, { chybaju: [] })
      .filter((x) => x.druh === "tyzden" && x.ciel.tyzden === "2026-08-24");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.splatne)).toBe(true);
  });
  it("neznáme udalosti: pondelok 00:30 v Prahe patrí do nového týždňa", () => {
    // Nedeľa 23:45 UTC (leto) = pondelok 01:45 v Prahe.
    const v = neznameUdalosti([{ zaciatok: "2026-08-24T00:30", typ: null, nazov: "X", trener: "Jerry" }], new Date("2026-08-23T23:45:00Z"));
    expect(v.map((x) => x.pocet)).toEqual([1]);
  });
});

describe("polnoc v Prahe ako UTC okamih", () => {
  it("leto: polnoc 6. 10. v Prahe je 5. 10. o 22:00 UTC", () => {
    expect(polnocPrahaUtc(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-05T22:00:00.000Z");
  });
  it("zima a deň zmeny času berú posun pri polnoci", () => {
    expect(polnocPrahaUtc(new Date("2026-01-15T10:00:00Z"))).toBe("2026-01-14T23:00:00.000Z");
    // 29. 3. 2026 o 10:00 je už letný čas, ale polnoc bola ešte zimná (+1).
    expect(polnocPrahaUtc(new Date("2026-03-29T08:00:00Z"))).toBe("2026-03-28T23:00:00.000Z");
  });
});
