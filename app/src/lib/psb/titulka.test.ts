import { describe, expect, it } from "bun:test";

import {
  farby, kusy, MAX_RIADKOV_NADPIS, navrhNadpisu, PALETA, priDlhy,
  sirkaRiadku, slova, styl, textRiadku, trackingPx, zalam, zalamKusy, zmes,
} from "./titulka";
import { REZ } from "./titulkaSkladby";

/** Falošné meranie: každý znak 50 px, tenký rez 40. Šírky sú predvídateľné. */
const meraj = (t: string, tenky = false) => t.length * (tenky ? 40 : 50);
const merajProste = (t: string) => t.length * 50;

describe("nadpis s dvoma rezmi", () => {
  it("hviezdičky označia tenký rez a z textu zmiznú", () => {
    expect(kusy("Bolest *není* problém")).toEqual([
      { text: "Bolest ", tenky: false },
      { text: "není", tenky: true },
      { text: " problém", tenky: false },
    ]);
  });

  it("osamotená hviezdička nič neoznačuje", () => {
    expect(kusy("5 * 3")).toEqual([{ text: "5 * 3", tenky: false }]);
  });

  it("interpunkcia za označeným slovom nespadne na vlastný riadok", () => {
    // Jarvis navrhol „Sval sílí. Záda *stejná*." a bodka za zatvorenou
    // hviezdičkou sa stala samostatným slovom — vyzeralo to ako chyba sadzby.
    const o = slova(kusy("Záda *stejná*."));
    expect(o[0].map((s) => s.text)).toEqual(["Záda", "stejná."]);
    expect(o[0][1].tenky).toBe(true);
  });

  it("čiarka a otáznik sa lepia rovnako", () => {
    expect(slova(kusy("*Naozaj*? Áno, *vážne*,"))[0].map((s) => s.text))
      .toEqual(["Naozaj?", "Áno,", "vážne,"]);
  });

  it("rez si nesie každé slovo samo", () => {
    const o = slova(kusy("a *b c* d"));
    expect(o[0].map((s) => [s.text, s.tenky])).toEqual([["a", false], ["b", true], ["c", true], ["d", false]]);
  });

  it("zalomí podľa skutočných šírok oboch rezov", () => {
    // Tenké slová sa vojdú tam, kde hrubé už nie — inak by sa lámalo naslepo.
    const hrube = zalamKusy("aaaa aaaa", 400, meraj);
    const tenke = zalamKusy("*aaaa aaaa*", 400, meraj);
    expect(hrube.length).toBe(2);
    expect(tenke.length).toBe(1);
  });

  it("rešpektuje vlastný zlom riadku", () => {
    expect(zalamKusy("aa\nbb", 10000, meraj).map(textRiadku)).toEqual(["aa", "bb"]);
  });

  it("slovo dlhšie než stĺpec nechá na vlastnom riadku, nerozseká ho", () => {
    expect(zalamKusy("aa dlhopredlhoslovo", 200, meraj).map(textRiadku)).toEqual(["aa", "dlhopredlhoslovo"]);
  });

  it("zahodí prázdne riadky na konci", () => {
    expect(zalamKusy("aa\n\n\n", 10000, meraj).map(textRiadku)).toEqual(["aa"]);
  });

  it("z prázdneho textu nič", () => {
    expect(zalamKusy("", 500, meraj)).toEqual([]);
    expect(zalamKusy("   ", 500, meraj)).toEqual([]);
  });

  it("šírka riadku ráta aj medzery", () => {
    expect(sirkaRiadku([{ text: "ab", tenky: false }, { text: "cd", tenky: false }], meraj)).toBe(250);
  });
});

describe("podnadpis", () => {
  it("zalomí na šírku stĺpca", () => {
    expect(zalam("aaa bbb ccc", 350, merajProste)).toEqual(["aaa bbb", "ccc"]);
  });

  it("z prázdneho nič", () => {
    expect(zalam("  ", 500, merajProste)).toEqual([]);
  });
});

describe("navrhNadpisu", () => {
  it("berie prvú VETU captionu, nie celý odsek", () => {
    expect(navrhNadpisu({ hotovyText: "Bolest zad není problém zad. Druhá veta už tam nepatří." }))
      .toBe("Bolest zad není problém zad");
  });

  it("staccato caption nespadne na jedno slovo", () => {
    // Toto ma dobehlo naživo: caption „Plank. Sklapovačky. Mrtvý tah." dal
    // nadpis „Plank". Jedno slovo nie je nadpis.
    expect(navrhNadpisu({ hotovyText: "Plank. Sklapovačky. Mrtvý tah. Roky odcvičené." }))
      .toBe("Plank. Sklapovačky. Mrtvý tah");
  });

  it("keď je prvá veta captionu dlhá, spadne na scenár", () => {
    const dlha = `${"x".repeat(90)}. Ešte veta.`;
    expect(navrhNadpisu({ hotovyText: dlha, scenar: "Tři slova tady a ještě." })).toBe("Tři slova tady a ještě");
  });

  it("bez captionu aj scenára siahne po koncepte", () => {
    expect(navrhNadpisu({ koncept: "Rotace pánve: proč to bolí" })).toBe("Rotace pánve");
  });

  it("z ničoho nevymyslí nič", () => {
    expect(navrhNadpisu({})).toBe("");
  });
});


describe("sadzba", () => {
  it("nesie obe variačné osi z PSD", () => {
    // Canvas šírkovú os zahadzuje; keby vypadla odtiaľto, titulka by bola
    // užšia než v Photoshope a nikto by si nevšimol prečo.
    expect(styl(REZ.nadpis).fontVariationSettings).toBe('"wght" 800, "wdth" 120');
    expect(styl(REZ.podnadpis).fontVariationSettings).toBe('"wght" 300, "wdth" 120');
  });

  it("tracking je v pixeloch, nie v em", () => {
    expect(trackingPx(REZ.nadpis)).toBe(2.2);
    expect(styl(REZ.nadpis).letterSpacing).toBe("2.20px");
  });
});

describe("farby", () => {
  it("zmes drží v šestnástkovej sústave", () => {
    expect(zmes("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(zmes("#1A2E24", "#3D6B52", 0)).toBe("#1A2E24");
  });

  it("obidva režimy majú kontrast a berú z jednej palety", () => {
    expect(farby("svetly").pozadie).toBe(PALETA.velmiSvetla);
    expect(farby("svetly").plocha).toBe(PALETA.svetlaZelena);
    expect(farby("tmavy").pozadie).toBe(PALETA.tmavaZelena);
    expect(farby("tmavy").nadpis).toBe(PALETA.biela);
    for (const r of ["svetly", "tmavy"] as const) {
      const f = farby(r);
      expect(f.pozadie).not.toBe(f.nadpis);
      expect(f.pozadie).not.toBe(f.podnadpis);
      // Plocha musí byť od pozadia odlíšiteľná, inak to nie je vrstva.
      expect(f.plocha).not.toBe(f.pozadie);
    }
  });

  it("nie sú to dve farby", () => {
    // Jerry po prvej verzii: „sú to dve farby na tej titulke." Titulka má
    // k dispozícii celý rozsah palety — pozadie, tónovú plochu, tmavý blok,
    // text na ňom aj pod ním, akcent a značku.
    for (const r of ["svetly", "tmavy"] as const) {
      const f = farby(r);
      const tony = new Set([
        f.pozadie, f.plocha, f.tmavaPlocha, f.nadpis, f.naTmavom,
        f.naTmavomTlmene, f.podnadpis, f.akcent, f.meta, f.znacka,
      ]);
      expect(tony.size).toBeGreaterThanOrEqual(7);
    }
  });

  it("tmavý blok je tmavý v oboch režimoch", () => {
    // Je to PLOCHA, nie pozadie. Keby sa v tmavom režime prepla na svetlú,
    // prestal by to byť ten istý nápad.
    for (const r of ["svetly", "tmavy"] as const) {
      const f = farby(r);
      expect(f.tmavaPlocha).not.toBe(f.naTmavom);
      expect(f.tmavaPlocha).not.toBe(f.pozadie);
    }
  });
});


