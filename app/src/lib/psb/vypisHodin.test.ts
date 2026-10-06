import { describe, expect, it } from "bun:test";

import type { Udalost } from "./klientOsCasu";
import { hod, hodinTreningu, poslednychMesiacov, priebehBalickov, stavPreSpravu, type Vypis, vypisAkoText, vypisHodin, zaciatokBalicka } from "./vypisHodin";
import { osCasuKlienta } from "./klientOsCasu";

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
  // 7 790 Kč a tri tréningy → −1, −2, −3. Od 3. 10. 2026 („nezaplatený balík
  // je 0") odpočet na nezaplatenom členstve NEBEŽÍ: hodina pri tréningu nie
  // je, kým sa nezaplatí — dovtedy odpočet 5, 4, 3 sľuboval hodiny, ktoré
  // klient nemal.
  const os: Udalost[] = [
    bal("2026-09-02", 6, { nezaplatene: true }), tre("2026-09-02"), tre("2026-09-10"), tre("2026-09-18"),
  ];

  it("počíta tréningy, nie hodiny do mínusu — a hodinu nedáva", () => {
    const v = vypisHodin(os, "", DNES, -3);
    expect(v.riadky.map((r) => [r.den, r.dlh, r.zostatok])).toEqual([
      ["2026-09-18", 3, null],
      ["2026-09-10", 2, null],
      ["2026-09-02", 1, null],
      ["2026-09-02", null, null],
    ]);
    expect(v.naDlh).toBe(3);
    expect(v.koniec).toBe(-3);
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

  it("platba mínus vynuluje — ďalší začína od jednotky", () => {
    // Richard Matl: balíček 6 h z 10. 8., dva tréningy pred platbou (23. 8.),
    // štyri po nej, a 28. 9. siedmy tréning na balíček, ktorý už nemá hodiny.
    // Pred opravou to bolo −3, lebo sa mínusy sčítavali cez celý úsek.
    const os: Udalost[] = [
      bal("2026-08-10", 6), tre("2026-08-10"), tre("2026-08-19"), pla("2026-08-23", 7790),
      tre("2026-08-27"), tre("2026-09-02"), tre("2026-09-07"), tre("2026-09-23"), tre("2026-09-28"),
    ];
    const v = vypisHodin(os, "", "2026-09-28", 0);
    const podla = new Map(v.riadky.filter((r) => r.druh === "trening").map((r) => [r.den, r]));
    expect(podla.get("2026-08-10")!.dlh).toBe(1);
    expect(podla.get("2026-08-19")!.dlh).toBe(2);
    expect(podla.get("2026-08-27")!.dlh).toBeNull();
    expect(podla.get("2026-09-23")!.zostatok).toBe(1);
    expect(podla.get("2026-09-28")!.dlh).toBe(1);
  });

  it("dva mínusy za sebou v tom istom členstve rastú", () => {
    // Vynulovanie je udalosť, nie strop: kto po platbe znova trénuje bez
    // hodín, ide −1, −2 — inak by sa druhá séria nikdy nepohla z jednotky.
    const os: Udalost[] = [
      bal("2026-08-10", 2), tre("2026-08-10"), pla("2026-08-12", 2600),
      tre("2026-08-20"), tre("2026-08-27"), tre("2026-09-03"),
    ];
    const v = vypisHodin(os, "", DNES, 0);
    const podla = new Map(v.riadky.filter((r) => r.druh === "trening").map((r) => [r.den, r]));
    expect(podla.get("2026-08-10")!.dlh).toBe(1);
    expect(podla.get("2026-08-20")!.dlh).toBeNull();
    expect(podla.get("2026-08-27")!.dlh).toBe(1);
    expect(podla.get("2026-09-03")!.dlh).toBe(2);
  });

  it("nový balíček preberie tréningy, na ktoré už hodina nebola", () => {
    // Richard Matl: 6 h z 10. 8. minul do 23. 9., 28. 9. odtrénoval na dlh
    // (−1, bez hodín). Keď mu Jerry 29. 9. nahodí ďalších 6 h, ten tréning
    // sa stane šiestou hodinou nového balíčka — mínus mu zostáva.
    // Staré členstvo ešte platí (do 1. 10.) — len z platného sa tréningy
    // preberajú; zo skončeného nie (Hanuš, 4. 10. 2026: karta −1, zoznam −3).
    const bezNoveho: Udalost[] = [
      bal("2026-09-01", 2, { doDna: "2026-10-01" }), tre("2026-09-05"), tre("2026-09-12"), tre("2026-09-20"),
    ];
    const v1 = vypisHodin(bezNoveho, "", "2026-09-29", 0);
    expect(v1.riadky.find((r) => r.den === "2026-09-20")!.zostatok).toBeNull();
    expect(v1.riadky.find((r) => r.den === "2026-09-20")!.dlh).toBe(1);

    // Karta klienta stále hovorí 0 — o balíčku nahodenom v Kokpite nevie,
    // lebo ráta z exportu PTmindera. Zrovnávať sa s ňou nesmie.
    const v2 = vypisHodin([...bezNoveho, bal("2026-09-29", 6, { zKokpitu: true })], "", "2026-09-29", 0);
    const r = v2.riadky.find((x) => x.den === "2026-09-20")!;
    expect(r.zostatok).toBe(6);
    expect(r.dlh).toBe(1);
  });

  it("nový balíček neprevezme obdobie, ktoré hodiny nikdy nemalo", () => {
    // Paušál ani čas pred prvým balíčkom sa nepreberá — inak by nový balíček
    // zhltol celú históriu klienta.
    const os: Udalost[] = [tre("2026-08-05"), tre("2026-08-12"), bal("2026-09-01", 6), tre("2026-09-03")];
    const v = vypisHodin(os, "", DNES, 5);
    expect(v.riadky.find((x) => x.den === "2026-08-12")!.zostatok).toBeNull();
    expect(v.riadky.find((x) => x.den === "2026-09-03")!.zostatok).toBe(6);
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
  it("doplnené hodiny dorovnajú KONIEC, odpočet zostáva taký, aký bol", () => {
    // „Doplnenie členstva" nehovorí, o koľko hodín ide, takže karta môže
    // tvrdiť viac, než vychádza z názvu. Do 3. 10. 2026 sa ten rozdiel
    // rozpustil do celého radu a balíček sa otváral osmičkou, hoci má šesť.
    // Jerry: „6, 5, 4, 3, 2, 1 sú pevne dané, to sa nikdy nemá meniť."
    const os: Udalost[] = [bal("2026-09-02", 6), tre("2026-09-09"), tre("2026-09-16")];
    const v = vypisHodin(os, "", DNES, 6);
    expect(v.koniec).toBe(6);                                               // karta
    expect(v.riadky.find((r) => r.den === "2026-09-09")!.zostatok).toBe(6);  // prvý tréning
    expect(v.riadky.find((r) => r.den === "2026-09-16")!.zostatok).toBe(5);  // druhý
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
    // Názov sa klientovi ukazuje v novom slovníku (Jerry, 29. 9. 2026);
    // v dátach zostáva pôvodný „OFF - 6h BEZ viazanosti" z PTmindera.
    expect(t).toContain("6h Balíček · 6 h · do 28. 10. 2026");
    // Nezaplatené členstvo hodinu nedáva — pri tréningu stojí len mínus.
    expect(t).toContain("nezaplatené · 1. tréning");
    expect(t).not.toContain("zostávalo 6 h · nezaplatené");
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
    // Členstvo je nezaplatené, takže platené tréningy sú bez hodiny a s mínusom;
    // darovaný tréning nemá ani mínus a koniec ho nepočíta.
    const v = vypisHodin(os, "", DNES, null);
    const r = new Map(v.riadky.filter((x) => x.druh === "trening").map((x) => [x.den, x]));
    expect(r.get("2026-09-02")).toMatchObject({ zostatok: null, dlh: 1 });
    expect(r.get("2026-09-09")).toMatchObject({ zostatok: null, dlh: null });
    expect(r.get("2026-09-16")).toMatchObject({ zostatok: null, dlh: 2 });
    expect(v.koniec).toBe(-2);
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

describe("doplnenie členstva bez počtu hodín", () => {
  /**
   * Lukáš Hanus, 29. 9. 2026: na piatich tréningoch po sebe mu appka
   * ukazovala −1 až −5, hoci mal všetko zaplatené. „Doplnenie členstva"
   * nemá v názve počet hodín, `hodinZNazvuBalicka` z neho vyčíta 0 a appka
   * to brala ako „nepridalo sa nič" — deficit sa potom valil cez všetky
   * ďalšie balíčky.
   */
  const os: Udalost[] = [
    { druh: "balicekOd", den: "2026-04-29", nazov: "OFF - 6h S viazanostou", hodin: 6 },
    { druh: "platba", den: "2026-04-29", suma: 6990, metoda: "prevodom" },
    { druh: "balicekOd", den: "2026-05-02", nazov: "Doplnenie členstva", hodin: 0, doplnenie: true },
    ...["2026-05-03", "2026-05-07", "2026-05-13", "2026-05-19", "2026-05-27", "2026-06-03", "2026-06-11"]
      .map((den) => ({ druh: "trening", den }) as Udalost),
  ];

  it("neznáme doplnenie neznamená nula hodín — v STARŠOM období sa dlh nepočíta", () => {
    // Za obdobím nasleduje ďalšie členstvo, takže je to história, nie dnešok.
    const sNovym: Udalost[] = [...os, { druh: "balicekOd", den: "2026-06-29", nazov: "OFF - 6h S viazanostou", hodin: 8 }];
    const { stavy } = priebehBalickov(sNovym, null, "2026-07-01");
    const dlhy = os.filter((u) => u.druh === "trening").map((u) => stavy.get(u)?.dlh ?? null);
    expect(dlhy.every((d) => d === null)).toBe(true);
  });

  it("v AKTUÁLNOM balíčku sa tréning bez hodiny kreslí, keď aj karta hovorí mínus", () => {
    const { stavy, koniec } = priebehBalickov(os, -1, "2026-06-15");
    const siedmy = os.filter((u) => u.druh === "trening")[6];
    expect(stavy.get(siedmy)?.dlh).toBe(1);
    expect(koniec).toBe(-1);
  });

  it("keď karta mínus nehlási, os mlčí aj v aktuálnom balíčku (Hrůzová: dva balíčky naraz)", () => {
    const { stavy } = priebehBalickov(os, 1, "2026-06-15");
    const siedmy = os.filter((u) => u.druh === "trening")[6];
    expect(stavy.get(siedmy)?.dlh ?? null).toBeNull();
  });

  it("bez doplnenia sa dlh počíta ďalej — mlčať sa má len tam, kde sa nevie", () => {
    const bez = os.filter((u) => !(u.druh === "balicekOd" && u.doplnenie));
    const { stavy } = priebehBalickov(bez, null, "2026-06-15");
    const siedmy = bez.filter((u) => u.druh === "trening")[6];
    expect(stavy.get(siedmy)?.dlh).toBe(1);
  });
});

describe("stavPreSpravu", () => {
  const riadok = (den: string, zostatok: number | null, dlh: number | null) =>
    ({ den, druh: "trening", popis: "tréning", zostatok, dlh }) as Vypis["riadky"][number];

  it("dva tréningy nad rámec sú −2, nie „dochodený“", () => {
    const v = { riadky: [riadok("2026-09-29", null, 2), riadok("2026-09-22", null, 1)], koniec: 0 } as Vypis;
    expect(stavPreSpravu(v, "2026-09-29")).toEqual({ zostatok: -2, dnesnyTrening: true });
  });

  it("nezaplatená hodina v balíčku nie je hodina nad rámec", () => {
    // Tréning mal hodinu (zostatok 3), len ešte nebol zaplatený — dlh 1.
    const v = { riadky: [riadok("2026-09-20", 3, 1)], koniec: 2 } as Vypis;
    expect(stavPreSpravu(v, "2026-09-29").zostatok).toBe(2);
  });

  it("o dnešku len vtedy, keď tréning dnes naozaj bol", () => {
    const v = { riadky: [riadok("2026-09-25", 1, null)], koniec: 0 } as Vypis;
    expect(stavPreSpravu(v, "2026-09-29").dnesnyTrening).toBe(false);
  });
});

describe("doplnenie po konci platnosti vs. počas nej", () => {
  it("po konci platnosti nepridáva — sú to tie isté hodiny (Sofia Resnerová)", () => {
    const os: Udalost[] = [
      bal("2026-07-20", 6, { doDna: "2026-09-13" }),
      ...["2026-07-20", "2026-07-21", "2026-09-02", "2026-09-09", "2026-09-16"].map((den) => ({ druh: "trening", den }) as Udalost),
      bal("2026-09-20", 2, { doplnenie: true }),
    ];
    expect(priebehBalickov(os, null, "2026-09-27").koniec).toBe(1);
  });

  it("počas platnosti pridáva — sú to hodiny navyše (Markéta Lozias)", () => {
    const os: Udalost[] = [
      bal("2026-07-31", 6, { doDna: "2026-09-24" }),
      ...["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"].map((den) => ({ druh: "trening", den }) as Udalost),
      bal("2026-09-12", 3, { doplnenie: true }),
      ...["2026-09-14", "2026-09-21"].map((den) => ({ druh: "trening", den }) as Udalost),
    ];
    expect(priebehBalickov(os, null, "2026-09-27").koniec).toBe(1);
  });
});

describe("úvodný tréning pred prvým balíčkom", () => {
  it("zaplatený v ten istý deň nenesie mínus — os ide klientovi", () => {
    const os: Udalost[] = [
      { druh: "trening", den: "2026-03-20" },
      { druh: "platba", den: "2026-03-20", suma: 1100, metoda: "prevodom" },
      bal("2026-03-27", 6),
      { druh: "trening", den: "2026-03-27" },
    ];
    const { stavy } = priebehBalickov(os, null, "2026-03-30");
    const uvodny = os[0];
    expect(stavy.get(uvodny)?.dlh).toBeNull();
  });

  it("tréning pred akoukoľvek platbou mínus nesie ďalej", () => {
    const os: Udalost[] = [
      { druh: "trening", den: "2026-03-18" },
      { druh: "platba", den: "2026-03-20", suma: 1100, metoda: "prevodom" },
    ];
    const { stavy } = priebehBalickov(os, null, "2026-03-30");
    expect(stavy.get(os[0])?.dlh).toBe(1);
  });
});

describe("os bez kalendára preskočí hodinu (Lukáš Hanus, 2. 10. 2026)", () => {
  /**
   * Jerry: „poslal som Hanusovi SMS, prečo tam chýba 5 h?"
   *
   * Stránka klienta stavala os BEZ kalendára, kým zostatok sa kotví na
   * čísle, ktoré kalendár pozná. Tréning z 29. 9. je len v kalendári —
   * export ho ešte nemá a je spred KOKPIT_OD, takže sedenie z neho
   * nevznikne. V zozname chýbal, v čísle bol.
   */
  const ses = (den: string) => ({
    client: "Lukas Hanus", date: `${den}T00:00:00.000Z`, time: "16:00", sessionTrainer: "Jerry",
    sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 1165,
  });
  const zdroj = (kal: boolean) => ({
    sessions: ["2026-09-09", "2026-09-14", "2026-09-16", "2026-09-21", "2026-09-25"].map(ses),
    payments: [], packages: [{
      client: "Lukas Hanus", package: "OFF - 6h S viazanostou", remaining: 0, total: 0,
      added: "2026-09-13", validFrom: "2026-09-09", validTo: "2026-10-08", payment: 6990, naObdobie: 6,
    }],
    kalUdalosti: kal
      ? [{ klient: "Lukas Hanus", trener: "Jerry", zaciatok: "2026-09-29T11:30", koniec: "2026-09-29T12:30", nazov: "Lukas Hanus", typ: "trening" }]
      : undefined,
  });
  const retaz = (kal: boolean) => {
    const os = osCasuKlienta("Lukas Hanus", zdroj(kal) as never, "2026-10-02");
    return vypisHodin(os as never, "", "2026-10-02", null)
      .riadky.filter((r) => r.druh === "trening")
      .map((r) => r.zostatok)
      .reverse();
  };

  it("s kalendárom je na osi aj tréning, ktorý export ešte nemá", () => {
    expect(retaz(true)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it("bez kalendára jeden tréning zo zoznamu vypadne", () => {
    // Päť riadkov namiesto šiestich — a práve ten chýbajúci robí dieru
    // medzi číslom na balíčku a prvým číslom v zozname.
    expect(retaz(false)).toEqual([6, 5, 4, 3, 2]);
  });
});

describe("balíček, ktorý hneď platí staršie tréningy", () => {
  /**
   * Jerry, 2. 10. 2026 nad Lukášom Hanusom: „prečo tam chýba 5 h?"
   *
   * Nechýba. Balíček mal 6 h a prvý tréning na ňom ukázal 4, lebo dve
   * hodiny zaplatili tréningy, ktoré predošlý balíček nepokryl. Appka to
   * robí správne — len to nehovorila nahlas.
   */
  const ses = (den: string) => ({ client: "X", date: `${den}T00:00:00.000Z`, time: "16:00",
    sessionTrainer: "Jerry", sessionName: "OFFLINE - 60min", sessionType: "OFFLINE", duration: 60, price: 1000 });
  const bal = (od: string) => ({ client: "X", package: "OFF - 2h", remaining: 0, total: 0, added: od,
    validFrom: od, validTo: "2026-12-31", payment: 2330, naObdobie: 2 });

  // Balíček 2 h, tri tréningy (jeden nekrytý), potom nový balíček 2 h.
  const os = osCasuKlienta("X", {
    sessions: ["2026-08-01", "2026-08-08", "2026-08-15", "2026-09-05"].map(ses),
    payments: [], packages: [bal("2026-08-01"), bal("2026-09-01")],
  } as never, "2026-09-10");
  const riadky = vypisHodin(os as never, "", "2026-09-10", null).riadky;

  it("balíček povie, koľko hodín si odpísal za staršie tréningy", () => {
    const b = riadky.filter((r) => r.druh === "balicekOd");
    expect(b[0].prevzate).toBe(1);   // novší (riadky sú od najnovšieho)
    expect(b[1].prevzate).toBeUndefined();
  });

  it("prvý tréning na ňom preto nezačína na plnom počte", () => {
    const poNovom = riadky.filter((r) => r.druh === "trening" && r.den >= "2026-09-01");
    expect(poNovom[0].zostatok).toBe(1);
  });
});

describe("zo skončeného členstva sa tréningy neprenášajú", () => {
  it("Hanuš 4. 10.: augustové členstvo skončilo, balíček z 9. 9. začína na šestke, koniec −1", () => {
    const os: Udalost[] = [
      bal("2026-08-10", 6, { doDna: "2026-09-09" }), tre("2026-08-12"), tre("2026-08-14"), tre("2026-08-18"), tre("2026-08-21"), tre("2026-08-25"), tre("2026-09-03"), tre("2026-09-05"),
      pla("2026-09-04", 6990), bal("2026-09-09", 6, { doDna: "2026-10-08" }),
      tre("2026-09-09"), tre("2026-09-14"), tre("2026-09-16"), tre("2026-09-21"), tre("2026-09-25"), tre("2026-09-29"),
      bal("2026-10-02", 6, { doDna: "2026-11-01", nezaplatene: true }), tre("2026-10-02"),
    ];
    const { stavy, koniec } = priebehBalickov(os, null, "2026-10-04");
    const st = (den: string) => [...stavy.entries()].find(([u]) => u.druh === "trening" && u.den === den)![1];
    // August prekročil svojich 6 h o jeden tréning — ostáva u seba, a od
    // 6. 10. 2026 ako vyrovnaný (staré obdobie z PTmindera: ani mínus, ani plus)…
    expect(st("2026-09-05")).toMatchObject({ zostatok: null, dlh: null, vyrovnane: true });
    // …a balíček z 9. 9. začína na svojich šiestich.
    expect(["2026-09-09", "2026-09-14", "2026-09-16", "2026-09-21", "2026-09-25", "2026-09-29"].map((d) => st(d).zostatok)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(st("2026-10-02")).toMatchObject({ zostatok: null, dlh: 1 });
    expect(koniec).toBe(-1);
    const b = [...stavy.entries()].find(([u]) => u.druh === "balicekOd" && u.den === "2026-09-09")![1];
    expect(b.prevzate).toBeUndefined();
  });
});

describe("nezaplatené členstvo hodiny nedáva (Jerry, 3. 10. 2026: nezaplatený balík je 0)", () => {
  // Lukáš Hanus 3. 10. 2026: členstvo 6 h od 9. 9. zaplatené 4. 9., sedem
  // tréningov, druhé členstvo od 2. 10. s otvoreným poplatkom.
  const hanus = (nezaplatene: boolean): Udalost[] => [
    pla("2026-09-04", 6990), bal("2026-09-09", 6, { doDna: "2026-10-08" }),
    tre("2026-09-09"), tre("2026-09-14"), tre("2026-09-16"), tre("2026-09-21"), tre("2026-09-25"), tre("2026-09-29"),
    bal("2026-10-02", 6, { doDna: "2026-11-01", nezaplatene: nezaplatene || undefined }), tre("2026-10-02"),
  ];

  it("koniec je −1: tréning na nezaplatenom členstve je bez hodiny a s mínusom", () => {
    const { stavy, koniec } = priebehBalickov(hanus(true), null, "2026-10-03");
    const st = (den: string) => [...stavy.entries()].find(([u]) => u.druh === "trening" && u.den === den)![1];
    expect(st("2026-09-09").zostatok).toBe(6);
    expect(st("2026-09-29").zostatok).toBe(1);
    expect(st("2026-10-02")).toMatchObject({ zostatok: null, dlh: 1 });
    expect(koniec).toBe(-1);
  });

  it("po zaplatení dáva to isté členstvo hodiny: 6 → tréning 2. 10. je šiestka, koniec 5", () => {
    const { stavy, koniec } = priebehBalickov(hanus(false), null, "2026-10-03");
    const st = (den: string) => [...stavy.entries()].find(([u]) => u.druh === "trening" && u.den === den)![1];
    expect(st("2026-10-02")).toMatchObject({ zostatok: 6, dlh: null });
    expect(koniec).toBe(5);
  });

  it("rad 6, 5, 4, 3, 2, 1 sa nezaplateným členstvom nemení", () => {
    const { stavy } = priebehBalickov(hanus(true), null, "2026-10-03");
    const rad = ["2026-09-09", "2026-09-14", "2026-09-16", "2026-09-21", "2026-09-25", "2026-09-29"]
      .map((d) => [...stavy.entries()].find(([u]) => u.druh === "trening" && u.den === d)![1].zostatok);
    expect(rad).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it("karta a os hovoria to isté číslo aj so zrovnaním: zrovnanie na −1 nič neposunie", () => {
    const { koniec } = priebehBalickov(hanus(true), -1, "2026-10-03");
    expect(koniec).toBe(-1);
  });

  it("Šašinková: jediné členstvo nezaplatené, tri tréningy → −3, každý s mínusom", () => {
    const os: Udalost[] = [bal("2026-09-09", 8, { doDna: "2026-11-03", nezaplatene: true }), tre("2026-09-16"), tre("2026-09-23"), tre("2026-10-01")];
    const { stavy, koniec } = priebehBalickov(os, null, "2026-10-03");
    expect([...stavy.values()].filter((s) => s.dlh).map((s) => s.dlh)).toEqual([1, 2, 3]);
    expect(koniec).toBe(-3);
  });
});

describe("dnešný tréning sa počíta, až keď sa začal", () => {
  it("s časom v `dnes` tréning o 18:00 o 15:00 na osi nie je, o 18:01 áno", () => {
    const zdroj = {
      sessions: [], payments: [], packages: [], services: [],
      kalUdalosti: [{ klient: "Petr Test", trener: "Jerry", zaciatok: "2026-10-03T18:00", koniec: "2026-10-03T19:00", nazov: "Petr Test", typ: "trening" }],
    };
    expect(osCasuKlienta("Petr Test", zdroj as never, "2026-10-03T15:00").filter((u) => u.druh === "trening")).toHaveLength(0);
    expect(osCasuKlienta("Petr Test", zdroj as never, "2026-10-03T18:01").filter((u) => u.druh === "trening")).toHaveLength(1);
    // Deň bez času sa správa ako doteraz — celý deň sa počíta.
    expect(osCasuKlienta("Petr Test", zdroj as never, "2026-10-03").filter((u) => u.druh === "trening")).toHaveLength(1);
  });
});

describe("tréning bez hodiny sa kreslí aj v období s neznámym doplnením", () => {
  it("Šašinková 4. 10.: nezaplatené členstvo, doplnenie bez počtu, štyri tréningy → −1 −2 −3 −4", () => {
    const os: Udalost[] = [
      bal("2026-09-09", 8, { doDna: "2026-11-03", nezaplatene: true }), tre("2026-09-09"),
      { druh: "balicekOd", den: "2026-09-12", nazov: "Doplnenie členstva", hodin: 0, doplnenie: true },
      tre("2026-09-23"), tre("2026-10-01"), tre("2026-10-04"),
    ];
    // Karta hovorí −4 (balíček nezaplatený, štyri tréningy) — riadky ju vysvetlia.
    const { stavy, koniec } = priebehBalickov(os, -4, "2026-10-04");
    expect([...stavy.entries()].filter(([u]) => u.druh === "trening").map(([, s]) => s.dlh)).toEqual([1, 2, 3, 4]);
    expect(koniec).toBe(-4);
  });
});

describe("koľkou hodinou sa tréning bez hodiny stane po zaplatení", () => {
  it("Šašinková: −1 · 8 h, −2 · 7 h, −3 · 6 h, −4 · 5 h — profil aj odkaz z jedného miesta", () => {
    const os: Udalost[] = [
      bal("2026-09-09", 8, { doDna: "2026-11-03", nezaplatene: true }), tre("2026-09-09"),
      tre("2026-09-23"), tre("2026-10-01"), tre("2026-10-04"),
    ];
    const { stavy } = priebehBalickov(os, -4, "2026-10-04");
    const t = [...stavy.entries()].filter(([u]) => u.druh === "trening").map(([, s]) => [s.dlh, s.buduca]);
    expect(t).toEqual([[1, 8], [2, 7], [3, 6], [4, 5]]);
  });

  it("tréning s hodinou budúcu hodinu nemá", () => {
    const { stavy } = priebehBalickov([bal("2026-09-09", 6), tre("2026-09-10")], 5, "2026-10-04");
    expect([...stavy.values()].every((s) => s.buduca === undefined)).toBe(true);
  });
});

describe("nový balíček preberá nekryté tréningy pred sebou (overené v PTminderi 5. 10. 2026)", () => {
  // Krčmar v malom: predošlé obdobie 3 h, päť tréningov (dva bez hodiny),
  // platba 23. 7., nový balíček zapísaný až 2. 8. Karta (PTminder) hovorí 8,
  // teda ročné členstvo pokrylo aj tie dva tréningy pred svojím zápisom.
  const os: Udalost[] = [
    bal("2026-06-01", 3), tre("2026-06-10"), tre("2026-06-20"), tre("2026-07-01"),
    tre("2026-07-23"), pla("2026-07-23", 10000), tre("2026-07-28"),
    bal("2026-08-02", 12), tre("2026-08-21"), tre("2026-09-01"),
  ];

  it("zoberie toľko najnovších nekrytých, koľko hovorí karta — a s nimi aj platbu", () => {
    const { stavy, koniec } = priebehBalickov(os, 8, DNES);
    const st = (den: string) => [...stavy].find(([u]) => u.druh === "trening" && u.den === den)![1];
    expect(st("2026-07-23").zostatok).toBe(12);
    expect(st("2026-07-28").zostatok).toBe(11);
    expect(st("2026-07-23").dlh).toBeNull();
    expect(st("2026-09-01").zostatok).toBe(9);
    expect(koniec).toBe(8);
  });

  it("bez rozdielu proti karte nepreberá nič", () => {
    const { stavy } = priebehBalickov(os, 10, DNES);
    const st = [...stavy].find(([u]) => u.druh === "trening" && u.den === "2026-07-28")![1];
    expect(st.zostatok).toBeNull();
  });

  it("starý balíček, ktorý sa už nepoužíva, nepreberá (Holubová — hodiny prepadli)", () => {
    const stary: Udalost[] = [bal("2026-01-01", 2), tre("2026-01-05"), tre("2026-01-10"), tre("2026-03-01"), bal("2026-04-10", 6), tre("2026-04-17"), tre("2026-05-08")];
    const { stavy } = priebehBalickov(stary, 0, DNES);
    const st = [...stavy].find(([u]) => u.druh === "trening" && u.den === "2026-03-01")![1];
    expect(st.usek).toBe("2026-01-01");
  });
});

describe("tréning po skončenom a minutom členstve je prvá hodina ďalšieho", () => {
  // Markéta Resnerová, 6. 10. 2026: 8 h do 5. 10. minuté, doplnenie bez
  // počtu hodín počas platnosti, karta 0 — tréning 6. 10. mlčal a nový
  // balíček nevznikol.
  const os = (koniec: string, treningPo: string): Udalost[] => [
    bal("2026-08-11", 2, { doDna: koniec }), tre("2026-08-12"),
    { druh: "balicekOd", den: "2026-09-20", nazov: "Doplnenie členstva", hodin: 0, doplnenie: true },
    tre("2026-09-25"), tre(treningPo),
  ];

  it("členstvo skončilo v Kokpite → mínus a budúca hodina", () => {
    const { stavy } = priebehBalickov(os("2026-10-05", "2026-10-06"), 0, "2026-10-06");
    const st = [...stavy].find(([u]) => u.druh === "trening" && u.den === "2026-10-06")![1];
    expect(st.dlh).toBe(1);
    expect(st.buduca).toBe(2);
  });

  it("členstvo skončilo ešte za PTmindera → appka nehádže, mlčí ako doteraz", () => {
    const { stavy } = priebehBalickov(os("2026-09-28", "2026-10-02"), 0, "2026-10-06");
    const st = [...stavy].find(([u]) => u.druh === "trening" && u.den === "2026-10-02")![1];
    expect(st.dlh).toBeNull();
  });

  it("zvyšok hodín po konci platnosti nečerpá, kým nie je doplnenie — mínus", () => {
    // Jerry, 6. 10. 2026: „ide mínus, dokým to nedefinujeme, či je to
    // doplnenie alebo prepadnutie."
    const os3: Udalost[] = [bal("2026-08-11", 6, { doDna: "2026-10-05" }), tre("2026-08-12"), tre("2026-10-06"), tre("2026-10-07")];
    const { stavy } = priebehBalickov(os3, 5, "2026-10-08");
    const st = (d: string) => [...stavy].find(([u]) => u.druh === "trening" && u.den === d)![1];
    expect(st("2026-08-12").zostatok).toBe(6);
    expect(st("2026-10-06").zostatok).toBeNull();
    expect(st("2026-10-06").dlh).toBe(1);
    expect(st("2026-10-07").dlh).toBe(2);
  });

  it("doplnenie po konci platnosti kryje — a zvyšok nahrádza, nepripočítava", () => {
    const os4: Udalost[] = [
      bal("2026-08-11", 6, { doDna: "2026-10-05" }), tre("2026-08-12"),
      { druh: "balicekOd", den: "2026-10-05", nazov: "Doplnenie členstva", hodin: 2, doplnenie: true, zKokpitu: true },
      tre("2026-10-06"), tre("2026-10-07"), tre("2026-10-08"),
    ];
    const { stavy } = priebehBalickov(os4, null, "2026-10-08");
    const st = (d: string) => [...stavy].find(([u]) => u.druh === "trening" && u.den === d)![1];
    expect(st("2026-10-06").zostatok).toBe(2);
    expect(st("2026-10-07").zostatok).toBe(1);
    expect(st("2026-10-08").zostatok).toBeNull();
    expect(st("2026-10-08").dlh).toBe(1);
  });
});

describe("samostatná hodina iného druhu členstvo neuťne", () => {
  // Marcela Hrůzová: ON 6 h od 27. 8., 18. 9. „OFF - 1 hodina offline".
  const on = (den: string): Udalost => ({ druh: "balicekOd", den, nazov: "ON - 6h BEZ viazanosti", hodin: 6, doDna: "2026-10-21" });
  const off1 = (den: string): Udalost => ({ druh: "balicekOd", den, nazov: "OFF - 1 hodina offline", hodin: 1, doDna: "2026-10-15" });
  const t = (den: string, nazov: string): Udalost => ({ druh: "trening", den, nazov });
  const os: Udalost[] = [
    on("2026-08-27"), t("2026-08-27", "OFFLINE - 60min"), t("2026-09-03", "OFFLINE - 60min"),
    off1("2026-09-18"), t("2026-09-18", "OFFLINE - 60min"), t("2026-09-24", "ONLINE - 60min"), t("2026-10-01", "ONLINE - 60min"),
  ];
  const zost = (den: string) => [...priebehBalickov(os, 2, "2026-10-06").stavy].find(([u]) => u.druh === "trening" && u.den === den)![1].zostatok;

  it("offline tréning ide z kúpenej hodiny, online beží z ON ďalej", () => {
    expect(zost("2026-09-03")).toBe(5);
    expect(zost("2026-09-18")).toBe(1);
    expect(zost("2026-09-24")).toBe(4);
    expect(zost("2026-10-01")).toBe(3);
    expect(priebehBalickov(os, 2, "2026-10-06").koniec).toBe(2);
  });

  it("hodina rovnakého druhu je nové členstvo ako doteraz", () => {
    const os2: Udalost[] = [on("2026-08-27"), t("2026-08-27", ""), { ...(off1("2026-09-18") as any), nazov: "ON - 1 hodina" }, t("2026-09-24", "")];
    const st = [...priebehBalickov(os2, null, "2026-10-06").stavy].find(([u]) => u.druh === "trening" && u.den === "2026-09-24")![1];
    expect(st.usek).toBe("2026-09-18");
  });
});

describe("staré obdobie z PTmindera: tréning nad rámec nie je mínus ani plus", () => {
  // Jerry, 6. 10. 2026: „sú to staré hodiny — neber to ako mínus ani ako plus,
  // dôležité je, aby to teraz sedelo."
  const os: Udalost[] = [
    bal("2026-06-30", 2, { doDna: "2026-08-24" }), tre("2026-07-07"), tre("2026-07-22"), tre("2026-08-18"),
    bal("2026-08-24", 6, { doDna: "2026-10-18" }), tre("2026-08-24"), tre("2026-09-07"),
  ];
  const { stavy, koniec } = priebehBalickov(os, 4, "2026-10-06");
  const st = (d: string) => [...stavy].find(([u]) => u.druh === "trening" && u.den === d)![1];

  it("nekrytý tréning v starom členstve je vyrovnaný, nie −1", () => {
    expect(st("2026-08-18").dlh).toBeNull();
    expect(st("2026-08-18").vyrovnane).toBe(true);
  });
  it("súčasné členstvo sa nemení", () => {
    expect(st("2026-08-24").zostatok).toBe(6);
    expect(st("2026-09-07").zostatok).toBe(5);
    expect(koniec).toBe(4);
  });
});
