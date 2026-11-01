import { describe, expect, it } from "bun:test";

import { porovnajSoSnimkou } from "./Prehlad";

const pamat = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};
const HODINA = 3600_000;

describe("Od posledného otvorenia", () => {
  it("prepnutie filtra neporovnáva s iným filtrom („klienti +34“)", () => {
    const u = pamat();
    expect(porovnajSoSnimkou(u, "Jerry", { klienti: 50 }, 0)).toBeNull();
    expect(porovnajSoSnimkou(u, "all", { klienti: 84 }, HODINA)).toBeNull();
    expect(porovnajSoSnimkou(u, "Jerry", { klienti: 51 }, 2 * HODINA)?.predtym.klienti).toBe(50);
    expect(porovnajSoSnimkou(u, "all", { klienti: 85 }, 3 * HODINA)?.predtym.klienti).toBe(84);
  });
  it("snímka sa prepíše až po 12 hodinách, aby dve otvorenia po sebe nezmazali rozdiel", () => {
    const u = pamat();
    porovnajSoSnimkou(u, "all", { klienti: 1 }, 0);
    porovnajSoSnimkou(u, "all", { klienti: 2 }, HODINA);
    expect(porovnajSoSnimkou(u, "all", { klienti: 3 }, 2 * HODINA)?.predtym.klienti).toBe(1);
    porovnajSoSnimkou(u, "all", { klienti: 4 }, 13 * HODINA);
    expect(porovnajSoSnimkou(u, "all", { klienti: 5 }, 14 * HODINA)?.predtym.klienti).toBe(4);
  });
});
