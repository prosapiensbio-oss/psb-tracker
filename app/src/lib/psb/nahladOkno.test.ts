import { describe, expect, it } from "bun:test";

import { adresaNahladu } from "./nahladOkno";

describe("náhľad odkazu vo vrstve s krížikom (Jerry, 27. 10. 2026)", () => {
  it("odkaz cez prosapiens.cz ide do rámika ako vlastná adresa a so značkou náhľadu", () => {
    expect(adresaNahladu("https://prosapiens.cz/t/abc123")).toBe("/t/abc123?nahlad=1");
    expect(adresaNahladu("/u/xyz?nahlad=1")).toBe("/u/xyz?nahlad=1");
    expect(adresaNahladu("/v/xyz?a=1")).toBe("/v/xyz?a=1&nahlad=1");
  });
});
