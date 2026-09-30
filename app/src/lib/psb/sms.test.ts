import { describe, expect, it } from "bun:test";

import { chybaOdosielatela, cisloPreBranu, dlzkaSpravy, rodZMena, textSms } from "./sms";

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
  it("keď balíček došiel, povie to hneď — a bez diakritiky za JEDNU správu", () => {
    const t = textSms({ oslovenie: "Richard", trener: "Jerry", zostatok: 0, sMailom: true, dnesnyTrening: true });
    // SMS ide bez diakritiky: jediný mäkčeň by limit zrazil zo 160 na 70
    // znakov a z jednej správy by boli dve (Jerry, 30. 9. 2026).
    expect(t).toBe("Ahoj Richard, dnes si mal poslednu hodinu z balicka. V maili najdes dochadzku aj QR na platbu. Jerry, ProSapiens");
    expect(dlzkaSpravy(t).sprav).toBe(1);
  });

  it("žene píše „mala si“", () => {
    const t = textSms({ oslovenie: "Hana", trener: "Jerry", zostatok: 0, sMailom: false, dnesnyTrening: true, rod: "z" });
    expect(t).toContain("dnes si mala poslednu hodinu");
  });

  it("keď hodiny ešte sú, povie koľko", () => {
    expect(textSms({ oslovenie: "Eva", trener: "Terezka", zostatok: 2, sMailom: false }))
      .toBe("Ahoj Eva, v balicku ti zostavaju 2 h. Terezka, ProSapiens");
  });

  it("bez mailu sa naň neodkazuje", () => {
    expect(textSms({ oslovenie: "Eva", trener: "Jerry", zostatok: 0, sMailom: false })).not.toContain("maili");
  });

  it("odkaz prebije vetu o maili a vojde sa do jednej správy", () => {
    const t = textSms({
      oslovenie: "Eva", trener: "Jerry", zostatok: 0, sMailom: true, dnesnyTrening: true, rod: "z",
      odkaz: "https://kokpit.prosapiensbio.workers.dev/v/Ab3xK9mQ2r",
    });
    expect(t).toContain("Treningy, platba a 3 otazky ako ti je: https://");
    expect(t).not.toContain("maili");
    expect(dlzkaSpravy(t).sprav).toBe(1);
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

describe("textSms podľa skutočnosti", () => {
  const z = { oslovenie: "Vítězslave", trener: "Jerry", sMailom: false };

  it("mínus hodiny povie ako mínus, nie ako „posledná hodina“", () => {
    expect(textSms({ ...z, zostatok: -2, dnesnyTrening: true }))
      .toBe("Ahoj Vitezslave, dnesnym treningom mas 2 hodiny nad ramec balicka. Jerry, ProSapiens");
  });

  it("jedna hodina navyše sa skloňuje", () => {
    expect(textSms({ ...z, zostatok: -1 })).toContain("mas 1 hodinu nad ramec balicka");
  });

  it("presná nula je posledná hodina — ale len keď bola dnes", () => {
    expect(textSms({ ...z, zostatok: 0, dnesnyTrening: true })).toContain("dnes si mal poslednu hodinu");
    expect(textSms({ ...z, zostatok: 0 })).toContain("balicek mas dochodeny");
  });
});
