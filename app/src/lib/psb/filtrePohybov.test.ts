import { describe, expect, it } from "bun:test";

import { cakaNaPotvrdenie, jePotvrdeny, patriDoFiltra, stavPrijmu, istaVyplata } from "./filtrePohybov";

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
    // Presun peňazí nie je náklad (prevod z 27. 10. 2026 s kategóriou „presun").
    expect(patriDoFiltra({ suma: -4741, kategoria: "presun" }, "naklady")).toBe(false);
    expect(patriDoFiltra({ suma: -4741, kategoria: "rezerva" }, "naklady")).toBe(false);
    // Telefón 50/50 (náklad + výplata) je rozdelený — patrí k nákladom.
    expect(patriDoFiltra({ suma: -8999, kategoria: "" }, "naklady", true)).toBe(true);
  });

  it("stav príjmu", () => {
    expect(stavPrijmu(gerich)).toBe("klient");
    expect(stavPrijmu({ suma: 500, kategoria: "", nieKlient: true })).toBe("nieKlient");
    expect(stavPrijmu({ suma: 500, kategoria: "", nieKlient: true }, true)).toBe("rozdelene");
    expect(stavPrijmu({ suma: 6990, kategoria: "" })).toBe("caka");
    // Loptička za 200 Kč nečaká na priradenie klientovi (Jerry, 8. 10. 2026).
    expect(stavPrijmu({ suma: 200, kategoria: "prijem.produkt" })).toBe("zaradeny");
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

describe("rezerva firmy (29. 10. 2026)", () => {
  const rezerva = { suma: -4741, kategoria: "rezerva" };
  it("nie je náklad a nečaká na potvrdenie", () => {
    expect(patriDoFiltra(rezerva, "naklady")).toBe(false);
    expect(cakaNaPotvrdenie(rezerva)).toBe(false);
    expect(jePotvrdeny(rezerva)).toBe(true);
  });
});

describe("istá výplata sa nepotvrdzuje (24. 11. 2026)", () => {
  const v = (kategoria: string, protistrana: string, poznamka: string) => ({ suma: -1500, kategoria, protistrana, poznamka });
  it("prevod na vlastný účet s poznámkou výplata", () => {
    expect(istaVyplata(v("vyplaty.jerry", "2323438014/3030", "Jerry vyplata"))).toBe(true);
    expect(istaVyplata(v("vyplaty.terezka", "2325740014/3030", "Terezka · Terezka vyplata"))).toBe(true);
    expect(cakaNaPotvrdenie(v("vyplaty.jerry", "2323438014/3030", "Jerry vyplata · Jerry vyplata box"))).toBe(false);
  });
  it("nákup kartou s poznámkou Terka výplata", () => {
    expect(istaVyplata(v("vyplaty.terezka", "Perio Clinic S.R.O.", "Nákup: Perio Clinic · Terka výplata"))).toBe(true);
    expect(istaVyplata(v("vyplaty.terezka", "SP *SKD MARTIN", "Vyplata terka NET transakce"))).toBe(true);
  });
  it("text a kategória sa rozchádzajú → čaká (Bolt 17. 11.)", () => {
    expect(istaVyplata(v("vyplaty.jerry", "Bolt", "Nákup: Bolt · Terka Výplata"))).toBe(false);
    expect(cakaNaPotvrdenie(v("vyplaty.jerry", "Bolt", "Nákup: Bolt · Terka Výplata"))).toBe(true);
  });
  it("bez slova výplata alebo bez človeka → čaká", () => {
    expect(istaVyplata(v("vyplaty.jerry", "2323438014/3030", "Jerry Rezerva"))).toBe(false);
    expect(istaVyplata(v("vyplaty.jerry", "APPLE.COM/BILL", "Nákup: APPLE.COM/BILL"))).toBe(false);
    expect(istaVyplata(v("vyplaty", "4277589389/0800", "Ovečkárna.cz · Spoločna vyplata"))).toBe(false);
    expect(istaVyplata(v("vyplaty.delene", "ZDRAVI NAPROTI 01", "Potraviny"))).toBe(false);
  });
  it("pohyb rozpísaný podľa faktúry nečaká", () => {
    expect(cakaNaPotvrdenie({ suma: -1269, kategoria: "variabilne.prevadzka2.pomocky", rozpisanyFakturou: true })).toBe(false);
    expect(cakaNaPotvrdenie({ suma: -1269, kategoria: "variabilne.prevadzka2.pomocky" })).toBe(true);
  });
});
