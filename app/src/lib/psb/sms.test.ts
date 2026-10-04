import { describe, expect, it } from "bun:test";

import { chybaOdosielatela, cisloNaUkazku, cisloPreBranu, dlzkaSpravy, rodZMena, textSms, textSmsPlatba, bezDiakritiky } from "./sms";

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

  it("keď je na stránke QR, správa ho menuje", () => {
    expect(textSms({ oslovenie: "Lukas", trener: "Jerry", datum: "9. 9. 2026", odkaz: ODKAZ, sQr: true }))
      .toBe(`Ahoj Lukas, tady mas prehled hodin a QR na platbu za balicek z 9. 9. 2026: ${ODKAZ} Jerry`);
  });

  it("keď QR na stránke nie je, nesľubuje ho", () => {
    // Jerry, 2. 10. 2026: pri zostávajúcich hodinách „tady máš přehled hodin".
    expect(textSms({ oslovenie: "Lukas", trener: "Jerry", odkaz: ODKAZ }))
      .toBe(`Ahoj Lukas, tady mas prehled hodin: ${ODKAZ} Jerry`);
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
    expect(textSms({ oslovenie: "Jan", trener: "Terezka", odkaz: ODKAZ, sQr: true }))
      .toBe(`Ahoj Jan, tady mas prehled hodin a QR na platbu: ${ODKAZ} Terezka`);
  });

  it("bez diakritiky a do jednej správy aj s dlhým menom", () => {
    for (const oslovenie of ["Jan", "Lukas", "Bartolomej"]) {
      const t = textSms({ oslovenie, trener: "Terezka", datum: "9. 9. 2026", odkaz: ODKAZ, sQr: true });
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
    expect(textSmsPlatba({ ...v, suma: 6990 })).toBe(textSms({ ...v, sQr: true }));
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


describe("žiadna správa klientovi nesmie mať diakritiku", () => {
  it("jeden mäkčeň zráža limit zo 160 znakov na 70", () => {
    // Jerry, 3. 10. 2026 si vypýtal všetky znenia pokope a vyšlo najavo,
    // že správa o zapísanom balíčku ide ako DVE SMS — bola napísaná priamo
    // v obrazovke Balíčky, mimo `textSms`, ktorý diakritiku odstraňuje sám.
    const sMakcenmi = "Lukas, zapísal som ti 6h Předplatné. QR na platbu máš v maili. ProSapiens";
    expect(dlzkaSpravy(sMakcenmi).sprav).toBe(2);
    expect(dlzkaSpravy(bezDiakritiky(sMakcenmi)).sprav).toBe(1);
  });
});

describe("slovenské číslo bez predvoľby", () => {
  it("deväť číslic na 9 je slovenský mobil, nie české (Pavlík, 2. 10. 2026)", () => {
    expect(cisloPreBranu("944096975")).toBe("+421944096975");
    expect(cisloPreBranu("944 096 975")).toBe("+421944096975");
    expect(cisloPreBranu("0944096975")).toBe("+421944096975");
  });
  it("české mobily zostávajú české", () => {
    expect(cisloPreBranu("735920248")).toBe("+420735920248");
    expect(cisloPreBranu("605965949")).toBe("+420605965949");
  });
  it("na ukážku s medzerami a krajinou", () => {
    expect(cisloNaUkazku("+421944096975")).toBe("+421 944 096 975 (Slovensko)");
    expect(cisloNaUkazku("+420735920248")).toBe("+420 735 920 248 (Česko)");
  });
});
