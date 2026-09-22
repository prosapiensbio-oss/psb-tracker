// Platby z výpisu banky — posledná tretina odchodu od PTmindera.
import { describe, expect, it } from "bun:test";

import { najdiKlientaVTexte, nepriradene, porovnajPlatby, textPlatby, vzorPlatby, type FioRiadok, type Platba } from "./platbyEvidencia";

const MENA = [
  "Natalia Peckova", "Josef Šnirych", "Natalia Krivdova", "Barbora Vankova",
  "Tomaš Dvořak", "Petra Rupova", "Eva Doležalova", "Richard Matl", "Katerina Matlova",
  "Jan Kral",
];
const r = (o: Partial<FioRiadok> & { id: string }): FioRiadok => ({
  id: o.id, date: o.date ?? "2026-09-16T00:00:00.000Z", amount_czk: o.amount_czk ?? 6990,
  counterparty: o.counterparty ?? null, note: o.note ?? null, typ: o.typ ?? "Okamžitá příchozí platba",
});

describe("najdiKlientaVTexte — skutočné riadky z Fio", () => {
  it("klient je odosielateľ", () => {
    expect(najdiKlientaVTexte("Prosapiens 18h · Natália Pecková", MENA)).toEqual(["Natalia Peckova"]);
  });

  it("klient je v SPRÁVE, platí niekto iný", () => {
    // Josefovi platí Filip Stráňavský — a v správe je „snyrich" s ypsilonom.
    expect(najdiKlientaVTexte("Josef snyrich · Filip Stráňavský", MENA)).toEqual(["Josef Šnirych"]);
  });

  it("manžel platí za manželku", () => {
    expect(najdiKlientaVTexte("Krivdova - 6 hodín s viazanosťou · Tomáš Krivda", MENA)).toEqual(["Natalia Krivdova"]);
  });

  it("naša faktúra v správe neprekáža", () => {
    expect(najdiKlientaVTexte("20260035 MGR. FILIP STRANAVSKY · Ing. BARBORA VANKOVÁ", MENA)).toEqual(["Barbora Vankova"]);
  });

  it("prechýlené priezvisko odosielateľky trafí klienta", () => {
    expect(najdiKlientaVTexte("Fyzio Tomas Dvorak · Ing. Silvie Dvořákov", MENA)).toEqual(["Tomaš Dvořak"]);
  });

  it("vklad do bankomatu nie je nikoho platba", () => {
    expect(najdiKlientaVTexte("Vklad do bankomatu: FIO BANKA, JOŠTOVA 4, BRNO", MENA)).toEqual([]);
  });

  it("dve priezviská na jeden token = nevyberie sa nikto", () => {
    // Richard Matl a Katerina Matlová. Zle priradená platba pokazí tržbu
    // aj históriu a nikto to nezbadá — súčet v banke sedí.
    expect(najdiKlientaVTexte("Platba · Katerina Matlova", MENA).length).toBe(2);
  });

  it("krátke priezvisko sa nehľadá — sedelo by na pol výpisu", () => {
    expect(najdiKlientaVTexte("Kralovopolska strojirna", MENA)).toEqual([]);
  });
});

describe("vzorPlatby", () => {
  it("berie odosielateľa, nie správu s číslom faktúry", () => {
    expect(vzorPlatby(r({ id: "1", counterparty: "ProSapiens 6hodin vazanost 09/2026/2 · EVA DOLEŽALOVÁ" }))).toBe("eva dolezalova");
  });
  it("bez oddeľovača berie celý text", () => {
    expect(vzorPlatby(r({ id: "1", counterparty: "Petra Rupova" }))).toBe("petra rupova");
  });
  it("textPlatby spája správu aj poznámku", () => {
    expect(textPlatby(r({ id: "1", counterparty: "A", note: "B" }))).toBe("A B");
  });
});

describe("nepriradene", () => {
  const fio = [
    r({ id: "a", counterparty: "Doplatek · PETRA RUPOVÁ", amount_czk: 700 }),
    r({ id: "b", counterparty: "Vklad do bankomatu: FIO BANKA", amount_czk: 23000 }),
    r({ id: "c", counterparty: "Najem", amount_czk: -15000 }),
    r({ id: "d", counterparty: "Prosapiens 18h · Natália Pecková", amount_czk: 21150 }),
  ];

  it("výdavky, vklady hotovosti a už priradené sa nepýtajú", () => {
    const platby: Platba[] = [{ id: "p1", klient: "Natalia Peckova", datum: "2026-09-16", sumaCzk: 21150, sposob: "banka", fioId: "d", zruseneAt: null }];
    const v = nepriradene(fio, platby, {}, new Set(), MENA);
    expect(v.map((x) => x.fioId)).toEqual(["a"]);
    expect(v[0].kandidati).toEqual(["Petra Rupova"]);
  });

  it("označené „nie je to platba klienta“ sa už nepýtajú", () => {
    const v = nepriradene(fio, [], {}, new Set(["a"]), MENA);
    expect(v.map((x) => x.fioId)).toEqual(["d"]);
  });

  it("naučené priradenie prebije hľadanie v texte", () => {
    const v = nepriradene([r({ id: "x", counterparty: "cokolvek · Firma s.r.o." })], [], { "firma s.r.o.": "Jan Kral" }, new Set(), MENA);
    expect(v[0].kandidati).toEqual(["Jan Kral"]);
  });
});

describe("porovnajPlatby", () => {
  const p = (datum: string, suma: number, sposob = "banka"): Platba => ({ id: datum + suma, klient: "X", datum, sumaCzk: suma, sposob, fioId: null, zruseneAt: null });

  it("mesiac, ktorý sedí, má rozdiel nula", () => {
    const v = porovnajPlatby(
      [p("2026-09-05", 6990), p("2026-09-10", 1100, "hotovost")],
      [{ klient: "X", datum: "2026-09-05", suma: 6990, metoda: "bank" }, { klient: "X", datum: "2026-09-10", suma: 1100, metoda: "cash" }],
      "2026-09-20",
    );
    expect(v.rozdiel).toBe(0);
    expect(v.mesiace[0].kokpitHotovost).toBe(1100);
    expect(v.mesiace[0].kokpitBanka).toBe(6990);
  });

  it("platba po konci exportu sa neporovnáva", () => {
    const v = porovnajPlatby([p("2026-09-05", 6990), p("2026-09-22", 5000)], [{ klient: "X", datum: "2026-09-05", suma: 6990, metoda: "bank" }], "2026-09-20");
    expect(v.rozdiel).toBe(0);
    expect(v.kokpit).toBe(6990);
  });

  it("zrušená platba sa nepočíta", () => {
    const zrusena: Platba = { ...p("2026-09-05", 6990), zruseneAt: "2026-09-06" };
    expect(porovnajPlatby([zrusena], [], "2026-09-20").kokpit).toBe(0);
  });

  it("chýbajúca platba v Kokpite je záporný rozdiel", () => {
    const v = porovnajPlatby([], [{ klient: "X", datum: "2026-09-05", suma: 6990, metoda: "bank" }], "2026-09-20");
    expect(v.mesiace[0].rozdiel).toBe(-6990);
  });
});
