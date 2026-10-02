import { describe, expect, it } from "bun:test";

import { chybaOdosielatela, cisloPreBranu, dlzkaSpravy, rodZMena, textSms, textSmsPlatba } from "./sms";

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

describe("textSms — jedno znenie pre všetky situácie okolo hodín", () => {
  const ODKAZ = "https://prosapiens.cz/v/cVz4vMRTHMKT";

  it("je to Jerryho veta, 2. 10. 2026", () => {
    expect(textSms({ oslovenie: "Lukas", trener: "Jerry", datum: "9. 9. 2026", odkaz: ODKAZ }))
      .toBe(`Ahoj Lukas, tady mas prehled hodin a QR na platbu za balicek z 9. 9. 2026: ${ODKAZ} Jerry`);
  });

  it("stav klienta do textu NEVSTUPUJE — povie ho stránka", () => {
    // Päť znení (zostáva / dnes posledná / dochodený / nad rámec / platba)
    // viedlo na ten istý odkaz a appka hovorila dvakrát to isté. Pri
    // Lukášovi Hanusovi sa to rozišlo: SMS tvrdila jedno, stránka druhé.
    const spolu = { oslovenie: "Lukas", trener: "Jerry", datum: "9. 9. 2026", odkaz: ODKAZ };
    const t = textSms(spolu);
    for (const slovo of ["zostava", "zostavaju", "poslednu", "dochodeny", "nad ramec", "chyba", "Kc"]) {
      expect(t).not.toContain(slovo);
    }
  });

  it("rod sa nerieši — v texte nie je sloveso v minulom čase", () => {
    expect(textSms({ oslovenie: "Marketa", trener: "Terezka", odkaz: ODKAZ })).not.toMatch(/mal|mala/);
  });

  it("bez dátumu veta drží", () => {
    expect(textSms({ oslovenie: "Jan", trener: "Terezka", odkaz: ODKAZ }))
      .toBe(`Ahoj Jan, tady mas prehled hodin a QR na platbu: ${ODKAZ} Terezka`);
  });

  it("bez diakritiky a do jednej správy aj s dlhým menom", () => {
    for (const oslovenie of ["Jan", "Lukas", "Bartolomej"]) {
      const t = textSms({ oslovenie, trener: "Terezka", datum: "9. 9. 2026", odkaz: ODKAZ });
      expect(t).not.toMatch(/[áäčďéíľĺňóôŕšťúýžÁČĎÉÍĽŇÓŠŤÚÝŽěřůŘ]/);
      expect(dlzkaSpravy(t).sprav).toBe(1);
    }
  });

  it("bez odkazu sa neposiela veta do prázdna", () => {
    expect(textSms({ oslovenie: "Jan", trener: "Jerry", sMailom: true })).toContain("v maili");
    expect(textSms({ oslovenie: "Jan", trener: "Jerry" })).toContain("ozvi sa mi");
  });

  it("textSmsPlatba je tá istá správa — len iný názov", () => {
    const v = { oslovenie: "Lukas", trener: "Jerry", datum: "9. 9. 2026", odkaz: ODKAZ };
    expect(textSmsPlatba({ ...v, suma: 6990 })).toBe(textSms(v));
  });
});

describe("rodZMena — heuristika, prepínač ju opraví", () => {
  it("priezvisko na -ová je žena", () => {
    expect(rodZMena("Hana Marková")).toBe("z");
    expect(rodZMena("Monika Schonwalderova")).toBe("z");
  });
  it("Lucie aj Naďa sú ženy podľa krstného mena", () => {
    expect(rodZMena("Lucie Podolova")).toBe("z");
    expect(rodZMena("Naďa Khamaziuk")).toBe("z");
  });
  it("muž zostáva mužom", () => {
    expect(rodZMena("Peter Gažo")).toBe("m");
    expect(rodZMena("Tomaš Krčmar")).toBe("m");
  });
});

describe("chybaOdosielatela", () => {
  it("celý názov firmy sa do SMS nezmestí", () => {
    // 22 znakov — brána by ho ticho zahodila a SMS by odišla z čísla.
    expect(chybaOdosielatela("ProSapiens Biomechanic")).toContain("11 znakov");
  });

  it("skrátené meno prejde", () => {
    expect(chybaOdosielatela("ProSapiens")).toBeNull();
  });

  it("diakritika v mene odosielateľa nie je", () => {
    expect(chybaOdosielatela("ProSápiens")).toContain("diakritiky");
  });

  it("prázdne je v poriadku — SMS pôjde z čísla", () => {
    expect(chybaOdosielatela("")).toBeNull();
  });

  it("Twilio bez čísla neposiela", () => {
    expect(chybaOdosielatela("", "twilio")).toContain("číslo");
    expect(chybaOdosielatela("+420777123456", "twilio")).toBeNull();
  });
});

