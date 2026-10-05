import { describe, expect, it } from "bun:test";

import { odsifrujBajty, zasifrujBajty } from "./sifra.server";

const KLUC = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i * 7)));

describe("šifrovanie fotiek", () => {
  it("tam a späť bajt po bajte, zakaždým iná šifra", async () => {
    const data = new Uint8Array(5000).map((_, i) => (i * 31) % 256);
    const a = await zasifrujBajty(data, KLUC);
    const b = await zasifrujBajty(data, KLUC);
    expect(a).not.toEqual(b);
    expect(await odsifrujBajty(a, KLUC)).toEqual(data);
  });
  it("cudzí kľúč a poškodený súbor nahlas spadnú", async () => {
    const a = await zasifrujBajty(new Uint8Array([1, 2, 3]), KLUC);
    const iny = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
    await expect(odsifrujBajty(a, iny)).rejects.toThrow();
    await expect(odsifrujBajty(new Uint8Array([1, 2, 3]), KLUC)).rejects.toThrow("poškodená");
  });
});
