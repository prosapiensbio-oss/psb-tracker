import { describe, expect, it } from "bun:test";

import { cakaNaPotvrdenie, jePotvrdeny, patriDoFiltra, stavPrijmu } from "./filtrePohybov";

describe("filtre zapísaných pohybov", () => {
  const gerich = { suma: 15580, kategoria: "fixne.apps.ai", klienti: "Gerich Jakub" };
  const alza = { suma: -1299, kategoria: "" };
  const claude = { suma: -546, kategoria: "fixne.apps.ai" };
  const vyplata = { suma: -30000, kategoria: "vyplaty.jerry" };
  const wolt = { suma: -320, kategoria: "mimo" };

  it("nezaradené sú len výdavky — príjem kategóriu nepotrebuje", () => {
    expect(patriDoFiltra(alza, "nezaradene")).toBe(true);
    expect(patriDoFiltra({ suma: 6990, kategoria: "" }, "nezaradene")).toBe(false);
    expect(patriDoFiltra(alza, "nezaradene", true)).toBe(false);
  });

  it("príjem nikdy nie je náklad, ani keď má omylom nákladovú kategóriu", () => {
    expect(patriDoFiltra(gerich, "naklady")).toBe(false);
    expect(patriDoFiltra(gerich, "prijmy")).toBe(true);
  });

  it("náklady bez výplat a súkromného, s nezaradenými", () => {
    expect([alza, claude, vyplata, wolt].map((p) => patriDoFiltra(p, "naklady"))).toEqual([true, true, false, false]);
    expect(patriDoFiltra(vyplata, "vyplaty")).toBe(true);
    expect(patriDoFiltra(wolt, "sukromne")).toBe(true);
    // Telefón 50/50 (náklad + výplata) je rozdelený — patrí k nákladom.
    expect(patriDoFiltra({ suma: -8999, kategoria: "" }, "naklady", true)).toBe(true);
  });

  it("stav príjmu", () => {
    expect(stavPrijmu(gerich)).toBe("klient");
    expect(stavPrijmu({ suma: 500, kategoria: "", nieKlient: true })).toBe("nieKlient");
    expect(stavPrijmu({ suma: 500, kategoria: "", nieKlient: true }, true)).toBe("rozdelene");
    expect(stavPrijmu({ suma: 6990, kategoria: "" })).toBe("caka");
  });
});

describe("oranžová fajka", () => {
  it("návrh Kokpitu čaká, ručné a rozdelené nie", () => {
    expect(cakaNaPotvrdenie({ suma: -1500, kategoria: "variabilne.sluzby.ine" })).toBe(true);
    expect(cakaNaPotvrdenie({ suma: -1500, kategoria: "vyplaty.terezka", potvrdene: true })).toBe(false);
    expect(cakaNaPotvrdenie({ suma: -8999, kategoria: "" }, true)).toBe(false);
    expect(cakaNaPotvrdenie({ suma: -200, kategoria: "spolocne.Potraviny", typ: "hotovosť" })).toBe(false);
  });
  it("nezaradený výdavok ani príjem sa nepotvrdzujú", () => {
    expect(cakaNaPotvrdenie({ suma: -605, kategoria: "" })).toBe(false);
    expect(cakaNaPotvrdenie({ suma: 6990, kategoria: "" })).toBe(false);
    expect(patriDoFiltra({ suma: -605, kategoria: "fixne.apps.ai" }, "potvrdit")).toBe(true);
  });
});

describe("potvrdené zmiznú z plochy", () => {
  it("potvrdený, rozdelený a hotovosť sú hotové; návrh a nezaradený nie", () => {
    expect(jePotvrdeny({ suma: -1500, kategoria: "vyplaty.terezka", potvrdene: true })).toBe(true);
    expect(jePotvrdeny({ suma: -8999, kategoria: "" }, true)).toBe(true);
    expect(jePotvrdeny({ suma: -200, kategoria: "spolocne.Potraviny", typ: "hotovosť" })).toBe(true);
    expect(jePotvrdeny({ suma: -605, kategoria: "fixne.apps.ai" })).toBe(false);
    expect(jePotvrdeny({ suma: -605, kategoria: "" })).toBe(false);
    expect(jePotvrdeny({ suma: 6990, kategoria: "", potvrdene: true })).toBe(false);
  });
});
