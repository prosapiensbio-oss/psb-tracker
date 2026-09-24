import { describe, expect, it } from "bun:test";

import { sedeniaPoMesiacoch } from "./profil";
import type { ClientAgg } from "./compute";

const DNES = new Date("2026-09-24T10:00:00Z");
const k = (dni: string[]) => ({ sessions: dni.map((d) => ({ date: `${d}T00:00:00.000Z` })) } as unknown as ClientAgg);

describe("sedeniaPoMesiacoch", () => {
  it("spočíta tréningy v mesiaci", () => {
    const v = sedeniaPoMesiacoch(k(["2026-09-01", "2026-09-10", "2026-09-20"]), 12, DNES);
    expect(v[v.length - 1]).toEqual({ mesiac: "2026-09", pocet: 3 });
  });

  it("mesiac bez tréningu je nula, nie vynechaný riadok", () => {
    // Inak by sa dva tréningy v júli a dva v septembri čítali ako
    // pravidelné chodenie — a medzera je to jediné zaujímavé.
    const v = sedeniaPoMesiacoch(k(["2026-07-05", "2026-09-05"]), 12, DNES);
    expect(v.map((x) => x.mesiac)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(v[1].pocet).toBe(0);
  });

  it("mesiace pred prvým tréningom sa neukazujú", () => {
    const v = sedeniaPoMesiacoch(k(["2026-08-05"]), 12, DNES);
    expect(v[0].mesiac).toBe("2026-08");
  });

  it("ticho po poslednom tréningu je vidieť až podnes", () => {
    const v = sedeniaPoMesiacoch(k(["2026-06-05"]), 12, DNES);
    expect(v[v.length - 1]).toEqual({ mesiac: "2026-09", pocet: 0 });
  });

  it("klient bez tréningov nedá žiadny rad", () => {
    expect(sedeniaPoMesiacoch(k([]), 12, DNES)).toEqual([]);
  });
});
