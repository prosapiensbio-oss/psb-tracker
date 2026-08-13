import { describe, expect, it } from "bun:test";

import { patriTrenerovi } from "./compute";

const KLIENTI = {
  "Eva Doležalova": { primaryTrainer: "Terezka" },
  "Jan Kral": { primaryTrainer: "Jerry" },
  "Nikto Neznamy": { primaryTrainer: "—" },
};

const polozka = (o: Partial<Parameters<typeof patriTrenerovi>[0]>) =>
  ({ category: "Anomália" as const, title: "", ...o });

describe("patriTrenerovi", () => {
  it("„Obaja“ nechá všetko", () => {
    expect(patriTrenerovi(polozka({ client: "Eva Doležalova" }), KLIENTI, "all")).toBe(true);
    expect(patriTrenerovi(polozka({ client: "Eva Doležalova" }), KLIENTI, "")).toBe(true);
  });

  it("položka o Terezkinej klientke sa Jerrymu neukáže", () => {
    // Presne to, na čo Jerry 12. 8. narazil: „prečo má Jerry info o Doležalovej“.
    expect(patriTrenerovi(polozka({ client: "Eva Doležalova" }), KLIENTI, "Jerry")).toBe(false);
    expect(patriTrenerovi(polozka({ client: "Eva Doležalova" }), KLIENTI, "Terezka")).toBe(true);
  });

  it("`oKom` prebije `client`, keď v ňom je cieľ prekliku", () => {
    // Toto bola tá chyba: „klienti|klienti“ nie je meno, takže sa v zozname
    // klientov nenájde a položka prepadla obom.
    const r = polozka({ client: "klienti|klienti", oKom: "Eva Doležalova" });
    expect(patriTrenerovi(r, KLIENTI, "Jerry")).toBe(false);
    expect(patriTrenerovi(r, KLIENTI, "Terezka")).toBe(true);
  });

  it("položka bez klienta zostáva obom", () => {
    // Nezhoda banky s Excelom sa týka firmy, nie trénera.
    expect(patriTrenerovi(polozka({ client: "udaje|" }), KLIENTI, "Jerry")).toBe(true);
    expect(patriTrenerovi(polozka({}), KLIENTI, "Terezka")).toBe(true);
  });

  it("kapacita sa pozná podľa nadpisu, nie podľa klienta", () => {
    const r = polozka({ category: "Kapacita", title: "Terezka — na strope kapacity" });
    expect(patriTrenerovi(r, KLIENTI, "Terezka")).toBe(true);
    expect(patriTrenerovi(r, KLIENTI, "Jerry")).toBe(false);
  });

  it("klient bez určeného trénera sa neukáže ani jednému omylom, ale ani sa nestratí", () => {
    // „—“ nie je ani Jerry, ani Terezka. Radšej ho neuvidí nikto pri filtri
    // než aby sa tíško priradil nesprávnemu — ale pri „Obaja“ tam je.
    const r = polozka({ client: "Nikto Neznamy" });
    expect(patriTrenerovi(r, KLIENTI, "Jerry")).toBe(false);
    expect(patriTrenerovi(r, KLIENTI, "all")).toBe(true);
  });

  it("meno, ktoré appka nepozná, zostáva obom", () => {
    // Preklep alebo klient zo starých dát — stratiť upozornenie je horšie
    // než ho ukázať navyše.
    expect(patriTrenerovi(polozka({ client: "Kto To Je" }), KLIENTI, "Jerry")).toBe(true);
  });
});
