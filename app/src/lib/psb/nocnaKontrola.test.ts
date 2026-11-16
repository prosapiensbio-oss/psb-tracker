import { describe, expect, it } from "bun:test";

import { kontrolujData, podobniKlienti, type VstupKontroly } from "./nocnaKontrola";

const STOKLASKOVCI = ["Iva Stoklaskova", "Kateřina Stoklásková", "Veronika Stoklaskova"];

const vstup = (z: Partial<VstupKontroly>): VstupKontroly => ({
  dnes: "2026-11-16", klienti: [], trenerKlienta: {}, aktivni: [], udalosti: [], prijmyBezKlienta: [], priradene: [], ...z,
});

describe("podobniKlienti", () => {
  it("Stoklasek z banky je Svetopluk Stoklasko, nie Stokláskové (15. 11. 2026)", () => {
    expect(podobniKlienti("RNDr.Stoklásek Svato", ["Svetopluk Stoklasko", ...STOKLASKOVCI])).toEqual(["Svetopluk Stoklasko"]);
  });
  it("presné priezvisko nie je nález — to appka spáruje sama", () => {
    expect(podobniKlienti("IVA STOKLÁSKOVÁ", STOKLASKOVCI)).toEqual([]);
    expect(podobniKlienti("Matěj Procházka", ["Matěj Procházka"])).toEqual([]);
  });
  it("Procházka z banky je Prochadzka v Kokpite", () => {
    expect(podobniKlienti("prosapiens · Matěj Procházka", ["Matej Prochadzka"])).toEqual(["Matej Prochadzka"]);
  });
  it("cudzie meno nesedí", () => {
    expect(podobniKlienti("Alza.cz a.s.", ["Anna Nová", "Jan Kral"])).toEqual([]);
  });
});

describe("kontrolujData", () => {
  it("tréning bez klienta s menom známeho klienta ide jeho trénerovi", () => {
    const n = kontrolujData(vstup({
      klienti: ["Svatopluk Stoklásek", ...STOKLASKOVCI],
      udalosti: [
        { uid: "a", trener: "Terezka", zaciatok: "2026-11-12T08:30", nazov: "Svetopluk Stoklásko", klient: null, typ: null, zmizla: false },
        { uid: "b", trener: "Terezka", zaciatok: "2026-11-23T08:30", nazov: "Svetopluk Stoklasko", klient: null, typ: null, zmizla: false },
      ],
    }));
    expect(n.map((x) => [x.druh, x.trener, x.klient])).toEqual([
      ["kalendar", "Terezka", "Svatopluk Stoklásek"],
      ["kalendar", "Terezka", "Svatopluk Stoklásek"],
    ]);
  });
  it("presná zhoda celého mena bez klienta je tiež nález (12. 11. 2026)", () => {
    const n = kontrolujData(vstup({
      klienti: ["Svetopluk Stoklasko"],
      udalosti: [{ uid: "a", trener: "Terezka", zaciatok: "2026-11-12T08:30", nazov: "Svetopluk Stoklásko", klient: null, typ: null, zmizla: false }],
    }));
    expect(n).toHaveLength(1);
    expect(n[0].text).toContain("12. 11.");
  });
  it("prezývka, zrušená udalosť, staré okno a súkromná vec nie sú nález", () => {
    const n = kontrolujData(vstup({
      klienti: ["Matej Prochadzka"],
      udalosti: [
        { uid: "a", trener: "Terezka", zaciatok: "2026-11-12T08:30", nazov: "Matej", klient: null, typ: null, zmizla: false },
        { uid: "b", trener: "Terezka", zaciatok: "2026-11-12T09:30", nazov: "Matej Prochazka", klient: null, typ: null, zmizla: true },
        { uid: "c", trener: "Terezka", zaciatok: "2026-06-17T09:00", nazov: "Matej Prochádzka", klient: null, typ: null, zmizla: false },
        { uid: "d", trener: "Terezka", zaciatok: "2026-11-13T09:00", nazov: "Matej Prochazka", klient: null, typ: "sukromne", zmizla: false },
      ],
    }));
    expect(n).toEqual([]);
  });
  it("príjem bez návrhu od podobného mena ide trénerovi klienta", () => {
    const n = kontrolujData(vstup({
      klienti: ["Svetopluk Stoklasko", ...STOKLASKOVCI],
      trenerKlienta: { "Svetopluk Stoklasko": "Terezka" },
      prijmyBezKlienta: [{ id: "f1", datum: "2026-11-10", suma: 8000, text: "RNDr.Stoklásek Svato" }],
    }));
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ druh: "platba", trener: "Terezka", klient: "Svetopluk Stoklasko", kluc: "kontrola-dat|platba|f1" });
    expect(n[0].text).toContain("8 000 Kč");
  });
  it("aktívny klient, ktorý platí pod iným priezviskom", () => {
    const n = kontrolujData(vstup({
      klienti: ["Matej Prochadzka"], aktivni: ["Matej Prochadzka"], trenerKlienta: { "Matej Prochadzka": "Jerry" },
      priradene: [{ klient: "Matej Prochadzka", datum: "2026-10-01", text: "prosapiens · Matěj Procházka" }],
    }));
    expect(n.map((x) => [x.druh, x.kluc])).toEqual([["meno", "kontrola-dat|meno|Matej Prochadzka"]]);
  });
  it("prevod, ktorý písal Jerry, ani neaktívny klient nie sú nález", () => {
    const n = kontrolujData(vstup({
      klienti: ["Panagiotis Tsiolis", "Irena Muselova"], aktivni: ["Panagiotis Tsiolis"],
      priradene: [
        { klient: "Panagiotis Tsiolis", datum: "2026-10-01", text: "Tsioli akis · Filip Stráňavský" },
        { klient: "Irena Muselova", datum: "2026-10-01", text: "Musilova irina" },
      ],
    }));
    expect(n).toEqual([]);
  });
});
