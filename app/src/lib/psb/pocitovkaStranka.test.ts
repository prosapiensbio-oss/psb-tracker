import { describe, expect, it } from "bun:test";

import { blokPocitovky } from "./pocitovkaStranka";
import { POCITOVKA } from "./pocitovka";

describe("blok na verejnej stránke", () => {
  it("nesie všetky tri otázky a stupnicu 1–10", () => {
    const h = blokPocitovky({});
    for (const o of POCITOVKA) {
      expect(h).toContain(o.text);
      expect(h).toContain(`name="${o.id}" value="10"`);
      expect(h).toContain(`name="${o.id}" value="1"`);
    }
    expect(h).not.toContain('value="0"');
    expect(h).not.toContain('value="11"');
  });

  it("odosiela sa bez JavaScriptu", () => {
    // Stránka sa otvára z SMS, často v okne správy. Skript, ktorý sa
    // nenačíta, by spravil z otázok mŕtve políčka.
    const h = blokPocitovky({});
    expect(h).toContain('<form method="post">');
    expect(h).toContain('type="submit"');
    expect(h).not.toContain("<script");
    expect(h).not.toContain("onclick");
  });

  it("dnešná odpoveď je predklepnutá", () => {
    const h = blokPocitovky({ dnesne: { datum: "2026-09-30", bolest: 4, pohyb: null, posun: 9 } });
    expect(h).toContain('name="bolest" value="4" checked');
    expect(h).toContain('name="posun" value="9" checked');
    expect(h).not.toContain('name="pohyb" value="4" checked');
    expect(h).toContain("Dnes si už odpovedal");
  });

  it("klepnutie je vidno bez skriptu", () => {
    // Bez tohto klient klepne na číslo, nestane sa nič viditeľné a odošle
    // naslepo — overené v prehliadači 30. 9. 2026, hodnoty sa zapisovali
    // správne a na obrazovke to vyzeralo, že tlačidlá nereagujú.
    const h = blokPocitovky({});
    expect(h).toContain(".psb-stupnica input:checked + span");
    expect(h).toContain('class="psb-stupnica"');
    expect(h).not.toContain("<script");
  });

  it("po odoslaní poďakuje a nemlčí", () => {
    expect(blokPocitovky({ vdaka: true })).toContain("Ďakujeme");
  });
});
