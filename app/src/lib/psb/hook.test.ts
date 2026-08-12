import { describe, expect, it } from "bun:test";

import { kategoriaHooku, krstneMenaKlientov } from "./hook";

// Skutočné prvé vety z Instagramu ProSapiens, nie vymyslené príklady.
const MENA = krstneMenaKlientov(["Michal Novák", "Jarek Dvořák", "Kateřina Stoklásková", "Ji Wu"]);

describe("kategoriaHooku", () => {
  it("meno klienta na začiatku je klientsky príbeh", () => {
    expect(kategoriaHooku("Michal nepřišel s chronickou bolestí ani po sérii neúspěšných léčení.", MENA))
      .toBe("Klientsky príbeh");
  });

  it("meno klienta až v druhej vete príbeh nerobí", () => {
    // „…a proto Michal přišel" je edukácia s príkladom. Bez tohto by sa
    // klientskym príbehom stal každý druhý príspevok.
    expect(kategoriaHooku("Fascie drží tělo pohromadě a proto Michal přišel k nám.", MENA))
      .not.toBe("Klientsky príbeh");
  });

  it("dvojpísmenové meno sa medzi krstné mená nedostane", () => {
    // „Ji" by inak chytilo každé „již…".
    expect(krstneMenaKlientov(["Ji Wu"]).has("ji")).toBe(false);
  });

  it("popretie bežného presvedčenia je vyvrátenie mýtu", () => {
    expect(kategoriaHooku("Absence bolesti není zdraví.")).toBe("Vyvrátenie mýtu");
    expect(kategoriaHooku("Proč klasická rehabilitace prostě nestačí❓")).toBe("Vyvrátenie mýtu");
  });

  it("diakritika nerozhoduje", () => {
    expect(kategoriaHooku("Absence bolesti neni zdravi")).toBe("Vyvrátenie mýtu");
  });

  it("tri krátke vety za sebou sú staccato", () => {
    expect(kategoriaHooku("Prkno. Sklapovačky. Plank. A přesto tě bolí záda."))
      .toBe("Staccato výpočet");
  });

  it("tri dlhé vety staccato nie sú", () => {
    const dlhe = "Silový trénink má svoje místo v každém tréninkovém plánu. "
      + "Bez něj se tělo neadaptuje na zátěž a stagnuje. "
      + "Proto ho zařazujeme hned od začátku spolupráce.";
    expect(kategoriaHooku(dlhe)).toBe("Edukácia");
  });

  it("otáznik aj v emodži robí otázku", () => {
    expect(kategoriaHooku("Chceš se zbavit bolestí při chůzi? 🚶")).toBe("Otázka");
    expect(kategoriaHooku("Bolí tě rameno❓")).toBe("Otázka");
  });

  it("emodži a odrážky na začiatku neprekážajú", () => {
    expect(kategoriaHooku("📌 Trénink v těhotenství – příprava na porod i regeneraci po něm"))
      .toBe("Edukácia");
  });

  it("všetko ostatné je edukácia", () => {
    expect(kategoriaHooku("🧬 Mechanotransdukce: Proč záleží na tom, jak se hýbeš")).toBe("Edukácia");
    expect(kategoriaHooku("")).toBe("Edukácia");
  });

  it("prednosť má užší signál", () => {
    // Spĺňa meno klienta aj otáznik. Meno je konkrétnejšie.
    expect(kategoriaHooku("Michal cvičil deset let. A přesto ho bolela záda. Proč?", MENA))
      .toBe("Klientsky príbeh");
    // Bez mena v zozname z toho ostane staccato: „a přesto“ je až v druhej
    // vete a mýtus sa hľadá len v prvej — kým staccato je forma celého úvodu.
    expect(kategoriaHooku("Michal cvičil deset let. A přesto ho bolela záda. Proč?"))
      .toBe("Staccato výpočet");
  });
});
