import { describe, expect, it } from "bun:test";

import { blokPocitovky } from "./pocitovkaStranka";
import { CELKOVO, POSUN, TAZKOST } from "./pocitovka";

describe("blok na verejnej stránke", () => {
  it("pýta sa na oblasti Z ANAMNÉZY, nie na bolesť všeobecne", () => {
    const h = blokPocitovky({ oblasti: ["krk", "hrudní páteř"] });
    expect(h).toContain("krk — koľko to bolí?");
    expect(h).toContain("hrudní páteř — koľko to bolí?");
    expect(h).toContain('name="oblast_meno" value="krk"');
    expect(h).toContain('name="oblast_sila_0"');
    expect(h).toContain('name="oblast_sila_1"');
  });

  it("bez anamnézy sa pýta jeden všeobecný riadok", () => {
    const h = blokPocitovky({});
    expect(h).toContain("Koľko ťa to bolí?");
    expect(h).toContain(`name="oblast_meno" value="${CELKOVO}"`);
  });

  it("stupnica je 0–10 a nikde ju neprekročí", () => {
    const h = blokPocitovky({ oblasti: ["krk"] });
    expect(h).toContain('name="oblast_sila_0" value="0"');
    expect(h).toContain('name="oblast_sila_0" value="10"');
    expect(h).not.toContain('name="oblast_sila_0" value="11"');
    expect(h).toContain("0 = žiadna");
    expect(h).toContain("10 = najhoršia, akú poznám");
  });

  it("bežné veci sa pýtajú na ŤAŽKOSŤ — nižšie je lepšie všade", () => {
    const h = blokPocitovky({});
    expect(h).toContain(TAZKOST.text);
    expect(h).toContain("0 = bez problémov");
    expect(h).toContain("10 = veľmi ťažko");
  });

  it("posun sú tri možnosti, nie stupnica", () => {
    const h = blokPocitovky({});
    expect(h).toContain(POSUN.text);
    for (const x of POSUN.moznosti) expect(h).toContain(`name="posun" value="${x.hodnota}"`);
    expect(h).not.toContain('name="posun" value="4"');
  });

  it("otvorená otázka je nepovinná", () => {
    const h = blokPocitovky({});
    expect(h).toContain("Čo sa zmenilo?");
    expect(h).toContain('name="poznamka"');
    expect(h).not.toContain("required");
  });

  it("odosiela sa bez JavaScriptu a klepnutie je vidno", () => {
    // Stránka sa otvára z SMS, často v okne správy. Skript, ktorý sa
    // nenačíta, by spravil z otázok mŕtve políčka; a bez `:checked + span`
    // by klient klepol a nestalo by sa nič viditeľné.
    const h = blokPocitovky({});
    expect(h).toContain('<form method="post">');
    expect(h).toContain(".psb-stupnica input:checked + span");
    expect(h).not.toContain("<script");
    expect(h).not.toContain("onclick");
  });

  it("dnešná odpoveď je predklepnutá aj v texte", () => {
    const h = blokPocitovky({
      oblasti: ["krk"],
      dnesne: { datum: "2026-09-30", oblasti: [{ oblast: "krk", sila: 4 }], tazkost: 2, posun: 3, poznamka: "lepšie sa mi spí" },
    });
    expect(h).toContain('name="oblast_sila_0" value="4" checked');
    expect(h).toContain('name="tazkost" value="2" checked');
    expect(h).toContain('name="posun" value="3" checked');
    expect(h).toContain("lepšie sa mi spí");
    expect(h).toContain("Dnes si už odpovedal");
  });

  it("meno oblasti sa do HTML nevloží surové", () => {
    const h = blokPocitovky({ oblasti: ['x"><script>zle()</script>'] });
    expect(h).not.toContain("<script>zle()");
    expect(h).toContain("&lt;script&gt;");
  });

  it("po odoslaní poďakuje a nemlčí", () => {
    expect(blokPocitovky({ vdaka: true })).toContain("Ďakujeme");
  });
});
