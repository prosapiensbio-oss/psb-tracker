import { describe, expect, it } from "bun:test";

import {
  type ReklamaNaKontrolu,
  type StrankaReklamy,
  jeBeziaca,
  jeBeziacouPodlaSad,
  klucReklamy,
  maFormularVHtml,
  normalizujOdkaz,
  skontrolujReklamy,
  stiahniStrankyReklam,
  utmReklamy,
  utmZOdkazu,
  utmZRetazca,
} from "./webKontrolaReklamy";
import type { NalezKontroly } from "./webKontrola";
// Bod 2 je tu naschvál: časť testov overuje, že oba body hovoria o tej istej
// stránke to isté. Keby sa hranica v jednom z nich zmenila, spadne to tu.
import { skontrolujStrankuZivot } from "./webKontrolaStranky";

/**
 * Testy sú postavené na tom, čo by kontrola mala zachytiť: reklama za ~300 Kč
 * denne vedie na adresu, ktorá sa môže premenovať, prestať načítavať alebo
 * stratiť formulár — a ani jedno z toho sa na výdavku neukáže. Preto sa tu
 * skúša VSTUP → NÁLEZ, nie vnútro funkcií.
 */

const ODKAZ = "https://www.prosapiens.cz/uvodni-trenink/?utm_source=meta&utm_medium=paid&utm_campaign=uvodni-trenink-zari&utm_content=jarek-video";

const dobraStranka = (): StrankaReklamy => ({ stav: 200, bajtov: 48_000, maFormular: true });

const reklama = (o: Partial<ReklamaNaKontrolu> = {}): ReklamaNaKontrolu => ({
  id: o.id ?? "120210000000001",
  nazov: o.nazov ?? "LPV · Jarek video",
  stav: o.stav ?? "ACTIVE",
  odkaz: o.odkaz ?? ODKAZ,
  utm: o.utm,
  stranka: o.stranka === undefined ? dobraStranka() : o.stranka,
});

const najdi = (nalezy: NalezKontroly[], zaciatok: string) => nalezy.find((n) => n.kluc.startsWith(zaciatok));

describe("čítanie reklamy", () => {
  it("beží len ACTIVE, bez ohľadu na veľkosť písmen a medzery", () => {
    expect(jeBeziaca("ACTIVE")).toBe(true);
    expect(jeBeziaca(" active ")).toBe(true);
    expect(jeBeziaca("PAUSED")).toBe(false);
    expect(jeBeziaca("")).toBe(false);
  });

  it("pozná aj hodnoty, ktoré má v DB stav_sad — inak by bol celý bod 5 vypnutý", () => {
    // `mkt_kampane.stav_sad` nesie doslova toto. Keby `jeBeziaca` uznávala len
    // „ACTIVE“, volajúci podľa hlavičky modulu by dostal false pri každej
    // reklame a kontrola by vrátila jediný riadok „žiadna nie je zapnutá“.
    expect(jeBeziaca("bezi")).toBe(true);
    expect(jeBeziaca(" BEZI ")).toBe(true);
    expect(jeBeziaca("skoncila")).toBe(false);
    expect(jeBeziaca("pozastavena")).toBe(false);
    expect(jeBeziaca("bez-sad")).toBe(false);
  });

  it("ACTIVE so skončenou sadou nebeží — tá istá pasca ako pri stavDorucovania", () => {
    const teraz = new Date("2026-08-19T08:00:00Z");
    // 19. 8. 2026 malo 32 kampaní sadu ACTIVE s koncom v júli a výdavok nula.
    expect(jeBeziacouPodlaSad([{ effective_status: "ACTIVE", end_time: "2026-07-14T00:00:00+0000" }], teraz)).toBe(false);
    expect(jeBeziacouPodlaSad([{ effective_status: "ACTIVE", end_time: "2026-09-30T00:00:00+0000" }], teraz)).toBe(true);
    expect(jeBeziacouPodlaSad([{ effective_status: "ACTIVE" }], teraz)).toBe(true);
    expect(jeBeziacouPodlaSad([{ effective_status: "PAUSED" }], teraz)).toBe(false);
    expect(jeBeziacouPodlaSad([], teraz)).toBe(false);
  });

  it("UTM sa čítajú z odkazu, z url_tags aj z oboch naraz", () => {
    expect(utmZOdkazu(ODKAZ).campaign).toBe("uvodni-trenink-zari");
    expect(utmZRetazca("?utm_source=meta&utm_content=jarek").content).toBe("jarek");
    // Meta pripája url_tags až pri kliku — značka len tam sa k človeku dostane.
    const u = utmReklamy(reklama({ odkaz: "https://www.prosapiens.cz/uvodni-trenink/", utm: "utm_source=meta&utm_medium=paid&utm_campaign=zari&utm_content=jarek" }));
    expect(u.campaign).toBe("zari");
    // Čo je v odkaze, dorazí určite — preto vyhráva nad url_tags.
    expect(utmReklamy(reklama({ utm: "utm_campaign=ine" })).campaign).toBe("uvodni-trenink-zari");
  });

  it("chýbajúce značky sú prázdne reťazce, nie undefined", () => {
    const u = utmZOdkazu("https://www.prosapiens.cz/uvodni-trenink/");
    expect(u).toEqual({ source: "", medium: "", campaign: "", content: "" });
  });

  it("stránka je tá istá bez ohľadu na www, schému a utm v odkaze", () => {
    expect(normalizujOdkaz("https://www.prosapiens.cz/uvodni-trenink/?utm_content=a"))
      .toBe(normalizujOdkaz("http://prosapiens.cz/uvodni-trenink/?utm_content=b"));
  });

  it("koncová lomka nerobí druhú stránku — web na ňu presmerúva sám", () => {
    // Overené naživo: /uvodni-trenink vracia 301 na /uvodni-trenink/. Bez
    // zjednotenia by jedna reklama bez lomky znamenala druhý riadok v tabuľke
    // a nález „adresa sa premenovala“ na stránke, ktorú nikto nepremenoval.
    expect(normalizujOdkaz("https://www.prosapiens.cz/uvodni-trenink"))
      .toBe(normalizujOdkaz("https://www.prosapiens.cz/uvodni-trenink/"));
    expect(normalizujOdkaz("https://www.prosapiens.cz/uvodni-trenink/")).toBe("prosapiens.cz/uvodni-trenink");
    // Koreň zostáva lomkou, inak by z neho bol kľúč „prosapiens.cz“ bez cesty.
    expect(normalizujOdkaz("https://prosapiens.cz/")).toBe("prosapiens.cz/");
    expect(normalizujOdkaz("https://prosapiens.cz")).toBe("prosapiens.cz/");
  });

  it("kľúč reklamy drží id z Mety, pri jeho chýbaní názov", () => {
    expect(klucReklamy(reklama({ id: "120210000000001", nazov: "iný názov" }))).toBe("120210000000001");
    expect(klucReklamy(reklama({ id: "", nazov: "LPV · Jarek video" }))).toBe("lpv-jarek-video");
    expect(klucReklamy(reklama({ id: "", nazov: "" }))).toBe("bez-nazvu");
  });

  it("formulár na stránke znamená OBE časti cesty k dopytu", () => {
    expect(maFormularVHtml('<form class="form" data-form></form><div id="psb-skryte"></div>')).toBe(true);
    expect(maFormularVHtml('<form class="form" data-form></form>')).toBe(false);
    expect(maFormularVHtml('<div id="psb-skryte"></div>')).toBe(false);
    expect(maFormularVHtml("")).toBe(false);
  });
});

describe("reklama má kam viesť", () => {
  it("bežiaca reklama na živú stránku s formulárom a celým značkovaním je v poriadku", () => {
    const n = skontrolujReklamy([reklama()]);
    expect(n.every((x) => x.stav === "ok")).toBe(true);
    expect(najdi(n, "reklama:stranka:")?.kluc).toBe("reklama:stranka:prosapiens.cz/uvodni-trenink");
    expect(najdi(n, "reklama:utm:")?.kluc).toBe("reklama:utm:120210000000001");
  });

  it("premenovaná stránka: adresa vráti 404 a nález to povie vetou, nie kódom", () => {
    const n = skontrolujReklamy([reklama({ stranka: { stav: 404, bajtov: 1200, maFormular: false, ukazka: "<!DOCTYPE html><title>Stránka nenalezena</title>" } })]);
    const s = najdi(n, "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("HTTP 404");
    expect(s?.detail).toContain("neuvidí");
    // Nikdy len stavový kód — v detaile je aj to, čo odpoveď hovorila.
    expect(s?.detail).toContain("Stránka nenalezena");
  });

  it("presmerovanie inam je chyba, aj keď stránka vráti 200", () => {
    const s = najdi(skontrolujReklamy([reklama({ stranka: { ...dobraStranka(), presmerovanieNa: "https://www.prosapiens.cz/sluzby/" } })]), "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("/sluzby/");
  });

  it("stránka bez formulára je chyba — reklama vedie tam, odkiaľ sa nedá ozvať", () => {
    const s = najdi(skontrolujReklamy([reklama({ stranka: { stav: 200, bajtov: 48_000, maFormular: false } })]), "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("nemá ako ozvať");
  });

  it("cieľ, ktorý nie je adresa, sa pozná bez siete", () => {
    const s = najdi(skontrolujReklamy([reklama({ odkaz: "uvodni-trenink", stranka: null })]), "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("uvodni-trenink");
  });

  it("na cudzej stránke sa formulár nevyžaduje, len to, že sa načíta", () => {
    const s = najdi(skontrolujReklamy([reklama({ odkaz: "https://www.instagram.com/prosapiens.biomechanic/", stranka: { stav: 200, bajtov: 90_000, maFormular: false } })]), "reklama:stranka:");
    expect(s?.stav).toBe("ok");
  });

  it("jedna stránka = jeden riadok, aj keď na ňu vedú tri reklamy", () => {
    const n = skontrolujReklamy([
      reklama({ id: "1", nazov: "A", odkaz: `${ODKAZ}1` }),
      reklama({ id: "2", nazov: "B", odkaz: `${ODKAZ}2` }),
      reklama({ id: "3", nazov: "C", odkaz: `${ODKAZ}3` }),
    ]);
    expect(n.filter((x) => x.kluc.startsWith("reklama:stranka:")).length).toBe(1);
    expect(n.filter((x) => x.kluc.startsWith("reklama:utm:")).length).toBe(3);
    expect(najdi(n, "reklama:stranka:")?.detail).toContain("3 reklamy: A, B, C");
  });
});

describe("značkovanie odkazov", () => {
  it("chýbajúca kampaň je chyba", () => {
    const u = najdi(skontrolujReklamy([reklama({ odkaz: "https://www.prosapiens.cz/uvodni-trenink/?utm_source=meta&utm_medium=paid&utm_content=jarek" })]), "reklama:utm:");
    expect(u?.stav).toBe("chyba");
    expect(u?.detail).toContain("utm_campaign");
    expect(u?.detail).toContain("cena za dopyt");
  });

  it("chýbajúci source a medium sú tiež chyba — dopyt vypadne z platenej cesty", () => {
    const u = najdi(skontrolujReklamy([reklama({ odkaz: "https://www.prosapiens.cz/uvodni-trenink/?utm_campaign=zari&utm_content=jarek" })]), "reklama:utm:");
    expect(u?.stav).toBe("chyba");
    expect(u?.detail).toContain("utm_source");
    expect(u?.detail).toContain("utm_medium");
  });

  it("chýbajúci utm_content je len varovanie", () => {
    const u = najdi(skontrolujReklamy([reklama({ odkaz: "https://www.prosapiens.cz/uvodni-trenink/?utm_source=meta&utm_medium=paid&utm_campaign=zari" })]), "reklama:utm:");
    expect(u?.stav).toBe("varovanie");
    expect(u?.detail).toContain("utm_content");
  });

  it("odkaz úplne bez značiek je chyba, nie varovanie", () => {
    const u = najdi(skontrolujReklamy([reklama({ odkaz: "https://www.prosapiens.cz/uvodni-trenink/" })]), "reklama:utm:");
    expect(u?.stav).toBe("chyba");
  });
});

describe("keď dáta chýbajú, hlási sa neviem", () => {
  it("prázdny zoznam reklám nie je v poriadku", () => {
    const n = skontrolujReklamy([]);
    expect(n.length).toBe(1);
    expect(n[0].kluc).toBe("reklama:bezi");
    expect(n[0].stav).toBe("varovanie");
    expect(n[0].detail).toContain("nie je dôkaz");
  });

  it("stránka, ktorú sa nestihlo stiahnuť, je varovanie, nie ok", () => {
    const s = najdi(skontrolujReklamy([reklama({ stranka: null })]), "reklama:stranka:");
    expect(s?.stav).toBe("varovanie");
    expect(s?.detail).toContain("nemá dáta");
  });

  it("200 s prázdnym telom je chyba, nie v poriadku (hodnota 0)", () => {
    const s = najdi(skontrolujReklamy([reklama({ stranka: { stav: 200, bajtov: 0, maFormular: false } })]), "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("0 bajtov");
  });

  it("stránka, ktorá vôbec neodpovedala, je chyba s dôvodom", () => {
    const s = najdi(skontrolujReklamy([reklama({ stranka: { stav: 0, bajtov: 0, maFormular: false, chyba: "TypeError: fetch failed" } })]), "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("fetch failed");
  });

  it("presmerovanie bez cieľa na inej stránke je neviem, nie chyba", () => {
    // 301 len na lomku alebo na https je normálny stav; keď ho sťahovanie
    // nenasledovalo, o obsahu stránky sa nedá povedať nič.
    const s = najdi(skontrolujReklamy([reklama({ stranka: { stav: 301, bajtov: 0, maFormular: false } })]), "reklama:stranka:");
    expect(s?.stav).toBe("varovanie");
    expect(s?.detail).toContain("nevie");
  });

  it("podozrivo malé telo je CHYBA — tak ako to o tej istej stránke hovorí bod 2", () => {
    // Do 8. 10. 2026 to tu bolo varovanie pri vlastnej hranici 500 bajtov,
    // kým bod 2 hlásil pri tej istej stránke chybu. Jeden riadok červený a
    // druhý oranžový o jednej veci znamená, že sa neverí ani jednému.
    const s = najdi(skontrolujReklamy([reklama({ stranka: { stav: 200, bajtov: 120, maFormular: false } })]), "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("120 bajtov");
  });

  it("vypnuté reklamy sa nekontrolujú, ale mlčať sa o nich nesmie", () => {
    const n = skontrolujReklamy([reklama({ stav: "PAUSED", stranka: { stav: 404, bajtov: 0, maFormular: false } })]);
    expect(n.length).toBe(1);
    expect(n[0].stav).toBe("varovanie");
    expect(n[0].detail).toContain("PAUSED");
  });

  it("samé boosty bez odkazu sú varovanie, nie v poriadku", () => {
    const n = skontrolujReklamy([reklama({ odkaz: "", nazov: "Boost reels 12. 9." }), reklama({ id: "2", odkaz: "   ", nazov: "Boost reels 19. 9." })]);
    expect(n.length).toBe(1);
    expect(n[0].stav).toBe("varovanie");
    expect(n[0].detail).toContain("Boost reels 12. 9.");
  });

  it("boost vedľa bežnej reklamy kontrolu nezhodí a povie sa to", () => {
    const n = skontrolujReklamy([reklama(), reklama({ id: "2", odkaz: "", nazov: "Boost reels" })]);
    expect(najdi(n, "reklama:bezi")?.stav).toBe("ok");
    expect(najdi(n, "reklama:bezi")?.detail).toContain("1 bez odkazu");
  });
});

describe("záznam, ktorý neprišiel zo sťahovania", () => {
  /**
   * Presne tá cesta, kvôli ktorej je `stranka` pripínateľná ku každej reklame:
   * riadok z DB, odložené meranie, odpoveď iného procesu. `JSON.parse` vracia
   * `any`, takže typy tu nechránia pred ničím — záznam s chýbajúcimi poľami sa
   * do kontroly dostane a tá o ňom nesmie povedať „v poriadku“.
   */
  const zoJsonu = (text: string): StrankaReklamy => JSON.parse(text);

  it("záznam bez čísel na cudzej adrese nie je ok, a vo vete nesmie byť undefined", () => {
    const n = skontrolujReklamy([reklama({
      odkaz: "https://www.instagram.com/prosapiens.biomechanic/?utm_source=meta&utm_medium=paid&utm_campaign=zari&utm_content=jarek",
      stranka: zoJsonu('{"maFormular":false}'),
    })]);
    const s = najdi(n, "reklama:stranka:");
    expect(s?.stav).toBe("varovanie");
    expect(s?.detail).not.toContain("undefined");
    expect(s?.detail).toContain("HTTP stav");
    expect(s?.detail).toContain("veľkosť odpovede");
  });

  it("záznam so stavom, ale bez veľkosti, hlási neviem a povie, čo chýba", () => {
    const s = najdi(skontrolujReklamy([reklama({ stranka: zoJsonu('{"stav":200,"maFormular":true}') })]), "reklama:stranka:");
    expect(s?.stav).toBe("varovanie");
    expect(s?.detail).not.toContain("undefined");
    expect(s?.detail).toContain("veľkosť odpovede");
    // Čo sa zmeralo, sa z vety nestráca — inak sa nedá odlíšiť neúplný záznam
    // od stránky, ktorá vôbec neodpovedala.
    expect(s?.detail).toContain("HTTP 200");
  });

  it("stránka bez údaja o formulári nie je stránka bez formulára", () => {
    const s = najdi(skontrolujReklamy([reklama({ stranka: zoJsonu('{"stav":200,"bajtov":48000}') })]), "reklama:stranka:");
    expect(s?.stav).toBe("varovanie");
    expect(s?.detail).toContain("nie je, či je na nej formulár");
    // „Formulár tam nie je“ by poslalo Jerryho opravovať web, ktorý je v poriadku.
    expect(s?.detail).not.toContain("nemá ako ozvať");
  });
});

describe("dva záznamy o jednej stránke", () => {
  it("štyristovka z druhej reklamy sa nestratí za dvestovkou z prvej", () => {
    // Do 8. 10. 2026 sa bral PRVÝ pripnutý záznam a ostatné sa zahodili bez
    // slova: riadok hlásil „ok“ a 404, ktorá v dátach bola, sa na výstup
    // nedostala vôbec.
    const n = skontrolujReklamy([
      reklama({ id: "1", nazov: "A", stranka: { stav: 200, bajtov: 48_000, maFormular: true } }),
      reklama({ id: "2", nazov: "B", stranka: { stav: 404, bajtov: 900, maFormular: false } }),
    ]);
    const s = najdi(n, "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("HTTP 404");
    // A druhý záznam sa tiež pomenuje — inak riadok tvrdí, že stránka je
    // rozbitá, a zamlčí, že iné meranie o nej hovorí opak.
    expect(s?.detail).toContain("POZOR");
    expect(s?.detail).toContain("HTTP 200");
    expect(s?.detail).toContain("A, B");
  });

  it("rozpor medzi pripnutým záznamom a mapou stránok rozhodne horší", () => {
    const mapa = new Map<string, StrankaReklamy>([["prosapiens.cz/uvodni-trenink", { stav: 500, bajtov: 300, maFormular: false, ukazka: "Fatal error: Uncaught Error" }]]);
    const s = najdi(skontrolujReklamy([reklama()], mapa), "reklama:stranka:");
    expect(s?.stav).toBe("chyba");
    expect(s?.detail).toContain("HTTP 500");
    expect(s?.detail).toContain("Fatal error");
  });

  it("tri reklamy s tým istým meraním nie sú rozpor a veta je jedna", () => {
    const n = skontrolujReklamy([
      reklama({ id: "1", nazov: "A", odkaz: `${ODKAZ}1` }),
      reklama({ id: "2", nazov: "B", odkaz: `${ODKAZ}2` }),
      reklama({ id: "3", nazov: "C", odkaz: `${ODKAZ}3` }),
    ]);
    const s = najdi(n, "reklama:stranka:");
    expect(s?.stav).toBe("ok");
    expect(s?.detail).not.toContain("POZOR");
    // Zoznam reklám stojí v riadku raz, nie pri každom zázname.
    expect(s?.detail.match(/vedie na ňu/g)?.length).toBe(1);
  });
});

describe("bod 2 a bod 5 nesmú o jednej stránke hovoriť inak", () => {
  it("1,2 kB HTML s formulárom je chyba v oboch bodoch", () => {
    const telo = '<html><body><form data-form></form><div id="psb-skryte"></div>'.padEnd(1200, "x");
    const url = "https://www.prosapiens.cz/uvodni-trenink/";
    const bod5 = najdi(skontrolujReklamy([reklama({ stranka: { stav: 200, bajtov: telo.length, maFormular: true } })]), "reklama:stranka:");
    const bod2 = skontrolujStrankuZivot({ url, stav: 200, konecnaUrl: url, telo, bajtov: telo.length, trvanieMs: 300 });
    // Nie „oba sú chyba“, ale „sú ROVNAKÉ“: keď sa hranica raz zmení, tento
    // test spadne skôr, než sa Jerry pozrie na dva riadky, čo si protirečia.
    expect(bod5?.stav).toBe(bod2.stav);
    expect(bod2.stav).toBe("chyba");
  });

  it("stránka nad spodnou hranicou je v poriadku v oboch bodoch", () => {
    const telo = '<html><body><form data-form></form><div id="psb-skryte"></div>'.padEnd(48_000, "x");
    const url = "https://www.prosapiens.cz/uvodni-trenink/";
    const bod5 = najdi(skontrolujReklamy([reklama({ stranka: { stav: 200, bajtov: telo.length, maFormular: true } })]), "reklama:stranka:");
    const bod2 = skontrolujStrankuZivot({ url, stav: 200, konecnaUrl: url, telo, bajtov: telo.length, trvanieMs: 300 });
    expect(bod5?.stav).toBe(bod2.stav);
    expect(bod2.stav).toBe("ok");
  });
});

describe("kľúč riadku sa medzi behmi nemení", () => {
  it("to isté zadanie v inom poradí a s inými číslami dá tie isté kľúče", () => {
    const prvy = skontrolujReklamy([reklama({ id: "a", odkaz: ODKAZ }), reklama({ id: "b", odkaz: "https://www.prosapiens.cz/test-postury/?utm_source=meta&utm_medium=paid&utm_campaign=zari&utm_content=b" })]);
    const druhy = skontrolujReklamy([
      reklama({ id: "b", odkaz: "https://prosapiens.cz/test-postury/?utm_source=meta&utm_medium=paid&utm_campaign=rijen&utm_content=b", stranka: { stav: 200, bajtov: 51_000, maFormular: true } }),
      reklama({ id: "a", odkaz: `${ODKAZ}&fbclid=xyz` }),
    ]);
    expect(druhy.map((n) => n.kluc).sort()).toEqual(prvy.map((n) => n.kluc).sort());
  });

  it("každý nález má kľúč v tvare oblasť:čo a neprázdnu vetu", () => {
    const n = skontrolujReklamy([reklama(), reklama({ id: "2", odkaz: "https://www.prosapiens.cz/kontakt/", stranka: null })]);
    for (const x of n) {
      expect(x.kluc.startsWith("reklama:")).toBe(true);
      expect(x.detail.length).toBeGreaterThan(20);
      expect(x.nazov.length).toBeGreaterThan(0);
    }
    // Kľúče v jednom behu musia byť rôzne — v tabuľke je to primárny kľúč.
    expect(new Set(n.map((x) => x.kluc)).size).toBe(n.length);
  });
});

describe("sťahovanie stránok (bez siete)", () => {
  type Volanie = { adresa: string };
  const fakeNacitaj = (odpovede: Record<string, { status?: number; telo?: string; url?: string; hod?: boolean }>, log: Volanie[]) =>
    async (adresa: string) => {
      log.push({ adresa });
      const cesta = new URL(adresa).pathname;
      const o = odpovede[cesta] || { status: 200, telo: "<html></html>" };
      if (o.hod) throw new Error("fetch failed");
      const status = o.status ?? 200;
      return { ok: status >= 200 && status < 300, status, url: o.url || adresa, text: async () => o.telo ?? "" };
    };

  const HTML = `<html><body><form class="form" data-form></form><div id="psb-skryte"></div>${"x".repeat(2000)}</body></html>`;

  it("sťahuje len bežiace reklamy, každú stránku raz a s jednorazovou značkou", async () => {
    const log: Volanie[] = [];
    const mapa = await stiahniStrankyReklam(
      [
        reklama({ id: "1", odkaz: `${ODKAZ}&a=1` }),
        reklama({ id: "2", odkaz: `${ODKAZ}&a=2` }),
        reklama({ id: "3", odkaz: "https://www.prosapiens.cz/test-postury/", stav: "PAUSED" }),
        reklama({ id: "4", odkaz: "" }),
      ],
      fakeNacitaj({ "/uvodni-trenink/": { telo: HTML } }, log),
      { znacka: "t1" },
    );
    expect(log.length).toBe(1);
    expect(log[0].adresa).toContain("kokpit=kontrola-t1");
    const s = mapa.get("prosapiens.cz/uvodni-trenink");
    expect(s?.stav).toBe(200);
    expect(s?.maFormular).toBe(true);
    expect(s?.bajtov).toBeGreaterThan(2000);
  });

  it("neúspešná odpoveď si nechá prvých 200 znakov tela", async () => {
    const mapa = await stiahniStrankyReklam(
      [reklama()],
      fakeNacitaj({ "/uvodni-trenink/": { status: 500, telo: `Fatal error: Uncaught Error${"!".repeat(500)}` } }, []),
      { znacka: "t1" },
    );
    const s = mapa.get("prosapiens.cz/uvodni-trenink");
    expect(s?.stav).toBe(500);
    expect(s?.ukazka).toContain("Fatal error");
    expect((s?.ukazka || "").length).toBeLessThanOrEqual(200);
  });

  it("presmerovanie sa zapamätá a prejde až do nálezu", async () => {
    const mapa = await stiahniStrankyReklam(
      [reklama()],
      fakeNacitaj({ "/uvodni-trenink/": { telo: HTML, url: "https://www.prosapiens.cz/sluzby/" } }, []),
      { znacka: "t1" },
    );
    expect(mapa.get("prosapiens.cz/uvodni-trenink")?.presmerovanieNa).toContain("/sluzby/");
    const n = skontrolujReklamy([reklama({ stranka: null })], mapa);
    expect(najdi(n, "reklama:stranka:")?.stav).toBe("chyba");
  });

  it("výnimka pri sťahovaní je zaznamenaná, nie prehltnutá", async () => {
    const mapa = await stiahniStrankyReklam([reklama()], fakeNacitaj({ "/uvodni-trenink/": { hod: true } }, []), { znacka: "t1" });
    expect(mapa.get("prosapiens.cz/uvodni-trenink")?.chyba).toContain("fetch failed");
    expect(mapa.get("prosapiens.cz/uvodni-trenink")?.stav).toBe(0);
  });

  it("odkaz, ktorý nie je adresa, sa nesťahuje a zapíše sa ako chyba", async () => {
    const log: Volanie[] = [];
    const mapa = await stiahniStrankyReklam([reklama({ odkaz: "uvodni-trenink" })], fakeNacitaj({}, log), { znacka: "t1" });
    expect(log.length).toBe(0);
    expect(mapa.get("uvodni-trenink")?.chyba).toContain("nedá rozobrať");
  });

  it("prázdny zoznam reklám nestiahne nič a nespadne", async () => {
    const mapa = await stiahniStrankyReklam([], fakeNacitaj({}, []), { znacka: "t1" });
    expect(mapa.size).toBe(0);
  });

  it("odpoveď, ktorá nikdy nepríde, skončí záznamom s chybou — nie vyvisnutím", async () => {
    // Bez limitu by beh vo Workeri zomrel na strop PRED zápisom do
    // web_kontroly: nevznikol by ani chybový riadok a kontrola by o sebe
    // mlčala. Preto musí byť výsledkom záznam, nie čakanie.
    const mapa = await stiahniStrankyReklam([reklama()], () => new Promise<never>(() => {}), { znacka: "t1", timeoutMs: 30 });
    const s = mapa.get("prosapiens.cz/uvodni-trenink");
    expect(s?.stav).toBe(0);
    expect(s?.chyba).toContain("odpoveď neprišla do");
  });

  it("limit platí aj na čítanie tela — zaseknúť sa dá aj tam", async () => {
    const mapa = await stiahniStrankyReklam(
      [reklama()],
      async (adresa) => ({ ok: true, status: 200, url: adresa, text: () => new Promise<never>(() => {}) }),
      { znacka: "t1", timeoutMs: 30 },
    );
    expect(mapa.get("prosapiens.cz/uvodni-trenink")?.chyba).toContain("odpoveď neprišla do");
  });

  it("jedna visiaca stránka nezastaví ostatné", async () => {
    const mapa = await stiahniStrankyReklam(
      [reklama({ id: "1", odkaz: "https://www.prosapiens.cz/visi/" }), reklama({ id: "2", odkaz: ODKAZ })],
      async (adresa) => {
        if (new URL(adresa).pathname === "/visi/") return new Promise<never>(() => {});
        return { ok: true, status: 200, url: adresa, text: async () => HTML };
      },
      { znacka: "t1", timeoutMs: 30 },
    );
    expect(mapa.get("prosapiens.cz/visi")?.stav).toBe(0);
    expect(mapa.get("prosapiens.cz/uvodni-trenink")?.stav).toBe(200);
  });

  it("sťahovanie dostane prerušovací podpis, aby sa dalo zastaviť zvonku", async () => {
    let podpis: AbortSignal | undefined;
    await stiahniStrankyReklam(
      [reklama()],
      async (adresa, init) => {
        podpis = init?.signal;
        return { ok: true, status: 200, url: adresa, text: async () => HTML };
      },
      { znacka: "t1" },
    );
    expect(podpis).toBeDefined();
    expect(podpis?.aborted).toBe(false);
  });

  it("301 len na koncovú lomku nie je presmerovanie inam a nesvieti červeno", async () => {
    const bezLomky = "https://www.prosapiens.cz/uvodni-trenink?utm_source=meta&utm_medium=paid&utm_campaign=zari&utm_content=jarek";
    const mapa = await stiahniStrankyReklam(
      [reklama({ odkaz: bezLomky })],
      async (adresa) => ({
        ok: true,
        status: 200,
        url: `https://www.prosapiens.cz/uvodni-trenink/?${new URL(adresa).searchParams.toString()}`,
        text: async () => HTML,
      }),
      { znacka: "t1" },
    );
    const s = mapa.get("prosapiens.cz/uvodni-trenink");
    expect(s?.presmerovanieNa).toBeUndefined();
    const n = skontrolujReklamy([reklama({ odkaz: bezLomky, stranka: null })], mapa);
    expect(najdi(n, "reklama:stranka:")?.stav).toBe("ok");
  });

  it("301 na inú cestu je chyba a vo vete nie je náš parameter kokpit", async () => {
    const mapa = await stiahniStrankyReklam(
      [reklama()],
      async () => ({
        ok: true,
        status: 200,
        url: "https://www.prosapiens.cz/sluzby/?kokpit=kontrola-t1&utm_source=meta",
        text: async () => HTML,
      }),
      { znacka: "t1" },
    );
    expect(mapa.get("prosapiens.cz/uvodni-trenink")?.presmerovanieNa).toBe("https://www.prosapiens.cz/sluzby/?utm_source=meta");
    const r = najdi(skontrolujReklamy([reklama({ stranka: null })], mapa), "reklama:stranka:");
    expect(r?.stav).toBe("chyba");
    expect(r?.detail).toContain("/sluzby/");
    // Parameter na obídenie kešu v reklame nikdy nebol — vo vete pre človeka
    // by zvádzal na nesprávnu stopu.
    expect(r?.detail).not.toContain("kokpit=");
  });
});

describe("nerozbalené makro Mety", () => {
  it("`{{campaign.name}}` sa nepočíta ako vyplnená značka", () => {
    // V GA4 by stálo doslovné „{{campaign.name}}" a platená cesta by sa
    // pripisovala nesprávne — kontrola to musí povedať, nie prepustiť.
    const u = utmZRetazca("utm_source=meta&utm_campaign={{campaign.name}}&utm_content=a");
    expect(u.campaign).toBe("");
    expect(u.source).toBe("meta");
    expect(u.content).toBe("a");
  });

  it("zakódované makro v adrese sa chytí tiež", () => {
    expect(utmZRetazca("utm_campaign=%7B%7Bcampaign.name%7D%7D").campaign).toBe("");
  });

  it("obyčajná hodnota so zloženou zátvorkou v názve prejde", () => {
    expect(utmZRetazca("utm_campaign=jesen-2026").campaign).toBe("jesen-2026");
  });
});
