import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Prekliky — odkaz, ktorý vedie na neexistujúcu podzáložku, sa nedá odhaliť
 * inak než klikaním. Tento test to robí za nás: obe strany číta zo ZDROJÁKU,
 * takže premenovanie podzáložky (alebo odkazu) spadne hneď, nie až keď na to
 * niekto klikne.
 *
 * Producenti: onNavigate("tab","sub"), navigate(...), cieľ v poli `client`
 * („tab|sub"), rituály (ciel: { tab, sub }).
 * Konzumenti: zoznamy podzáložiek v komponentoch.
 *
 * Známe presmerovania sú vymenované nižšie — navigate() ich prekladá, takže
 * nie sú chyba.
 */

const KOREN = new URL("../../", import.meta.url).pathname;
const zdroj = (p: string) => readFileSync(`${KOREN}${p}`, "utf8");
const komponenty = readdirSync(`${KOREN}components/psb`).filter((f) => f.endsWith(".tsx"));
const vsetko = [
  ...komponenty.map((f) => zdroj(`components/psb/${f}`)),
  zdroj("lib/psb/compute.ts"),
  zdroj("lib/psb/rituals.ts"),
].join("\n");

/** Podzáložky, ktoré obrazovky naozaj ponúkajú — vytiahnuté zo zdrojáku. */
const idZo = (text: string, od: string, doo: string): string[] => {
  const i = text.indexOf(od);
  if (i < 0) return [];
  const usek = text.slice(i, text.indexOf(doo, i) > 0 ? text.indexOf(doo, i) : i + 4000);
  return [...usek.matchAll(/\{\s*id:\s*"([a-z0-9]+)"/g)].map((m) => m[1]);
};

const SUBY: Record<string, string[]> = {
  vzas: idZo(zdroj("components/psb/Vzas.tsx"), "const SEKCIE_PENIAZE", "const sekciaPre"),
  vysledky: idZo(zdroj("components/psb/Vzas.tsx"), "export const VYSLEDKY_LISTY", "];"),
  marketing: idZo(zdroj("components/psb/Marketing.tsx"), "{ id: \"dopyty\", label: \"Dopyty\"", "]}"),
  klienti: idZo(zdroj("components/psb/Klienti.tsx"), "{ id: \"klienti\", label: \"Klienti\" }", "]}"),
  treningy: idZo(zdroj("components/psb/Treningy.tsx"), "{ id: \"prehled\"", "]}"),
  mesiac: ["udaje", "vysledky"],
};

/** Ciele bez podzáložiek. */
const HOLE = new Set(["dashboard", "kalendar", "tracker", "jarvis", "udaje", "6m", "mesiac"]);
/** Staré id, ktoré navigate() prekladá — nie sú chyba. */
const ALIAS: Record<string, string> = { financie: "vzas", vysledky: "vysledky", udaje: "mesiac", "6m": "klienti", tracker: "tracker" };

describe("podzáložky sa dajú prečítať zo zdrojáku", () => {
  it("každá obrazovka ich má aspoň dve", () => {
    for (const [tab, zoz] of Object.entries(SUBY)) {
      expect(zoz.length, `${tab} — nenašiel som podzáložky, regex sa rozišiel so zdrojákom`).toBeGreaterThan(1);
    }
  });
});

describe("každý preklik vedie na existujúcu obrazovku", () => {
  /** (tab, sub) → chyba, alebo null keď je cieľ v poriadku. */
  const over = (tab: string, sub: string | undefined, kde: string): string | null => {
    const t = ALIAS[tab] || tab;
    if (t === "klienti" && sub === "dopyty") return null;      // presmerované do Marketingu
    if (t === "marketing" && sub === "referencie") return null; // presmerované ku Klientom
    if (t === "vzas" && ["klienti", "cashflow", "trzby", "sedenia", "predikcia"].includes(sub || "")) {
      // legacy „financie" mapa — navigate ich prekladá na platné listy
      if (sub === "klienti") return null;
    }
    const znamy = HOLE.has(t) || t in SUBY;
    if (!znamy) return `${kde}: neznámy cieľ „${tab}"`;
    if (!sub) return null;
    const platne = SUBY[t];
    if (!platne) return null;
    return platne.includes(sub) ? null : `${kde}: „${tab}|${sub}" — taká podzáložka neexistuje (má: ${platne.join(", ")})`;
  };

  it("onNavigate / navigate", () => {
    const chyby: string[] = [];
    for (const m of vsetko.matchAll(/\bo?n?[Nn]avigate\(\s*"([a-z0-9]+)"(?:\s*,\s*"([a-z0-9]*)")?/g)) {
      const ch = over(m[1], m[2] || undefined, "onNavigate");
      if (ch) chyby.push(ch);
    }
    expect(chyby).toEqual([]);
  });

  it("ciele v poli client tab-sub", () => {
    const chyby: string[] = [];
    for (const m of vsetko.matchAll(/client:\s*[`"]([a-z0-9]+)\|([a-z0-9]*)/g)) {
      const ch = over(m[1], m[2] || undefined, "register");
      if (ch) chyby.push(ch);
    }
    expect(chyby).toEqual([]);
  });

  it("rituály (kroky uzávierky)", () => {
    const r = zdroj("lib/psb/rituals.ts");
    const chyby: string[] = [];
    for (const m of r.matchAll(/tab:\s*"([a-z0-9]+)"(?:\s*,\s*sub:\s*"([a-z0-9]*)")?/g)) {
      const ch = over(m[1], m[2] || undefined, "rituál");
      if (ch) chyby.push(ch);
    }
    expect(chyby).toEqual([]);
  });
});

describe("adresy v tabuľkách sú preklikávacie", () => {
  // Jerry, 19. 8. 2026: appka povie „táto stránka má zlý titulok" a hľadanie
  // tej stránky nechá na človeku. Kto pridá ďalšiu tabuľku so stĺpcom
  // Stránka, nech na ňu dá odkaz — tento test mu to pripomenie a rovno
  // povie, ktorý riadok v ktorom súbore ho nemá.
  it("stĺpec s adresou stránky kreslí OdkazStranky", () => {
    const bezOdkazu: string[] = [];
    for (const f of komponenty) {
      for (const riadok of zdroj(`components/psb/${f}`).split("\n")) {
        if (riadok.includes('label: "Stránka"') && !riadok.includes("OdkazStranky")) {
          bezOdkazu.push(`${f}: ${riadok.trim()}`);
        }
      }
    }
    expect(bezOdkazu).toEqual([]);
  });
});
