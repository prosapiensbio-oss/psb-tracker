import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { ritualy } from "./rituals";

/**
 * Týždenná únava je zápis JEDNÉHO človeka o sebe.
 *
 * Do 29. 8. 2026 stačilo, aby hodnotenie napísal ktokoľvek z dvojice, a
 * pripomienka zhasla obom — Terezka svoj týždeň nemala kde nájsť. Tieto
 * testy držia, že cudzí zápis ten môj neodškrtne.
 */
const PIATOK = new Date("2026-08-28T09:00:00Z");
const STREDA = new Date("2026-08-26T09:00:00Z");
const TW = "2026-08-24";

const MINULY = "2026-08-17";

/** Rituály za PREBIEHAJÚCI týždeň. */
const tyzdenne = (dnes: Date, zaznam: Record<string, string>, minuly: Record<string, string> = { jerry_score: "5", terezka_score: "5" }) =>
  ritualy(dnes, { [TW]: zaznam, [MINULY]: minuly }, {}, { chybaju: [] })
    .filter((r) => r.druh === "tyzden" && r.ciel.tyzden === TW);

/** Rituály za MINULÝ týždeň. */
const minuleTyzdne = (dnes: Date, zaznam: Record<string, string>, minuly: Record<string, string>) =>
  ritualy(dnes, { [TW]: zaznam, [MINULY]: minuly }, {}, { chybaju: [] })
    .filter((r) => r.druh === "tyzden" && r.ciel.tyzden === MINULY);

describe("pripomienka týždennej únavy", () => {
  it("v piatok pýta oboch, keď nikto nezapísal", () => {
    const r = tyzdenne(PIATOK, {});
    expect(r.map((x) => x.trener).sort()).toEqual(["Jerry", "Terezka"]);
    expect(r.every((x) => x.splatne)).toBe(true);
  });

  it("Jerryho zápis NEZHASÍ Terezkinu pripomienku", () => {
    const r = tyzdenne(PIATOK, { jerry_score: "7" });
    const jerry = r.find((x) => x.trener === "Jerry")!;
    const terezka = r.find((x) => x.trener === "Terezka")!;
    expect(jerry.splatne).toBe(false);
    expect(jerry.hotove).toBe(true);
    expect(terezka.splatne).toBe(true);
  });

  it("poznámka bez hodnotenia nestačí — to je presne týždeň 24. 8. 2026", () => {
    const r = tyzdenne(PIATOK, { jerry_score: "7", terezka_note: "psík mal zdravotné problémy" });
    expect(r.find((x) => x.trener === "Terezka")!.splatne).toBe(true);
  });

  it("pred piatkom sa nepýta", () => {
    expect(tyzdenne(STREDA, {}).some((x) => x.splatne)).toBe(false);
  });

  it("klik vedie na konkrétny týždeň v Tréningy → Prehľad", () => {
    for (const r of tyzdenne(PIATOK, {})) {
      expect(r.ciel).toEqual({ tab: "treningy", sub: "prehled", tyzden: TW });
    }
  });

  it("každý má vlastný kľúč, takže odklepnutie jedného neumlčí druhého", () => {
    const r = tyzdenne(PIATOK, {});
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
  });
});

/**
 * Klik má viesť až k písaniu, nie k tabuľke.
 *
 * Register skladá cieľ do reťazca „tab|sub|t:PONDELOK" a Tréningy podľa tvaru
 * rozlišujú „zvýrazni riadok" (štítok „24.8.") od „ROZBAĽ ho" (RRRR-MM-DD).
 * Keď Dashboard posielal štítok, tabuľka sa len prefiltrovala a políčko na
 * náročnosť zostalo zabalené.
 */
describe("cieľ prekliku otvára riadok týždňa", () => {
  const dash = readFileSync(new URL("../../components/psb/Dashboard.tsx", import.meta.url).pathname, "utf8");
  const treningy = readFileSync(new URL("../../components/psb/Treningy.tsx", import.meta.url).pathname, "utf8");

  it("Dashboard posiela pondelok, nie štítok riadku", () => {
    expect(dash).toContain('{ week: zapisCiel[2].slice(2), nonce: Date.now() }');
    expect(dash).not.toContain("week: weekLabel(zapisCiel[2].slice(2))");
  });

  it("Tréningy na tvar RRRR-MM-DD riadok rozbalia", () => {
    expect(treningy).toContain("setOpenWeek(focus.week)");
    expect(treningy).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(focus\.week\)/);
  });
});

/**
 * Jeden týždeň spätne (Jerry, 29. 8. 2026).
 *
 * Bez toho zmizol v pondelok aj nezapísaný týždeň a už sa nikdy nevrátil —
 * tak zostal navždy prázdny týždeň 17. 8. 2026. Hranica je zámerne JEDEN
 * týždeň: viac by nakopilo stĺpec starých riadkov.
 */
describe("dobiehanie minulého týždňa", () => {
  it("nezapísaný minulý týždeň sa pýta aj v stredu", () => {
    const r = minuleTyzdne(STREDA, {}, {});
    expect(r.map((x) => x.trener).sort()).toEqual(["Jerry", "Terezka"]);
    expect(r.every((x) => x.splatne)).toBe(true);
  });

  it("zapísaný minulý týždeň sa nepýta", () => {
    const r = minuleTyzdne(STREDA, {}, { jerry_score: "4", terezka_score: "6" });
    expect(r.some((x) => x.splatne)).toBe(false);
  });

  it("aj tu platí po osobách", () => {
    const r = minuleTyzdne(STREDA, {}, { jerry_score: "4" });
    expect(r.find((x) => x.trener === "Jerry")!.splatne).toBe(false);
    expect(r.find((x) => x.trener === "Terezka")!.splatne).toBe(true);
  });

  it("klik vedie na minulý týždeň, nie na tento", () => {
    for (const r of minuleTyzdne(STREDA, {}, {})) {
      expect(r.ciel).toEqual({ tab: "treningy", sub: "prehled", tyzden: MINULY });
    }
  });

  it("dva týždne dozadu sa už nepýta — hranica je jeden", () => {
    const vsetky = ritualy(STREDA, {}, {}, { chybaju: [] }).filter((r) => r.druh === "tyzden");
    const tyzdne = new Set(vsetky.map((r) => r.ciel.tyzden));
    expect([...tyzdne].sort()).toEqual([MINULY, TW]);
  });

  it("v stredu je otvorený len minulý týždeň, prebiehajúci čaká na piatok", () => {
    const vsetky = ritualy(STREDA, {}, {}, { chybaju: [] }).filter((r) => r.druh === "tyzden" && r.splatne);
    expect(vsetky.every((r) => r.ciel.tyzden === MINULY)).toBe(true);
  });
});

/**
 * Prepísanie zápisu prázdnym formulárom (29. 8. 2026).
 *
 * Riadok týždňa sa cez pripomienku otvoril skôr, než dorazili dáta.
 * `useState(entry)` berie hodnotu len pri prvom vykreslení, takže formulár
 * zostal prázdny aj potom, čo sa týždeň načítal — a uloženie prepísalo
 * poznámky, ktoré tam boli. Týždňu 24. 8. tak zmizli obe poznámky.
 */
describe("formulár týždňa neprepíše, čo už je zapísané", () => {
  const treningy = readFileSync(new URL("../../components/psb/Treningy.tsx", import.meta.url).pathname, "utf8");
  const api = readFileSync(new URL("../../routes/api/vzas-weeks.ts", import.meta.url).pathname, "utf8");

  it("draft dobehne dáta, kým sa políčok nikto nedotkol", () => {
    expect(treningy).toContain("const dotknute = useRef(false)");
    expect(treningy).toContain("if (!dotknute.current) setDraft(entry ?? {})");
  });

  it("po prvom písmene sa draft zamkne", () => {
    expect(treningy).toContain("dotknute.current = true; setDraft");
  });

  it("server zlučuje, neprepisuje celý riadok", () => {
    expect(api).toContain("const zluc = { ...povodne, ...data }");
    expect(api).not.toMatch(/\.bind\(week, JSON\.stringify\(data\)/);
  });

  it("predchádzajúca podoba sa odkladá do auditu", () => {
    expect(api).toContain('"tyzden"');
    expect(api).toContain("stare.data !== novy");
  });
});

/**
 * Dve rovnaké položky bez mena vyzerali ako štyrikrát tá istá chyba.
 * Prvý pokus dal mená do nadpisov — riadky ostali štyri. Riešenie je
 * zlúčenie (viď nižšie); meno sa nesie v popise, nie v nadpise.
 */
describe("okno Čo chceš zapísať nekreslí duplicity", () => {
  const zapis = readFileSync(new URL("../../components/psb/Zapis.tsx", import.meta.url).pathname, "utf8");
  it("kľúč v zozname je jedinečný", () => {
    expect(zapis).not.toContain("key={p.nadpis}");
  });
  it("rituály sa do zoznamu nesypú po jednom", () => {
    expect(zapis).not.toContain("...ritualy.map((r) => ({");
  });
});

/** „Stále sú tu 4" — okno Čo chceš zapísať zlučuje rituály po ľuďoch. */
describe("okno Čo chceš zapísať zlučuje položky", () => {
  const zapis = readFileSync(new URL("../../components/psb/Zapis.tsx", import.meta.url).pathname, "utf8");

  it("existuje zlučovanie a zoznam ho používa", () => {
    expect(zapis).toContain("function zlucRitualy");
    expect(zapis).toContain("...zlucRitualy(ritualy)");
  });

  it("zlúčený riadok povie, na koho sa čaká", () => {
    expect(zapis).toContain("`Chýba: ${chybaju.join(\" a \")}");
  });

  it("odznak počíta zlúčené riadky, nie rituály", () => {
    expect(zapis).toContain('zlucRitualy(ritualy).filter((p) => p.stav === "chyba").length');
    expect(zapis).not.toContain("ritualy.filter((r) => r.splatne).length");
  });

  it("rôzne týždne sa nezlejú do jedného riadku", () => {
    // Kľúč skupiny nesie cieľový týždeň.
    expect(zapis).toContain("r.ciel.tyzden || r.ciel.mesiac");
  });
});

/** Dobehnutý riadok s nadpisom Chýba si protirečí — má zmiznúť. */
describe("dobehnutý minulý týždeň zo zoznamu zmizne", () => {
  it("rituál dobiehania je označený", () => {
    const r = minuleTyzdne(STREDA, {}, {});
    expect(r.every((x) => x.tichyKedHotovy)).toBe(true);
  });
  it("prebiehajúci týždeň označený nie je, potvrdenie tam má zostať", () => {
    const r = tyzdenne(PIATOK, {});
    expect(r.every((x) => !x.tichyKedHotovy)).toBe(true);
  });
  it("zoznam ich odfiltruje, keď sú hotové", () => {
    const zapis = readFileSync(new URL("../../components/psb/Zapis.tsx", import.meta.url).pathname, "utf8");
    expect(zapis).toContain("zoz[0].tichyKedHotovy && zoz.every((r) => r.hotove)");
  });
});
