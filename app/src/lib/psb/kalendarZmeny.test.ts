import { describe, expect, test } from "bun:test";

import { ohlasitZmenu, sparujZmeny, tenIstyClovek, type SurovaZmena } from "./kalendarZmeny";

/**
 * Michal Knapčok, 11. 8.: „mal tréning v stredu o 15, zrušil, program to
 * nezachytil." Appka to zachytila — `zmizla_at` sa zapísalo pri synchronizácii
 * v pondelok o 17:23 — ale záznam zahodila, lebo streda bola v budúcnosti.
 * A keďže udalosť je odvtedy označená ako zmiznutá, rozdiel ju už nikdy
 * nevyrobí: ticho bolo trvalé.
 */
const DNES = "2026-08-10";
const MINULOST = "2026-08-07T15:00";
const BUDUCNOST = "2026-08-12T15:00";

describe("ohlasitZmenu", () => {
  test("zrušená BUDÚCA hodina sa hlási — presne Michalov prípad", () => {
    expect(ohlasitZmenu("zrusene", BUDUCNOST, null, DNES)).toBe(true);
  });

  test("zrušená minulá hodina sa hlási tiež", () => {
    expect(ohlasitZmenu("zrusene", MINULOST, null, DNES)).toBe(true);
  });

  test("posun do budúcnosti sa hlási — je to voľné okno", () => {
    expect(ohlasitZmenu("posunute", BUDUCNOST, "2026-08-13T15:00", DNES)).toBe(true);
  });

  test("NOVÝ termín do budúcna sa nehlási — to je plán, nie otázka", () => {
    expect(ohlasitZmenu("pridane", null, BUDUCNOST, DNES)).toBe(false);
  });

  test("tréning dopísaný spätne sa hlási", () => {
    expect(ohlasitZmenu("pridane", null, MINULOST, DNES)).toBe(true);
  });

  test("premenovanie budúcej udalosti je šum", () => {
    expect(ohlasitZmenu("premenovane", BUDUCNOST, BUDUCNOST, DNES)).toBe(false);
  });

  test("dnešok sa ešte ráta ako minulosť", () => {
    expect(ohlasitZmenu("pridane", null, `${DNES}T09:00`, DNES)).toBe(true);
  });

  test("zmena bez termínu sa nehlási — nie je o čom", () => {
    expect(ohlasitZmenu("pridane", null, null, DNES)).toBe(false);
  });

  test("„posun“ z rovnakého času na rovnaký sa nehlási", () => {
    // Opakovaná udalosť prerobená Googlom: iné uid, ten istý termín.
    // Lenka Přinosilová takto 22. 9. 2026 vyrobila štyri otázky naraz,
    // hoci sa v jej kalendári nestalo nič.
    expect(ohlasitZmenu("posunute", "2026-10-01T15:00", "2026-10-01T15:00", "2026-09-23")).toBe(false);
  });

  test("skutočný posun v ten istý deň sa hlási aj naďalej", () => {
    expect(ohlasitZmenu("posunute", "2026-09-25T10:00", "2026-09-25T09:30", "2026-09-23")).toBe(true);
  });

  test("posun na iný deň sa hlási", () => {
    expect(ohlasitZmenu("posunute", "2026-09-23T19:00", "2026-09-24T19:00", "2026-09-23")).toBe(true);
  });

  test("súkromná udalosť sa nehlási, ani keď pribudne", () => {
    // Pravidlo existovalo len pre zmiznuté. „Poslat veronika QR" a „Napisat
    // lenke" tak viseli v registri ako otázky, prečo pribudli (23. 9. 2026).
    expect(ohlasitZmenu("pridane", null, MINULOST, DNES, "sukromne")).toBe(false);
    expect(ohlasitZmenu("zrusene", MINULOST, null, DNES, "sukromne")).toBe(false);
    expect(ohlasitZmenu("posunute", MINULOST, BUDUCNOST, DNES, "netrening")).toBe(false);
  });

  test("tréning sa hlási aj naďalej", () => {
    expect(ohlasitZmenu("zrusene", BUDUCNOST, null, DNES, "trening")).toBe(true);
    expect(ohlasitZmenu("pridane", null, MINULOST, DNES, "uvodny")).toBe(true);
  });

  test("bez typu sa nič nemení — staré volania platia ďalej", () => {
    expect(ohlasitZmenu("zrusene", BUDUCNOST, null, DNES)).toBe(true);
  });
});

const zmena = (o: Partial<SurovaZmena>): SurovaZmena =>
  ({ druh: "zrusene", u: "u1", nazov: "", klient: null, pred: null, po: null, typ: "trening", ...o });

describe("kto je to — párovanie mien", () => {
  test("diakritika nerozhoduje", () => {
    // Presne prípad z 24. 9. 2026: starý výskyt mal priradenú „Annu
    // Kadličkovu", nový prišiel ako názov „Anna Kadlickova" bez klienta.
    expect(tenIstyClovek("Anna Kadličkova", "Anna Kadlickova")).toBe(true);
  });

  test("samotné priezvisko sedí na celé meno", () => {
    expect(tenIstyClovek("Kadlickova", "Anna Kadličkova")).toBe(true);
    expect(tenIstyClovek("Anna Kadličkova", "Kadlickova")).toBe(true);
  });

  test("samotné krstné meno NESEDÍ — Jakubov je v PSB viac", () => {
    expect(tenIstyClovek("Jakub", "Jakub Gerich")).toBe(false);
    expect(tenIstyClovek("Jakub Gerich", "Jakub Kaňovský")).toBe(false);
  });

  test("prázdne meno nesedí na nič", () => {
    expect(tenIstyClovek("", "Anna Kadličkova")).toBe(false);
  });
});

describe("zrušené + pridané v ten istý deň je posun", () => {
  test("spáruje sa aj cez inak napísané meno a nový záznam bez klienta", () => {
    const v = sparujZmeny([
      zmena({ druh: "pridane", nazov: "Anna Kadlickova", klient: null, po: "2026-10-07T19:00", typ: "netrening" }),
      zmena({ druh: "zrusene", nazov: "Kadlickova", klient: "Anna Kadličkova", pred: "2026-10-07T19:00" }),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].druh).toBe("posunute");
    expect(v[0].pred).toBe("2026-10-07T19:00");
    expect(v[0].po).toBe("2026-10-07T19:00");
    // …a taký „posun" sa už neohlási, lebo sa čas nezmenil.
    expect(ohlasitZmenu(v[0].druh, v[0].pred, v[0].po, "2026-09-24", v[0].typ)).toBe(false);
  });

  test("typ ostáva zo STARÉHO záznamu — nový ešte nemusí byť rozpoznaný", () => {
    const [v] = sparujZmeny([
      zmena({ druh: "zrusene", klient: "Anna Kadličkova", pred: "2026-10-07T19:00", typ: "trening" }),
      zmena({ druh: "pridane", nazov: "Anna Kadlickova", po: "2026-10-07T18:00", typ: "netrening" }),
    ]);
    expect(v.typ).toBe("trening");
    expect(ohlasitZmenu(v.druh, v.pred, v.po, "2026-09-24", v.typ)).toBe(true);
  });

  test("iný deň sa nepáruje — to je naozaj zrušenie a naozaj pridanie", () => {
    const v = sparujZmeny([
      zmena({ druh: "zrusene", klient: "Anna Kadličkova", pred: "2026-09-30T19:00" }),
      zmena({ druh: "pridane", klient: "Anna Kadličkova", po: "2026-10-07T19:00" }),
    ]);
    expect(v.map((x) => x.druh).sort()).toEqual(["pridane", "zrusene"]);
  });

  test("jedno zrušenie si nevezme dve pridania", () => {
    const v = sparujZmeny([
      zmena({ druh: "zrusene", klient: "Anna Kadličkova", pred: "2026-10-07T19:00" }),
      zmena({ druh: "pridane", klient: "Anna Kadličkova", po: "2026-10-07T18:00", u: "a" }),
      zmena({ druh: "pridane", klient: "Anna Kadličkova", po: "2026-10-07T20:00", u: "b" }),
    ]);
    expect(v.filter((x) => x.druh === "posunute")).toHaveLength(1);
    expect(v.filter((x) => x.druh === "pridane")).toHaveLength(1);
  });
});
