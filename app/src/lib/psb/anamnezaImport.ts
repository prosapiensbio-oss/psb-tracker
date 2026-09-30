/**
 * IMPORT STARÝCH ANAMNÉZ Z GOOGLE FORMS.
 *
 * Päťdesiatšesť anamnéz z 23. 6. 2025 – 28. 9. 2026. Jerry ich vypĺňal sám
 * počas úvodných tréningov (48 z 56 odpovedí je po slovensky a 33 v tretej
 * osobe), takže sa preberajú ako ZÁPIS TRÉNERA, nie ako odpovede klienta.
 *
 * DVE VECI, KTORÉ ROBIA TENTO IMPORT ZRADNÝM
 *
 * 1. FORMULÁR SA ZA PÄTNÁSŤ MESIACOV MENIL a Google Forms zapisuje staré
 *    odpovede do stĺpcov PODĽA DNEŠNEJ PODOBY. U starších riadkov tak
 *    v stĺpci „Výška" stojí hlavná obtiaž („zvědavost, spravit držení těla"),
 *    inde zase v stĺpci „Váha". Preto sa každá typovaná hodnota overuje
 *    (výška je číslo 120–220, nie veta) a hlavná obtiaž sa hľadá v troch
 *    stĺpcoch naraz.
 *
 * 2. ČO SA NEDÁ PRELOŽIŤ, SA NEVYMÝŠĽA. Stará ponuka cieľov, „ochotní
 *    obetovať" a intenzita bolesti bez miesta v dnešnom formulári ekvivalent
 *    nemajú. Nemapujú sa — celý pôvodný riadok sa ukladá ako ARCHÍV
 *    (`_archiv`) a appka ho ukáže ako samostatnú sekciu na čítanie. Inak by
 *    sa z „preložil som, čo šlo" stalo ticho stratených dvanásť odpovedí.
 */

/** Jeden riadok exportu — hlavička stĺpca → hodnota. */
export type StaryRiadok = Record<string, string>;

export type PrevzataAnamneza = {
  /** Odpovede v tvare, aký číta dnešný formulár. */
  odpovede: Record<string, unknown>;
  /** Doklad o súhlase z pôvodného formulára; nikdy sa nešifruje. */
  suhlasy: Record<string, unknown> | null;
  /** Kedy bola anamnéza vyplnená (ISO). */
  kedy: string;
};

/**
 * Názvy stĺpcov sa porovnávajú BEZ OHĽADU NA MEDZERY.
 *
 * Hlavička exportu má na niektorých miestach koncovú medzeru („Co vám
 * fungovalo? ", „@Email ") a inde dve za sebou. Presné porovnanie na tom
 * ticho padne — odpoveď by nespadla do poľa, ale do archívu, a nikto by si
 * nevšimol, že jedno pole je prázdne. Kľúč sa preto zrovná na jeden tvar.
 */
const kluc = (s: string): string => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Riadok prekľúčovaný na porovnateľné názvy stĺpcov. */
const zrovnaj = (r: StaryRiadok): Map<string, string> => {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(r || {})) {
    const cisty = String(v ?? "").trim();
    if (cisty) m.set(kluc(k), cisty);
  }
  return m;
};

const text = (r: Map<string, string>, s: string): string => r.get(kluc(s)) || "";

/** Číslo v rozumnom rozsahu, inak nič — v starých riadkoch tu býva veta. */
function cislo(hodnota: string, od: number, doo: number): number | null {
  const m = hodnota.replace(",", ".").match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= od && n <= doo ? Math.round(n) : null;
}

/** Vyzerá hodnota ako číslo? Slúži na rozpoznanie posunutých stĺpcov. */
const jeCislo = (h: string): boolean => /^\s*\d+([.,]\d+)?\s*(cm|kg)?\s*$/i.test(h);

/** Časová pečiatka Google Forms („2025/06/23 5:42:25 PM GMT+3") na ISO. */
export function naIso(peciatka: string, zalohaDatum: string): string {
  const m = String(peciatka || "").match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)?/);
  if (m) {
    let h = Number(m[4]);
    if (m[7] === "PM" && h < 12) h += 12;
    if (m[7] === "AM" && h === 12) h = 0;
    return `${m[1]}-${m[2]}-${m[3]}T${String(h).padStart(2, "0")}:${m[5]}:${m[6]}.000Z`;
  }
  // Záloha: „Dnešní datum". Niektoré riadky v ňom majú preklep (0025-08-20).
  const d = String(zalohaDatum || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return d && Number(d[1]) > 2000 ? `${d[1]}-${d[2]}-${d[3]}T12:00:00.000Z` : "";
}

/** Voľba sa preberie LEN vtedy, keď presne sedí na dnešnú ponuku. */
const zPonuky = (hodnota: string, ponuka: string[]): string | null =>
  ponuka.find((p) => p.toLowerCase() === hodnota.trim().toLowerCase()) || null;

const ZDROJ_ZO_STAREHO: Record<string, string> = {
  reference: "Doporučení",
  doporučení: "Doporučení",
  google: "Google",
  instagram: "Instagram",
  "functional patterns": "Functional Patterns",
};

/** Stĺpce, ktoré sa prenášajú 1:1 ako voľný text. */
const TEXTOVE: [string, string][] = [
  ["Měli jste někdy závažné zranění, operaci (jazvy) nebo hospitalizaci?", "zranenia"],
  ["Jaké odborné přístupy jste v minulosti zkoušeli? (fyzioterapie, chiropraktik, osteopatie, masáže...) Co vám pomohlo a co ne?", "pristupy"],
  ["Proč si myslíte, že předchozí přístupy nefungovaly dlouhodobě?", "preco_nevydrzalo"],
  ["Co by pro vás znamenal úspěch po 3/6/12 měsících tréninku?", "uspech"],
  ["Čím se živíte ?", "zivi"],
  ["Jaký sport nebo pohyb jste dělali jako dítě/mladý?", "sport_detstvo"],
  ["Jaké sporty/pohyb děláte aktuální – a jak často?", "sport_teraz"],
  ["Co vám fungovalo? ", "trener_fungovalo"],
  ["Co vás nakonec vedlo k ukončení spolupráce?", "trener_koniec"],
  ["V čem vás naše nabídka/trénink zaujala nejvíc?", "zaujalo"],
];

/** Stĺpce, ktoré sa do dnešného formulára prekladajú — zvyšok ide do archívu. */
const PRELOZENE = new Set<string>([
  "Časová pečiatka", "Dnešní datum", "Meno", "Příjmení", "@Email ", "Telefonne číslo ", "Dátum narození",
  "Výška", "Váha", "Popište hlavní obtíž, která vás přivedla k nám — co vás trápí, jak dlouho to trvá?",
  "Jste těhotná?", "Kolikaty trimestr?", "Jaký je zatím průběh?",
  "Pracujete více vsedě, ve stoje nebo je práce pohybová/variabilní?",
  "Do jaké míry je vaše práce stresující ?", "Měli jste v minulosti trenéra?",
  "Jak jste se o nás dozvěděli?",
  "Souhlasím s obchodními podmínkami", "Souhlasím se zpracováním osobních údajů",
  "Souhlasím ze zasilaním newslatter-u - s informacemi o lepším pochopení tréninku a speciálnimi ponukami, které nikdy jinde nejsou",
  ...TEXTOVE.map(([stlpec]) => stlpec),
]);

export function prevezmi(surovy: StaryRiadok): PrevzataAnamneza {
  const r = zrovnaj(surovy);
  const o: Record<string, unknown> = {};

  // ── výška a váha: len keď to naozaj je číslo ──
  const vyska = cislo(text(r, "Výška"), 120, 220);
  const vaha = cislo(text(r, "Váha"), 35, 200);
  if (vyska) o.vyska = vyska;
  if (vaha) o.vaha = vaha;

  /**
   * HLAVNÁ OBTIAŽ SA HĽADÁ V TROCH STĹPCOCH.
   *
   * Formulár sa menil a Google zapisuje staré odpovede podľa dnešného
   * poradia, takže obtiaž z roku 2025 sedí v stĺpci „Výška" a z jari 2026
   * v „Váha". Nečíselná hodnota v týchto stĺpcoch je preto text obtiaže,
   * nie miera.
   */
  const obtiz = [
    text(r, "Popište hlavní obtíž, která vás přivedla k nám — co vás trápí, jak dlouho to trvá?"),
    jeCislo(text(r, "Výška")) ? "" : text(r, "Výška"),
    jeCislo(text(r, "Váha")) ? "" : text(r, "Váha"),
  ].filter(Boolean);
  if (obtiz.length) o.obtiz = obtiz.join(" · ");

  for (const [stlpec, id] of TEXTOVE) {
    const v = text(r, stlpec);
    if (v) o[id] = v;
  }

  // ── voľby: preberá sa len presná zhoda s dnešnou ponukou ──
  const tehotna = zPonuky(text(r, "Jste těhotná?"), ["Ano", "Ne"]);
  if (tehotna) o.tehotna = tehotna;
  const tehotenstvo = [text(r, "Kolikaty trimestr?"), text(r, "Jaký je zatím průběh?")].filter(Boolean);
  if (tehotenstvo.length) o.tehotenstvo = tehotenstvo.join(" · ");

  const trener = zPonuky(text(r, "Měli jste v minulosti trenéra?"), ["Ano", "Ne"]);
  if (trener) o.trener = trener;

  const poloha = zPonuky(text(r, "Pracujete více vsedě, ve stoje nebo je práce pohybová/variabilní?"),
    ["Převážně vsedě", "Převážně ve stoje", "Pohybová / variabilní", "Kombinace"]);
  if (poloha) o.poloha = poloha;

  const stres = cislo(text(r, "Do jaké míry je vaše práce stresující ?"), 0, 10);
  if (stres !== null) o.stres = stres;

  // ── odkiaľ prišiel; za bodkočiarkou býva meno odporúčateľa ──
  const zdrojSurovy = text(r, "Jak jste se o nás dozvěděli?");
  if (zdrojSurovy) {
    const [prvy, ...zvysok] = zdrojSurovy.split(";").map((x) => x.trim()).filter(Boolean);
    const zdroj = ZDROJ_ZO_STAREHO[(prvy || "").toLowerCase()];
    if (zdroj) {
      o.zdroj = zdroj;
      if (zdroj === "Doporučení" && zvysok.length) o.zdroj_kto = zvysok.join(", ");
    }
  }

  /**
   * ARCHÍV — CELÝ PÔVODNÝ RIADOK.
   *
   * Nie je to poistka, je to obsah: „ochotní obetovať", stará ponuka cieľov,
   * intenzita bolesti bez miesta a sedem nepomenovaných stĺpcov z neskorších
   * úprav formulára v dnešnej anamnéze otázku nemajú. Bez archívu by sa
   * stratili a nikto by to nezistil.
   */
  const prelozene = new Set([...PRELOZENE].map(kluc));
  const archiv: [string, string][] = [];
  for (const [stlpec, hodnota] of Object.entries(surovy || {})) {
    const v = String(hodnota ?? "").trim();
    if (!v || prelozene.has(kluc(stlpec))) continue;
    archiv.push([stlpec.replace(/\s+/g, " ").trim() || "(bez názvu)", v]);
  }
  const kedy = naIso(text(r, "Časová pečiatka"), text(r, "Dnešní datum"));
  if (archiv.length) o._archiv = { kedy, polozky: archiv };

  // ── doklad o súhlase ──
  const ano = (s: string) => text(r, s).toLowerCase() === "ano";
  const podmienky = ano("Souhlasím s obchodními podmínkami");
  const gdpr = ano("Souhlasím se zpracováním osobních údajů");
  const suhlasy = podmienky || gdpr ? {
    podmienky: { dano: podmienky },
    // Starý formulár sa na zdravotné údaje výslovne nepýtal — a doklad
    // o súhlase má hovoriť, čo naozaj odklepli, nie čo by sa nám hodilo.
    gdpr: { dano: gdpr, zdravotneUdaje: false, fotky: false },
    newsletter: ano("Souhlasím ze zasilaním newslatter-u - s informacemi o lepším pochopení tréninku a speciálnimi ponukami, které nikdy jinde nejsou"),
    kedy,
    zdroj: "Google Forms",
  } : null;

  return { odpovede: o, suhlasy, kedy };
}
