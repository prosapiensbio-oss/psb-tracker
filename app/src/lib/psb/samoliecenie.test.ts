import { describe, expect, test } from "bun:test";
import { samoliecenieAssetu } from "./samoliecenie";

describe("samoliecenieAssetu — zaseknutý PWA shell žiada starý bundle", () => {
  test("chýbajúci hashovaný JS → 200 + presmerovanie na čerstvú URL", async () => {
    const r = samoliecenieAssetu("/assets/index-DEADBEEF.js");
    expect(r).not.toBeNull();
    expect(r!.status).toBe(200);
    expect(r!.headers.get("content-type")).toContain("text/javascript");
    expect(r!.headers.get("cache-control")).toBe("no-store");
    const body = await r!.text();
    expect(body).toContain("location.replace");
    expect(body).toContain("searchParams.set('v'");
    // poistka proti slučke
    expect(body).toContain("kokpit-samoliecenie");
    expect(body).toContain("60000");
  });

  test("chunk (nie len index) sa lieči tiež", () => {
    expect(samoliecenieAssetu("/assets/router-ABC123.js")?.status).toBe(200);
  });

  test("CSS, obrázky a cudzie cesty ostávajú obyčajný 404", () => {
    expect(samoliecenieAssetu("/assets/styles-XYZ.css")).toBeNull();
    expect(samoliecenieAssetu("/assets/ikona.png")).toBeNull();
    expect(samoliecenieAssetu("/api/data.js")).toBeNull();
    expect(samoliecenieAssetu("/assets/")).toBeNull();
  });
});
