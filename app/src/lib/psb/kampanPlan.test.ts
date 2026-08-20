import { describe, expect, it } from "bun:test";

import { MIN_DENNE_KC, MIN_STROP_KC, UCET_REKLAM, adsManagerOdkaz, jeUcetReklam, navrhNazvu, OKRUH_MAX_KM, OKRUH_MIN_KM, navrhZTokenu, pripravKampan, pripravSadu, skontrolujPredSpustenim, stavDorucovania, type StavKampanePredSpustenim } from "./kampanPlan";

const zaklad = {
  nazov: "PSB 2026-09 — uvodni-trenink — navstevy",
  ciel: "navstevnost" as const,
  stranka: "https://www.prosapiens.cz/uvodni-trenink/",
  denneKc: 50,
  stropKc: 3000,
};

describe("pripravKampan", () => {
  it("poskladá telo a sumy pošle v halieroch", () => {
    const v = pripravKampan(zaklad);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // V korunách by 50 Kč znamenalo 0,50 Kč a kampaň by sa nedoručila.
    expect(v.telo.daily_budget).toBe(5000);
    expect(v.telo.spend_cap).toBe(300000);
    expect(v.telo.objective).toBe("OUTCOME_TRAFFIC");
    // Bez explicitnej stratégie si Meta vezme predvoľbu účtu („Strop
    // ponuky") a sada reklám potom neprejde — pýta si sumu ponuky.
    expect(v.telo.bid_strategy).toBe("LOWEST_COST_WITHOUT_CAP");
  });

  it("stav je VŽDY pozastavený", () => {
    // Toto je celá poistka: chyba v appke smie stáť čas, nie rozpočet.
    const v = pripravKampan({ ...zaklad, denneKc: 999, stropKc: 5000 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.telo.status).toBe("PAUSED");
  });

  it("k odkazu pridá značku, aby sa dala kampaň zmerať", () => {
    const v = pripravKampan(zaklad);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.odkaz).toContain("utm_source=meta");
    expect(v.odkaz).toContain("utm_campaign=psb-2026-09-uvodni-trenink-navstevy");
  });

  it("pod minimom účtu kampaň nezaloží", () => {
    const v = pripravKampan({ ...zaklad, denneKc: MIN_DENNE_KC - 1 });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.chyby.join(" ")).toContain("aspoň 22 Kč");
  });

  it("prázdny strop prejde, ale appka to povie", () => {
    const v = pripravKampan({ ...zaklad, stropKc: 0 });
    expect(v.ok).toBe(true);
    expect(v.varovania.join(" ")).toContain("bez stropu");
    if (!v.ok) return;
    expect(v.telo.spend_cap).toBeUndefined();
  });

  it("strop nižší než denný rozpočet je chyba, nie poznámka", () => {
    const v = pripravKampan({ ...zaklad, denneKc: 3000, stropKc: 2500 });
    expect(v.ok).toBe(false);
  });

  it("strop pod minimom Mety neprejde — inak by to odmietol až server", () => {
    // 19. 8. 2026: „Campaign Spending Limit Too Low: must be at least
    // CZK2,000.00". Karta dovtedy ponúkala 100 Kč ako predvolenú hodnotu.
    const v = pripravKampan({ ...zaklad, stropKc: 100 });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.chyby.join(" ")).toContain(`aspoň ${MIN_STROP_KC} Kč`);
  });

  it("bez názvu a bez stránky sa nezakladá", () => {
    const v = pripravKampan({ ...zaklad, nazov: "x", stranka: "" });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.chyby.length).toBe(2);
  });

  it("cieľ „dopyty“ prejde, ale s varovaním o málo udalostiach na učenie", () => {
    // Zakázať ho nie je na appke — upozorniť áno. Od 20. 8. 2026 varovanie
    // hovorí pravdivý dôvod: Lead udalosť JE pravdivá (CAPI), len jej je málo.
    const v = pripravKampan({ ...zaklad, ciel: "dopyty" });
    expect(v.ok).toBe(true);
    expect(v.varovania.join(" ")).toContain("Lead");
    expect(v.varovania.join(" ")).toContain("optimalizuje na zobrazenia");
    if (!v.ok) return;
    expect(v.telo.objective).toBe("OUTCOME_LEADS");
  });

  it("vysoký rozpočet je varovanie, nie zákaz", () => {
    const v = pripravKampan({ ...zaklad, denneKc: 900, stropKc: 5000 });
    expect(v.ok).toBe(true);
    expect(v.varovania.join(" ")).toContain("31 452 Kč");
  });
});

describe("navrhNazvu", () => {
  it("z adresy a cieľa poskladá názov, ktorý sa dá rozoznať", () => {
    expect(navrhNazvu("navstevnost", "https://www.prosapiens.cz/uvodni-trenink/", "2026-09"))
      .toBe("PSB 2026-09 — uvodni-trenink — navstevy");
  });
});

describe("účet, na ktorom kampane vznikajú", () => {
  it("je jeden a je to ten, ktorý Kokpit číta", () => {
    expect(UCET_REKLAM).toBe("172897726151288");
    expect(jeUcetReklam("172897726151288")).toBe(true);
    expect(jeUcetReklam("act_172897726151288")).toBe(true);
  });

  it("osobný účet neprejde — appka ho nesleduje", () => {
    // 19. 8. 2026 v ňom viseli dve zapnuté kampane z roku 2023 a Kokpit
    // o nich nevedel. Peniaze minuté tam by v cene za klienta neboli.
    expect(jeUcetReklam("3356679857899572")).toBe(false);
    expect(jeUcetReklam("act_3356679857899572")).toBe(false);
    expect(jeUcetReklam("")).toBe(false);
  });
});

describe("stavDorucovania", () => {
  const teraz = new Date("2026-08-19T10:00:00.000Z");

  it("„ACTIVE“ s uplynutým koncom nie je bežiaca sada", () => {
    // Skutočný tvar z účtu 19. 8. 2026: sada „Post 2.7.2026 / Zájmy - zdraví“
    // hlási ACTIVE a jej termín skončil 14. júla. Prvá verzia pravidla z toho
    // urobila „beží 32 kampaní“ pri nulovom výdavku.
    expect(stavDorucovania([
      { effective_status: "ACTIVE", end_time: "2026-07-14T21:14:00+0200" },
    ], teraz)).toBe("skoncila");
  });

  it("stačí jedna bežiaca sada a kampaň beží", () => {
    expect(stavDorucovania([
      { effective_status: "PAUSED" },
      { effective_status: "ACTIVE" },
    ], teraz)).toBe("bezi");
    // Aj s koncom, ktorý ešte len príde.
    expect(stavDorucovania([
      { effective_status: "ACTIVE", end_time: "2026-09-30T23:59:59+0200" },
    ], teraz)).toBe("bezi");
  });

  it("zapnutá kampaň s dobehnutými sadami je „dobehla“, nie „beží“", () => {
    // Presne toto je tých 37 kampaní z 19. 8. 2026: prepínač zapnutý,
    // doručovanie žiadne. „ACTIVE“ pri nich hovorilo o prepínači.
    expect(stavDorucovania([
      { effective_status: "PAUSED", end_time: "2026-07-31T23:59:59+0200" },
      { effective_status: "PAUSED", end_time: "2026-06-30T23:59:59+0200" },
    ], teraz)).toBe("skoncila");
  });

  it("rozlišuje vypnuté od dobehnutého — je to rozhodnutie proti udalosti", () => {
    expect(stavDorucovania([{ effective_status: "PAUSED" }], teraz)).toBe("pozastavena");
  });

  it("sada, ktorá ešte len skončí, nie je dobehnutá", () => {
    expect(stavDorucovania([
      { effective_status: "PAUSED", end_time: "2026-09-30T23:59:59+0200" },
    ], teraz)).toBe("pozastavena");
  });

  it("kampaň bez sady sa netvári, že je pozastavená", () => {
    expect(stavDorucovania([], teraz)).toBe("bez-sad");
  });
});

describe("navrhZTokenu", () => {
  it("prečíta návrh, ktorý Jarvis napíše do odpovede", () => {
    expect(navrhZTokenu("kampan|navstevnost|https://www.prosapiens.cz/uvodni-trenink/|80|PSB 2026-09 — úvodní trénink"))
      .toEqual({
        ciel: "navstevnost",
        stranka: "https://www.prosapiens.cz/uvodni-trenink/",
        denneKc: 80,
        nazov: "PSB 2026-09 — úvodní trénink",
      });
  });

  it("prečíta aj strop a dĺžku, keď ich Jarvis doplní", () => {
    expect(navrhZTokenu("kampan|navstevnost|https://www.prosapiens.cz/uvodni-trenink/|150|Test|5000|21"))
      .toEqual({
        ciel: "navstevnost",
        stranka: "https://www.prosapiens.cz/uvodni-trenink/",
        denneKc: 150,
        nazov: "Test",
        stropKc: 5000,
        dni: 21,
      });
  });

  it("cudzia adresa neprejde — reklama nesmie viesť inam", () => {
    expect(navrhZTokenu("kampan|navstevnost|https://example.com/x|80|Test")).toBeNull();
    expect(navrhZTokenu("kampan|navstevnost|uvodni-trenink|80|Test")).toBeNull();
  });

  it("bez názvu a s cudzou značkou nevznikne tlačidlo", () => {
    expect(navrhZTokenu("kampan|navstevnost|https://www.prosapiens.cz/faq/|80|")).toBeNull();
    expect(navrhZTokenu("Peniaze → Výplaty|vzas|vyplaty")).toBeNull();
  });
});

describe("pripravSadu", () => {
  const zaklad = {
    kampanId: "123", nazov: "PSB 2026-09 — uvodni-trenink — navstevy",
    ciel: "navstevnost" as const, oblast: "cz" as const,
    odkaz: "https://www.prosapiens.cz/uvodni-trenink/?utm_source=meta",
    prijemca: "ProSapiens Biomechanic",
  };

  it("sada vzniká pozastavená a bez vlastného rozpočtu", () => {
    // Kampaň má rozpočet (CBO). Sada s vlastným by ju rozbila:
    // Meta vráti „Must Use Campaign Bid Strategy".
    const t = pripravSadu(zaklad);
    expect(t.status).toBe("PAUSED");
    expect(t.daily_budget).toBeUndefined();
    expect(t.lifetime_budget).toBeUndefined();
  });

  it("cieľ určuje, na čo sa optimalizuje", () => {
    expect(pripravSadu(zaklad).optimization_goal).toBe("LINK_CLICKS");
    expect(pripravSadu({ ...zaklad, ciel: "dopyty" }).optimization_goal).toBe("LANDING_PAGE_VIEWS");
  });

  it("pri cielení do EÚ vypĺňa DSA polia — bez nich Graph sadu neprijme", () => {
    const t = pripravSadu(zaklad);
    expect(t.dsa_beneficiary).toBe("ProSapiens Biomechanic");
    expect(t.dsa_payor).toBe("ProSapiens Biomechanic");
  });

  it("bez zadanej dĺžky nemá koniec — inak by sa sama zastavila", () => {
    expect(pripravSadu(zaklad).end_time).toBeUndefined();
    expect(typeof pripravSadu({ ...zaklad, dni: 21 }).end_time).toBe("string");
  });
});

describe("cielenie na mesto", () => {
  const zaklad = {
    kampanId: "1", nazov: "test", ciel: "navstevnost" as const, oblast: "cz" as const,
    odkaz: "https://www.prosapiens.cz/uvodni-trenink/", prijemca: "ProSapiens Biomechanic",
  };

  it("bez mesta cieli na krajinu", () => {
    expect((pripravSadu(zaklad).targeting as { geo_locations: { countries?: string[] } }).geo_locations.countries).toEqual(["CZ"]);
  });

  it("s mestom cieli na mesto s okruhom v kilometroch", () => {
    const g = (pripravSadu({ ...zaklad, mesto: { key: "1234", okruhKm: 25 } }).targeting as {
      geo_locations: { cities?: { key: string; radius: number; distance_unit: string }[]; countries?: string[] };
    }).geo_locations;
    expect(g.countries).toBeUndefined();
    expect(g.cities).toEqual([{ key: "1234", radius: 25, distance_unit: "kilometer" }]);
  });

  it("okruh sa drží v rozsahu, ktorý Meta prijme", () => {
    const r = (k: number) => ((pripravSadu({ ...zaklad, mesto: { key: "1", okruhKm: k } }).targeting as {
      geo_locations: { cities: { radius: number }[] };
    }).geo_locations.cities[0].radius);
    // Pod 17 km (10 míľ) Meta mesto necieli a nad 80 km je to už kraj.
    expect(r(5)).toBe(OKRUH_MIN_KM);
    expect(r(500)).toBe(OKRUH_MAX_KM);
    expect(r(25)).toBe(25);
  });
});

describe("strážca učiacej fázy a rozpočtu", () => {
  const zaklad = {
    nazov: "PSB test", ciel: "dopyty" as const,
    stranka: "https://www.prosapiens.cz/uvodni-trenink/",
    denneKc: 150, stropKc: 6000,
  };

  it("cieľ dopyty pri troch dopytoch mesačne NEPREJDE", () => {
    // 0,7 signálu týždenne namiesto päťdesiatich. Kampaň sa nemá z čoho učiť.
    const v = pripravKampan({ ...zaklad, dopytovTyzdenne: 0.7 });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.chyby.join(" ")).toContain("50 udalostí TÝŽDENNE");
    expect(v.chyby.join(" ")).toContain("0,7 dopytov");
  });

  it("pri dostatku udalostí prejde", () => {
    expect(pripravKampan({ ...zaklad, dopytovTyzdenne: 60 }).ok).toBe(true);
  });

  it("bez údaja o dopytoch sa nehádže chyba — appka nehádže", () => {
    expect(pripravKampan(zaklad).ok).toBe(true);
  });

  it("krátky a lacný test dostane varovanie s očakávaným počtom dopytov", () => {
    const v = pripravKampan({
      ...zaklad, ciel: "navstevnost", denneKc: 80, dni: 14, cenaZaDopytKc: 2200,
    });
    expect(v.ok).toBe(true);
    expect(v.varovania.join(" ")).toContain("menej než jeden dopyt");
  });

  it("dostatočne dlhý test varovanie nedostane", () => {
    const v = pripravKampan({
      ...zaklad, ciel: "navstevnost", denneKc: 200, dni: 42, cenaZaDopytKc: 2200,
    });
    expect(v.varovania.join(" ")).not.toContain("nedá rozhodnúť");
  });
});

/**
 * Celková suma namiesto dennej — Jerry, 19. 8. 2026: „čo keby chcem pri
 * kampani nastaviť celkovú sumu, ktorú chcem dať za reklamu?"
 *
 * Uvažuje v „dám 2 000 Kč na test", nie v korunách na deň. Meta to vie
 * (`lifetime_budget`), len k tomu potrebuje koniec — a hlavne posudzuje
 * NIE celkovú sumu, ale to, čo z nej vyjde na deň.
 */
describe("rozpočet zadaný celkovou sumou", () => {
  const zaklad = { nazov: "PSB test", ciel: "navstevnost" as const, stranka: "https://www.prosapiens.cz/uvodni-trenink/", denneKc: 0, stropKc: 0 };

  it("pošle lifetime_budget a koniec, nie denný rozpočet", () => {
    const v = pripravKampan({ ...zaklad, rezimRozpoctu: "celkom", celkomKc: 2000, dni: 14 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.telo.lifetime_budget).toBe(200000);
    expect(v.telo.daily_budget).toBeUndefined();
    expect(v.telo.spend_cap).toBeUndefined();
    expect(typeof v.telo.stop_time).toBe("string");
  });

  it("bez počtu dní to Meta neprijme, tak sa to povie dopredu", () => {
    const v = pripravKampan({ ...zaklad, rezimRozpoctu: "celkom", celkomKc: 2000 });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.chyby.join(" ")).toContain("koľko dní");
  });

  it("posudzuje sa denný podiel, nie celková suma — a povie sa oboje východisko", () => {
    // 200 Kč na 30 dní je 6,67 Kč/deň, teda pod minimom.
    const v = pripravKampan({ ...zaklad, rezimRozpoctu: "celkom", celkomKc: 200, dni: 30 });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    const t = v.chyby.join(" ");
    expect(t).toContain("na deň");
    expect(t).toContain("zvýš sumu");
    expect(t).toContain("skráť");
  });

  it("strop sa pri celkovej sume nevypytuje ani nevyčíta", () => {
    const v = pripravKampan({ ...zaklad, rezimRozpoctu: "celkom", celkomKc: 2000, dni: 14 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.varovania.join(" ")).not.toContain("bez stropu");
  });
});

describe("adsManagerOdkaz", () => {
  it("vedie na účet PSB s predvybranou kampaňou", () => {
    const u = adsManagerOdkaz("52598507328475");
    expect(u).toContain("act=172897726151288");
    expect(u).toContain("selected_campaign_ids=52598507328475");
  });
});

describe("skontrolujPredSpustenim", () => {
  const zdrava: StavKampanePredSpustenim = {
    kampan: { id: "1", accountId: "act_172897726151288", dailyBudget: 4400 },
    sady: [{ id: "s1" }],
    reklamy: [{ id: "r1", efektivnyStav: "PAUSED", maKreativu: true }],
  };
  it("zdravú kampaň pustí", () => {
    expect(skontrolujPredSpustenim(zdrava)).toEqual([]);
  });
  it("cudzí účet zastaví", () => {
    const ch = skontrolujPredSpustenim({ ...zdrava, kampan: { ...zdrava.kampan, accountId: "act_999" } });
    expect(ch.some((c) => c.includes("inému účtu"))).toBe(true);
  });
  it("bez reklamy zastaví", () => {
    expect(skontrolujPredSpustenim({ ...zdrava, reklamy: [] }).some((c) => c.includes("žiadnu reklamu"))).toBe(true);
  });
  it("bez kreatívy zastaví", () => {
    const ch = skontrolujPredSpustenim({ ...zdrava, reklamy: [{ id: "r1", maKreativu: false }] });
    expect(ch.some((c) => c.includes("kreatívu"))).toBe(true);
  });
  it("zamietnutú reklamu zastaví", () => {
    const ch = skontrolujPredSpustenim({ ...zdrava, reklamy: [{ id: "r1", efektivnyStav: "DISAPPROVED", maKreativu: true }] });
    expect(ch.some((c) => c.includes("zamietla"))).toBe(true);
  });
  it("bez rozpočtu zastaví, sadový rozpočet stačí", () => {
    expect(skontrolujPredSpustenim({ ...zdrava, kampan: { id: "1", accountId: "act_172897726151288" } }).some((c) => c.includes("rozpočet"))).toBe(true);
    expect(skontrolujPredSpustenim({ ...zdrava, kampan: { id: "1", accountId: "act_172897726151288" }, sady: [{ id: "s1", dailyBudget: 4400 }] })).toEqual([]);
  });
  it("denný rozpočet pod minimom zastaví (haliere!)", () => {
    const ch = skontrolujPredSpustenim({ ...zdrava, kampan: { ...zdrava.kampan, dailyBudget: 1000 } });
    expect(ch.some((c) => c.includes("pod minimom"))).toBe(true);
  });
  it("celkový rozpočet bez konca zastaví", () => {
    const ch = skontrolujPredSpustenim({ ...zdrava, kampan: { id: "1", accountId: "act_172897726151288", lifetimeBudget: 600000, stopTime: null } });
    expect(ch.some((c) => c.includes("dátum konca"))).toBe(true);
  });
});
