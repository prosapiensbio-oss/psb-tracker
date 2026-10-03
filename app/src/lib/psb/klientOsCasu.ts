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

export type Udalost =
  | { druh: "platba"; den: string; suma: number; metoda: string; poznamka?: string }
  | { druh: "trening"; den: string; cas?: string; trener?: string; nazov?: string; zKalendara?: boolean; minut?: number; zdarma?: string }
  | { druh: "balicekOd"; den: string; nazov: string; hodin: number; doDna?: string; zaplatene?: number; odvodene?: boolean; nezaplatene?: boolean; doplnenie?: boolean; zKokpitu?: boolean }
  | { druh: "balicekDo"; den: string; nazov: string; hodin: number; odvodene?: boolean };

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

export function osCasuKlienta(
  meno: string,
  zdroj: {
    sessions: Sedenie[]; payments: Platba[]; packages: Balicek[]; kalUdalosti?: KalUdalost[];
    services?: Sluzba[]; poplatky?: Poplatok[]; treningyZdarma?: Zdarma[]; balicky?: BalicekKokpitu[];
    /**
     * Koľko hodín pridalo „Doplnenie členstva" — kľúč `klient|deň`.
     *
     * Export to nenesie (223× ten istý riadok s cenou 0) a vyrátať sa to
     * nedá: hodiny z členstva s viazanosťou na konci platnosti prepadajú,
     * ak sa Jerry nerozhodne inak, a doplnenie je záznam práve toho
     * rozhodnutia. Preto sa na to Kokpit pýta — viď migráciu 0085.
     */
    doplneniaHodiny?: Record<string, number>;
  },
  dnes: string = new Date().toISOString().slice(0, 10),
): Udalost[] {
  const k = normName(meno);
  const moje = <T extends { client: string }>(xs: T[]) => xs.filter((x) => normName(x.client) === k);

  const out: Udalost[] = [];

  for (const s of moje(zdroj.sessions)) {
    out.push({ druh: "trening", den: den(s.date), cas: s.time, trener: s.sessionTrainer, nazov: s.sessionName, minut: s.duration });
  }

  // Tréningy, ktoré sú v kalendári a v exporte ešte nie. Porovnáva sa po
  // DŇOCH: v jeden deň klient druhýkrát netrénuje a dvojica by len mýlila.
  const dniZExportu = new Set(out.map((x) => x.den));
  for (const u of zdroj.kalUdalosti || []) {
    if (!u.klient || normName(u.klient) !== k) continue;
    if (u.typ !== "trening" && u.typ !== "uvodny") continue;
    const d = den(u.zaciatok);
    if (d > dnes || dniZExportu.has(d)) continue;
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

  for (const p of moje(zdroj.payments)) {
    out.push({ druh: "platba", den: den(p.date), suma: p.amount, metoda: p.method, poznamka: p.note });
  }

  const nezaplateneDni = new Set(
    (zdroj.poplatky || []).filter((p) => normName(p.klient) === k).map((p) => den(p.datum)),
  );
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
  for (const b of zdroj.balicky || []) {
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
    out.push({
      druh: "balicekOd",
      den: d,
      nazov: sl.description,
      hodin: odpoved ?? zNazvu,
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
