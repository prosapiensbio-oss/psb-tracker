import { describe, expect, it } from "bun:test";

import { cisloPreBranu, dlzkaSpravy, textSms } from "./sms";

describe("cisloPreBranu", () => {
  it("české číslo bez predvoľby dostane +420", () => {
    expect(cisloPreBranu("605965949")).toBe("+420605965949");
    expect(cisloPreBranu("776 491 800")).toBe("+420776491800");
    expect(cisloPreBranu("733-161-399")).toBe("+420733161399");
  });

  it("číslo s predvoľbou sa nechá tak", () => {
    expect(cisloPreBranu("+420605965949")).toBe("+420605965949");
    expect(cisloPreBranu("00420605965949")).toBe("+420605965949");
    expect(cisloPreBranu("420605965949")).toBe("+420605965949");
    expect(cisloPreBranu("+421905123456")).toBe("+421905123456");
  });

  it("slovenský domáci tvar s nulou ide na +421", () => {
    expect(cisloPreBranu("0905123456")).toBe("+421905123456");
  });

  it("nezmysel sa neposiela", () => {
    // Osem číslic je v dátach naozaj (Martina Šintalová) a je to preklep.
    expect(cisloPreBranu("73521600")).toBeNull();
    expect(cisloPreBranu("")).toBeNull();
    expect(cisloPreBranu("nemá telefón")).toBeNull();
    expect(cisloPreBranu("+42060")).toBeNull();
  });
});

describe("dlzkaSpravy", () => {
  it("bez diakritiky sa zmestí 160 znakov", () => {
    const v = dlzkaSpravy("A".repeat(160));
    expect(v).toMatchObject({ znakov: 160, unicode: false, sprav: 1 });
    expect(dlzkaSpravy("A".repeat(161)).sprav).toBe(2);
  });

  it("jediný mäkčeň zráža limit na 70", () => {
    // Toto je celý dôvod, prečo v SMS nie je zoznam tréningov.
    expect(dlzkaSpravy("A".repeat(71)).sprav).toBe(1);
    expect(dlzkaSpravy(`${"A".repeat(70)}č`).sprav).toBe(2);
  });

  it("prázdny text nie je žiadna správa", () => {
    expect(dlzkaSpravy("").sprav).toBe(0);
  });

  it("zložené zátvorky zaberajú v GSM dva znaky", () => {
    expect(dlzkaSpravy("{}").znakov).toBe(4);
  });
});

describe("textSms", () => {
  it("keď balíček došiel, povie to hneď", () => {
    const t = textSms({ oslovenie: "Richard", trener: "Jerry", zostatok: 0, sMailom: true });
    expect(t).toBe("Richard, dnes si mal poslednú hodinu z balíčka. V maili nájdeš dochádzku aj QR na platbu. Jerry, ProSapiens");
    // Dve správy — s diakritikou sa inak nedá.
    expect(dlzkaSpravy(t).sprav).toBe(2);
  });

  it("keď hodiny ešte sú, povie koľko", () => {
    expect(textSms({ oslovenie: "Eva", trener: "Terezka", zostatok: 2, sMailom: false }))
      .toBe("Eva, v balíčku ti zostávajú 2 h. Terezka, ProSapiens");
  });

  it("bez mailu sa naň neodkazuje", () => {
    expect(textSms({ oslovenie: "Eva", trener: "Jerry", zostatok: 0, sMailom: false })).not.toContain("maili");
  });
});
