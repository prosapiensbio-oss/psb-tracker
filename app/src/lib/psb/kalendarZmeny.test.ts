import { describe, expect, test } from "bun:test";

import { holyUid, ohlasitZmenu, prenosRucnych, sparujZmeny, tenIstyClovek, type SurovaZmena, najdiPresun, zmizlaPoKonci } from "./kalendarZmeny";

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

describe("zmiznutá hodina, ktorá sa inde objavila", () => {
  const zmena = { druh: "zrusene", klient: "Tomaš Krčmar", nazov: null, pred: "2026-09-15T16:00", kedy: "2026-09-14T09:00:00.000Z" };
  const u = (zaciatok: string, prvyRaz: string | null, klient = "Tomaš Krčmar") =>
    ({ uid: `u-${zaciatok}`, klient, nazov: klient, zaciatok, prvyRaz });

  test("udalosť, ktorá pribudla v tej istej chvíli, je presun", () => {
    const p = najdiPresun(zmena, [u("2026-09-22T16:00", "2026-09-14T09:00:00.000Z")]);
    expect(p?.zaciatok).toBe("2026-09-22T16:00");
    expect(p?.kandidatov).toBe(1);
  });

  test("bežný ďalší tréning presun nie je — objavil sa dávno predtým", () => {
    expect(najdiPresun(zmena, [u("2026-09-22T16:00", "2026-08-01T09:00:00.000Z")])).toBe(null);
  });

  test("udalosť ďaleko od pôvodného termínu sa neberie", () => {
    expect(najdiPresun(zmena, [u("2026-11-20T16:00", "2026-09-14T09:00:00.000Z")])).toBe(null);
  });

  test("iný človek nie je presun", () => {
    expect(najdiPresun(zmena, [u("2026-09-22T16:00", "2026-09-14T09:00:00.000Z", "Jan Kral")])).toBe(null);
  });

  test("z viacerých kandidátov vyberie najbližší v čase objavenia a povie, že ich je viac", () => {
    const p = najdiPresun(zmena, [
      u("2026-09-20T16:00", "2026-09-14T20:00:00.000Z"),
      u("2026-09-22T16:00", "2026-09-14T09:30:00.000Z"),
    ]);
    expect(p?.zaciatok).toBe("2026-09-22T16:00");
    expect(p?.kandidatov).toBe(2);
  });

  test("posunuté ani pridané sa už nerieši", () => {
    expect(najdiPresun({ ...zmena, druh: "posunute" }, [u("2026-09-22T16:00", "2026-09-14T09:00:00.000Z")])).toBe(null);
  });

  test("udalosť bez známeho prvého videnia sa neberie — nie je z čoho súdiť", () => {
    expect(najdiPresun(zmena, [u("2026-09-22T16:00", null)])).toBe(null);
  });
});

describe("zmizlaPoKonci — UTC proti pražskému času", () => {
  test("leto (CEST, +2): tréning do 10:00 zmizol o 11:00 v Prahe = 09:00 UTC", () => {
    expect(zmizlaPoKonci("2026-07-15T09:00:00.000Z", "2026-07-15T10:00")).toBe(true);
    // Reťazce by tvrdili opak: „…T09:00" < „…T10:00".
    expect("2026-07-15T09:00:00.000Z" > "2026-07-15T10:00").toBe(false);
  });
  test("leto: zmizol o 09:30 v Prahe (07:30 UTC), tréning ešte bežal", () => {
    expect(zmizlaPoKonci("2026-07-15T07:30:00.000Z", "2026-07-15T10:00")).toBe(false);
  });
  test("zima (CET, +1): hranica je o hodinu inde než v lete", () => {
    expect(zmizlaPoKonci("2026-01-15T09:30:00.000Z", "2026-01-15T10:00")).toBe(true);
    expect(zmizlaPoKonci("2026-01-15T08:30:00.000Z", "2026-01-15T10:00")).toBe(false);
  });
  test("bez časov nie je o čom hovoriť", () => {
    expect(zmizlaPoKonci(null, "2026-01-15T10:00")).toBe(false);
    expect(zmizlaPoKonci("2026-01-15T09:30:00.000Z", null)).toBe(false);
  });
});

describe("prenosRucnych — presun priamo v Googli", () => {
  const r = (uid: string, zaciatok: string, x: Partial<{ typ_rucne: number | null; klient_rucne: number | null; zmizla_at: string | null }> = {}) => ({
    uid, zaciatok, zmizla_at: null, typ_rucne: null, klient_rucne: 0, ...x,
  });
  const nova = (uid: string, zaciatok: string) => ({ uid, zaciatok });

  test("holyUid berie posledný oddeľovač", () => {
    expect(holyUid("abc@google.com|2026-11-02T09:00")).toBe("abc@google.com");
  });
  test("jednorazová udalosť presunutá na iný deň si nesie ručné polia", () => {
    const stara = r("a|2026-11-02T09:00", "2026-11-02T09:00", { typ_rucne: 1, klient_rucne: 1 });
    const novy = nova("a|2026-11-04T17:00", "2026-11-04T17:00");
    const m = prenosRucnych([novy], [stara], new Set([novy.uid]));
    expect(m.get(novy.uid)).toBe(stara);
  });
  test("bez ručných polí sa nič neprenáša", () => {
    const novy = nova("a|2026-11-04T17:00", "2026-11-04T17:00");
    expect(prenosRucnych([novy], [r("a|2026-11-02T09:00", "2026-11-02T09:00")], new Set([novy.uid])).size).toBe(0);
  });
  test("cudzie UID sa nepreberá", () => {
    const novy = nova("b|2026-11-04T17:00", "2026-11-04T17:00");
    expect(prenosRucnych([novy], [r("a|2026-11-02T09:00", "2026-11-02T09:00", { klient_rucne: 1 })], new Set([novy.uid])).size).toBe(0);
  });
  test("udalosť, ktorá v súbore ostala, nie je zmiznutá", () => {
    const stara = r("a|2026-11-02T09:00", "2026-11-02T09:00", { klient_rucne: 1 });
    const novy = nova("a|2026-11-09T09:00", "2026-11-09T09:00");
    const m = prenosRucnych([nova(stara.uid, stara.zaciatok), novy], [stara], new Set([stara.uid, novy.uid]));
    expect(m.size).toBe(0);
  });
  test("skôr zmiznutá udalosť sa nepočíta — prenáša sa len práve zmiznutá", () => {
    const novy = nova("a|2026-11-04T17:00", "2026-11-04T17:00");
    const m = prenosRucnych([novy], [r("a|2026-11-02T09:00", "2026-11-02T09:00", { klient_rucne: 1, zmizla_at: "2026-10-30T00:00:00Z" })], new Set([novy.uid]));
    expect(m.size).toBe(0);
  });
  test("séria posunutá o hodinu: páruje sa v rámci dňa", () => {
    const s1 = r("a|2026-11-02T09:00", "2026-11-02T09:00", { typ_rucne: 1 });
    const s2 = r("a|2026-11-09T09:00", "2026-11-09T09:00");
    const n1 = nova("a|2026-11-02T10:00", "2026-11-02T10:00");
    const n2 = nova("a|2026-11-09T10:00", "2026-11-09T10:00");
    const m = prenosRucnych([n1, n2], [s1, s2], new Set([n1.uid, n2.uid]));
    expect(m.get(n1.uid)).toBe(s1);
    expect(m.has(n2.uid)).toBe(false);
  });
  test("nejednoznačný stav sa neháda", () => {
    const s1 = r("a|2026-11-02T09:00", "2026-11-02T09:00", { typ_rucne: 1 });
    const s2 = r("a|2026-11-03T09:00", "2026-11-03T09:00", { typ_rucne: 1 });
    const n1 = nova("a|2026-11-05T10:00", "2026-11-05T10:00");
    expect(prenosRucnych([n1], [s1, s2], new Set([n1.uid])).size).toBe(0);
  });
});
