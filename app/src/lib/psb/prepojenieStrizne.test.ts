import { describe, expect, it } from "bun:test";
import { naplanovaneZApi, podlaHodnoty } from "./prepojenieStrizne";

describe("prepojenie so Strižňou", () => {
  const r = (dateTime: string, o: object = {}) => ({ publicationDate: { dateTime }, providers: [{ network: "instagram", status: "PENDING" }], text: "A  B", instagramData: { type: "REEL" }, ...o });
  it("naplánované: len budúce, zoradené, bez publikovaných", () => {
    const v = naplanovaneZApi([
      r("2026-11-10T10:00:00"), r("2026-11-05T09:00:00"), r("2026-11-01T09:00:00"),
      r("2026-11-06T09:00:00", { providers: [{ network: "instagram", status: "PUBLISHED" }] }),
    ], "2026-11-03T12:00");
    expect(v.map((x) => x.datum)).toEqual(["2026-11-05T09:00", "2026-11-10T10:00"]);
    expect(v[0]).toMatchObject({ siete: ["instagram"], typ: "reel", text: "A B", koncept: false });
  });
  it("koncept sa pozná, riadok bez dátumu sa zahodí", () => {
    expect(naplanovaneZApi([r("2026-11-05T09:00:00", { draft: true })], "2026-11-03")[0].koncept).toBe(true);
    expect(naplanovaneZApi([{ text: "x" }], "2026-11-03")).toEqual([]);
  });
  it("hodnota: uloženia a zdieľania idú pred dosah", () => {
    const a = { datum: "", druh: "", hook: "", dosah: 900, ulozenia: 0, zdielania: 1, url: "" };
    const b = { ...a, dosah: 100, ulozenia: 3 };
    expect([a, b].sort(podlaHodnoty)[0]).toBe(b);
  });
});
