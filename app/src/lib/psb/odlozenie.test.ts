import { describe, expect, it } from "bun:test";

import {
  odpovedeZRegistra,
  parujVysvetlenia,
  rodinaZKluca,
  stavPolozkyRegistra,
  trenerZOdpovede,
  znieAkoZrusenie,
} from "./compute";

/**
 * Revízia upozornení, 17. 8. 2026.
 *
 * Tri veci, ktoré appka robila potichu zle a nič ich nechytalo:
 *  1. „Odložiť o týždeň" pri anomáliách znamenalo navždy.
 *  2. „Nehlásiť" pri týždennom rituáli umlčalo presne jeden týždeň.
 *  3. Odpoveď na upozornenie zmizla spolu s upozornením.
 */

const DNES = new Date("2026-08-17T10:00:00Z");

describe("stavPolozkyRegistra — odloženie", () => {
  it("odložená položka je do dátumu skrytá", () => {
    const ack = { "duch|Martin Spok": { note: "odlozene|2026-08-24|pride buduci tyzden" } };
    const s = stavPolozkyRegistra("duch|Martin Spok", ack, undefined, DNES);
    expect(s.acked).toBe(true);
    expect(s.note).toContain("odložené do 2026-08-24");
  });

  it("po dátume sa vráti sama — aj s dôvodom, prečo bola odložená", () => {
    // Toto je tá chyba: register a obe pripomienky čítali holé `ack[key]`,
    // takže odložená položka sa už nikdy nevrátila. Appka sľúbila, že sa ozve.
    const ack = { "duch|Martin Spok": { note: "odlozene|2026-08-10|pride buduci tyzden" } };
    const s = stavPolozkyRegistra("duch|Martin Spok", ack, undefined, DNES);
    expect(s.acked).toBe(false);
    expect(s.vratene).toBe(true);
    expect(s.note).toContain("pride buduci tyzden");
  });

  it("v deň odloženia sa už vracia — nie až deň po ňom", () => {
    const ack = { "sms|2026-08-01|Roman Pavlik": { note: "odlozene|2026-08-17|" } };
    expect(stavPolozkyRegistra("sms|2026-08-01|Roman Pavlik", ack, "sms|Roman Pavlik", DNES).acked).toBe(false);
  });

  it("obyčajná odpoveď zostáva vybavená a poznámka sa nesie ďalej", () => {
    const ack = { "gone|Jakub Štigut": { note: "odpoveď: dohodli sme sa na pondelok" } };
    const s = stavPolozkyRegistra("gone|Jakub Štigut", ack, undefined, DNES);
    expect(s.acked).toBe(true);
    expect(s.note).toBe("odpoveď: dohodli sme sa na pondelok");
  });

  it("umlčaná rodina prebije všetko, aj odloženie", () => {
    const ack = {
      "duch|Pavel Novak": { note: "odlozene|2026-08-01|" },
      "mute|duch|Pavel Novak": { note: "nehlásiť tento druh" },
    };
    expect(stavPolozkyRegistra("duch|Pavel Novak", ack, undefined, DNES).acked).toBe(true);
  });
});

describe("rodinaZKluca", () => {
  it("dátum ako samostatný diel sa zahodí", () => {
    expect(rodinaZKluca("dnes|2026-08-10|Jan Kral")).toBe("dnes|Jan Kral");
    expect(rodinaZKluca("odchody|2026-07")).toBe("odchody");
    expect(rodinaZKluca("nezhody|2026-07|7")).toBe("nezhody");
  });

  it("dátum PRILEPENÝ na slovo sa zahodí tiež", () => {
    // Bez toho niesla rodina týždňa dátum, takže „Nehlásiť" 14. 8. umlčalo
    // presne ten týždeň a o sedem dní bola vec späť.
    expect(rodinaZKluca("zapis|tyzden-2026-08-10")).toBe("zapis|tyzden");
    expect(rodinaZKluca("zapis|tyzden-2026-08-17")).toBe("zapis|tyzden");
    expect(rodinaZKluca("zapis|mesiac-2026-07")).toBe("zapis|mesiac");
  });

  it("kľúč, z ktorého by nezostalo nič, zostáva sám sebou", () => {
    expect(rodinaZKluca("2026-08-10")).toBe("2026-08-10");
  });

  it("mená a kategórie zostávajú — umlčať sa má druh veci, nie všetko", () => {
    expect(rodinaZKluca("sixm|Lukas Hanus|Obnova|5")).toBe("sixm|Lukas Hanus|Obnova");
  });
});

describe("odpovedeZRegistra — pamäť odpovedí", () => {
  const ACK = {
    "dnes|2026-08-12|Iva Stoklaskova": { note: "odpoveď: to je klientka terezky", ackedAt: "2026-08-12T09:00:00Z" },
    "naklad|chyba|fixne.prevadzka.najom|2026-07": { note: "Radek dal júl 2026 zadarmo", ackedAt: "2026-08-06T09:00:00Z" },
    "sms|2026-05-01|Kto Uz Neexistuje": { note: "SMS poslaná", ackedAt: "2026-05-01T09:00:00Z" },
    "orphan|Adéla Lutonska": { note: "skryté", ackedAt: "2026-07-29T09:00:00Z" },
    "cap|Jerry|under": { note: "", ackedAt: "2026-07-28T09:00:00Z" },
    "mute|data": { note: "nehlásiť tento druh", ackedAt: "2026-08-13T09:00:00Z" },
    "duch|Kto Vie": { note: "odlozene|2026-09-01|", ackedAt: "2026-08-15T09:00:00Z" },
  };

  const von = odpovedeZRegistra(ACK);

  it("pamätá si vety aj po tom, čo upozornenie zmizlo z registra", () => {
    // SMS má okno 21 dní — táto položka sa už negeneruje, ale odpoveď platí.
    expect(von.some((o) => o.odpoved === "SMS poslaná")).toBe(true);
  });

  it("zametanie nie je odpoveď", () => {
    const texty = von.map((o) => o.odpoved);
    expect(texty).not.toContain("skryté");
    expect(texty).not.toContain("nehlásiť tento druh");
    expect(von.some((o) => o.key.startsWith("mute|"))).toBe(false);
    expect(von.some((o) => o.odpoved.startsWith("odlozene|"))).toBe(false);
    expect(von.some((o) => o.key.startsWith("cap|"))).toBe(false);
  });

  it("identifikátor nie je meno", () => {
    // `referral|08039e34-…` niesol v pamäti kus UUID namiesto človeka.
    const ack = { "referral|08039e34-3393-49d3-b8a2-8c4f1e13f200": { note: "zľava 10 % daná", ackedAt: "2026-08-17T09:00:00Z" } };
    expect(odpovedeZRegistra(ack)[0].koho).toBe(null);
  });

  it("predpona odpoveď: sa nenesie do pamäte", () => {
    const iva = von.find((o) => o.koho === "Iva Stoklaskova");
    expect(iva?.odpoved).toBe("to je klientka terezky");
  });

  it("z kľúča vie, čoho sa to týkalo a koho", () => {
    const iva = von.find((o) => o.koho === "Iva Stoklaskova");
    expect(iva?.oCom).toBe("dnešný tréning");
    const najom = von.find((o) => o.odpoved.startsWith("Radek"));
    expect(najom?.oCom).toBe("náklad v P&L");
  });

  it("najnovšie prvé", () => {
    expect(von[0].datum).toBe("2026-08-12");
  });
});

describe("trenerZOdpovede — kto je čí klient", () => {
  it("pozná vety, ktoré Jerry naozaj napísal 12. 8.", () => {
    expect(trenerZOdpovede("to je klientka terezky")).toBe("Terezka");
    expect(trenerZOdpovede("jakub gerrich je terezkin klient")).toBe("Terezka");
  });

  it("znesie sklonovanie aj diakritiku", () => {
    expect(trenerZOdpovede("Je to Terezkina klientka")).toBe("Terezka");
    expect(trenerZOdpovede("chodí k Terezke, ne ke mně")).toBe("Terezka");
    expect(trenerZOdpovede("trénuje ho Jerry")).toBe("Jerry");
    expect(trenerZOdpovede("prehoď ho na Jerryho")).toBe("Jerry");
    expect(trenerZOdpovede("patrí Terezke")).toBe("Terezka");
  });

  it("samotná zmienka o trénerovi NIE je priradenie", () => {
    // Toto je ten drahý omyl: prehodiť klienta cudziemu trénerovi si nikto
    // nevšimne, kým mu neprestanú chodiť upozornenia.
    expect(trenerZOdpovede("Terezka mi hovorila, že sa vráti v septembri")).toBe(null);
    expect(trenerZOdpovede("bol som s Jerrym dohodnutý na pondelok")).toBe(null);
    expect(trenerZOdpovede("dohodli sme sa na najbližší pondelok")).toBe(null);
  });

  it("keď sú vo vete obaja, mlčí", () => {
    expect(trenerZOdpovede("bola Jerryho klientka, teraz ju trénuje Terezka")).toBe(null);
  });

  it("veta bez trénera nezapíše nič", () => {
    expect(trenerZOdpovede("je to môj klient")).toBe(null);
    expect(trenerZOdpovede("")).toBe(null);
  });
});

describe("znieAkoZrusenie", () => {
  it("pozná vetu, ktorú Jerry napísal", () => {
    expect(znieAkoZrusenie("dneska zrušil pretoze ho štipla včela")).toBe(true);
  });

  it("pozná bežné dôvody neúčasti", () => {
    expect(znieAkoZrusenie("je chorý")).toBe(true);
    expect(znieAkoZrusenie("nepríde, má dovolenku")).toBe(true);
    expect(znieAkoZrusenie("presunuli sme to na štvrtok")).toBe(true);
    expect(znieAkoZrusenie("zranil si rameno")).toBe(true);
  });

  it("odpoveď, ktorá o zrušení nie je, sa Kalendára netýka", () => {
    expect(znieAkoZrusenie("chce pokračovať aj naďalej, cíti progres")).toBe(false);
    expect(znieAkoZrusenie("to je klientka Terezky")).toBe(false);
    expect(znieAkoZrusenie("predplatil si ďalší balík")).toBe(false);
  });
});

describe("parujVysvetlenia — veta z registra do Kalendára", () => {
  const DNES_P = new Date("2026-08-19T10:00:00Z");
  const cakajuce = { "kalvysv|josef snirych|2026-08-17": { note: "dneska zrušil, štípla ho včela" } };

  it("priradí sa k jedinej nevysvetlenej zmene toho človeka", () => {
    const z = [{ id: "z1", klient: "Josef Šnirych", kedy: "2026-08-18T19:00:00Z" }];
    const { hotove } = parujVysvetlenia(cakajuce, z, DNES_P);
    expect(hotove).toHaveLength(1);
    expect(hotove[0].id).toBe("z1");
    expect(hotove[0].poznamka).toContain("včela");
  });

  it("kým sa zrušenie neobjaví, veta trpezlivo čaká", () => {
    // Toto je bežný stav: Jerry odpovie hneď, kalendár sa sťahuje až večer.
    const { hotove, expirovane } = parujVysvetlenia(cakajuce, [], DNES_P);
    expect(hotove).toHaveLength(0);
    expect(expirovane).toHaveLength(0);
  });

  it("pri dvoch zmenách sa nehádа — Kalendár sa spýta na obe", () => {
    const z = [
      { id: "z1", klient: "Josef Šnirych", kedy: "2026-08-18T19:00:00Z" },
      { id: "z2", klient: "Josef Šnirych", kedy: "2026-08-19T07:00:00Z" },
    ];
    expect(parujVysvetlenia(cakajuce, z, DNES_P).hotove).toHaveLength(0);
  });

  it("zmena iného klienta si vetu nezoberie", () => {
    const z = [{ id: "z1", klient: "Richard Matl", kedy: "2026-08-18T19:00:00Z" }];
    expect(parujVysvetlenia(cakajuce, z, DNES_P).hotove).toHaveLength(0);
  });

  it("zmena STARŠIA než odpoveď sa nepriradí", () => {
    // Zrušenie z minulého týždňa nemá s dnešnou včelou nič spoločné.
    const z = [{ id: "z1", klient: "Josef Šnirych", kedy: "2026-08-10T19:00:00Z" }];
    expect(parujVysvetlenia(cakajuce, z, DNES_P).hotove).toHaveLength(0);
  });

  it("po týždni veta vyprší a zmaže sa", () => {
    const neskoro = new Date("2026-08-27T10:00:00Z");
    const z = [{ id: "z1", klient: "Josef Šnirych", kedy: "2026-08-26T19:00:00Z" }];
    const { hotove, expirovane } = parujVysvetlenia(cakajuce, z, neskoro);
    expect(hotove).toHaveLength(0);
    expect(expirovane).toEqual(["kalvysv|josef snirych|2026-08-17"]);
  });

  it("diakritika mien nerozhoduje", () => {
    const ack = { "kalvysv|janka snirychova|2026-08-17": { note: "je na dovolenke" } };
    const z = [{ id: "z9", klient: "Janka šnirychova", kedy: "2026-08-18T19:00:00Z" }];
    expect(parujVysvetlenia(ack, z, DNES_P).hotove[0]?.id).toBe("z9");
  });

  it("čakajúca veta sa v pamäti odpovedí neobjaví druhýkrát", () => {
    expect(odpovedeZRegistra(cakajuce)).toHaveLength(0);
  });
});
