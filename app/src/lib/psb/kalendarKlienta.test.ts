import { describe, expect, it } from "bun:test";

import type { Udalost } from "./klientOsCasu";
import { mesiacKalendara, pasyBalickov, posunMesiac, triMesiace } from "./kalendarKlienta";

// Robin Martinek, 26. 11. 2026 — tie isté dáta ako v návrhu B.
const OS: Udalost[] = [
  { druh: "balicekOd", den: "2026-09-21", nazov: "Předplatné", hodin: 8, doDna: "2026-10-20" },
  { druh: "platba", den: "2026-09-21", suma: 6990, metoda: "banka" },
  { druh: "trening", den: "2026-09-21", cas: "15:00" },
  { druh: "platba", den: "2026-10-16", suma: 6990, metoda: "banka" },
  { druh: "trening", den: "2026-10-16", cas: "11:00" },
  { druh: "balicekOd", den: "2026-10-21", nazov: "Předplatné", hodin: 7, doDna: "2026-11-20" },
  { druh: "trening", den: "2026-10-22", cas: "16:00" },
  { druh: "balicekOd", den: "2026-11-20", nazov: "Doplnenie členstva", hodin: 3, doplnenie: true },
  { druh: "trening", den: "2026-11-22", cas: "9:00" },
];

describe("kalendár v profile klienta", () => {
  it("posun mesiaca cez rok", () => {
    expect(posunMesiac("2026-11", -2)).toBe("2026-09");
    expect(posunMesiac("2027-01", -1)).toBe("2026-12");
    expect(posunMesiac("2026-12", 1)).toBe("2027-01");
  });

  it("mesiac: posun od pondelka, tréningy, platby a súčty", () => {
    const m = mesiacKalendara("2026-10", OS, [], "2026-11-26");
    expect(m.posun).toBe(3); // 1. 10. 2026 je štvrtok
    expect(m.dni).toHaveLength(31);
    expect(m.treningov).toBe(2);
    expect(m.zaplatene).toBe(6990);
    expect(m.dni[15].platby).toHaveLength(1);
    expect(m.dni[20].balicky[0].hodin).toBe(7);
  });

  it("objednaný termín sa ukáže na svojom dni", () => {
    const m = mesiacKalendara("2026-11", OS, ["2026-11-27T12:00"], "2026-11-26");
    expect(m.dni[26].objednane).toEqual(["12:00"]);
    expect(m.treningov).toBe(1);
  });

  it("pásy: doplnenie bez konca beží do dneška a je otvorené", () => {
    const p = pasyBalickov(OS, "2026-11-26");
    expect(p.map((x) => [x.od, x.do, x.otvoreny])).toEqual([
      ["2026-09-21", "2026-10-20", false],
      ["2026-10-21", "2026-11-20", false],
      ["2026-11-20", "2026-11-26", true],
    ]);
  });

  it("pás sa oreže na mesiac", () => {
    const [sep, okt] = triMesiace("2026-11", OS, [], "2026-11-26");
    expect(sep.pasy).toEqual([expect.objectContaining({ od: "2026-09-21", do: "2026-09-30" })]);
    expect(okt.pasy.map((x) => [x.od, x.do])).toEqual([["2026-10-01", "2026-10-20"], ["2026-10-21", "2026-10-31"]]);
  });
});
