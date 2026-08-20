/**
 * Príprava reklamnej kampane z Kokpitu.
 *
 * ČO TENTO SÚBOR ROBÍ A ČO NIE
 *
 * Robí kontrolu zadania a skladá to, čo sa pošle Mete. NEROZHODUJE o tom,
 * či sa kampaň spustí — appka zakladá VŽDY pozastavenú a spustenie zostáva
 * v Meta Ads Manageri. Je to zámerná poistka: chyba v appke smie stáť
 * čas, nie rozpočet.
 *
 * PREČO SA CIEĽ „DOPYTY" STÁLE OPTIMALIZUJE NA ZOBRAZENIA STRÁNKY
 *
 * Od 18. 8. 2026 posiela Kokpit do Mety udalosť Lead pri REÁLNOM odoslaní
 * formulára (CAPI cez /api/lead-web) — konverzná akcia už teda pravdivá JE.
 * Na učenie kampane jej je však málo: Meta chce ~50 optimalizačných udalostí
 * týždenne a PSB má 3–4 dopyty MESAČNE. Kampaň sa preto učí z
 * LANDING_PAGE_VIEWS (tých je dosť) a Lead slúži na MERANIE — cena za
 * skutočný dopyt sa dá prečítať z výsledkov kampane. Appka pri cieli varuje,
 * ale nezakazuje ho — rozhodnutie je Jerryho. (Pôvodný dôvod varovania —
 * „akcia meria zobrazenie stránky" — prestal platiť 18. 8. 2026.)
 */

import { slug, znackovanyOdkaz } from "./utm";

/**
 * Reklamný účet, na ktorom kampane VZNIKAJÚ. Jediný.
 *
 * Jerry, 19. 8. 2026: „chcem, aby sa vždy reklamy robili na tomto účte."
 * Tri dôvody, ktoré uviedol, a všetky platia: všetka doterajšia reklama je
 * tam, je prepojený s Instagramom aj s Facebookom, a je to ten účet, ktorý
 * číta Kokpit.
 *
 * Ten druhý (osobný, 3356679857899572) appka nesleduje — čokoľvek by sa
 * v ňom minulo, v cene za klienta by nebolo. Preto to nie je nastavenie,
 * ale konštanta: nastavenie sa dá omylom prepísať, konštanta nie.
 */
export const UCET_REKLAM = "172897726151288";

/** Je to ten účet, na ktorom sa smie inzerovať? Prijíma aj tvar `act_…`. */
export function jeUcetReklam(id: string): boolean {
  return (id || "").trim().replace(/^act_/, "") === UCET_REKLAM;
}

export type CielKampane = "navstevnost" | "dopyty";

/** Čo Meta pod tým cieľom rozumie. */
export const OBJECTIVE: Record<CielKampane, string> = {
  navstevnost: "OUTCOME_TRAFFIC",
  dopyty: "OUTCOME_LEADS",
};

/**
 * Najnižší denný rozpočet účtu je 21,09 Kč (Meta, august 2026). Appka drží
 * 22, aby zaokrúhlenie kurzu nezhodilo zakladanie na haliere.
 */
export const MIN_DENNE_KC = 22;

/** Nad týmto sa už appka pýta dvakrát — nie je to strop Mety, je to poistka. */
export const VYSOKY_ROZPOCET_KC = 500;

/**
 * Najnižší strop výdavkov, aký Meta v korunách prijme.
 *
 * 19. 8. 2026 odmietla kampaň so stropom 100 Kč: „Campaign Spending Limit
 * Too Low: must be at least CZK2,000.00". Predvolených 100 Kč v karte teda
 * nemohlo prejsť nikdy — appka by ponúkla hodnotu, ktorú server odmietne,
 * a človek by hľadal chybu u seba.
 */
export const MIN_STROP_KC = 2000;

/**
 * Koľko udalostí týždenne chce Meta, aby sa kampaň naučila.
 *
 * Od marca 2026 je to 50 optimalizačných udalostí TÝŽDENNE. PSB má ~3 dopyty
 * MESAČNE — kampaň optimalizovaná na konverzie by dostala 0,7 signálu
 * týždenne namiesto päťdesiatich a nikdy by sa nenaučila. Preto to appka
 * nedovolí; nie je to opatrnosť, je to aritmetika.
 */
export const UDALOSTI_NA_UCENIE = 50;

/** Pod týmto počtom očakávaných dopytov sa z testu nedá nič usúdiť. */
export const CITATELNY_TEST = 3;

export type Plan = {
  nazov: string;
  ciel: CielKampane;
  stranka: string;
  denneKc: number;
  stropKc: number;
  /**
   * Ako sa zadáva rozpočet.
   *
   * `denne` — Meta minie `denneKc` každý deň a beží, kým ju nezastavíš;
   * `stropKc` je len núdzová brzda, nie plán.
   *
   * `celkom` — povieš celkovú sumu a počet dní, Meta si ju sama rozvrhne:
   * v deň, keď je aukcia lacnejšia, minie viac. Jerry, 19. 8. 2026: uvažuje
   * v „dám 2 000 Kč na test", nie v korunách na deň — a prepočet 2000/14 je
   * presne tá práca, ktorú má robiť appka. Strop pri tomto režime nedáva
   * zmysel: celková suma JE hranica.
   */
  rezimRozpoctu?: "denne" | "celkom";
  /** Celková suma pre režim `celkom`. */
  celkomKc?: number;
  /** Ako dlho má bežať. Bez toho sa nedá povedať, čo z testu vypadne. */
  dni?: number;
  /** Skutočný počet dopytov týždenne — z dát appky, nie z odhadu. */
  dopytovTyzdenne?: number;
  /** Koľko dnes stojí jeden dopyt. Z karty Čo priniesla reklama. */
  cenaZaDopytKc?: number;
};

export type Vysledok =
  | { ok: true; telo: Record<string, unknown>; odkaz: string | null; varovania: string[] }
  | { ok: false; chyby: string[]; varovania: string[] };

/**
 * Skontroluje plán a poskladá telo požiadavky.
 *
 * Sumy chodia Mete v halieroch — v korunách by 22 Kč znamenalo 0,22 Kč
 * a kampaň by sa nedala doručiť. Preto sa prepočítavajú tu, na jednom
 * mieste, a nie v obrazovke.
 */
export function pripravKampan(p: Plan): Vysledok {
  const chyby: string[] = [];
  const varovania: string[] = [];

  const nazov = (p.nazov || "").trim();
  if (nazov.length < 3) chyby.push("Kampaň potrebuje názov — podľa neho ju nájdeš v Mete aj v Kokpite.");
  if (nazov.length > 120) chyby.push("Názov je pridlhý, Meta ho odsekne.");

  if (!p.stranka) chyby.push("Vyber stránku, na ktorú má reklama viesť.");

  const celkom = p.rezimRozpoctu === "celkom";
  if (celkom) {
    // Celková suma bez konca nemá zmysel a Meta ju ani neprijme — `lifetime_budget`
    // vyžaduje `end_time`. Preto je pri tomto režime dĺžka povinná.
    if (!p.dni || p.dni < 1) {
      chyby.push("Pri celkovej sume treba povedať, koľko dní má kampaň bežať — bez konca ju Meta neprijme.");
    }
    if (!Number.isFinite(p.celkomKc) || (p.celkomKc || 0) <= 0) {
      chyby.push("Zadaj celkovú sumu, ktorú chceš za reklamu dať.");
    } else if (p.dni && p.dni >= 1) {
      // Meta neposudzuje celkovú sumu, ale to, čo z nej vyjde na deň.
      const naDen = (p.celkomKc || 0) / p.dni;
      if (naDen < MIN_DENNE_KC) {
        chyby.push(
          `${Math.round(p.celkomKc || 0)} Kč na ${p.dni} dní je ${naDen.toFixed(0)} Kč na deň — Meta chce aspoň `
          + `${MIN_DENNE_KC} Kč. Buď zvýš sumu na ${Math.ceil(MIN_DENNE_KC * p.dni)} Kč, alebo skráť na `
          + `${Math.floor((p.celkomKc || 0) / MIN_DENNE_KC)} dní.`,
        );
      }
    }
  } else {
    if (!Number.isFinite(p.denneKc) || p.denneKc < MIN_DENNE_KC) {
      chyby.push(`Denný rozpočet musí byť aspoň ${MIN_DENNE_KC} Kč — pod tým Meta kampaň nezaloží.`);
    }
    // Strop je NEPOVINNÝ — rovnako ako v Mete. Jerry, 19. 8. 2026: „strop
    // nechaj voliteľný." Prázdny znamená bez stropu; keď tam číslo je, musí
    // dávať zmysel.
    if (!p.stropKc) {
      varovania.push("Kampaň je bez stropu výdavkov. Jediné, čo ju drží, je denný rozpočet a to, že je pozastavená.");
    } else if (!Number.isFinite(p.stropKc) || p.stropKc < 0) {
      chyby.push("Strop výdavkov musí byť číslo, alebo nechaj pole prázdne.");
    } else if (p.stropKc < MIN_STROP_KC) {
      chyby.push(`Strop výdavkov musí byť aspoň ${MIN_STROP_KC} Kč — nižší Meta neprijme (skúšané 19. 8. 2026).`);
    } else if (p.stropKc < p.denneKc) {
      chyby.push("Strop výdavkov je nižší než denný rozpočet — kampaň by skončila v prvý deň.");
    }
  }

  if (p.ciel === "dopyty") {
    varovania.push(
      "Udalosť Lead od 18. 8. 2026 meria skutočné odoslania formulára (CAPI), ale na učenie kampane jej je málo — "
      + "Meta chce ~50 udalostí týždenne a PSB má 3–4 dopyty mesačne. Kampaň sa preto optimalizuje na zobrazenia "
      + "stránky a Lead slúži na meranie ceny za skutočný dopyt.",
    );
    /**
     * Strážca učiacej fázy. Zámerne CHYBA, nie varovanie: kampaň, ktorá sa
     * nemá z čoho učiť, minie rozpočet na náhodné doručovanie a výsledok
     * sa potom vykladá, akoby niečo znamenal.
     */
    if (typeof p.dopytovTyzdenne === "number" && p.dopytovTyzdenne < UDALOSTI_NA_UCENIE) {
      const majme = String(Math.round(p.dopytovTyzdenne * 10) / 10).replace(".", ",");
      chyby.push(
        `Na optimalizáciu na dopyty potrebuje Meta ${UDALOSTI_NA_UCENIE} udalostí TÝŽDENNE (od marca 2026). `
        + `PSB má ${majme} dopytov týždenne, takže sa kampaň nemá z čoho učiť a rozpočet minie na náhodné doručovanie. `
        + "Zvoľ cieľ „návštevy webu“ — ten sa učí z klikov, ktorých je dosť.",
      );
    }
  }

  // Čo z testu vôbec vypadne. Bez tohto sa dá pustiť kampaň, ktorá skončí
  // s jedným dopytom a rozhodnutie „reklama nefunguje" postavené na náhode.
  if (p.dni && p.denneKc && p.cenaZaDopytKc && p.cenaZaDopytKc > 0) {
    const cakane = (p.denneKc * p.dni) / p.cenaZaDopytKc;
    if (cakane < CITATELNY_TEST) {
      varovania.push(
        `Za ${p.dni} dní pri ${p.denneKc} Kč denne a cene ${Math.round(p.cenaZaDopytKc)} Kč za dopyt čakaj `
        + `zhruba ${cakane < 1 ? "menej než jeden dopyt" : `${Math.round(cakane * 10) / 10} dopytu`.replace(".", ",")}. `
        + "Z toho sa nedá rozhodnúť nič — buď dlhšie, alebo viac denne.",
      );
    }
  }
  if (p.denneKc > VYSOKY_ROZPOCET_KC) {
    varovania.push(`Denný rozpočet ${p.denneKc} Kč je na septembrový test vysoký — celý júl 2026 stál 31 452 Kč.`);
  }

  if (chyby.length) return { ok: false, chyby, varovania };

  return {
    ok: true,
    varovania,
    odkaz: znackovanyOdkaz(p.stranka, "meta", nazov),
    telo: {
      name: nazov,
      objective: OBJECTIVE[p.ciel],
      // Pozastavená VŽDY. Server to kontroluje ešte raz — obrazovka sa dá
      // obísť, server nie.
      status: "PAUSED",
      buying_type: "AUCTION",
      // Automatické ponúkanie. Bez toho si Meta vezme PREDVOLENÚ stratégiu
      // účtu — a tá je tu „Strop ponuky" (LOWEST_COST_WITH_BID_CAP), pri
      // ktorej odmietne sadu reklám vetou „Bid amount required" (19. 8.
      // 2026). Strop ponuky je nástroj pre kampaň, ktorá už vie, koľko jej
      // klik smie stáť; septembrový test to práve zisťuje.
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      special_ad_categories: [],
      /**
       * Buď denný rozpočet, alebo celkový — Meta ich naraz neprijme.
       *
       * Pri `lifetime_budget` chce aj koniec (`stop_time`); bez neho by
       * nevedela, na aké obdobie sumu rozvrhnúť. Strop sa pri ňom zámerne
       * neposiela: celková suma je sama o sebe hranicou a druhá by ju len
       * mohla podrezať skôr, než kampaň dobehne.
       */
      ...(celkom
        ? {
          lifetime_budget: Math.round((p.celkomKc || 0) * 100),
          stop_time: new Date(Date.now() + (p.dni || 0) * 86400000).toISOString(),
        }
        : {
          daily_budget: Math.round(p.denneKc * 100),
          ...(p.stropKc ? { spend_cap: Math.round(p.stropKc * 100) } : {}),
        }),
    },
  };
}

/** Návrh názvu, nech sa kampane v zozname dajú rozoznať. */
export function navrhNazvu(ciel: CielKampane, stranka: string, mesiac: string): string {
  const cast = (stranka.replace(/\/+$/, "").split("/").pop() || "web");
  const co = ciel === "dopyty" ? "dopyty" : "navstevy";
  return `PSB ${mesiac} — ${slug(cast)} — ${co}`;
}

// ── Beží to vôbec? ───────────────────────────────────────────────────────────

export type StavDorucovania = "bezi" | "skoncila" | "pozastavena" | "bez-sad";

/**
 * Odpoveď na otázku, ktorú si nad zoznamom kampaní kladie človek.
 *
 * Stav KAMPANE na ňu neodpovedá. 19. 8. 2026 bolo na účte 37 zo 62 kampaní
 * zapnutých a nebežala ani jedna — ich sady reklám mali dávno po konci.
 * Zapnutá kampaň s dobehnutou sadou nemíňa nič; „ACTIVE" pri nej je pravda
 * o prepínači, nie o doručovaní.
 *
 * POZOR NA „ACTIVE" PRI SADE. Meta ho nechá aj na sade, ktorej termín dávno
 * uplynul — 19. 8. 2026 malo 32 kampaní sadu v stave ACTIVE s koncom
 * 10.–14. júla. Prvá verzia tejto funkcie sa na to chytila a vyhlásila, že
 * beží 32 kampaní, pričom výdavok bol nula. Bežiaca sada je preto ACTIVE
 * A ZÁROVEŇ bez uplynutého konca.
 *
 * Až keď nebeží žiadna, rozlišuje sa PREČO — či to niekto vypol, alebo to
 * samo dobehlo. To je rozdiel medzi „rozhodli sme sa" a „stalo sa".
 */
export function stavDorucovania(
  sady: { effective_status?: string; end_time?: string }[],
  teraz: Date,
): StavDorucovania {
  if (!sady.length) return "bez-sad";
  const poKonci = (s: { end_time?: string }) => {
    const k = s.end_time ? new Date(s.end_time) : null;
    return !!k && !Number.isNaN(k.getTime()) && k < teraz;
  };
  const bezi = sady.some((s) => (s.effective_status || "").toUpperCase() === "ACTIVE" && !poKonci(s));
  if (bezi) return "bezi";
  return sady.every(poKonci) ? "skoncila" : "pozastavena";
}

/** Ako sa to volá na obrazovke. */
export const POPIS_DORUCOVANIA: Record<StavDorucovania, string> = {
  bezi: "beží",
  skoncila: "dobehla",
  pozastavena: "pozastavená",
  "bez-sad": "bez sady reklám",
};

/**
 * Návrh kampane, ktorý Jarvis napíše do odpovede.
 *
 * Tvar `⟦kampan|cieľ|adresa|rozpočet|názov⟧` — appka z neho spraví tlačidlo,
 * ktoré otvorí formulár už vyplnený. Debata o tom, čo pustiť, a formulár na
 * to boli dve obrazovky; toto je most medzi nimi.
 *
 * Vracia null pri nezmysle: radšej obyčajný text než tlačidlo, ktoré vyplní
 * kampaň zle. Adresa musí byť z vlastného webu — reklama vedúca inam je
 * chyba, ktorú by nikto nečakal.
 */
export function navrhZTokenu(vnutro: string): {
  ciel: CielKampane; stranka: string; denneKc: number; nazov: string; stropKc?: number; dni?: number;
} | null {
  const [znacka, ciel, adresa, rozpocet, nazovRaw, strop, dni] = (vnutro || "").split("|").map((x) => x.trim());
  if ((znacka || "").toLowerCase() !== "kampan") return null;
  const c: CielKampane = ciel === "dopyty" ? "dopyty" : "navstevnost";
  if (!/^https?:\/\//i.test(adresa || "")) return null;
  if (!/prosapiens\.cz/i.test(adresa)) return null;
  const denneKc = Math.round(Number((rozpocet || "").replace(",", ".")) || 0);
  const nazov = (nazovRaw || "").trim();
  if (!nazov) return null;
  // Strop a dĺžka sú nepovinné — Jerry, 19. 8. 2026: „daj Jarvisovi možnosť
  // tam dopisovať tie veci, ak by boli záverom mojej debaty s ním."
  const st = Math.round(Number((strop || "").replace(",", ".")) || 0);
  const d = Math.round(Number(dni || "") || 0);
  return { ciel: c, stranka: adresa, denneKc, nazov, ...(st > 0 ? { stropKc: st } : {}), ...(d > 0 ? { dni: d } : {}) };
}

// ── Sada reklám ──────────────────────────────────────────────────────────────
//
// Kampaň je priečinok. Sada je to, čo hovorí KOMU, KDE a DOKEDY — a bez nej
// kampaň nemá čo doručovať. Jerry, 19. 8. 2026, keď uvidel prázdnu kampaň
// v Mete: „čo to vlastne za reklamu vytukalo, aký je tam vizuál?"

/** Kde sa inzeruje. Mestá by potrebovali kľúče z Metinho číselníka; krajina stačí. */
export const OBLASTI = { cz: "Česko", sk: "Slovensko" } as const;
export type Oblast = keyof typeof OBLASTI;

/**
 * Telo sady reklám.
 *
 * Rozpočet sa sem NEDÁVA: kampaň ho už má (CBO) a Meta odmietne kampaň aj
 * sadu s vlastným rozpočtom naraz („Must Use Campaign Bid Strategy").
 *
 * `dsa_beneficiary` a `dsa_payor` sú povinné pri cielení do EÚ — bez nich
 * Graph sadu neprijme. Je to meno toho, v čí prospech reklama beží.
 */
export type Mesto = { key: string; nazov?: string; okruhKm: number };

/** Meta berie okruh mesta v rozsahu 17–80 km (10–50 míľ). */
export const OKRUH_MIN_KM = 17;
export const OKRUH_MAX_KM = 80;

export function pripravSadu(v: {
  kampanId: string;
  nazov: string;
  ciel: CielKampane;
  oblast: Oblast;
  /** Keď je zadané mesto, cieli sa naň s okruhom — nie na celú krajinu. */
  mesto?: Mesto | null;
  dni?: number;
  odkaz: string;
  prijemca: string;
}): Record<string, unknown> {
  const start = new Date();
  const koniec = v.dni && v.dni > 0 ? new Date(start.getTime() + v.dni * 86400000) : null;
  return {
    campaign_id: v.kampanId,
    name: `${v.nazov} — sada`,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    // Pri návštevnosti sa optimalizuje na kliky, pri dopytoch na zobrazenie
    // cieľovej stránky — konverzie sa optimalizovať nedajú, kým je konverzná
    // akcia rozbitá (meria zobrazenie stránky, nie odoslaný formulár).
    optimization_goal: v.ciel === "dopyty" ? "LANDING_PAGE_VIEWS" : "LINK_CLICKS",
    destination_type: "WEBSITE",
    /**
     * Mesto + okruh, keď je zadané. Pre štúdio v Brne je celá krajina
     * priširoká: rešerš z 19. 8. 2026 hovorí začať úzko a rozširovať, až
     * keď sa rozpočet nedá minúť. Klient z Ostravy na tréning nepríde.
     */
    targeting: {
      geo_locations: v.mesto?.key
        ? { cities: [{ key: v.mesto.key, radius: Math.min(OKRUH_MAX_KM, Math.max(OKRUH_MIN_KM, Math.round(v.mesto.okruhKm))), distance_unit: "kilometer" }] }
        : { countries: [v.oblast.toUpperCase()] },
    },
    start_time: start.toISOString(),
    ...(koniec ? { end_time: koniec.toISOString() } : {}),
    dsa_beneficiary: v.prijemca,
    dsa_payor: v.prijemca,
  };
}
