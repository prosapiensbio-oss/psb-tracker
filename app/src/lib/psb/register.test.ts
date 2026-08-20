import { describe, expect, it } from "bun:test";

import { odpovedeZRegistra, patriTrenerovi } from "./compute";

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

  it("klient TRETIEHO trénera zostáva obom — inak ho nevidí nikto", () => {
    // Matyáš odtrénoval 151 hodín a je stále primárnym trénerom šiestich ľudí,
    // ale v prepínači nie je. Jeho klienti tak prepadli medzi stoličky: dve
    // pripomienky na zľavu za odporúčanie ležali 17. 8. 2026 neviditeľné.
    const KLIENTI3 = { ...KLIENTI, "Natalia Peckova": { primaryTrainer: "Matyáš" } };
    const r = polozka({ client: "Natalia Peckova" });
    expect(patriTrenerovi(r, KLIENTI3, "Jerry")).toBe(true);
    expect(patriTrenerovi(r, KLIENTI3, "Terezka")).toBe(true);
  });

  it("„—“ ale nie — tam sa tréner nedal určiť a hádať sa nebude", () => {
    // Rozdiel oproti tretiemu trénerovi: „—“ neznamená niekoho iného,
    // znamená, že sa to nevie. Ukázať to obom by bolo tiché priradenie.
    expect(patriTrenerovi(polozka({ client: "Nikto Neznamy" }), KLIENTI, "Terezka")).toBe(false);
  });

  it("tréner z kalendára prebije neznáme meno", () => {
    // Toto je celá oprava zo 17. 8.: nový človek po úvodnom v `clients` ešte
    // nie je, takže pravidlo „neznáme meno zostáva obom" ho poslalo obom.
    // Keď položka nesie trénera z kalendára, filter má z čoho rozhodnúť.
    const r = polozka({ client: "Jana Malinová", oKom: "Jana Malinová", trener: "Terezka" });
    expect(patriTrenerovi(r, KLIENTI, "Jerry")).toBe(false);
    expect(patriTrenerovi(r, KLIENTI, "Terezka")).toBe(true);
  });

  it("meno, ktoré appka nepozná, zostáva obom", () => {
    // Preklep alebo klient zo starých dát — stratiť upozornenie je horšie
    // než ho ukázať navyše.
    expect(patriTrenerovi(polozka({ client: "Kto To Je" }), KLIENTI, "Jerry")).toBe(true);
  });
});

describe("stav ovládača nie je odpoveď", () => {
  it("kľúče hlasenie| a project| sa do Jarvisovej pamäte nedostanú", () => {
    // Inak by si Jarvis pamätal vetu „skryté hlásenie" bez toho, čoho sa
    // týka — a tváril by sa, že na niečo odpovedal.
    const pamat = odpovedeZRegistra({
      "hlasenie|gads|konverzie-vs-klienti": { note: "skryté hlásenie", ackedAt: "2026-08-19T10:00:00.000Z" },
      "project|nastavene": { note: "nastavené", ackedAt: "2026-08-19T10:00:00.000Z" },
      "dovod|Jan Novak": { note: "odsťahoval sa", ackedAt: "2026-08-18T10:00:00.000Z" },
    });
    expect(pamat.map((p) => p.odpoved)).toEqual(["odsťahoval sa"]);
  });
});
