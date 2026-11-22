import { describe, expect, it } from "bun:test";
import { ponukaStrankaHtml } from "./ponukaStranka";

/** Ponuka na úvodný so stránkou pred úvodným (Leon, 22. 11. 2026). */
describe("ponuka na úvodný", () => {
  const cas = { id: "a", trener: "Jerry", zaciatok: "2026-11-25T10:00", koniec: "2026-11-25T11:00" };
  const zaklad = { token: "AbCdEfGhJkMn", oslovenie: "Leone", trener: "Jerry", logoUrl: "/logo.svg", typ: "uvodny" };

  it("pri výbere povie cenu a že adresa príde po výbere", () => {
    const h = ponukaStrankaHtml({ ...zaklad, stav: { druh: "vyber", volne: [cas], platiDo: "2026-11-29" }, uvod: { url: "https://x.cz/u/abc", cena: null } });
    expect(h).toContain("úvodní lekce trvá hodinu a stojí 1 100 Kč");
    expect(h).toContain("Po výběru ti ukážeme informace o úvodní lekci");
  });

  it("zadarmo sa povie slovom", () => {
    const h = ponukaStrankaHtml({ ...zaklad, stav: { druh: "vyber", volne: [cas], platiDo: "2026-11-29" }, uvod: { url: "https://x.cz/u/abc", cena: 0 } });
    expect(h).toContain("a je zdarma");
  });

  it("po výbere vedie na stránku pred úvodným", () => {
    const h = ponukaStrankaHtml({ ...zaklad, stav: { druh: "vybrane", cas }, uvod: { url: "https://x.cz/u/abc", cena: 1100 } });
    expect(h).toContain('href="https://x.cz/u/abc"');
    expect(h).toContain(">Informace o úvodní lekci</a>");
    expect(h).toContain("Než přijdeš, otevři si prosím informace o úvodní lekci");
  });

  it("bežná ponuka bez úvodu ostáva, ako bola", () => {
    const h = ponukaStrankaHtml({ ...zaklad, typ: "trening", stav: { druh: "vybrane", cas } });
    expect(h).not.toContain("/u/");
    expect(h).toContain("Přidat do kalendáře");
  });
});
