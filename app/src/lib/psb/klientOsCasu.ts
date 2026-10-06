/**
 * Jedna os času klienta: čo zaplatil, kedy chodil a čo mu vtedy bežalo.
 *
 * Jerry, 23. 9. 2026: „klient chodí a zistíme, že mu nevychádzajú tréningy —
 * kde nájdem záznamy o tom, kedy platil, kedy bol na tréningu a aké má
 * členstvo a odkedy platí?"
 *
 * Doteraz nikde na jednom mieste. Profil mal platby ako zoznam, tréningy len
 * ako stĺpce po mesiacoch (konkrétne dni nikde) a z balíčka len zostatok
 * „1/6" — bez názvu a bez platnosti. Tri otázky, tri rôzne obrazovky a
 * jedna z odpovedí sa nedala nájsť vôbec.
 *
 * Táto os ich dáva pod seba v čase. Nič nepočíta a nič netvrdí: iba ukáže,
 * čo sa kedy stalo, aby sa dalo spočítať očami. Presne to človek pri „nesedí
 * mu to" potrebuje — nie ďalšie odvodené číslo.
 *
 * TRÉNING Z KALENDÁRA SA PRIZNÁ
 *
 * Export z PTmindera chodí raz za čas, takže posledné dni v ňom chýbajú.
 * Riadok z kalendára preto nesie značku `zKalendara` — inak by človek pri
 * počítaní hodín vynechal to, čo sa už odtrénovalo, a vyšlo by mu, že
 * zostatok nesedí (tá istá pasca ako pri „Posledné" v profile, 21. 9. 2026).
 */

import { normName } from "./format";
import { dnesPraha, terazPraha } from "./cas";

export type Udalost =
  | { druh: "platba"; den: string; suma: number; metoda: string; poznamka?: string; zKokpitu?: boolean }
  | { druh: "trening"; den: string; cas?: string; trener?: string; nazov?: string; zKalendara?: boolean; minut?: number; zdarma?: string }
  | { druh: "balicekOd"; den: string; nazov: string; hodin: number; doDna?: string; zaplatene?: number; odvodene?: boolean; nezaplatene?: boolean; doplnenie?: boolean; zKokpitu?: boolean }
  | { druh: "balicekDo"; den: string; nazov: string; hodin: number; odvodene?: boolean; prepadlo?: number };

/**
 * DVA ROVNAKÉ BALÍČKY V JEDEN DEŇ — KOĽKO ICH NAOZAJ JE, POVIE KNIHA PREDAJOV.
 *
 * `packages` je snímka a Anne Novej v nej stoja DVA riadky „OFF - 8 hodín
 * offline" s tou istou platnosťou aj cenou (4/8 a 8/8). V exporte služieb —
 * v knihe predajov — je v ten deň PREDAJ JEDEN a platba tiež jedna. Je to
 * duplicita v PTminderi, nie druhé členstvo; brať oba riadky by znamenalo
 * dvojnásobok hodín na osi a na karte klienta ten riadok, ktorý sa netýka
 * ničoho (8 z 8, hoci štyri hodiny sú odtrénované).
 *
 * Peter Gažo je ten druhý prípad a vyzerá inak: jeho dve členstvá majú RÔZNE
 * dni (18. 5. a 24. 7.), takže sa ich to netýka. Naprieč celou databázou je
 * dvojica v jeden deň jediná — Anna.
 *
 * Keď kniha o tom dni nevie (staršie obdobia), berie sa JEDEN riadok:
 * duplicita je horšia než chýbajúce druhé členstvo.
 */
export function bezDuplicitBalickov<T extends { client: string; package: string; validFrom?: string }>(
  packages: T[],
  services: { client: string; date: string; description: string }[] | undefined,
): T[] {
  const kniha = new Map<string, number>();
  for (const s of services || []) {
    const kluc = `${normName(s.client)}|${(s.date || "").slice(0, 10)}|${normName(s.description)}`;
    kniha.set(kluc, (kniha.get(kluc) || 0) + 1);
  }
  const uz = new Map<string, number>();
  return packages.filter((b) => {
    if (!b.validFrom) return true;
    const kluc = `${normName(b.client)}|${b.validFrom.slice(0, 10)}|${normName(b.package)}`;
    const koľko = (uz.get(kluc) || 0) + 1;
    if (koľko > Math.max(1, kniha.get(kluc) || 0)) return false;
    uz.set(kluc, koľko);
    return true;
  });
}

/**
 * Koľko hodín má balíček v názve.
 *
 * Offline členstvá PTminder vyváža ako 0/0 a počet hodín stojí len v názve
 * („OFF - 18 hodín offline"). Bez toho by os času tvrdila „bez limitu"
 * a zostatok by po prvom tréningu padol do mínusu — Natália Pečková −1 h.
 * Tú istú hodnotu číta `deriveClients` v compute.ts; definícia je JEDNA.
 */
export function hodinZNazvuBalicka(nazov: string): number {
  const z = Number(/(\d+)\s*(?:h\b|hodin|hodiny|hodín)/i.exec(nazov || "")?.[1] || 0);
  if (z) return z;
  for (const [vzor, hodin] of Object.entries(HODIN_PODLA_NAZVU)) {
    if (new RegExp(vzor, "i").test(nazov || "")) return hodin;
  }
  return 0;
}

/**
 * Balíčky, ktoré počet hodín v názve nemajú.
 *
 * Jerry ich doložil exportom Packages & Memberships (27. 9. 2026), kde stojí
 * „50 left from 78" a „2 left from 3". Staré stupne (SILVER, BRONZ, GOLD,
 * ČLENSTVÍ ONE, EXKLUZIVNÍ PLÁN) tu zámerne NIE SÚ — z roku 2025 a počet
 * hodín k nim nikto nepovedal. Radšej prázdny odpočet než vymyslené číslo.
 */
const HODIN_PODLA_NAZVU: Record<string, number> = {
  "^ONE YEAR": 78,
  "^SPECIAL 3": 3,
};

/**
 * Doplnenie členstva — hodiny sa dokupujú k bežiacemu balíčku.
 *
 * V exporte je 144 takých riadkov a ani jeden nehovorí, o koľko hodín ide.
 * Na os sa preto kladú ako značka („v ten deň sa dokupovalo"), nie ako číslo;
 * rozdiel oproti PTminderu sa k nim priradí, ak nejaký je.
 */
export function jeDoplnenie(nazov: string): boolean {
  return /doplnenie/i.test(nazov || "");
}

/** Čo z exportu služieb je predaj tréningov a čo tovar (míček, poukaz). */
const SLUZBA_JE_BALICEK = (typ: string) => typ === "Membership" || typ === "Package";

type Sedenie = { client: string; date: string; time?: string; sessionTrainer?: string; sessionName?: string; duration?: number };
type Platba = { client: string; date: string; amount: number; method: string; note?: string };
type Balicek = { client: string; package: string; total: number; remaining: number; validFrom?: string; validTo?: string; payment?: number; kind?: string; added?: string; naObdobie?: number };
type Sluzba = { client: string; date: string; serviceType: string; description: string; price: number };
type Poplatok = { klient: string; datum: string; popis: string; suma: number };
type KalUdalost = { zaciatok: string; klient: string | null; typ: string | null; trener?: string | null };
type Zdarma = { klient: string; den: string; dovod: string };
/** Riadok z vlastnej evidencie balíčkov (tabuľka `balicky`). */
type BalicekKokpitu = {
  klient: string; nazov: string; hodiny?: number | null;
  platnost_od: string; platnost_do?: string | null; cena_czk?: number | null;
  zrusene_at?: string | null; zdroj?: string;
};

const den = (s: string) => (s || "").slice(0, 10);

/**
 * PLATBY Z OBOCH SVETOV, TÁ ISTÁ RAZ (5. 10. 2026).
 *
 * Do toho dňa os poznala len platby z PTmindera. Platba, ktorú Kokpit videl
 * v banke a do PTmindera ju nikto nezapísal, na osi chýbala — klient ju
 * nevidel ani v maili „celá história". Od 1. 10. je Kokpit pravda, takže
 * platba z Kokpitu ide na os vždy a z PTmindera ostane len to, čo v Kokpite
 * nie je. Párovanie jedného klienta, v tomto poradí (overené nad ostrými
 * dátami — každý krok má v nich svoj prípad):
 *
 *  1. rovnaká suma (± 1 Kč) do 10 dní, jedna ku jednej;
 *  2. jedna platba v banke = SÚČET dvoch-troch riadkov PTmindera do 3 dní
 *     (Albert Matl: banka 8 890, PTminder 1 100 + 7 790);
 *  3. preklep v sume v PTminderi: do 3 dní a najviac o 5 % alebo 100 Kč
 *     (Kalva 6 690 / banka 6 990 a 990 / 900, Richard Matl 7 790 / 7 890)
 *     — platí suma z banky.
 *
 * Pri zhode sa berie SKORŠÍ deň. Banka pripisuje o deň-dva neskôr, než
 * Jerry platbu zapíše, a tréning v deň platby by inak dostal falošné −1.
 */
export function zlucPlatby(
  pt: { date: string; amount: number; method: string; note?: string }[],
  kokpit: { datum: string; suma: number; sposob: string }[],
): Extract<Udalost, { druh: "platba" }>[] {
  const dni = (a: string, b: string) => Math.abs(Date.parse(`${den(a)}T00:00:00Z`) - Date.parse(`${den(b)}T00:00:00Z`)) / 86400000;
  const k = kokpit.map((p) => ({ p, den: den(p.datum), pouzita: false }));
  const t = pt.map((p) => ({ p, pouzita: false }));
  const spoj = (x: (typeof k)[number], ptDni: string[]) => {
    x.pouzita = true;
    for (const d of ptDni) if (d < x.den) x.den = d;
  };
  // 1. presná suma do 10 dní — najbližší deň má prednosť
  for (const y of t) {
    const n = k.filter((x) => !x.pouzita && Math.abs(Math.round(x.p.suma) - Math.round(y.p.amount)) <= 1 && dni(x.p.datum, y.p.date) <= 10)
      .sort((a, b) => dni(a.p.datum, y.p.date) - dni(b.p.datum, y.p.date))[0];
    if (n) { spoj(n, [den(y.p.date)]); y.pouzita = true; }
  }
  // 2. jedna platba v banke = súčet 2–3 riadkov PTmindera do 3 dní
  for (const x of k) {
    if (x.pouzita) continue;
    const blizke = t.filter((y) => !y.pouzita && dni(x.p.datum, y.p.date) <= 3);
    const ciel = Math.round(x.p.suma);
    let najdene: typeof blizke | null = null;
    for (let i = 0; i < blizke.length && !najdene; i++) {
      for (let j = i + 1; j < blizke.length && !najdene; j++) {
        const dva = Math.round(blizke[i].p.amount) + Math.round(blizke[j].p.amount);
        if (Math.abs(dva - ciel) <= 1) { najdene = [blizke[i], blizke[j]]; break; }
        for (let l = j + 1; l < blizke.length; l++) {
          if (Math.abs(dva + Math.round(blizke[l].p.amount) - ciel) <= 1) { najdene = [blizke[i], blizke[j], blizke[l]]; break; }
        }
      }
    }
    if (najdene) { spoj(x, najdene.map((y) => den(y.p.date))); for (const y of najdene) y.pouzita = true; }
  }
  // 3. preklep v sume: do 3 dní a najviac o 5 %
  for (const y of t) {
    if (y.pouzita) continue;
    const n = k.filter((x) => !x.pouzita && dni(x.p.datum, y.p.date) <= 3
      && Math.abs(x.p.suma - y.p.amount) <= Math.max(100, 0.05 * Math.max(x.p.suma, y.p.amount)))
      .sort((a, b) => dni(a.p.datum, y.p.date) - dni(b.p.datum, y.p.date))[0];
    if (n) { spoj(n, [den(y.p.date)]); y.pouzita = true; }
  }
  return [
    ...k.map((x) => ({ druh: "platba" as const, den: x.den, suma: x.p.suma, metoda: x.p.sposob === "hotovost" ? "cash" : "bank", zKokpitu: true })),
    ...t.filter((y) => !y.pouzita).map((y) => ({ druh: "platba" as const, den: den(y.p.date), suma: y.p.amount, metoda: y.p.method, poznamka: y.p.note })),
  ];
}

/**
 * Koľko hodín prepadlo — z odpovede na otázku o konci platnosti. Veta má
 * tvar „doplnenie 1 h, 1 h prepadlo — platnosť do 2026-10-05" (KrokPlatnost),
 * staršie odpovede z registra „prepadlo".
 */
export function prepadnuteHodiny(meno: string, acks?: Record<string, { note?: string }>): { den: string; hodin: number }[] {
  if (!acks) return [];
  const k = normName(meno);
  const out: { den: string; hodin: number }[] = [];
  for (const [kluc, a] of Object.entries(acks)) {
    const m = /^platnost\|(.+)\|(\d{4}-\d{2}-\d{2})$/.exec(kluc);
    if (!m || normName(m[1]) !== k) continue;
    const h = /(\d+(?:[.,]\d+)?)\s*h prepadl/.exec(a?.note || "");
    const hodin = h ? Number(h[1].replace(",", ".")) : 0;
    if (hodin > 0) out.push({ den: m[2], hodin });
  }
  return out;
}

export function osCasuKlienta(
  meno: string,
  zdroj: {
    sessions: Sedenie[]; payments: Platba[]; packages: Balicek[]; kalUdalosti?: KalUdalost[];
    /**
     * História z PTmindera (`ptminder_historia`): skutočné hodiny a koniec
     * platnosti minulých členstiev a doplnení. Bez nej sa hodiny čítajú
     * z názvu — a „6h" v názve nemusí byť šesť hodín (Hanus, júl 2026: 8).
     */
    historia?: Balicek[];
    services?: Sluzba[]; poplatky?: Poplatok[]; nezaplateneKokpit?: { klient: string; den: string }[]; treningyZdarma?: Zdarma[]; balicky?: BalicekKokpitu[];
    /**
     * Jedno pravidlo „zaplatený" (`data.bezHodin`). Keď je, rozhoduje
     * o príznaku nezaplateného balíčka on — `poplatky` a `nezaplateneKokpit`
     * sa na to nepoužijú.
     */
    bezHodin?: { klient: string; den: string }[];
    /** Platby zapísané v Kokpite (`data.platbyKokpit`) — zlúčia sa s `payments`. */
    platbyKokpit?: { klient: string; datum: string; suma: number; sposob: string }[];
    /**
     * Koľko hodín pridalo „Doplnenie členstva" — kľúč `klient|deň`.
     *
     * Export to nenesie (223× ten istý riadok s cenou 0) a vyrátať sa to
     * nedá: hodiny z členstva s viazanosťou na konci platnosti prepadajú,
     * ak sa Jerry nerozhodne inak, a doplnenie je záznam práve toho
     * rozhodnutia. Preto sa na to Kokpit pýta — viď migráciu 0085.
     */
    doplneniaHodiny?: Record<string, number>;
    /**
     * Odpovede na „platnosť skončila a hodiny zostali" (`anomaly_ack`,
     * kľúč `platnost|meno|deň`). Keď časť prepadla, os to ukáže značkou
     * v deň konca platnosti — bez tréningu (Jerry, 6. 10. 2026: „2 h a 1 h
     * by sa označili ako prepadlo, bolo by tam iba označenie").
     */
    acks?: Record<string, { note?: string }>;
  },
  dnes: string = dnesPraha(),
): Udalost[] {
  const k = normName(meno);
  const moje = <T extends { client: string }>(xs: T[]) => xs.filter((x) => normName(x.client) === k);

  const out: Udalost[] = [];

  for (const s of moje(zdroj.sessions)) {
    out.push({ druh: "trening", den: den(s.date), cas: s.time, trener: s.sessionTrainer, nazov: s.sessionName, minut: s.duration });
  }

  // Tréningy, ktoré sú v kalendári a v exporte ešte nie. Porovnáva sa po
  // DŇOCH: v jeden deň klient druhýkrát netrénuje a dvojica by len mýlila.
  /**
   * DNEŠNÝ TRÉNING SA POČÍTA AŽ KEĎ SA ZAČAL.
   *
   * Porovnanie len po dňoch (`d > dnes`) bralo tréning o 18:00 ako konaný
   * už ráno — a stránka klienta ho o 15:00 odpočítala a zároveň ponúkla ako
   * „Ďalší tréning". `dnes` preto smie niesť aj čas (`2026-10-03T15:02`,
   * pražský, ako `terazPraha()`); porovnáva sa na jeho dĺžku. Deň bez času
   * sa správa ako doteraz (celý deň sa počíta).
   */
  const dniZExportu = new Set(out.map((x) => x.den));
  for (const u of zdroj.kalUdalosti || []) {
    if (!u.klient || normName(u.klient) !== k) continue;
    if (u.typ !== "trening" && u.typ !== "uvodny") continue;
    const d = den(u.zaciatok);
    if (String(u.zaciatok).slice(0, dnes.length) > dnes || dniZExportu.has(d)) continue;
    dniZExportu.add(d);
    /**
     * TRÉNER SA NESIE AJ Z KALENDÁRA.
     *
     * Jerry, 2. 10. 2026: „prečo 29. 9. Jerry nie je, ale 2. 10. je?" Lebo
     * 2. 10. je už za KOKPIT_OD, takže z neho vznikne sedenie s trénerom,
     * kým 29. 9. prišiel touto cestou — a tá trénera zahadzovala, hoci
     * kalendár patrí konkrétnemu trénerovi a appka ho pozná. Dva riadky
     * o tom istom teda vyzerali ako dva rôzne druhy záznamu.
     */
    out.push({ druh: "trening", den: d, cas: u.zaciatok.slice(11, 16), trener: u.trener || undefined, zKalendara: true });
  }

  for (const x of zlucPlatby(
    moje(zdroj.payments),
    (zdroj.platbyKokpit || []).filter((p) => normName(p.klient) === k),
  )) out.push(x);

  const nezaplateneDni = new Set(zdroj.bezHodin
    ? zdroj.bezHodin.filter((d) => normName(d.klient) === k).map((d) => den(d.den))
    : [
      ...(zdroj.poplatky || []).filter((p) => normName(p.klient) === k).map((p) => den(p.datum)),
      // Balíček z Kokpitu bez platby — viď `nezaplateneZKokpitu`.
      ...(zdroj.nezaplateneKokpit || []).filter((b) => normName(b.klient) === k).map((b) => den(b.den)),
    ]);
  /** Kľúče `deň|názov` a `deň|hhodiny` balíčkov z Kokpitu — PTminder im ustúpi. */
  const zKokpitu = new Set<string>();
  /**
   * BALÍČKY NAHODENÉ V KOKPITE PATRIA NA OS.
   *
   * Do 28. 9. 2026 na nej nestáli — os čítala len PTminder. Jerry vtedy pri
   * Richardovi Matlovi: „keď mu nahodím nový balík, chcem, aby sa od tej −1
   * znovu odpočítaval počet tréningov, ktoré mu nahodím." Bez tohto zdroja
   * sa nemalo čo odpočítavať: klient mal vyčerpané členstvo, Jerry mu zapísal
   * nové a na osi sa nezmenilo nič.
   *
   * Berú sa LEN ručne nahodené (`zdroj = "rucne"`). Zvyšných 82 riadkov
   * nalial do `balicky` import z exportu a 22 z nich sú OTVÁRACIE POLOŽKY
   * ku dňu exportu („Doplnenie členstva", 20. 9. 2026) — nie predaje. Keby
   * sa dostali na os, otvorili by v ten deň nové obdobie a každému klientovi
   * by prepísali odpočet zostatkom, ktorý sa tvári ako nový balíček.
   *
   * OD 1. 10. 2026 JE KOKPIT NADRADENÝ A PTMINDER KONTROLA (Jerry, 3. 10.
   * 2026): „ak som nahodil členstvo cez Kokpit v rovnaký deň ako v PTminderi,
   * tak platí ten Kokpit." Preto sa tieto balíčky kladú na os PRVÉ a to, čo
   * k nim v ten deň sedí z exportu, ustúpi. Dovtedy to bolo naopak a Martin
   * Vaško videl na odkaze riadok z PTmindera, hoci ten istý predaj má
   * zapísaný v Kokpite.
   */
  /**
   * TVAR RIADKU BALÍČKA. Profil posiela riadky z API (`platnost_od`), App,
   * Workspace a automatické balíčky ich mali prepísané do camelCase
   * (`platnostOd`) — os ich potom ticho preskočila (deň = "") a Kokpitove
   * balíčky na tých osiach chýbali (nález 5. 10. 2026). Berú sa oba tvary.
   */
  const riadky = (zdroj.balicky || []).map((x) => {
    const r = x as BalicekKokpitu & { platnostOd?: string; platnostDo?: string | null; cenaCzk?: number | null; zruseneAt?: string | null };
    return {
      ...r,
      platnost_od: r.platnost_od ?? r.platnostOd ?? "",
      platnost_do: r.platnost_do ?? r.platnostDo ?? null,
      cena_czk: r.cena_czk ?? r.cenaCzk ?? null,
      zrusene_at: r.zrusene_at ?? r.zruseneAt ?? null,
    };
  });
  for (const b of riadky) {
    if (b.zdroj !== "rucne") continue;
    if (normName(b.klient) !== k || b.zrusene_at) continue;
    const d = den(b.platnost_od);
    if (!d || d > dnes) continue;
    /**
     * ZDVOJENIE SA POZNÁ PO DNI A HODINÁCH, NIE PO NÁZVE.
     *
     * Kým Kokpit aj PTminder hovorili „OFF - 6h BEZ viazanosti", stačil
     * názov. Od 29. 9. 2026 sa produkty volajú „Balíček 6 h" a „Předplatné
     * 6 h", takže ten istý predaj má v každom systéme iné meno — a počas
     * súbežného chodu ho Jerry zapisuje do oboch. Bez tohto by taký balíček
     * stál na osi dvakrát a hodiny by sa zdvojili.
     */
    const hodinRucne = Number(b.hodiny) > 0 ? Number(b.hodiny) : hodinZNazvuBalicka(b.nazov);
    const kluc = `${d}|${normName(b.nazov)}`;
    if (zKokpitu.has(kluc) || zKokpitu.has(`${d}|h${hodinRucne}`)) continue;
    zKokpitu.add(kluc);
    zKokpitu.add(`${d}|h${hodinRucne}`);
    out.push({
      druh: "balicekOd",
      den: d,
      nazov: b.nazov,
      // Hodiny sú zapísané ručne; keď chýbajú, ostáva názov ako pri exporte.
      hodin: hodinRucne,
      doDna: den(b.platnost_do || "") || undefined,
      zaplatene: b.cena_czk || undefined,
      nezaplatene: nezaplateneDni.has(d) || undefined,
      zKokpitu: true,
    });
  }


  for (const p of prepadnuteHodiny(meno, zdroj.acks)) {
    if (p.den <= dnes) out.push({ druh: "balicekDo", den: p.den, nazov: "prepadnuté hodiny", hodin: p.hodin, prepadlo: p.hodin });
  }

  for (const b of bezDuplicitBalickov(moje(zdroj.packages), zdroj.services)) {
    /**
     * DOKÚPENÉ HODINY MAJÚ DEŇ AJ POČET — len inde.
     *
     * „Doplnenie členstva" nemá platnosť od–do, takže sa na os dlho nedostalo
     * vôbec. Deň má ale v stĺpci `Added` a počet hodín v `# of sessions`
     * („2 left from 3"). Bez nich vyšlo Markéte Lozias, že 18. 9. trénovala
     * nad rámec balíčka — pritom 12. 9. si dokúpila tri hodiny (Jerry,
     * 27. 9. 2026: „ako je možné, že má −2, keď zaplatila 9. 9.?").
     * Z 65 takých riadkov má deň 27; zvyšok na os položiť nejde.
     */
    if (!b.validFrom && b.added && b.total > 0 && jeDoplnenie(b.package)) {
      const d = den(b.added);
      if (d && d <= dnes) out.push({ druh: "balicekOd", den: d, nazov: b.package, hodin: b.total, doplnenie: true });
      continue;
    }
    const od = den(b.validFrom || "");
    const doDna = den(b.validTo || "");
    // Ten istý predaj zapísaný v Kokpite má prednosť — viď vyššie.
    if (od && (zKokpitu.has(`${od}|${normName(b.package)}`) || zKokpitu.has(`${od}|h${b.total || hodinZNazvuBalicka(b.package)}`))) continue;
    // Doplnenie členstva nemá v exporte dátumy — na os ho položiť nejde,
    // lebo sa nevie kam. Radšej vynechať než hádať deň.
    // Export mlčí (0/0) → hodiny z názvu, a riadok to prizná značkou ≈.
    const zNazvu = hodinZNazvuBalicka(b.package);
    // Počet na obdobie z exportu členstiev (8 per month) má prednosť pred názvom — nesie
    // v sebe prenesené hodiny, názov nie.
    const hodin = b.total || b.naObdobie || zNazvu;
    const odvodene = !b.total && hodin > 0;
    if (od) out.push({ druh: "balicekOd", den: od, nazov: b.package, hodin, doDna: doDna || undefined, zaplatene: b.payment, odvodene });
    if (doDna && doDna <= dnes) out.push({ druh: "balicekDo", den: doDna, nazov: b.package, hodin, odvodene });
  }

  /**
   * ZAČIATKY ČLENSTIEV Z EXPORTU SLUŽIEB
   *
   * Jerry, 26. 9. 2026: „vidím zapísané platby, ale nevidím začiatky členstiev,
   * iba tak max posledného." Bola to pravda o zdroji: `packages` je SNÍMKA
   * dneška (55 riadkov s dátumom, najstarší 3/2026), takže na osi stál jediný
   * balíček. Export služieb (Payroll → Services) je naproti tomu KNIHA — 456
   * riadkov od 5. 1. 2025 — a nesie každý predaj členstva aj s dňom a cenou.
   *
   * Riadok z `packages` má prednosť, lebo vie aj platnosť a zostatok; služba
   * v ten istý deň s tým istým názvom sa preto preskočí.
   */
  const uzJe = new Set<string>(zKokpitu);
  for (const x of out) {
    if (x.druh !== "balicekOd") continue;
    uzJe.add(`${x.den}|${normName(x.nazov)}`);
    uzJe.add(`${x.den}|h${x.hodin}`);
  }
  /**
   * SKUTOČNÉ HODINY MINULÉHO ČLENSTVA SÚ V HISTÓRII, NIE V NÁZVE.
   *
   * Jerry, 4. 10. 2026: „neriaď sa podľa názvu." Kniha predajov nesie len
   * názov a deň; koľko hodín obdobie naozaj malo (aj s prenesenými), vie
   * PTminder v reporte Packages & Memberships. Párovanie: ten istý klient,
   * začiatok obdobia najviac 3 dni od predaja a rovnaký názov. Bez zhody
   * zostáva názov — tak, ako doteraz.
   *
   * LEN ČLENSTVÁ, NIE DOPLNENIA. Doplnenie je podľa Jerryho „presne toľko,
   * koľko mu ostalo" — hodiny, ktoré už v čísle sú. Z exportu sa nedá
   * poznať, ku ktorému členstvu patria: Daniele Šašinkovej prišlo 12. 9.
   * doplnenie 1 h zo skončeného členstva, os ho pripočítala k novému
   * (nezaplatenému) a z −3 spravila −2; Markéte Resnerovej to isté s
   * doplnením z 20. 9. Skúšané 4. 10. 2026 nad všetkými klientmi a vrátené.
   */
  const mojaHistoria = moje(zdroj.historia || []);
  const zHistorie = (nazov: string, d: string, doplnenie: boolean) => {
    if (doplnenie) return null;
    const n = normName(nazov);
    let naj: Balicek | null = null;
    let najDni = 99;
    for (const h of mojaHistoria) {
      if (normName(h.package) !== n) continue;
      if (h.kind && h.kind !== "membership") continue;
      const kotva = den(h.validFrom || "");
      if (!kotva) continue;
      const dni = Math.abs(Date.parse(`${kotva}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000;
      if (dni <= 3 && dni < najDni) { naj = h; najDni = dni; }
    }
    if (!naj) return null;
    const hodin = naj.naObdobie || naj.total;
    return hodin > 0 ? { hodin, doDna: den(naj.validTo || "") || undefined } : null;
  };

  for (const sl of (zdroj.services || []).filter((x) => normName(x.client) === k)) {
    if (!SLUZBA_JE_BALICEK(sl.serviceType)) continue;
    const d = den(sl.date);
    if (!d || d > dnes) continue;
    const kluc = `${d}|${normName(sl.description)}`;
    const zNazvu = hodinZNazvuBalicka(sl.description);
    /**
     * DVOJICU TREBA HĽADAŤ AJ PODĽA HODÍN, NIELEN PODĽA NÁZVU.
     *
     * Ten istý predaj sa v Kokpite volá „Předplatné 6 h" a v exporte
     * „OFF - 6h S viazanostou" — podľa názvu sa nestretnú. Kľúč `deň|hhodiny`
     * sa tu dovtedy len ZAPISOVAL, nečítal, a odkedy ide Kokpit prvý, prestal
     * fungovať: Vítězslav Papiež mal 29. 9. dva balíčky po šesť hodín a na
     * odkaze mu svietilo 12 h namiesto 6.
     */
    if (uzJe.has(kluc) || (zNazvu > 0 && uzJe.has(`${d}|h${zNazvu}`))) continue;
    uzJe.add(kluc);
    // Kľúč po hodinách drží aj tu: ten istý predaj môže mať v Kokpite iné
    // meno než v exporte (Balíček 6 h vs. OFF - 6h BEZ viazanosti).
    uzJe.add(`${d}|h${zNazvu}`);
    const doplnenie = jeDoplnenie(sl.description) || undefined;
    // Odpovedané doplnenie má hodiny ako ktorýkoľvek iný balíček; bez
    // odpovede zostáva 0 a obdobie sa berie ako neisté (`priebehBalickov`).
    const odpoved = doplnenie ? zdroj.doplneniaHodiny?.[`${sl.client}|${d}`] : undefined;
    const hist = zHistorie(sl.description, d, !!doplnenie);
    if (hist) uzJe.add(`${d}|h${hist.hodin}`);
    out.push({
      druh: "balicekOd",
      den: d,
      nazov: sl.description,
      // Jerryho odpoveď > PTminder (história) > názov.
      hodin: odpoved ?? hist?.hodin ?? zNazvu,
      doDna: hist?.doDna,
      zaplatene: sl.price || undefined,
      nezaplatene: nezaplateneDni.has(d) || undefined,
      doplnenie,
    });
  }
  // Nezaplatené sa musí prilepiť aj na riadok, ktorý prišiel z `packages`.
  for (const u of out) {
    if (u.druh === "balicekOd" && nezaplateneDni.has(u.den)) u.nezaplatene = true;
  }

  /**
   * Tréning zadarmo sa z členstva neodpočíta.
   *
   * Značka je per klient a DEŇ, takže platí pre oba zdroje tréningu — z
   * exportu aj z kalendára. Dôvod sa nesie so sebou, nech je na osi vidieť,
   * prečo sa hodina nestrhla.
   */
  const zdarma = new Map<string, string>();
  for (const z of zdroj.treningyZdarma || []) {
    if (normName(z.klient) === k) zdarma.set(den(z.den), z.dovod || "zadarmo");
  }
  if (zdarma.size) {
    for (const u of out) {
      if (u.druh !== "trening") continue;
      const d = zdarma.get(u.den);
      if (d !== undefined) u.zdarma = d;
    }
  }

  // Najnovšie hore. Pri rovnakom dni ide začiatok balíčka pred tréningy
  // a tréningy pred platbu — tak, ako sa to v ten deň naozaj stalo.
  const poradie = { balicekOd: 0, trening: 1, platba: 2, balicekDo: 3 } as const;
  return out.sort((a, b) => b.den.localeCompare(a.den) || poradie[a.druh] - poradie[b.druh]);
}

/**
 * Tréningy, ktoré padli do platnosti daného balíčka.
 *
 * Pre balíčky nahodené v Kokpite (`balicky`) — tie na osi času nestoja, lebo
 * os číta PTminder. Rozsah je ich vlastná platnosť; keď koniec nie je
 * zapísaný, berie sa dnešok alebo začiatok nasledujúceho balíčka.
 */
export function treningyVBalicku(os: Udalost[], od: string, doDna?: string): Udalost[] {
  return os.filter((x) => x.druh === "trening" && x.den >= od && (!doDna || x.den <= doDna));
}

/** Koľko tréningov padlo do platnosti daného balíčka — na spočítanie očami. */
export function treningovVBalicku(os: Udalost[], od: string, doDna?: string): number {
  return treningyVBalicku(os, od, doDna).length;
}
