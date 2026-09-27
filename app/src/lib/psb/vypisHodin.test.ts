import { describe, expect, it } from "bun:test";

import type { Udalost } from "./klientOsCasu";
import { hod, hodinTreningu, poslednychMesiacov, priebehBalickov, vypisAkoText, vypisHodin, zaciatokBalicka } from "./vypisHodin";

const bal = (den: string, hodin: number, extra: Partial<Extract<Udalost, { druh: "balicekOd" }>> = {}): Udalost =>
  ({ druh: "balicekOd", den, nazov: hodin ? `OFF - ${hodin}h` : "SILVER členství", hodin, ...extra });
const tre = (den: string, minut?: number): Udalost => ({ druh: "trening", den, minut });
const pla = (den: string, suma: number): Udalost => ({ druh: "platba", den, suma, metoda: "bank" });
const DNES = "2026-09-26";

describe("odpočet sa vracia na začiatku každého členstva", () => {
  // Dan Kouřil má šesť členstiev po 6 h za pol roka. Odpočet sa pri každom
  // vráti na šestku — nie je to jeden dlhý súčet cez celú históriu.
  const os: Udalost[] = [
    bal("2026-05-07", 6), tre("2026-05-07"), pla("2026-05-15", 7790), tre("2026-05-15"), tre("2026-05-28"),
    bal("2026-07-09", 6), tre("2026-07-09"), tre("2026-07-17"),
  ];

  it("prvý tréning balíčka ukáže jeho hodiny, ďalšie klesajú", () => {
    const v = vypisHodin(os, "", DNES, 4);
    const podlaDna = new Map(v.riadky.map((r) => [`${r.den}|${r.druh}`, r]));
    // Riadok balíčka aj platby ostáva prázdny — počet hodín je v názve.
    expect(podlaDna.get("2026-05-07|balicekOd")!.zostatok).toBeNull();
    expect(podlaDna.get("2026-05-15|platba")!.zostatok).toBeNull();
    expect(podlaDna.get("2026-05-07|trening")!.zostatok).toBe(6);
    expect(podlaDna.get("2026-05-28|trening")!.zostatok).toBe(4);
    expect(podlaDna.get("2026-07-09|trening")!.zostatok).toBe(6);
    expect(podlaDna.get("2026-07-17|trening")!.zostatok).toBe(5);
  });

  it("paušál bez hodín v názve odpočet ukončí", () => {
    const v = vypisHodin([bal("2026-05-07", 6), tre("2026-05-10"), bal("2026-06-01", 0), tre("2026-06-05")], "", DNES, null);
    expect(v.riadky.find((r) => r.den === "2026-05-10")!.zostatok).toBe(6);
    expect(v.riadky.find((r) => r.den === "2026-06-05")!.zostatok).toBeNull();
  });
});

describe("dlh — tréning na nezaplatenom členstve", () => {
  // Jerryho príklad: Dan Kouřil, balíček z 2. 9. s otvoreným poplatkom
  // 7 790 Kč a tri tréningy → −1, −2, −3, kým odpočet beží 5, 4, 3.
  const os: Udalost[] = [
    bal("2026-09-02", 6, { nezaplatene: true }), tre("2026-09-02"), tre("2026-09-10"), tre("2026-09-18"),
  ];

  it("počíta tréningy, nie hodiny do mínusu", () => {
    const v = vypisHodin(os, "", DNES, 3);
    expect(v.riadky.map((r) => [r.den, r.dlh, r.zostatok])).toEqual([
      ["2026-09-18", 3, 4],
      ["2026-09-10", 2, 5],
      ["2026-09-02", 1, 6],
      ["2026-09-02", null, null],
    ]);
    expect(v.naDlh).toBe(3);
  });

  it("tréning pred platbou je dlh, tréning po nej už nie", () => {
    // Anetka: balíček 2. 9., tréning v ten istý deň, platba až 3. 9.
    const v = vypisHodin([bal("2026-09-02", 18), tre("2026-09-02"), pla("2026-09-03", 21150), tre("2026-09-09")], "", DNES, 16);
    expect(v.riadky.find((r) => r.den === "2026-09-02" && r.druh === "trening")!.dlh).toBe(1);
    expect(v.riadky.find((r) => r.den === "2026-09-09")!.dlh).toBeNull();
  });

  it("Jerryho príklad: nové členstvo, platba až po troch tréningoch", () => {
    // „Má nový balík, ale je −1 (18), ďalší týždeň −2 (17), −3 (16), a na
    // štvrtý týždeň zaplatila, tak to už len pokračuje 15, 14."
    const os: Udalost[] = [
      bal("2026-09-01", 18), tre("2026-09-02"), tre("2026-09-09"), tre("2026-09-16"),
      pla("2026-09-23", 21150), tre("2026-09-23"),
    ];
    const v = vypisHodin(os, "", DNES, 14);
    expect(v.riadky.map((r) => [r.den, r.druh, r.dlh, r.zostatok])).toEqual([
      ["2026-09-23", "platba", null, null],
      ["2026-09-23", "trening", null, 15],
      ["2026-09-16", "trening", 3, 16],
      ["2026-09-09", "trening", 2, 17],
      ["2026-09-02", "trening", 1, 18],
      ["2026-09-01", "balicekOd", null, null],
    ]);
  });

  it("vyčerpané členstvo bez nového = ďalšie tréningy na dlh", () => {
    const os: Udalost[] = [bal("2026-09-02", 2), tre("2026-09-05"), tre("2026-09-12"), tre("2026-09-19"), tre("2026-09-26")];
    const v = vypisHodin(os, "", DNES, 0);
    expect(v.riadky.map((r) => [r.den, r.zostatok, r.dlh])).toEqual([
      ["2026-09-26", null, 2],
      ["2026-09-19", null, 1],
      ["2026-09-12", 1, null],
      ["2026-09-05", 2, null],
      ["2026-09-02", null, null],
    ]);
  });

  it("keď v období platba nie je vôbec, appka neobviňuje", () => {
    // Platilo sa dopredu — v členstve žiadna platba nie je a značka sa nedá
    // z ničoho odvodiť. Falošné obvinenie je horšie než chýbajúca značka.
    const v = vypisHodin([bal("2026-09-02", 6), tre("2026-09-09")], "", DNES, 5);
    expect(v.riadky[0].dlh).toBeNull();
    expect(v.naDlh).toBe(0);
  });

  it("Natália: platba na poslednom tréningu, nové členstvo ešte nezačalo", () => {
    // Zaplatila 16. 9. na tréningu; nový balíček začne budúci týždeň, takže
    // na 16. 9. sa nesmie objaviť mínus z niečoho, čo ešte neexistuje.
    const v = vypisHodin([bal("2026-04-29", 18), tre("2026-09-09"), tre("2026-09-16"), pla("2026-09-16", 21150)], "", DNES, 0);
    expect(v.riadky.every((r) => r.dlh === null)).toBe(true);
  });
});

describe("posledné členstvo sa zrovná s PTminderom", () => {
  it("doplnené hodiny posunú celý rad, nech koniec sedí", () => {
    // „Doplnenie členstva" nehovorí, o koľko hodín ide. Keď PTminder tvrdí
    // viac, než vychádza z názvu, posunie sa celé posledné obdobie.
    const os: Udalost[] = [bal("2026-09-02", 6), tre("2026-09-09"), tre("2026-09-16")];
    const v = vypisHodin(os, "", DNES, 6);
    expect(v.koniec).toBe(6);
    expect(v.riadky.find((r) => r.den === "2026-09-09")!.zostatok).toBe(8);   // prvý tréning
  });

  it("zrovnáva sa ku dňu exportu, nie k tréningu z kalendára", () => {
    // Dan Kouřil: 6 h od 2. 9., tri tréningy v exporte (zostáva 3) a štvrtý
    // z kalendára z 25. 9. Bez tejto hranice by sa balíček nafúkol na 7 h.
    const os: Udalost[] = [
      bal("2026-09-02", 6), tre("2026-09-02"), tre("2026-09-10"), tre("2026-09-18"),
      { druh: "trening", den: "2026-09-25", zKalendara: true },
    ];
    const v = vypisHodin(os, "", DNES, 3);
    expect(v.riadky.find((r) => r.den === "2026-09-02" && r.druh === "trening")!.zostatok).toBe(6);
    expect(v.koniec).toBe(2);                                  // po tréningu z kalendára
  });

  it("bez čísla z karty sa nič neposúva", () => {
    const v = vypisHodin([bal("2026-09-02", 6), tre("2026-09-09")], "", DNES, null);
    expect(v.riadky[0].zostatok).toBe(6);
    expect(v.koniec).toBe(5);
  });
});

describe("dĺžka tréningu", () => {
  it("bez údaja hodina, deväťdesiat minút hodina a pol", () => {
    expect(hodinTreningu(tre("2026-09-09"))).toBe(1);
    expect(hodinTreningu(tre("2026-09-09", 90))).toBe(1.5);
  });

  it("do odpočtu ide skutočná dĺžka", () => {
    const v = vypisHodin([bal("2026-09-02", 18), tre("2026-09-09", 90)], "", DNES, null);
    expect(v.riadky[0].zostatok).toBe(18);
    expect(v.koniec).toBe(16.5);
    expect(v.odtrenovane).toBe(1.5);
  });
});

describe("obdobie", () => {
  const os: Udalost[] = [bal("2025-05-01", 6), tre("2025-05-10"), bal("2026-09-02", 18), tre("2026-09-09"), tre("2026-09-16")];

  it("staršie členstvá sú vo výpise aj s odpočtom", () => {
    const v = vypisHodin(os, "", DNES, 16);
    expect(v.riadky).toHaveLength(5);
    expect(v.riadky.find((r) => r.den === "2025-05-10")!.zostatok).toBe(6);
  });

  it("obdobie nesie počiatočný stav", () => {
    const v = vypisHodin(os, "2026-09-10", DNES, 16);
    expect(v.zaciatok).toBe(18);
    expect(v.odtrenovane).toBe(1);
  });

  it("posledné N mesiace", () => {
    expect(poslednychMesiacov(3, "2026-09-26")).toEqual({ od: "2026-06-26", do: "2026-09-26" });
  });
});

describe("text pre klienta", () => {
  const os: Udalost[] = [
    { druh: "balicekOd", den: "2026-09-02", nazov: "OFF - 6h BEZ viazanosti", hodin: 6, doDna: "2026-10-28", nezaplatene: true },
    { druh: "trening", den: "2026-09-10", cas: "3:00pm", trener: "Jerry" },
  ];

  it("nesie začiatok členstva, odpočet aj mínus", () => {
    const t = vypisAkoText(vypisHodin(os, "", DNES, 5), "Dan Kouřil");
    expect(t).toContain("Výpis hodín — Dan Kouřil");
    expect(t).toContain("OFF - 6h BEZ viazanosti · 6 h · do 28. 10. 2026");
    expect(t).toContain("zostávalo 6 h · nezaplatené · 1. tréning");
    expect(t).toContain("Tréningov na nezaplatenom členstve: 1");
    expect(t).toContain("tréning 15:00 · Jerry");
  });
});

describe("kotva", () => {
  it("posledný balíček s hodinami; paušál ani doplnenie sa nerátajú", () => {
    const os: Udalost[] = [bal("2026-09-02", 18), bal("2026-09-10", 0), { druh: "balicekOd", den: "2026-09-12", nazov: "Doplnenie členstva", hodin: 0, doplnenie: true }];
    expect(zaciatokBalicka(os, DNES)).toBe("2026-09-02");
  });

  it("bez balíčka žiadne stavy", () => {
    expect(priebehBalickov([tre("2026-09-01")], 5, DNES).stavy.size).toBe(1);
  });
});

describe("dokúpené hodiny sa pripočítajú", () => {
  // Markéta Lozias: balíček 6 h z 31. 7. vyčerpala 7. 9., 12. 9. si dokúpila
  // tri hodiny a 18. 9. trénovala. Kým appka dokúpené hodiny ignorovala,
  // vyšlo jej −2 nad rámec balíčka.
  const dopl = (den: string, hodin: number): Udalost =>
    ({ druh: "balicekOd", den, nazov: "Doplnenie členstva", hodin, doplnenie: true });

  it("po dokúpení odpočet pokračuje, nezačína odznova", () => {
    const os: Udalost[] = [
      bal("2026-07-31", 2), tre("2026-08-07"), tre("2026-09-07"),
      dopl("2026-09-12", 3), tre("2026-09-18"),
    ];
    const v = vypisHodin(os, "", DNES, null);
    expect(v.riadky.find((r) => r.den === "2026-09-07")!.zostatok).toBe(1);
    expect(v.riadky.find((r) => r.den === "2026-09-18")).toMatchObject({ zostatok: 3, dlh: null });
    expect(v.koniec).toBe(2);
  });

  it("doplnenie bez hodín odpočet nemení", () => {
    const os: Udalost[] = [bal("2026-07-31", 2), tre("2026-08-07"), dopl("2026-09-12", 0), tre("2026-09-18")];
    const v = vypisHodin(os, "", DNES, null);
    expect(v.riadky.find((r) => r.den === "2026-09-18")!.zostatok).toBe(1);
  });
});

describe("tréning zadarmo", () => {
  // Jerry, 27. 9. 2026: „čo keď nechcem, aby sa klientovi odpočítal tréning
  // od členstva?" Hodina sa odtrénovala, z balíčka sa nestrhne — a nemôže
  // byť ani na dlh, lebo je darovaná.
  const os: Udalost[] = [
    bal("2026-09-02", 6, { nezaplatene: true }),
    tre("2026-09-02"),
    { druh: "trening", den: "2026-09-09", zdarma: "kompenzácia za zrušený tréning" },
    tre("2026-09-16"),
  ];

  it("z odpočtu ani z dlhu sa nepočíta", () => {
    const v = vypisHodin(os, "", DNES, null);
    const r = new Map(v.riadky.filter((x) => x.druh === "trening").map((x) => [x.den, x]));
    expect(r.get("2026-09-02")).toMatchObject({ zostatok: 6, dlh: 1 });
    expect(r.get("2026-09-09")).toMatchObject({ zostatok: null, dlh: null });
    expect(r.get("2026-09-16")).toMatchObject({ zostatok: 5, dlh: 2 });
    expect(v.koniec).toBe(4);
  });

  it("dôvod je v texte pre klienta", () => {
    const t = vypisAkoText(vypisHodin(os, "", DNES, null), "Klient");
    expect(t).toContain("zdarma (kompenzácia za zrušený tréning)");
  });

  it("do vyčerpaných hodín sa nepočíta, ale v zozname stojí", () => {
    const v = vypisHodin(os, "", DNES, null);
    expect(v.odtrenovane).toBe(2);                                   // tri tréningy, dve hodiny z členstva
    expect(v.riadky.filter((r) => r.druh === "trening")).toHaveLength(3);
  });
});
