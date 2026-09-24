// Platby z výpisu banky — posledná tretina odchodu od PTmindera.
import { describe, expect, it } from "bun:test";

import { najdiKlientaVTexte, nepriradene, porovnajPlatby, smieSaZapamatat, textPlatby, vzorPlatby, type FioRiadok, type Platba, vyzeraNaKlienta, parujPodlaSumy } from "./platbyEvidencia";

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

  it("rozpad na banku, hotovosť a iné dá dokopy celok", () => {
    // Keď pribudol „prevod" a „bitcoin", pôvodný rozpad ich nezaradil nikam
    // a stĺpce v tabuľke prestali dávať dokopy súčet — ticho, bez chyby.
    const v = porovnajPlatby(
      [p("2026-09-01", 1000, "banka"), p("2026-09-02", 2000, "prevod"), p("2026-09-03", 300, "hotovost"), p("2026-09-04", 40, "bitcoin"), p("2026-09-05", 5, "ine")],
      [], "2026-09-30",
    );
    const m = v.mesiace[0];
    expect(m.kokpitBanka).toBe(3000);
    expect(m.kokpitHotovost).toBe(300);
    expect(m.kokpitIne).toBe(45);
    expect(m.kokpitBanka + m.kokpitHotovost + m.kokpitIne).toBe(m.kokpit);
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

describe("smieSaZapamatat", () => {
  it("odosielateľ, ktorý JE klient, sa zapamätá", () => {
    expect(smieSaZapamatat("eva dolezalova", "Eva Doležalova")).toBe(true);
  });

  it("rodinný príslušník s tým istým priezviskom tiež", () => {
    expect(smieSaZapamatat("tomas krivda", "Tomaš Krivda")).toBe(true);
  });

  it("sprostredkovateľ sa NEzapamätá", () => {
    // „Josef snyrich · Filip Stráňavský" — Jerry poslal prevod za Josefa.
    // Keby sa to naučilo, každý jeho ďalší prevod by appka ponúkala ako
    // platbu Josefa Šnirycha.
    expect(smieSaZapamatat("filip stranavsky", "Josef Šnirych")).toBe(false);
  });
});

describe("vyzeraNaKlienta", () => {
  const r = (counterparty: string, typ = "Okamžitá platba", note = "") => ({ counterparty, note, typ });

  it("prevod od človeka s poznámkou o balíčku je platba klienta", () => {
    expect(vyzeraNaKlienta(r("6 hodín s viazanosťou · PETRA RUPOVÁ"))).toBe(true);
    expect(vyzeraNaKlienta(r("ProSapiens Úvodní trénink · Dvořák"))).toBe(true);
  });

  it("vrátka z e-shopu nie je platba klienta", () => {
    // Do kopy chodila každý deň a Jerry nad ňou zakaždým zastal.
    expect(vyzeraNaKlienta(r("Eshop · ALZA.CZ A.S.", "Bezhotovostní platba"))).toBe(false);
    expect(vyzeraNaKlienta(r("Kredit: Alza.cz, Prague, CZ", "Karetní transakce"))).toBe(false);
  });

  it("vklad do bankomatu a dobropis na kartu nie sú platby klienta", () => {
    expect(vyzeraNaKlienta(r("Vklad do bankomatu: FIO BANKA", "Karetní transakce"))).toBe(false);
    expect(vyzeraNaKlienta(r("Kavarna a pekarna PANE, Brno-sever", "Karetní transakce"))).toBe(false);
  });

  it("titul pred menom firmu nerobí", () => {
    // „Ing." a „MGR." sú ľudia; pravidlo hľadá a.s., s.r.o., spol., z.ú.
    expect(vyzeraNaKlienta(r("Fyzio Tomas Dvorak · Ing. Silvie Dvořáková"))).toBe(true);
    expect(vyzeraNaKlienta(r("20260037 MGR. FILIP STRANAVSKY"))).toBe(true);
  });

  it("firma medzi odosielateľmi sa vylúči", () => {
    expect(vyzeraNaKlienta(r("PROSAPIENS BIOMECHANIC S.R.O."))).toBe(false);
  });
});

describe("faktúra prebíja firmu", () => {
  it("firemný účet platiaci našu faktúru je klient", () => {
    // „HBH PROJEKT SPOL. S · 20260016" — klientovi platí zamestnávateľ.
    // Bez tejto výnimky by riadok z kopy vypadol ako vrátka z obchodu.
    expect(vyzeraNaKlienta({ counterparty: "HBH PROJEKT SPOL. S · 20260016", note: "", typ: "Okamžitá platba" })).toBe(true);
  });

  it("dlhé číslo objednávky faktúrou nie je", () => {
    expect(vyzeraNaKlienta({ counterparty: "ALZA.CZ A.S. · 1053853034", note: "", typ: "Bezhotovostní platba" })).toBe(false);
  });
});

describe("párovanie podľa sumy a dňa", () => {
  const pt = [
    { klient: "Jan Kral", datum: "2026-09-16", suma: 6990, metoda: "bank" },
    { klient: "Eva Doležalova", datum: "2026-09-09", suma: 6990, metoda: "bank" },
    { klient: "Janka Malinova", datum: "2026-08-17", suma: 1100, metoda: "cash" },
  ];

  it("suma a deň nájdu človeka, ktorého meno v texte nie je", () => {
    // „20260037 MGR. FILIP STRANAVSKY" je číslo faktúry a meno PRÍJEMCU.
    // PTminder o tej istej platbe vie, kto ju poslal.
    expect(parujPodlaSumy({ date: "2026-09-16", amount_czk: 6990 }, pt)).toEqual(["Jan Kral"]);
  });

  it("na hotovosť sa nepáruje — cez účet neprešla", () => {
    expect(parujPodlaSumy({ date: "2026-08-17", amount_czk: 1100 }, pt)).toEqual([]);
  });

  it("mimo okna sa nepáruje", () => {
    expect(parujPodlaSumy({ date: "2026-09-25", amount_czk: 6990 }, pt)).toEqual([]);
  });

  it("dvaja s rovnakou sumou v okne = nevyberie sa nikto sám", () => {
    const v = parujPodlaSumy({ date: "2026-09-16", amount_czk: 6990 }, [
      ...pt, { klient: "Iný Človek", datum: "2026-09-15", suma: 6990, metoda: "bank" },
    ]);
    expect(v.length).toBe(2);
  });
});

describe("krstné meno ako druhý pokus", () => {
  const mena = ["Richard Matl", "Roman Pavlik", "Jan Kral"];

  it("priezvisko má prednosť", () => {
    expect(najdiKlientaVTexte("platba · Pavlik", mena)).toEqual(["Roman Pavlik"]);
  });

  it("keď priezvisko nesedí, skúsi sa krstné", () => {
    // „ProSapiens Balíček 6h Richard" — priezvisko tam nie je.
    expect(najdiKlientaVTexte("ProSapiens Balíček 6h Richard", mena)).toEqual(["Richard Matl"]);
  });

  it("vrátka nie je platba klienta", () => {
    expect(vyzeraNaKlienta({ counterparty: "Vraciam za potraviny · Terézia Zaťková", note: "", typ: "Okamžitá platba" })).toBe(false);
    expect(vyzeraNaKlienta({ counterparty: "vratka kauce · KATEŘINA KONVIČKOVÁ", note: "", typ: "Okamžitá platba" })).toBe(false);
  });
});
