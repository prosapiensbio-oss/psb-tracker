import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { bezKesovaniaApi } from "./apiCache";

const r = (cesta: string, method = "GET") => new Request(`https://k${cesta}`, { method });

describe("cache-control na API", () => {
  it("GET /api/* dostane no-store a telo aj cookie ostanú", async () => {
    const v = bezKesovaniaApi(r("/api/data"), new Response('{"a":1}', { status: 201, headers: { "set-cookie": "x=1", "content-type": "application/json" } }));
    expect(v.headers.get("cache-control")).toBe("no-store");
    expect(v.status).toBe(201);
    expect(v.headers.get("set-cookie")).toBe("x=1");
    expect(await v.text()).toBe('{"a":1}');
  });
  it("vlastné kešovanie trasy (náhľady) sa neprepíše", () => {
    const v = bezKesovaniaApi(r("/api/editor-snimky"), new Response("x", { headers: { "cache-control": "private, max-age=31536000, immutable" } }));
    expect(v.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  });
  it("POST ani stránky mimo /api sa to netýka", () => {
    expect(bezKesovaniaApi(r("/api/data", "POST"), new Response("x")).headers.has("cache-control")).toBe(false);
    expect(bezKesovaniaApi(r("/assets/a.js"), new Response("x")).headers.has("cache-control")).toBe(false);
  });
  it("odpoveď bez tela (presmerovanie, 204) neprepadne", () => {
    expect(bezKesovaniaApi(r("/api/sso"), new Response(null, { status: 204 })).status).toBe(204);
    const v = bezKesovaniaApi(r("/api/sso"), new Response(null, { status: 302, headers: { location: "/" } }));
    expect(v.status).toBe(302);
    expect(v.headers.get("location")).toBe("/");
  });
  it("server.ts ju volá na každej odpovedi", () => {
    expect(readFileSync(new URL("../../server.ts", import.meta.url).pathname, "utf8")).toContain("bezKesovaniaApi(request,");
  });
});
