import { describe, expect, it } from "bun:test";

import { holy, mapaPoli, mapaPreCiel, polia, pravidloZhody, skontrolujStranku } from "./webKontrola";

/**
 * Testy sú postavené na skutočnej chybe: test postury sa od 23. 9. do 7. 10.
 * 2026 nedal odoslať, lebo prepínač posielal „ano" a plugin čakal celú vetu.
 * Keby táto kontrola vtedy existovala, vedelo sa to na druhý deň.
 */

const JS_PRESNE = `
  var POLIA = {
    cf7127: { jmeno: 'your-name', email: 'your-email', telefon: 'your-phone', zprava: 'your-message' },
    cf75111: { jmeno: 'psb-name', email: 'psb-email', telefon: 'psb-phone', zprava: 'psb-note', hovor: 'psb-call' },
    forminator: { jmeno: 'name-1', email: 'email-1', telefon: 'phone-1', zprava: 'textarea-1' }
  };
  function nastav(form, meno, hodnota) { vsetky[i].checked = (vsetky[i].value === hodnota); }
`;
const JS_TOLERANTNE = JS_PRESNE + `\n function holy(s) { return s.toLowerCase(); }\n`;

/** Stránka testu postury tak, ako naozaj vyzerá. */
const stranka = (opt: { hodnotyPrepinaca?: string[]; povinnyPrepinac?: boolean } = {}) => {
  const hod = opt.hodnotyPrepinaca ?? ["Ano, chci 15minutový hovor", "Ne, stačí mi analýza e-mailem"];
  const pov = opt.povinnyPrepinac ?? true;
  return `<html><body>
  <form class="form" data-form novalidate>
    <input type="text" name="jmeno" required>
    <input type="tel" name="telefon" required>
    <input type="email" name="email" required>
    <textarea name="zprava"></textarea>
    <label><input type="radio" name="hovor" value="ano"> Ano</label>
    <label><input type="radio" name="hovor" value="ne"> Ne</label>
    <button type="submit">Odeslat</button>
  </form>
  <div id="psb-skryte" data-psb-ciel="cf7:5111">
    <form action="/#wpcf7-f5111">
      <input type="hidden" name="_wpcf7" value="5111">
      <input type="hidden" name="psb-pain" value="">
      <input type="hidden" name="psb-posture" value="">
      <input type="hidden" name="psb-insight" value="">
      <input type="text" name="psb-name" aria-required="true">
      <input type="tel" name="psb-phone">
      <input type="email" name="psb-email" aria-required="true">
      <textarea name="psb-note"></textarea>
      <input type="radio" name="psb-call" ${pov ? 'aria-required="true"' : ""} value="${hod[0]}">
      <input type="radio" name="psb-call" ${pov ? 'aria-required="true"' : ""} value="${hod[1]}">
      <input type="checkbox" name="psb-gdpr" value="1">
    </form>
  </div></body></html>`;
};

describe("čítanie stránky", () => {
  it("polia sa zlúčia pod jedno meno a hodnoty prepínača sa pozbierajú", () => {
    const p = polia(stranka());
    const hovor = p.find((x) => x.meno === "hovor");
    expect(hovor?.typ).toBe("radio");
    expect(hovor?.hodnoty).toEqual(["ano", "ne"]);
    // Technické polia CF7 nie sú polia formulára.
    expect(p.some((x) => x.meno.startsWith("_wpcf7"))).toBe(false);
  });

  it("mapa polí sa číta zo živého formulare.js", () => {
    const m = mapaPoli(JS_PRESNE);
    expect(m.cf75111.hovor).toBe("psb-call");
    expect(mapaPreCiel("cf7:5111", m).kluc).toBe("cf75111");
    // Neznámy formulár → téma ticho použije mapu kontaktu, a to sa má ohlásiť.
    expect(mapaPreCiel("cf7:9999", m).kluc).toBe("");
  });

  it("pravidlo párovania sa berie z toho, čo je naozaj nasadené", () => {
    expect(pravidloZhody(JS_PRESNE)).toBe("presne");
    expect(pravidloZhody(JS_TOLERANTNE)).toBe("tolerantne");
  });
});

describe("chyba z 23. 9. 2026", () => {
  it("pri presnom párovaní nájde nezhodu prepínača a povie, že sa to nedá odoslať", () => {
    const n = skontrolujStranku("https://www.prosapiens.cz/test-postury/", stranka(), JS_PRESNE);
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("psb-call");
    expect(n.detail).toContain("POVINNÉ");
  });

  it("po oprave na tolerantné párovanie je tá istá stránka v poriadku", () => {
    const n = skontrolujStranku("https://www.prosapiens.cz/test-postury/", stranka(), JS_TOLERANTNE);
    expect(n.stav).toBe("ok");
  });

  it("tolerantné párovanie NEzakryje naozaj inú hodnotu", () => {
    const n = skontrolujStranku("/x/", stranka({ hodnotyPrepinaca: ["Souhlasím", "Nesouhlasím"] }), JS_TOLERANTNE);
    expect(n.stav).toBe("chyba");
  });

  it("keď prepínač nie je povinný, je to varovanie o stratenej odpovedi, nie pád", () => {
    const n = skontrolujStranku("/x/", stranka({ hodnotyPrepinaca: ["A", "B"], povinnyPrepinac: false }), JS_PRESNE);
    expect(n.detail).toContain("nemá v plugine zhodnú možnosť");
    expect(n.detail).not.toContain("POVINNÉ");
  });
});

describe("ostatné spôsoby, ako sa dopyt stratí", () => {
  it("chýbajúci most je chyba, nie prázdny výsledok", () => {
    const h = stranka().replace('id="psb-skryte"', 'id="nieco-ine"');
    expect(skontrolujStranku("/x/", h, JS_TOLERANTNE).stav).toBe("chyba");
  });

  it("zmiznutý formulár z obrazovky sa pozná", () => {
    const h = stranka().replace("data-form", "data-neco");
    expect(skontrolujStranku("/x/", h, JS_TOLERANTNE).detail).toContain("nie je vysádzaný formulár");
  });

  it("povinné pole pluginu, ktoré nemá kto vyplniť", () => {
    const h = stranka().replace('<textarea name="psb-note"></textarea>', '<input type="text" name="psb-firma" aria-required="true">');
    const n = skontrolujStranku("/x/", h, JS_TOLERANTNE);
    expect(n.stav).toBe("chyba");
    expect(n.detail).toContain("psb-firma");
  });

  it("pole na obrazovke, ktoré most nikam nenesie", () => {
    const h = stranka().replace("<textarea name=\"zprava\"></textarea>", "<textarea name=\"zprava\"></textarea><input type=\"text\" name=\"vek\">");
    expect(skontrolujStranku("/x/", h, JS_TOLERANTNE).detail).toContain("vek");
  });

  it("neznámy cieľ je varovanie — mená polí nemusia sedieť", () => {
    const h = stranka().replace('data-psb-ciel="cf7:5111"', 'data-psb-ciel="cf7:9999"');
    const n = skontrolujStranku("/x/", h, JS_TOLERANTNE);
    expect(n.stav).not.toBe("ok");
    expect(n.detail).toContain("cf7:9999");
  });

  it("holy() normalizuje rovnako ako téma", () => {
    expect(holy(" Ano, Chci ")).toBe("ano, chci");
    expect(holy("Nesouhlasím")).toBe("nesouhlasim");
  });
});
