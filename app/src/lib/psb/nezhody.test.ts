import { describe, expect, it } from "bun:test";

import { cakajuciKlienti, minutyZCasu, nepotvrdeneTreningy, odstranDuplicity, udalostiBezMena } from "./compute";

/**
 * Kalendár vyhráva, export potvrdzuje — a keď nepotvrdí, appka to povie.
 * Pravidlo od Jerryho, 17. 8. 2026.
 */

const DNES = new Date("2026-08-17T12:00:00Z");
const s = (client: string, date: string) => ({ client, date });
const u = (zaciatok: string, klient: string | null, typ = "trening", trener = "Jerry") => ({ zaciatok, klient, typ, trener });

describe("nepotvrdeneTreningy", () => {
  // Export siaha po 13. 8. — presne ako v ostrých dátach.
  const SEDENIA = [s("Richard Matl", "2026-08-03"), s("Iny Klient", "2026-08-13")];

  it("tréning na deň, ktorý export pokrýva a nemá ho, je nezhoda", () => {
    // Richard Matl, 10. 8.: kalendár tvrdí, export mlčí. Jerry: „nebol tam."
    const von = nepotvrdeneTreningy(SEDENIA, [u("2026-08-10T18:00:00Z", "Richard Matl")], [], DNES);
    expect(von).toHaveLength(1);
    expect(von[0]).toMatchObject({ klient: "Richard Matl", datum: "2026-08-10" });
  });

  it("tréning za hranicou exportu sa NEHLÁSI — to je len bežné oneskorenie", () => {
    // Toto je celá hodnota pravidla: bez neho by appka hlásila každý včerajšok.
    expect(nepotvrdeneTreningy(SEDENIA, [u("2026-08-16T18:00:00Z", "Richard Matl")], [], DNES)).toHaveLength(0);
    expect(nepotvrdeneTreningy(SEDENIA, [u("2026-08-14T18:00:00Z", "Richard Matl")], [], DNES)).toHaveLength(0);
  });

  it("potvrdený tréning mlčí", () => {
    expect(nepotvrdeneTreningy(SEDENIA, [u("2026-08-03T18:00:00Z", "Richard Matl")], [], DNES)).toHaveLength(0);
  });

  it("PTminder smie zapísať sedenie o deň vedľa", () => {
    // Nočný prevod alebo iné pásmo — tolerancia ±1 deň, rovnako ako v Balíčkoch.
    expect(nepotvrdeneTreningy([s("Kto", "2026-08-11")], [u("2026-08-10T18:00:00Z", "Kto")], [], DNES)).toHaveLength(0);
    expect(nepotvrdeneTreningy([s("Kto", "2026-08-09")], [u("2026-08-10T18:00:00Z", "Kto")], [], DNES)).toHaveLength(0);
  });

  it("zrušený tréning nie je nezhoda", () => {
    const von = nepotvrdeneTreningy(
      SEDENIA,
      [u("2026-08-10T18:00:00Z", "Richard Matl")],
      [{ druh: "zrusene", klient: "Richard Matl", pred: "2026-08-10T18:00" }],
      DNES,
    );
    expect(von).toHaveLength(0);
  });

  it("bez exportu sa nedá povedať, že niečo chýba", () => {
    expect(nepotvrdeneTreningy([], [u("2026-08-10T18:00:00Z", "Kto")], [], DNES)).toHaveLength(0);
  });

  it("dva zápisy toho istého dňa sú jedna nezhoda", () => {
    // V ostrých dátach mal Matl 10. 8. dve udalosti — jednu živú, jednu zmiznutú.
    const von = nepotvrdeneTreningy(
      SEDENIA,
      [u("2026-08-10T18:00:00Z", "Richard Matl"), u("2026-08-10T19:00:00Z", "Richard Matl")],
      [], DNES,
    );
    expect(von).toHaveLength(1);
  });
});

describe("posledný deň exportu sa posudzuje len po hodinu, po ktorú siaha", () => {
  it("čas z PTmindera sa číta správne", () => {
    expect(minutyZCasu("7:00am")).toBe(420);
    expect(minutyZCasu("12:00pm")).toBe(720);
    expect(minutyZCasu("7:00pm")).toBe(1140);
    expect(minutyZCasu("12:30am")).toBe(30);
    expect(minutyZCasu("18:30")).toBe(1110);
    expect(minutyZCasu("")).toBe(null);
  });

  it("hodina po konci exportu sa NEHLÁSI — export mohol byť stiahnutý napoludnie", () => {
    const sedenia = [{ client: "Iny", date: "2026-08-13", time: "10:30am" }];
    expect(nepotvrdeneTreningy(sedenia, [u("2026-08-13T18:00:00Z", "Kto")], [], DNES)).toHaveLength(0);
  });

  it("hodina PRED koncom exportu sa hlási — ten deň je pokrytý", () => {
    // Trinásteho augusta 2026 mal export sedenia od 7:00 do 19:00, takže
    // Roman Pavlík o 9:30 naozaj chýba. Je to hodina, za ktorú zaplatil.
    const sedenia = [
      { client: "Jan Kalmus", date: "2026-08-13", time: "7:30am" },
      { client: "Jan Kral", date: "2026-08-13", time: "7:00pm" },
    ];
    const von = nepotvrdeneTreningy(sedenia, [u("2026-08-13T09:30:00Z", "Roman Pavlik")], [], DNES);
    expect(von).toHaveLength(1);
    expect(von[0].klient).toBe("Roman Pavlik");
  });

  it("export bez časov posledný deň nesúdi", () => {
    const sedenia = [{ client: "Iny", date: "2026-08-13" }];
    expect(nepotvrdeneTreningy(sedenia, [u("2026-08-13T09:30:00Z", "Kto")], [], DNES)).toHaveLength(0);
  });
});

describe("udalostiBezMena", () => {
  it("tréning bez klienta sa ohlási", () => {
    const von = udalostiBezMena([{ ...u("2026-08-17T16:00:00Z", null, "uvodny", "Terezka"), nazov: "Úvodní trénink" }], DNES);
    expect(von).toHaveLength(1);
    expect(von[0]).toMatchObject({ typ: "uvodny", trener: "Terezka", nazov: "Úvodní trénink" });
  });

  it("budúca udalosť bez mena ešte počká", () => {
    expect(udalostiBezMena([u("2026-08-25T16:00:00Z", null, "uvodny")], DNES)).toHaveLength(0);
  });

  it("súkromná udalosť meno klienta mať nemusí", () => {
    expect(udalostiBezMena([u("2026-08-10T16:00:00Z", null, "sukromne")], DNES)).toHaveLength(0);
  });
});

describe("cakajuciKlienti — profil vzniká z úvodného v kalendári", () => {
  const KLIENTI = { "Stary Klient": { name: "Stary Klient" } };

  it("po úvodnom vznikne záznam, aj keď export ešte nedorazil", () => {
    const von = cakajuciKlienti(KLIENTI, [u("2026-08-14T16:00:00Z", "Nova Klientka", "uvodny", "Terezka")], [], DNES);
    expect(von).toHaveLength(1);
    expect(von[0]).toMatchObject({ meno: "Nova Klientka", uvodny: "2026-08-14", trener: "Terezka" });
  });

  it("úvodný, ktorý sa ešte nekonal, klienta nezakladá", () => {
    expect(cakajuciKlienti(KLIENTI, [u("2026-08-17T18:00:00Z", "Kto", "uvodny")], [], DNES)).toHaveLength(0);
    expect(cakajuciKlienti(KLIENTI, [u("2026-08-20T10:00:00Z", "Kto", "uvodny")], [], DNES)).toHaveLength(0);
  });

  it("keď export klienta už potvrdil, položka zmizne sama", () => {
    expect(cakajuciKlienti({ "Nova Klientka": { name: "Nova Klientka" } },
      [u("2026-08-14T16:00:00Z", "Nova Klientka", "uvodny")], [], DNES)).toHaveLength(0);
  });

  it("preklep ani diakritika nezaložia človeka druhýkrát", () => {
    expect(cakajuciKlienti({ "Matej Procházka": { name: "Matej Procházka" } },
      [u("2026-08-14T16:00:00Z", "Matej Prochadzka", "uvodny")], [], DNES)).toHaveLength(0);
  });

  it("zrušený úvodný klienta nezakladá", () => {
    expect(cakajuciKlienti(KLIENTI, [u("2026-08-14T16:00:00Z", "Kto", "uvodny")],
      [{ druh: "zrusene", klient: "Kto", pred: "2026-08-14T16:00" }], DNES)).toHaveLength(0);
  });

  it("bežný tréning profil nezakladá — len úvodný", () => {
    expect(cakajuciKlienti(KLIENTI, [u("2026-08-14T16:00:00Z", "Kto", "trening")], [], DNES)).toHaveLength(0);
  });
});

describe("odstranDuplicity", () => {
  const p = (key: string, oKom: string) =>
    ({ key, oKom, category: "Zápis" as const, tone: "blue" as const, title: "", detail: "", acked: false, priority: 1 });

  it("ustúpi, keď o tom istom človeku niečo pýta akciu", () => {
    // Jana Malinová mala 18. 8. tri riadky naraz — a tri riadky o jednom
    // človeku sú presne to, po čom sa zoznam prestane čítať.
    const von = odstranDuplicity([
      p("novy|2026-08-17|Jana Malinová", "Jana Malinová"),
      p("sms|2026-08-17|Jana Malinová", "Jana Malinová"),
    ]);
    expect(von.map((x) => x.key)).toEqual(["sms|2026-08-17|Jana Malinová"]);
  });

  it("zostane, keď o ňom nič iné otvorené nie je", () => {
    // Po 21 dňoch SMS pripomienka zmizne — a vtedy je `novy` jediný signál,
    // že človek stále nie je potvrdený exportom.
    const von = odstranDuplicity([p("novy|2026-07-01|Kto Caka", "Kto Caka")]);
    expect(von).toHaveLength(1);
  });

  it("vybavená položka nikoho neumlčí", () => {
    const von = odstranDuplicity([
      p("novy|2026-08-17|Jana Malinová", "Jana Malinová"),
      { ...p("sms|2026-08-17|Jana Malinová", "Jana Malinová"), acked: true },
    ]);
    expect(von.some((x) => x.key.startsWith("novy|"))).toBe(true);
  });

  it("iný človek nič neumlčí", () => {
    const von = odstranDuplicity([
      p("novy|2026-08-17|Jana Malinová", "Jana Malinová"),
      p("sms|2026-08-17|Tereza Pehalova", "Tereza Pehalova"),
    ]);
    expect(von).toHaveLength(2);
  });
});

// Jerry, 1. 9. 2026: „vidím v notifikáciách redundanciu ohľadom Martina Vaška
// … jedna z nich sa musí vyhodiť."
describe("6M otázka a dnešný tréning o tom istom človeku", () => {
  const dnes = (meno: string) =>
    ({ key: `dnes|2026-09-01|${meno}`, category: "6M" as const, tone: "blue" as const,
       title: `18:00 ${meno}: 5. mesiac`, detail: `Dnes o 18:00 máš tréning s ${meno}. 5. mesiac — hodnotiaci rozhovor.`,
       priority: 1, acked: false, oKom: meno });
  const sixm = (meno: string) =>
    ({ key: `sixm|${meno}|Obnova|5`, category: "6M" as const, tone: "orange" as const,
       title: `${meno} — 6M`, detail: `${meno}: 5. mesiac — hodnotiaci rozhovor`,
       priority: 0, acked: false, client: meno });

  it("v deň tréningu zostane len tá dnešná", () => {
    const von = odstranDuplicity([sixm("Martin Vaško"), dnes("Martin Vaško")]);
    expect(von.map((x) => x.key)).toEqual(["dnes|2026-09-01|Martin Vaško"]);
  });

  it("bez dnešného tréningu 6M riadok zostáva — nič sa nestráca", () => {
    const von = odstranDuplicity([sixm("Martin Vaško")]);
    expect(von.length).toBe(1);
  });

  it("dnešný tréning iného klienta 6M riadok neumlčí", () => {
    const von = odstranDuplicity([sixm("Martin Vaško"), dnes("Anna Nova")]);
    expect(von.map((x) => x.key).sort()).toEqual(["dnes|2026-09-01|Anna Nova", "sixm|Martin Vaško|Obnova|5"]);
  });

  it("odklepnutá dnešná pripomienka 6M riadok nezhasne", () => {
    // Inak by odklepnutie dnešného riadku umlčalo aj otázku, na ktorú nikto
    // neodpovedal — a tá by sa vrátila až o mesiac.
    const von = odstranDuplicity([sixm("Martin Vaško"), { ...dnes("Martin Vaško"), acked: true }]);
    expect(von.some((x) => x.key.startsWith("sixm|"))).toBe(true);
  });
});
