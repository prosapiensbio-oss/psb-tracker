import { describe, expect, it } from "bun:test";

import { blokPocitovky } from "./pocitovkaStranka";
import { CELKOVO, POSUN } from "./pocitovka";

describe("blok na verejnej stránke", () => {
  it("pýta sa na oblasti Z ANAMNÉZY, nie na bolesť všeobecne", () => {
    const h = blokPocitovky({ oblasti: ["krk", "hrudní páteř"] });
    expect(h).toContain("krk — jak moc to bolí?");
    expect(h).toContain("hrudní páteř — jak moc to bolí?");
    expect(h).toContain('name="oblast_meno" value="krk"');
    expect(h).toContain('name="oblast_sila_0"');
    expect(h).toContain('name="oblast_sila_1"');
  });

  it("bez anamnézy sa pýta jeden všeobecný riadok", () => {
    const h = blokPocitovky({});
    expect(h).toContain("Jak moc to bolí?");
    expect(h).toContain(`name="oblast_meno" value="${CELKOVO}"`);
  });

  it("pri kraji stupnice stojí slovom, ktorý koniec je ktorý", () => {
    const h = blokPocitovky({ oblasti: ["krk"] });
    expect(h).toContain('name="oblast_sila_0" value="0"');
    expect(h).toContain('name="oblast_sila_0" value="10"');
    expect(h).not.toContain('name="oblast_sila_0" value="11"');
    expect(h).toContain("nejlepší");
    expect(h).toContain("nejhorší");
  });

  it("na ťažkosť bežných vecí sa už nepýta", () => {
    const h = blokPocitovky({ oblasti: ["krk"] });
    expect(h).not.toContain("bežné veci");
    expect(h).not.toContain('name="tazkost"');
  });

  it("posun sú tri možnosti, nie stupnica", () => {
    const h = blokPocitovky({});
    expect(h).toContain(POSUN.text);
    for (const x of POSUN.moznosti) expect(h).toContain(`name="posun" value="${x.hodnota}"`);
    expect(h).not.toContain('name="posun" value="4"');
  });

  it("nadpis hneď hovorí, že je to dobrovoľné", () => {
    const h = blokPocitovky({});
    expect(h).toContain("Jak ti je?");
    expect(h).toContain("nepovinné");
    expect(h).not.toContain("required");
  });

  it("NIČ sa nepredklepáva — ani minulá odpoveď", () => {
    // Predvybraná odpoveď by sa odoslala aj vtedy, keď sa jej klient ani
    // nedotkol, a z „nechcelo sa mi" by spravila tvrdenie o jeho tele.
    const h = blokPocitovky({
      oblasti: ["krk"],
      minule: { krk: { hodnota: 6, datum: "2026-08-15" }, posun: { hodnota: 2, datum: "2026-08-15" } },
    });
    // `:checked` v štýle je pravidlo pre klepnutie, nie predvyber — test
    // sa musí pýtať na samotné prepínače.
    expect(h).not.toMatch(/<input[^>]*\schecked/);
  });

  it("minulá odpoveď je obrys a povie aj kedy", () => {
    const h = blokPocitovky({ oblasti: ["krk"], minule: { krk: { hodnota: 6, datum: "2026-08-15" } } });
    expect(h).toContain("minule 6 · 15. 8.");
    // Obrys = prerušovaný rámik na tom jednom čísle, nie výplň.
    expect(h).toMatch(/value="6"[\s\S]{0,200}?1px dashed/);
    expect(h).not.toMatch(/value="5"[\s\S]{0,200}?1px dashed/);
  });

  it("minulý odkaz sa ukáže ako citát, nie ako predvyplnený text", () => {
    const h = blokPocitovky({ poslednyOdkaz: { datum: "2026-08-15", text: "lepšie sa mi spí" } });
    expect(h).toContain("minule jsi napsal: „lepšie sa mi spí“");
    expect(h).toContain("<textarea name=\"poznamka\" rows=\"3\"");
    expect(h).not.toContain(">lepšie sa mi spí</textarea>");
  });

  it("odosiela sa bez JavaScriptu a klepnutie je vidno", () => {
    const h = blokPocitovky({});
    expect(h).toContain('<form method="post">');
    expect(h).toContain(".psb-stupnica input:checked + span");
    expect(h).not.toContain("<script");
    expect(h).not.toContain("onclick");
  });

  it("meno oblasti sa do HTML nevloží surové", () => {
    const h = blokPocitovky({ oblasti: ['x"><script>zle()</script>'] });
    expect(h).not.toContain("<script>zle()");
    expect(h).toContain("&lt;script&gt;");
  });

  it("po odoslaní poďakuje a nemlčí", () => {
    expect(blokPocitovky({ vdaka: true })).toContain("Díky");
  });
});
