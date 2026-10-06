import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Editory v public/editor sú ZOSTAVENÉ zo spoločných častí (editor/zostav.py).
 * Keby niekto zmenil jadro a zabudol zostaviť, Kokpit by nasadil starý editor
 * a nikto by to nevidel — preto tento test.
 */
const tu = join(import.meta.dir, "../../../editor");
const citaj = (p: string) => readFileSync(join(tu, p), "utf8");

describe("editor fotiek a videa", () => {
  it("public/editor je zostavený z aktuálnych častí (python3 editor/zostav.py)", () => {
    const foto = citaj("../public/editor/foto.html");
    const video = citaj("../public/editor/video.html");
    expect(foto).toContain(citaj("jadro.js"));
    expect(foto).toContain(citaj("jadro.css"));
    expect(foto).toContain(citaj("ui.css"));
    expect(foto).toContain(citaj("sklad.js"));
    expect(video).toContain(citaj("ui.css"));
    expect(video).toContain(citaj("sklad.js"));
    expect(foto).toContain(citaj("kartoteka.js"));
    expect(video).toContain(citaj("kartoteka.js"));
  });
  it("v <style> nie je HTML komentár — pokazil by prvé pravidlo štvorca", () => {
    for (const s of [citaj("../public/editor/foto.html"), citaj("../public/editor/video.html")]) {
      const styl = s.slice(s.indexOf("<style>"), s.indexOf("</style>"));
      expect(styl.includes("<!--")).toBe(false);
    }
  });
  it("v Kokpite nie sú ukážkové figúrky ani vymyslený klient", () => {
    const foto = citaj("../public/editor/foto.html");
    expect(foto.includes("figurka(")).toBe(false);
    expect(foto.includes("Albert")).toBe(false);
  });
});
