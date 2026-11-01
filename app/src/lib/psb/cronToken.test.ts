import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import { jeOdPlanovaca, rovnakyToken } from "./cronToken.server";

const ziadost = (hlavicka?: string) =>
  new Request("https://kokpit.test/api/x", { headers: hlavicka === undefined ? {} : { "x-cron-token": hlavicka } });

describe("rovnakyToken", () => {
  it("rovnaké áno, iné nie", () => {
    expect(rovnakyToken("abc123", "abc123")).toBe(true);
    expect(rovnakyToken("abc123", "abc124")).toBe(false);
    expect(rovnakyToken("xbc123", "abc123")).toBe(false);
  });
  it("rôzna dĺžka nie je zhoda ani keď je jeden začiatkom druhého", () => {
    expect(rovnakyToken("abc", "abc123")).toBe(false);
    expect(rovnakyToken("abc123", "abc")).toBe(false);
    expect(rovnakyToken("", "a")).toBe(false);
  });
});

describe("jeOdPlanovaca", () => {
  it("bez nastaveného tokenu neprejde nikto — ani s prázdnou hlavičkou", () => {
    expect(jeOdPlanovaca(ziadost(""), "")).toBe(false);
    expect(jeOdPlanovaca(ziadost(""), undefined)).toBe(false);
    expect(jeOdPlanovaca(ziadost(), undefined)).toBe(false);
  });
  it("chýbajúca alebo zlá hlavička neprejde, správna áno", () => {
    expect(jeOdPlanovaca(ziadost(), "tajne")).toBe(false);
    expect(jeOdPlanovaca(ziadost("zle"), "tajne")).toBe(false);
    expect(jeOdPlanovaca(ziadost("tajne"), "tajne")).toBe(true);
  });
});

describe("žiadny endpoint neporovnáva token plánovača sám", () => {
  it("v routes/api sa x-cron-token číta len cez jeOdPlanovaca", () => {
    const dir = new URL("../../routes/api/", import.meta.url).pathname;
    const zle = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .filter((f) => readFileSync(dir + f, "utf8").includes("x-cron-token"));
    expect(zle).toEqual([]);
  });
});
