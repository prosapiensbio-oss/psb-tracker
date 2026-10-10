/**
 * DOZOR NAD REKLAMOU — kedy sa Kokpit ozve a čo navrhne (10. 10. 2026).
 *
 * Jerry: „Kokpit vie, že je reklama spustená — mohla by ma notifikácia
 * upozorniť, že mám skontrolovať reklamy?" Kampane z 8. 9. sa mali vyhodnotiť
 * okolo 21. 9. a nepripomenulo to nič; do 10. 10. za ne odišlo ~9 300 Kč.
 *
 * Holé „skontroluj reklamy“ by sa o tri týždne stalo riadkom, ktorý sa
 * odklepne bez čítania (pravidlo „číslo bez akcie je zbytočné“). Preto sa
 * dozor ozve len z DÔVODU, nesie ČÍSLA a NAVRHNE rozhodnutie:
 *
 *  • čas vyhodnotiť — kampaň beží 7 dní (po „nechať“ 14) alebo minula 1 500 Kč
 *    od posledného rozhodnutia,
 *  • peniaze bez výsledku — od posledného dopytu z reklamy odišlo ďalších
 *    1 000 Kč (každá ďalšia tisícka sa ozve znova),
 *  • niečo sa pokazilo — zamietnutá reklama, zapnutá kampaň bez bežiacej
 *    sady, problém s účtom (platba),
 *  • mesačný strop — keď si ho Jerry nastaví.
 *
 * Keď nebeží žiadna kampaň, dozor mlčí.
 *
 * Všetko tu je čistý výpočet: dáta sťahuje `/api/meta` (akcia `dozor`, plánovač
 * o 4:20 UTC), čítajú ich register (`deriveRegister` → aj ranný push), karta
 * v Marketingu aj Jarvis. Jedno miesto, aby tri obrazovky nepovedali tri čísla.
 */

/** Kampaň tak, ako ju dozor uložil do `reklama_dozor`. `id = "ucet"` je reklamný účet. */
export type DozorKampan = {
  id: string;
  nazov: string;
  ciel: string;
  /** effective_status kampane z Mety. */
  stav: string;
  /** start_time (ISO) — odkedy kampaň beží. */
  zaciatok: string;
  /** Denný rozpočet v Kč (kampaň alebo súčet sád); null = celoživotný/žiadny. */
  dennyRozpocet: number | null;
  sady: { id: string; nazov: string; stav: string; denny: number | null }[];
  problemy: { druh: string; text: string }[];
  updatedAt: string;
};

/** Jeden deň jednej kampane z Mety (`reklama_dni`). */
export type DozorDen = { kampanId: string; den: string; spend: number; kliky: number; naStranke: number };

/** Rozhodnutie nad kampaňou (`reklama_vyhodnotenia`). */
export type Vyhodnotenie = {
  kampanId: string;
  kedy: string;
  rozhodnutie: "nechat" | "vypnut" | "rozpocet";
  minuteKc: number | null;
  dopyty: number | null;
  dm: number | null;
  rozpocetPo: number | null;
  poznamka: string;
};

export type NastavenieDozoru = {
  /** Mesačný strop na reklamu v Kč; null = bez stropu. */
  stropMesiac: number | null;
  /** Cieľová cena za dopyt v Kč; null = nezadaná. */
  cielDopyt: number | null;
};

export type DozorData = {
  kampane: DozorKampan[];
  dni: DozorDen[];
  vyhodnotenia: Vyhodnotenie[];
  nastavenie: NastavenieDozoru;
  /** Kedy dozor naposledy prešiel (ISO, UTC). */
  aktualizovane: string;
};

export type DopytPreDozor = { date: string; source: string; kampan?: string; utm?: string; status?: string };

export const PRAHY = {
  /** Prvé vyhodnotenie po spustení. */
  prveDni: 7,
  /** Po „nechať“ sa pýta znova o 14 dní. */
  poNechatDni: 14,
  /** Po pridaní rozpočtu skôr — treba vidieť, či viac peňazí prinieslo viac. */
  poRozpocteDni: 7,
  /** Toľko minutých Kč od posledného rozhodnutia spustí vyhodnotenie skôr. */
  kcNaVyhodnotenie: 1500,
  /** Každá takáto suma bez nového dopytu z reklamy = upozornenie. */
  kcBezDopytu: 1000,
  /** Dozor starší než toľko dní = nevie sa nič (kontrola sama zlyhala). */
  dniStarehoDozoru: 2,
} as const;

/**
 * Ciele, pri ktorých Meta nemeria nič, z čoho by sa dal vyčítať dopyt.
 * Kampaň s Jarkom ide na profil a do správ — DM cez API nevidno, musí ich
 * povedať Jerry (pamäť meta-reklamy-2026-09).
 */
const BEZ_DOPYTU_Z_METY = new Set([
  "OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT", "PAGE_LIKES", "VIDEO_VIEWS",
  "OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS", "MESSAGES",
]);
export const meriaSaDm = (ciel: string): boolean => BEZ_DOPYTU_Z_METY.has((ciel || "").toUpperCase());

const NAZOV_CIELA: Record<string, string> = {
  OUTCOME_TRAFFIC: "návštevnosť", LINK_CLICKS: "prekliky", OUTCOME_ENGAGEMENT: "interakcie",
  POST_ENGAGEMENT: "interakcie", VIDEO_VIEWS: "videnia", OUTCOME_LEADS: "dopyty", LEAD_GENERATION: "dopyty",
  OUTCOME_AWARENESS: "povedomie", REACH: "dosah", MESSAGES: "správy", OUTCOME_SALES: "predaj", CONVERSIONS: "konverzie",
};
export const nazovCiela = (ciel: string): string => NAZOV_CIELA[(ciel || "").toUpperCase()] || (ciel || "").toLowerCase();

/** „1 230 Kč“ — obyčajná medzera, nie nbsp (texty idú aj do pushu a promptu). */
export const kc = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
/** „8. 9.“ z RRRR-MM-DD. */
const denKratko = (d: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : "";
};
const dniMedzi = (od: string, doD: string): number =>
  Math.round((Date.parse(`${doD.slice(0, 10)}T00:00:00Z`) - Date.parse(`${od.slice(0, 10)}T00:00:00Z`)) / 86400000);

/** Je dopyt z reklamy? Označený zdroj alebo utm z odkazu reklamy. */
export const jeDopytZReklamy = (d: DopytPreDozor): boolean => d.source === "reklama" || !!(d.kampan || "").trim();

/**
 * Ku ktorej kampani dopyt patrí — podľa `utm_term`, do ktorého reklama dáva
 * ID sady (`term=52603024112275`). `utm_campaign` je pri všetkých troch
 * septembrových kampaniach rovnaký, takže kampaň nerozlíši.
 */
export function kampanDopytu(d: DopytPreDozor, kampane: Pick<DozorKampan, "id" | "sady">[]): string | null {
  const term = /(?:^|[\s·])term=(\d{6,})/.exec(d.utm || "")?.[1];
  if (!term) return null;
  for (const k of kampane) {
    if (k.id === term || k.sady.some((s) => s.id === term)) return k.id;
  }
  return null;
}

export type Navrh = { akcia: "nechat" | "vypnut" | "rozpocet" | "dm"; veta: string };

export type StavKampane = {
  kampan: DozorKampan;
  /** Od ktorého dňa sa počíta toto kolo (spustenie alebo posledné rozhodnutie). */
  od: string;
  /** Posledné rozhodnutie, ak bolo. */
  posledne: Vyhodnotenie | null;
  dniOd: number;
  minuteOd: number;
  klikyOd: number;
  naStrankeOd: number;
  /** Dopyty s odkazom (utm) práve z tejto kampane. */
  dopytyOd: number;
  /** Dopyty z reklamy v tom istom období bez odkazu — nevie sa, z ktorej kampane sú. */
  bezOdkazuOd: number;
  /** Celkom za okno, ktoré dozor drží (≈ 60 dní). */
  minuteCelkom: number;
  cenaZaDopyt: number | null;
  splatne: boolean;
  /** Prečo je (ne)splatné — veta do karty. */
  dovod: string;
  navrh: Navrh;
  /** Bežia sady? Kampaň zapnutá bez bežiacej sady neminie nič. */
  bezi: boolean;
};

/**
 * Posledné rozhodnutie: zapísané vyhodnotenie ALEBO holé „Vybavené“ na
 * notifikácii (bez tlačidla rozhodnutia). Bez toho druhého by kľúč toho kola
 * ostal odklepnutý a ďalšie kolo by nikdy nezačalo — holé „Vybavené“ preto
 * platí ako „nechať“.
 */
function posledneRozhodnutie(
  id: string,
  vyhodnotenia: Vyhodnotenie[],
  ack: Record<string, { ackedAt?: string; note?: string } | undefined>,
): Vyhodnotenie | null {
  let naj: Vyhodnotenie | null = null;
  for (const v of vyhodnotenia) if (v.kampanId === id && (!naj || v.kedy > naj.kedy)) naj = v;
  const predpona = `reklama|vyhodnot|${id}|`;
  for (const [k, a] of Object.entries(ack)) {
    if (!a?.ackedAt || !k.startsWith(predpona)) continue;
    // Odloženie nie je rozhodnutie — vráti sa samo.
    if ((a.note || "").startsWith("odlozene|")) continue;
    if (!naj || a.ackedAt > naj.kedy) {
      naj = { kampanId: id, kedy: a.ackedAt, rozhodnutie: "nechat", minuteKc: null, dopyty: null, dm: null, rozpocetPo: null, poznamka: a.note || "" };
    }
  }
  return naj;
}

export function stavKampane(
  k: DozorKampan,
  d: Pick<DozorData, "kampane" | "dni" | "vyhodnotenia" | "nastavenie">,
  dopyty: DopytPreDozor[],
  ack: Record<string, { ackedAt?: string; note?: string } | undefined>,
  dnes: string,
): StavKampane {
  const dniK = d.dni.filter((x) => x.kampanId === k.id).sort((a, b) => a.den.localeCompare(b.den));
  const posledne = posledneRozhodnutie(k.id, d.vyhodnotenia, ack);
  const zaciatok = (k.zaciatok || "").slice(0, 10) || dniK[0]?.den || dnes;
  const od = posledne ? posledne.kedy.slice(0, 10) : zaciatok;
  const vObdobi = dniK.filter((x) => x.den >= od);
  const minuteOd = vObdobi.reduce((s, x) => s + x.spend, 0);
  const klikyOd = vObdobi.reduce((s, x) => s + x.kliky, 0);
  const naStrankeOd = vObdobi.reduce((s, x) => s + x.naStranke, 0);
  const minuteCelkom = dniK.reduce((s, x) => s + x.spend, 0);
  const reklamne = dopyty.filter((x) => jeDopytZReklamy(x) && x.date.slice(0, 10) >= od);
  const kampaneSady = d.kampane.filter((x) => x.id !== "ucet");
  let dopytyOd = 0;
  let bezOdkazuOd = 0;
  for (const x of reklamne) {
    const kam = kampanDopytu(x, kampaneSady);
    if (kam === k.id) dopytyOd++;
    else if (!kam) bezOdkazuOd++;
  }
  const dniOd = Math.max(0, dniMedzi(od, dnes));
  const bezi = (k.stav || "").toUpperCase() === "ACTIVE" && (k.sady.length === 0 || k.sady.some((s) => (s.stav || "").toUpperCase() === "ACTIVE"));
  const prahDni = !posledne ? PRAHY.prveDni : posledne.rozhodnutie === "rozpocet" ? PRAHY.poRozpocteDni : PRAHY.poNechatDni;
  const splatne = bezi && minuteOd > 0 && (dniOd >= prahDni || minuteOd >= PRAHY.kcNaVyhodnotenie);
  const dovod = !bezi
    ? "kampaň nedoručuje"
    : dniOd >= prahDni
      ? `${posledne ? "od posledného rozhodnutia" : "od spustenia"} ${dniOd} dní`
      : minuteOd >= PRAHY.kcNaVyhodnotenie
        ? `minula ${kc(minuteOd)} ${posledne ? "od posledného rozhodnutia" : "od spustenia"}`
        : `ďalšie vyhodnotenie o ${prahDni - dniOd} dní alebo po ${kc(PRAHY.kcNaVyhodnotenie - minuteOd)}`;
  const cenaZaDopyt = dopytyOd > 0 ? minuteOd / dopytyOd : null;
  return {
    kampan: k, od, posledne, dniOd, minuteOd, klikyOd, naStrankeOd, dopytyOd, bezOdkazuOd, minuteCelkom,
    cenaZaDopyt, splatne, dovod, bezi, navrh: navrhni(k, { minuteOd, klikyOd, naStrankeOd, dopytyOd, bezOdkazuOd, cenaZaDopyt }, d.nastavenie),
  };
}

/**
 * Čo Kokpit navrhne. Pravidlá sú zámerne jednoduché a povedia, PREČO —
 * rozhodnutie je Jerryho a veta mu má dať dôvod, nie verdikt.
 */
export function navrhni(
  k: Pick<DozorKampan, "ciel">,
  c: { minuteOd: number; klikyOd: number; naStrankeOd: number; dopytyOd: number; bezOdkazuOd: number; cenaZaDopyt: number | null },
  n: NastavenieDozoru,
): Navrh {
  // Omylom ťuknuté kliky — 15. 9. 2026 dorazila na stránku štvrtina klikov
  // (Reels). Dopĺňa sa k návrhu, nie je to samostatný verdikt.
  const pomer = c.klikyOd >= 100 ? c.naStrankeOd / c.klikyOd : null;
  const dodatok = pomer !== null && pomer < 0.35 && !meriaSaDm(k.ciel)
    ? ` Z ${c.klikyOd} klikov dorazilo na stránku len ${c.naStrankeOd} (${Math.round(pomer * 100)} %) — väčšina je omylom ťuknutá; pomôže cieľ „zobrazenie stránky“ namiesto klikov alebo vypnúť umiestnenie v Reels.`
    : "";
  if (meriaSaDm(k.ciel) && c.dopytyOd === 0) {
    return { akcia: "dm", veta: `Meta pri tomto cieli dopyty nemeria — zadaj, koľko správ (DM) z nej prišlo. Pri nule navrhujem vypnúť.${dodatok}` };
  }
  if (c.dopytyOd === 0) {
    if (c.minuteOd >= PRAHY.kcNaVyhodnotenie && c.bezOdkazuOd === 0) {
      return { akcia: "vypnut", veta: `Vypnúť — za ${kc(c.minuteOd)} ani jeden dopyt z reklamy.${dodatok}` };
    }
    if (c.bezOdkazuOd > 0) {
      return { akcia: "nechat", veta: `S odkazom z tejto kampane neprišiel žiadny dopyt, ale ${c.bezOdkazuOd} ${c.bezOdkazuOd === 1 ? "dopyt" : "dopyty"} z reklamy prišli bez odkazu — nedá sa povedať, z ktorej kampane. Opýtaj sa ich, odkiaľ o nás vedia.${dodatok}` };
    }
    return { akcia: "nechat", veta: `Zatiaľ bez dopytu, ale minula len ${kc(c.minuteOd)} — ešte je skoro súdiť.${dodatok}` };
  }
  const cena = c.cenaZaDopyt!;
  if (n.cielDopyt) {
    if (cena <= n.cielDopyt * 0.7) return { akcia: "rozpocet", veta: `Pridať rozpočet — dopyt stojí ${kc(cena)}, tvoj cieľ je ${kc(n.cielDopyt)}.${dodatok}` };
    if (cena > n.cielDopyt * 1.5) return { akcia: "vypnut", veta: `Vypnúť alebo vymeniť kreatívu — dopyt stojí ${kc(cena)}, cieľ je ${kc(n.cielDopyt)}.${dodatok}` };
    return { akcia: "nechat", veta: `Nechať — dopyt stojí ${kc(cena)}, cieľ je ${kc(n.cielDopyt)}.${dodatok}` };
  }
  return { akcia: "nechat", veta: `Nechať — dopyt stojí ${kc(cena)}. Zadaj si cieľovú cenu za dopyt a Kokpit bude vedieť povedať aj „pridať“ alebo „vypnúť“.${dodatok}` };
}

/** Čo notifikácia nesie pre tlačidlá a text pre Clauda. */
export type ReklamaPolozka = {
  druh: "vyhodnot" | "problem" | "bezdopytu" | "strop" | "stary";
  kampanId?: string;
  nazov?: string;
  ciel?: string;
  dennyRozpocet?: number | null;
  navrh?: Navrh;
  /** Bežiace kampane — pri „bez dopytu“ a strope sa dajú vypnúť priamo. */
  bezia?: { id: string; nazov: string; denny: number | null }[];
  /** Čísla na zapísanie k rozhodnutiu. */
  cisla?: { minuteKc: number; dopyty: number };
  prompt: string;
};

export type PolozkaDozoru = {
  key: string;
  rodina: string;
  category: "Rozhodnutie" | "Anomália";
  tone: "red" | "orange" | "blue";
  title: string;
  detail: string;
  priority: number;
  reklama: ReklamaPolozka;
};

const UCET = "act_172897726151288";

/** Text pre Claude Code — ID, čísla a návrh, aby sa nemuselo nič dohľadávať. */
export function promptPreClauda(s: StavKampane, dnes: string): string {
  const k = s.kampan;
  return [
    `Reklama v Mete (účet ${UCET}): „${k.nazov}“ — kampaň ${k.id}, cieľ ${k.ciel}, ${k.dennyRozpocet ? `denný rozpočet ${kc(k.dennyRozpocet)}` : "bez denného rozpočtu"}.`,
    `Sady: ${k.sady.map((x) => `${x.nazov} (${x.id}, ${x.stav.toLowerCase()}${x.denny ? `, ${kc(x.denny)}/deň` : ""})`).join("; ") || "—"}.`,
    `Od ${denKratko(s.od)} do ${denKratko(dnes)} (${s.dniOd} dní): minuté ${kc(s.minuteOd)}, kliky ${s.klikyOd}, na stránke ${s.naStrankeOd}, dopyty s odkazom z tejto kampane ${s.dopytyOd}, dopyty z reklamy bez odkazu ${s.bezOdkazuOd}.`,
    `Kokpit navrhuje: ${s.navrh.veta}`,
    ``,
    `Chcem: [doplň — nová kreatíva / nové publikum / nová sada / iný cieľ].`,
    `Pracuj cez Graph API s tokenom meta_token z vzas_settings (pamäť meta-reklamy-2026-09). Kampaň zakladaj pozastavenú a pred spustením mi ukáž, čo meníš a koľko to bude stáť.`,
  ].join("\n");
}

/**
 * Položky do registra. Kľúče:
 *  • `reklama|vyhodnot|<id>|<od>` — kolo sa viaže na deň, od ktorého sa počíta;
 *    rozhodnutie posunie `od`, a tým vznikne nové kolo,
 *  • `reklama|bezdopytu|<deň posledného dopytu>|<tisícky>` — nový dopyt aj
 *    každá ďalšia tisícka je nová otázka,
 *  • `reklama|problem|<id>|<druh>`, `reklama|strop|<mesiac>|<druh>`.
 */
export function polozkyDozoru(
  d: DozorData,
  dopyty: DopytPreDozor[],
  ack: Record<string, { ackedAt?: string; note?: string } | undefined>,
  dnes: string,
): PolozkaDozoru[] {
  const out: PolozkaDozoru[] = [];
  const kampane = d.kampane.filter((k) => k.id !== "ucet");
  const ucet = d.kampane.find((k) => k.id === "ucet");
  const stavy = kampane.map((k) => stavKampane(k, d, dopyty, ack, dnes));
  const bezia = stavy.filter((s) => s.bezi).map((s) => ({ id: s.kampan.id, nazov: s.kampan.nazov, denny: s.kampan.dennyRozpocet }));

  // Pokazené veci najprv — tie stoja peniaze bez toho, aby niekto čokoľvek videl.
  for (const k of [...(ucet ? [ucet] : []), ...kampane]) {
    for (const p of k.problemy) {
      out.push({
        key: `reklama|problem|${k.id}|${p.druh}`,
        rodina: `reklama|problem|${k.id}`,
        category: "Anomália",
        tone: "red",
        title: k.id === "ucet" ? `Reklamný účet: ${p.text.split(" — ")[0]}` : `Reklama „${k.nazov}“: ${p.text.split(" — ")[0]}`,
        detail: k.id === "ucet" ? `Reklamný účet: ${p.text}` : `Reklama „${k.nazov}“: ${p.text}`,
        priority: 2,
        reklama: {
          druh: "problem", kampanId: k.id === "ucet" ? undefined : k.id, nazov: k.nazov, ciel: k.ciel, bezia,
          prompt: `V reklamnom účte ${UCET} ${k.id === "ucet" ? "je problém s účtom" : `má kampaň „${k.nazov}“ (${k.id}) problém`}: ${p.text}\n\nZisti cez Graph API, čo presne Meta hlási a čo s tým treba urobiť, a navrhni opravu. Nič nespúšťaj bez mňa.`,
        },
      });
    }
  }

  if (!bezia.length) return out;

  // Dozor, ktorý sa nestiahol, nevie nič — chýbajúca chyba nie je dôkaz, že
  // je dobre (pravidlo z 24. 8. 2026 o kalendári).
  if (d.aktualizovane && dniMedzi(d.aktualizovane.slice(0, 10), dnes) > PRAHY.dniStarehoDozoru) {
    out.push({
      key: `reklama|stary|${d.aktualizovane.slice(0, 10)}`,
      rodina: "reklama|stary",
      category: "Anomália",
      tone: "orange",
      title: `Dozor reklám sa nestiahol od ${denKratko(d.aktualizovane)}`,
      detail: `Čísla o reklame sú z ${denKratko(d.aktualizovane)}. Kým sa nestiahnu nové, Kokpit nevie, či kampane bežia a koľko minuli. Skús „Stiahnuť teraz“ v Marketing → Dozor reklám; keď to zlyhá, je problém s tokenom Mety.`,
      priority: 20,
      reklama: { druh: "stary", bezia, prompt: `Denný dozor reklám v Kokpite (/api/meta akcia "dozor") sa nestiahol od ${d.aktualizovane}. Zisti prečo (token, práva, chyba Graph API) a oprav to.` },
    });
  }

  for (const s of stavy) {
    if (!s.splatne) continue;
    const k = s.kampan;
    const cislo = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    // Pri interakciách sa na stránku nechodí — „0 na stránke (0 %)" by klamalo.
    const navstevyTxt = meriaSaDm(k.ciel)
      ? `${cislo(s.klikyOd)} klikov`
      : `${cislo(s.klikyOd)} klikov, ${cislo(s.naStrankeOd)} na stránke${s.klikyOd ? ` (${Math.round((s.naStrankeOd / s.klikyOd) * 100)} %)` : ""}`;
    const dopytyTxt = meriaSaDm(k.ciel) && s.dopytyOd === 0
      ? `dopyty Meta pri tomto cieli nemeria`
      : `dopyty s odkazom z tejto kampane: ${s.dopytyOd}${s.bezOdkazuOd ? ` · z reklamy bez odkazu: ${s.bezOdkazuOd}` : ""}${s.cenaZaDopyt ? ` → ${kc(s.cenaZaDopyt)} za dopyt` : ""}`;
    out.push({
      key: `reklama|vyhodnot|${k.id}|${s.od}`,
      rodina: `reklama|vyhodnot|${k.id}`,
      category: "Rozhodnutie",
      tone: s.navrh.akcia === "vypnut" ? "red" : "orange",
      title: `Reklama: čas vyhodnotiť — ${k.nazov}`,
      detail: `Reklama „${k.nazov}“ (${nazovCiela(k.ciel) || "kampaň"}) — čas vyhodnotiť. Od ${denKratko(s.od)} (${s.dniOd} dní): ${kc(s.minuteOd)}, ${navstevyTxt}; ${dopytyTxt}. Návrh: ${s.navrh.veta}`,
      priority: 8,
      reklama: {
        druh: "vyhodnot", kampanId: k.id, nazov: k.nazov, ciel: k.ciel, dennyRozpocet: k.dennyRozpocet,
        navrh: s.navrh, cisla: { minuteKc: Math.round(s.minuteOd), dopyty: s.dopytyOd }, prompt: promptPreClauda(s, dnes),
      },
    });
  }

  // Peniaze bez výsledku — za celý účet, od posledného dopytu z reklamy.
  const posledny = dopyty.filter(jeDopytZReklamy).map((x) => x.date.slice(0, 10)).sort().pop() || "";
  const najstarsiDen = d.dni.map((x) => x.den).sort()[0] || "";
  const odDna = posledny || najstarsiDen;
  if (odDna) {
    const dniPo = d.dni.filter((x) => (posledny ? x.den > posledny : true));
    const minute = dniPo.reduce((s, x) => s + x.spend, 0);
    const tisicky = Math.floor(minute / PRAHY.kcBezDopytu);
    if (tisicky >= 1) {
      const aspon = posledny && najstarsiDen && posledny < najstarsiDen ? "aspoň " : "";
      const spolu = bezia.reduce((s, x) => s + (x.denny || 0), 0);
      out.push({
        key: `reklama|bezdopytu|${posledny || "nikdy"}|${tisicky}`,
        rodina: "reklama|bezdopytu",
        category: "Anomália",
        tone: tisicky >= 2 ? "red" : "orange",
        title: `Reklama: ${aspon}${kc(minute)} bez nového dopytu`,
        detail: `${posledny ? `Od posledného dopytu z reklamy (${denKratko(posledny)})` : "Odkedy Kokpit reklamu sleduje"} odišlo na reklamu ${aspon}${kc(minute)} a nový dopyt neprišiel. Bežia: ${bezia.map((x) => `${x.nazov}${x.denny ? ` (${kc(x.denny)}/deň)` : ""}`).join(", ")}${spolu ? ` — spolu ${kc(spolu)} denne` : ""}.`,
        priority: 6,
        reklama: {
          druh: "bezdopytu", bezia,
          prompt: `Od ${posledny ? `posledného dopytu z reklamy (${posledny})` : "začiatku sledovania"} odišlo v účte ${UCET} ${kc(minute)} bez nového dopytu. Bežiace kampane: ${bezia.map((x) => `„${x.nazov}“ (${x.id})`).join(", ")}.\n\nPozri cez Graph API výkon po reklamách a sadách za toto obdobie a navrhni, čo vypnúť a čo zmeniť. Nič nemeň bez mňa.`,
        },
      });
    }
  }

  // Mesačný strop — len keď si ho Jerry nastaví.
  const strop = d.nastavenie.stropMesiac;
  if (strop && strop > 0) {
    const mesiac = dnes.slice(0, 7);
    const vMesiaci = d.dni.filter((x) => x.den.startsWith(mesiac)).reduce((s, x) => s + x.spend, 0);
    const denVMesiaci = Number(dnes.slice(8, 10));
    const dniVMesiaci = new Date(Date.UTC(Number(dnes.slice(0, 4)), Number(dnes.slice(5, 7)), 0)).getUTCDate();
    const spolu = bezia.reduce((s, x) => s + (x.denny || 0), 0);
    const prognoza = vMesiaci + spolu * (dniVMesiaci - denVMesiaci);
    const druh = vMesiaci >= strop ? "prekroceny" : prognoza > strop ? "prognoza" : "";
    if (druh) {
      out.push({
        key: `reklama|strop|${mesiac}|${druh}`,
        rodina: "reklama|strop",
        category: "Anomália",
        tone: druh === "prekroceny" ? "red" : "orange",
        title: druh === "prekroceny" ? `Reklama prekročila mesačný strop ${kc(strop)}` : `Reklama prekročí mesačný strop ${kc(strop)}`,
        detail: druh === "prekroceny"
          ? `Tento mesiac už odišlo ${kc(vMesiaci)} zo stropu ${kc(strop)} a kampane bežia ďalej (${kc(spolu)} denne).`
          : `Tento mesiac zatiaľ ${kc(vMesiaci)}; pri dnešných rozpočtoch (${kc(spolu)} denne) skončí mesiac na ~${kc(prognoza)}, strop je ${kc(strop)}.`,
        priority: 7,
        reklama: { druh: "strop", bezia, prompt: `Reklama v účte ${UCET} ${druh === "prekroceny" ? "prekročila" : "prekročí"} mesačný strop ${kc(strop)} (zatiaľ ${kc(vMesiaci)}, prognóza ${kc(prognoza)}). Navrhni, ktoré rozpočty znížiť.` },
      });
    }
  }
  return out;
}

/** Súhrn pre Jarvisa a kartu — hotové čísla, nepočítať v odpovedi. */
export function suhrnDozoru(d: DozorData, dopyty: DopytPreDozor[], ack: Record<string, { ackedAt?: string; note?: string } | undefined>, dnes: string) {
  return d.kampane.filter((k) => k.id !== "ucet").map((k) => {
    const s = stavKampane(k, d, dopyty, ack, dnes);
    return {
      id: k.id, nazov: k.nazov, ciel: nazovCiela(k.ciel), bezi: s.bezi, dennyRozpocet: k.dennyRozpocet,
      obdobie: { od: s.od, do: dnes, dni: s.dniOd }, minuteKc: Math.round(s.minuteOd), kliky: s.klikyOd, naStranke: s.naStrankeOd,
      dopytySOdkazom: s.dopytyOd, dopytyZReklamyBezOdkazu: s.bezOdkazuOd,
      cenaZaDopyt: s.cenaZaDopyt ? Math.round(s.cenaZaDopyt) : null,
      minuteZaSledovane60Dni: Math.round(s.minuteCelkom),
      posledneRozhodnutie: s.posledne ? { kedy: s.posledne.kedy.slice(0, 10), co: s.posledne.rozhodnutie, dm: s.posledne.dm } : null,
      cakaNaVyhodnotenie: s.splatne, dovod: s.dovod, navrh: s.navrh.veta,
      problemy: k.problemy.map((p) => p.text),
    };
  });
}

/**
 * Metriky do pravého stĺpca Dozoru reklám (10. 10. 2026) — tie, na ktoré sa
 * pri rozhodovaní o reklame naozaj pozerá: koľko odchádza, koľko ľudí
 * dorazí na stránku, čo stojí dopyt a hlavne DOHODNUTÝ ÚVODNÝ (meradlo
 * dohodnuté 30. 9. v debate FB Reklama), a koľko odišlo od posledného dopytu.
 * Okno 30 dní pre peniaze a dopyty, 7 dní pre „dorazilo" (mení sa rýchlo).
 */
export function metrikyDozoru(d: DozorData, dopyty: DopytPreDozor[], dnes: string) {
  const od30 = posunDenLokal(dnes, -29), od7 = posunDenLokal(dnes, -6);
  const kampane = d.kampane.filter((k) => k.id !== "ucet");
  const engagement = new Set(kampane.filter((k) => meriaSaDm(k.ciel)).map((k) => k.id));
  const dni30 = d.dni.filter((x) => x.den >= od30 && x.den <= dnes);
  const dni7 = d.dni.filter((x) => x.den >= od7 && x.den <= dnes && !engagement.has(x.kampanId));
  const minute30 = dni30.reduce((s, x) => s + x.spend, 0);
  const mesiac = dnes.slice(0, 7);
  const minuteMesiac = d.dni.filter((x) => x.den.startsWith(mesiac)).reduce((s, x) => s + x.spend, 0);
  const kliky7 = dni7.reduce((s, x) => s + x.kliky, 0);
  const naStranke7 = dni7.reduce((s, x) => s + x.naStranke, 0);
  const spendWeb7 = dni7.reduce((s, x) => s + x.spend, 0);
  const reklamne30 = dopyty.filter((x) => jeDopytZReklamy(x) && x.date.slice(0, 10) >= od30 && x.date.slice(0, 10) <= dnes);
  const sOdkazom30 = reklamne30.filter((x) => !!kampanDopytu(x, kampane)).length;
  const dohodnute30 = reklamne30.filter((x) => x.status === "dohodnuty").length;
  const bezia = kampane.filter((k) => (k.stav || "").toUpperCase() === "ACTIVE");
  const denne = bezia.reduce((s, k) => s + (k.dennyRozpocet || 0), 0);
  const posledny = dopyty.filter(jeDopytZReklamy).map((x) => x.date.slice(0, 10)).filter((x) => x <= dnes).sort().pop() || "";
  const odPosledneho = posledny ? d.dni.filter((x) => x.den > posledny).reduce((s, x) => s + x.spend, 0) : null;
  const dniPo: { den: string; spend: number; dopyty: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const den = posunDenLokal(dnes, -i);
    dniPo.push({
      den,
      spend: d.dni.filter((x) => x.den === den).reduce((s, x) => s + x.spend, 0),
      dopyty: dopyty.filter((x) => jeDopytZReklamy(x) && x.date.slice(0, 10) === den).length,
    });
  }
  return {
    denneRozpocty: denne,
    mesacnePriTomtoTempe: denne * 30,
    minuteMesiac: Math.round(minuteMesiac),
    minute30: Math.round(minute30),
    dopyty30: reklamne30.length,
    dopytySOdkazom30: sOdkazom30,
    dohodnute30,
    cenaZaDopyt30: reklamne30.length ? Math.round(minute30 / reklamne30.length) : null,
    cenaZaDohodnuty30: dohodnute30 ? Math.round(minute30 / dohodnute30) : null,
    kliky7, naStranke7,
    dorazilo7: kliky7 ? Math.round((naStranke7 / kliky7) * 100) : null,
    cenaZaNavstevu7: naStranke7 ? Math.round((spendWeb7 / naStranke7) * 10) / 10 : null,
    poslednyDopyt: posledny || null,
    dniOdPoslednehoDopytu: posledny ? dniMedzi(posledny, dnes) : null,
    minuteOdPoslednehoDopytu: odPosledneho === null ? null : Math.round(odPosledneho),
    dniPo,
  };
}

const posunDenLokal = (den: string, n: number): string =>
  new Date(Date.parse(`${den.slice(0, 10)}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
