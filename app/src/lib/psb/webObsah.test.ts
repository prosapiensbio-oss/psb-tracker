import { describe, expect, test } from "bun:test";

import {
  h1ZHtml, metaPopisZHtml, normUrl, prilezitostiTitulkov, sitemapUrls,
  sitemapZapisy, textZHtml, titulokZHtml, typZoSitemapy, type WebStranka,
} from "./webObsah";

/**
 * Vytiahnuť titulok z HTML funguje na deviatich stránkach a na desiatej vráti
 * prázdno — a prázdny titulok vyzerá ako stránka bez titulku, nie ako chyba.
 * Preto testy.
 */

describe("adresa na spárovanie", () => {
  test("lomka na konci a http nesmú rozhodovať", () => {
    // Search Console aj sitemapa dnes dávajú rovnaký tvar. Spoliehať sa na to
    // je hazard: jedna chýbajúca lomka a spojenie mlčky nenájde nič.
    const a = normUrl("https://www.prosapiens.cz/lateral-line/");
    expect(normUrl("https://www.prosapiens.cz/lateral-line")).toBe(a);
    expect(normUrl("http://www.prosapiens.cz/lateral-line/")).toBe(a);
    expect(normUrl("HTTPS://WWW.PROSAPIENS.CZ/lateral-line/")).toBe(a);
  });

  test("prázdno zostáva prázdno", () => {
    expect(normUrl("")).toBe("");
  });
});

describe("sitemapa", () => {
  test("vytiahne adresy z indexu aj z listu", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.prosapiens.cz/a/</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>  https://www.prosapiens.cz/b/  </loc></url>
    </urlset>`;
    expect(sitemapUrls(xml)).toEqual([
      "https://www.prosapiens.cz/a/",
      "https://www.prosapiens.cz/b/",
    ]);
  });

  test("lastmod patrí k svojej adrese, aj keď ho jedna stránka nemá", () => {
    // Dva samostatné vzory by sa pri stránke bez lastmod rozišli o jeden riadok
    // a appka by potom prečítala nesprávnu stránku ako zmenenú.
    const xml = `<urlset>
      <url><loc>https://x.cz/a/</loc></url>
      <url><loc>https://x.cz/b/</loc><lastmod>2026-08-15T10:00:00+00:00</lastmod></url>
    </urlset>`;
    expect(sitemapZapisy(xml)).toEqual([
      { url: "https://x.cz/a/", zmenene: "" },
      { url: "https://x.cz/b/", zmenene: "2026-08-15T10:00:00+00:00" },
    ]);
  });

  test("typ podľa zdrojovej sitemapy", () => {
    expect(typZoSitemapy("https://x.cz/page-sitemap.xml")).toBe("stranka");
    expect(typZoSitemapy("https://x.cz/post-sitemap.xml")).toBe("clanok");
    expect(typZoSitemapy("https://x.cz/rl_gallery-sitemap.xml")).toBe("");
  });
});

describe("čítanie z HTML", () => {
  test("titulok a entity", () => {
    expect(titulokZHtml("<html><head><title>Co je  Functional&nbsp;Patterns</title>"))
      .toBe("Co je Functional Patterns");
  });

  test("meta description pri oboch poradiach atribútov", () => {
    // Yoast píše content pred name aj naopak; jeden pevný vzor by pri opačnom
    // poradí nenašiel nič a stránka by vyzerala ako bez popisu.
    expect(metaPopisZHtml('<meta name="description" content="Prvý popis">')).toBe("Prvý popis");
    expect(metaPopisZHtml(`<meta content='Druhý popis' name='description'>`)).toBe("Druhý popis");
    expect(metaPopisZHtml('<meta name="og:description" content="Nie ten">')).toBe("");
  });

  test("h1 bez vnútorných značiek", () => {
    expect(h1ZHtml('<h1 class="x">Padající <span>kolena</span></h1>')).toBe("Padající kolena");
  });

  test("skript a štýl sa vyhodia VRÁTANE obsahu", () => {
    // Bez toho by sa do textu dostal JavaScript a Jarvis by v ňom hľadal vetu.
    const html = `<body><script>var a = "text v skripte";</script>
      <style>.a{color:red}</style><p>Skutočný text</p></body>`;
    const t = textZHtml(html);
    expect(t).toContain("Skutočný text");
    expect(t).not.toContain("text v skripte");
    expect(t).not.toContain("color:red");
  });

  test("odstavce sa nezlepia", () => {
    const t = textZHtml("<p>prvý</p><p>druhý</p>");
    expect(t).toMatch(/prvý\s+druhý/);
    expect(t).not.toContain("prvýdruhý");
  });

  test("strop dĺžky drží", () => {
    expect(textZHtml("<p>" + "a".repeat(500) + "</p>", 100).length).toBe(100);
  });
});

describe("príležitosti v titulkoch", () => {
  const st = (url: string, titulok: string): WebStranka =>
    ({ url, typ: "clanok", titulok, metaPopis: "", h1: "", text: "", znakov: 0 });

  // Skutočné čísla z 15. 8. 2026: anatomické stránky ťahajú obrovské
  // zobrazenia a takmer nula klikov, symptómové konvertujú niekolkonásobne.
  const stranky = [
    st("https://www.prosapiens.cz/lateral-line/", "Lateral line — fasciální řetězec"),
    st("https://www.prosapiens.cz/arm-lines/", "Arm lines"),
    st("https://www.prosapiens.cz/padajici-kolena-dovnitr/", "Padající kolena dovnitř"),
    st("https://www.prosapiens.cz/odstavajici-lopatky/", "Odstávající lopatky"),
    st("https://www.prosapiens.cz/spiral-line/", "Spiral line"),
  ];
  const gsc = [
    { url: "https://www.prosapiens.cz/lateral-line/", zobrazenia: 15777, kliky: 97 },
    { url: "https://www.prosapiens.cz/arm-lines/", zobrazenia: 9555, kliky: 31 },
    { url: "https://www.prosapiens.cz/padajici-kolena-dovnitr/", zobrazenia: 7508, kliky: 202 },
    { url: "https://www.prosapiens.cz/odstavajici-lopatky/", zobrazenia: 7032, kliky: 173 },
    { url: "https://www.prosapiens.cz/spiral-line/", zobrazenia: 8809, kliky: 126 },
  ];

  test("nájde stránky výrazne pod mediánom a dá k nim titulok", () => {
    const v = prilezitostiTitulkov(stranky, gsc);
    const urly = v.map((x) => x.url);
    expect(urly).toContain("https://www.prosapiens.cz/arm-lines/");
    expect(urly).not.toContain("https://www.prosapiens.cz/padajici-kolena-dovnitr/");
    expect(v[0].titulok).toBeTruthy();
  });

  test("radí sa podľa zobrazení — najväčšia strata prvá", () => {
    const v = prilezitostiTitulkov(stranky, gsc);
    expect(v[0].zobrazenia).toBeGreaterThanOrEqual(v[v.length - 1].zobrazenia);
  });

  test("CTR je v percentách, nie v podiele", () => {
    const v = prilezitostiTitulkov(stranky, gsc);
    const arm = v.find((x) => x.url.includes("arm-lines"));
    expect(arm?.ctr).toBeCloseTo(0.32, 1);
  });

  test("stránka bez titulku sem nepatrí", () => {
    // Bez titulku je to znova len číslo bez akcie.
    const v = prilezitostiTitulkov([st("https://www.prosapiens.cz/arm-lines/", "")], gsc);
    expect(v).toEqual([]);
  });

  test("malé zobrazenia sa nehlásia — pri dvesto je nízke CTR šum", () => {
    const male = gsc.map((g) => ({ ...g, zobrazenia: 200 }));
    expect(prilezitostiTitulkov(stranky, male)).toEqual([]);
  });

  test("pri málo stránkach radšej nič než náhodný medián", () => {
    expect(prilezitostiTitulkov(stranky, gsc.slice(0, 2))).toEqual([]);
  });
});
