import { describe, expect, it } from "bun:test";

import { ktoDnesTrenoval, poslednyTrening, pripomienkySlubov, zruseneTreningy } from "./compute";

/**
 * Diery medzi poschodiami — revízia 17. 8. 2026.
 *
 * Jerry: „keď v Kalendári vyplním, že Josef nepríde, zmizne mi notifikácia
 * o vyčerpanom balíku? A keď zapíšem, že Richard Matl bol minulý týždeň na
 * tréningu, zmizne mi to z notifikácií?"
 *
 * Obe odpovede boli nie: register veril výhradne exportu z PTmindera a ručne
 * zapísané zrušenie čítal len samotný Kalendár.
 */

const DNES = new Date("2026-08-17T12:00:00Z");
const klient = (name: string, lastSession: string) => ({ name, lastSession });
const udalost = (zaciatok: string, klient: string | null, typ = "trening") => ({ zaciatok, klient, typ });

describe("zruseneTreningy", () => {
  it("ručný zápis zrušenia sa dá prečítať aj mimo Kalendára", () => {
    const s = zruseneTreningy([{ druh: "zrusene", klient: "Josef Šnirych", pred: "2026-08-17T00:00" }]);
    expect(s.has("josef snirych|2026-08-17")).toBe(true);
  });

  it("náhrada ani posun nie sú zrušenie", () => {
    expect(zruseneTreningy([{ druh: "nahrada", klient: "Kto", po: "2026-08-17T00:00" }]).size).toBe(0);
    expect(zruseneTreningy([{ druh: "posunute", klient: "Kto", pred: "2026-08-17T10:00" }]).size).toBe(0);
  });
});

describe("poslednyTrening — kalendár hovorí skôr než export", () => {
  const KLIENTI = { "Richard Matl": klient("Richard Matl", "2026-08-03") };

  it("tréning z kalendára prebije starší dátum z PTmindera", () => {
    // Presne Jerryho prípad: Richard trénoval 13. 8., export ho ešte nemá,
    // a appka hlásila „14 dní bez tréningu".
    const von = poslednyTrening(KLIENTI, [udalost("2026-08-13T10:00:00Z", "Richard Matl")], [], DNES);
    expect(von["Richard Matl"]).toBe("2026-08-13");
  });

  it("budúci tréning nie je dôkaz o ničom", () => {
    const von = poslednyTrening(KLIENTI, [udalost("2026-08-25T10:00:00Z", "Richard Matl")], [], DNES);
    expect(von["Richard Matl"]).toBe("2026-08-03");
  });

  it("dnešný tréning sa ráta až po tom, čo prebehol", () => {
    const pred = poslednyTrening(KLIENTI, [udalost("2026-08-17T18:00:00Z", "Richard Matl")], [], DNES);
    expect(pred["Richard Matl"]).toBe("2026-08-03");
    const po = poslednyTrening(KLIENTI, [udalost("2026-08-17T09:00:00Z", "Richard Matl")], [], DNES);
    expect(po["Richard Matl"]).toBe("2026-08-17");
  });

  it("zrušený tréning sa neráta ani vtedy, keď stojí v kalendári", () => {
    const von = poslednyTrening(
      KLIENTI,
      [udalost("2026-08-13T10:00:00Z", "Richard Matl")],
      [{ druh: "zrusene", klient: "Richard Matl", pred: "2026-08-13T10:00" }],
      DNES,
    );
    expect(von["Richard Matl"]).toBe("2026-08-03");
  });

  it("export zostáva, keď je novší než kalendár", () => {
    const k = { "Kto Chodi": klient("Kto Chodi", "2026-08-16") };
    const von = poslednyTrening(k, [udalost("2026-08-10T10:00:00Z", "Kto Chodi")], [], DNES);
    expect(von["Kto Chodi"]).toBe("2026-08-16");
  });

  it("meno, ktoré appka nepozná, nezaloží nového klienta", () => {
    const von = poslednyTrening(KLIENTI, [udalost("2026-08-13T10:00:00Z", "Ktosi Cudzi")], [], DNES);
    expect(Object.keys(von)).toEqual(["Richard Matl"]);
  });

  it("diakritika v kalendári nerozhoduje", () => {
    const k = { "Josef Šnirych": klient("Josef Šnirych", "2026-08-01") };
    const von = poslednyTrening(k, [udalost("2026-08-14T10:00:00Z", "Josef Snirych")], [], DNES);
    expect(von["Josef Šnirych"]).toBe("2026-08-14");
  });
});

describe("ktoDnesTrenoval — chipy v + Zápis", () => {
  it("ručne zrušený tréning sa na zápis neponúka", () => {
    // Ponúknuť meno človeka, o ktorom Jerry pred hodinou zapísal, že nepríde,
    // je pozvánka zapísať si tréning, ktorý sa nekonal.
    const u = [{ zaciatok: "2026-08-17T09:00:00Z", klient: "Josef Šnirych", typ: "trening" }];
    expect(ktoDnesTrenoval(u, { dnes: DNES })).toEqual(["Josef Šnirych"]);
    expect(ktoDnesTrenoval(u, { dnes: DNES, zmeny: [{ druh: "zrusene", klient: "Josef Šnirych", pred: "2026-08-17T09:00" }] })).toEqual([]);
  });
});

describe("SMS po úvodnom — ručné zrušenie mlčí rovnako ako to z Googlu", () => {
  it("zrušený úvodný SMS nepotrebuje", () => {
    const u = [{ zaciatok: "2026-08-11T10:00:00Z", klient: "Tereza Pehalova", typ: "uvodny", zmizlaAt: null }];
    expect(pripomienkySlubov(u, [], {}, DNES)).not.toHaveLength(0);
    expect(
      pripomienkySlubov(u, [], {}, DNES, [{ druh: "zrusene", klient: "Tereza Pehalova", pred: "2026-08-11T10:00" }]),
    ).toHaveLength(0);
  });
});
