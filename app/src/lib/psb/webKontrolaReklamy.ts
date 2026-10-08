/**
 * Kontrola webu — bod 5: reklama má kam viesť.
 *
 * PREČO TO VZNIKLO
 *
 * Na Meta reklamy ide ~300 Kč denne a vedú na konkrétnu adresu na
 * prosapiens.cz. Keby sa tá stránka premenovala, prestala sa načítavať alebo
 * z nej zmizol formulár, kampane by ďalej platili za kliky do prázdna a
 * nikto by to nevedel — výdavok sa nezmení a Ads Manager hlási kliky, nie
 * to, čo človek na druhej strane uvidel. Rovnako tiché je, keď z odkazu
 * vypadnú UTM značky: dopyt príde, ale GA4 ho započíta ako priamu návštevu,
 * takže platená cesta vyzerá drahšie a organická lepšie, než aká je.
 *
 * To isté sa už raz stalo na druhej ceste k dopytu: test postury sa od
 * 23. 9. do 7. 10. 2026 nedal odoslať a zistilo sa to až ručným pokusom.
 *
 * ČO TU NIE JE A PREČO
 *
 * Nie je tu sťahovanie z Mety ani čítanie z mkt_reklamy/mkt_kampane. Hlavná
 * funkcia dostane reklamy už stiahnuté (`skontrolujReklamy`), aby sa dala
 * otestovať bez siete a bez tokenu; sťahovanie stránok je vedľa v
 * `stiahniStrankyReklam`, ktorá dostáva `fetch` ako parameter z tej istej
 * príčiny.
 *
 * Nie je tu prehliadač. Stránka sa číta ako text — na otázku „načíta sa a je
 * na nej formulár?“ to stačí. Otázka „preklikne sa tam človek?“ patrí do
 * merania lievika (GA4), nie sem.
 *
 * Nie je tu druhá hranica veľkosti stránky ani druhé sťahovanie. Oboje má
 * bod 2 (`webKontrolaStranky`) a bod 5 ho volá — dve kópie toho istého
 * pravidla si o jednej stránke v jednom behu protirečili.
 *
 * ČO VOLAJÚCI MUSÍ DOPLNIŤ
 *
 * Pre každú reklamu: `nazov` (Meta ad name), `stav` (stav DORUČOVANIA, pozri
 * odsek nižšie), `odkaz` (cieľová adresa z kreatívy —
 * object_story_spec.link_data.link alebo asset_feed_spec) a nepovinne `utm`
 * (url_tags, ktoré Meta pripojí k odkazu až pri kliku). Nepovinné `id` je id
 * reklamy z Mety; keď je, drží kľúč riadku aj pri premenovaní reklamy.
 *
 * `stav` JE STAV DORUČOVANIA, NIE PREPÍNAČ KAMPANE
 *
 * Patrí doň jedno z dvoch a nič iné: hodnota stĺpca `mkt_kampane.stav_sad`
 * (v DB sú to doslova `bezi` | `skoncila` | `pozastavena` | `bez-sad`), alebo
 * výsledok `stavDorucovania` z `kampanPlan.ts` preložený na ACTIVE/PAUSED.
 * `jeBeziaca` pozná oba tvary, aby volajúci nemusel hádať, ktorý z nich je
 * ten správny — a aby sa z poslušného prečítania `stav_sad` nestalo vypnutie
 * celého bodu 5.
 *
 * `mkt_kampane.stav` (prepínač kampane) ani surový `effective_status` sady sem
 * NEPATRIA. Meta nechá „ACTIVE“ aj na sade, ktorej termín dávno uplynul —
 * 19. 8. 2026 malo takú sadu 32 kampaní a výdavok bol nula. Kontrola by na nich
 * hlásila 404 a chýbajúce formuláre, hoci nestoja ani korunu, a veta „beží
 * 5 reklám“ by tvrdila výdavok, ktorý neexistuje. Kto má po ruke len surové
 * sady z Mety, nech si stav vyrobí `jeBeziacouPodlaSad` — tá sa pýta aj na
 * `end_time`, ako `stavDorucovania`, ktoré sa na to už raz nachytalo.
 */

import { stavDorucovania } from "./kampanPlan";
import { slug } from "./utm";
import type { NalezKontroly } from "./webKontrola";
import { DNO_BAJTOV, type Nacitaj, type OdpovedStranky, stiahniStranku } from "./webKontrolaStranky";

/**
 * Sťahovanie je TO ISTÉ ako v bode 2 (`webKontrolaStranky`), nie vlastné.
 *
 * Do 8. 10. 2026 tu stála druhá kópia: vlastný typ `Nacitaj`, vlastná
 * hlavička user-agent (znak po znak tá istá), vlastný `TextEncoder`, vlastná
 * ukážka tela — a hlavne VLASTNÁ spodná hranica veľkosti (500 bajtov) vedľa
 * tej v bode 2 (2 kB). O jednej stránke s 1 200 bajtami tak jeden riadok
 * tabuľky hlásil chybu a druhý „v poriadku“; dva riadky o jednej veci, ktoré
 * si protirečia, nezrušia len jeden z nich — zrušia dôveru v oba.
 *
 * Tu zostáva len to, čo bod 2 nerieši a riešiť nemá: značka na obídenie kešu
 * (reklamnú stránku chceme vidieť čerstvú), zjednotenie adresy na kľúč
 * stránky (`normalizujOdkaz`), formulár v tele a druhý časový limit
 * (`sLimitom`) — ten je tu preto, že `stiahniStranku` sa spolieha na
 * `AbortSignal`, ktorý podstrčená implementácia `Nacitaj` nemusí uznať.
 */
export type { Nacitaj };

/**
 * UTM značky ako štyri polia, nie `Record<string, string>`.
 *
 * Index do `Record` TypeScript nekontroluje, takže preklep v názve značky by
 * ticho vrátil `undefined` a kontrola by hlásila „chýba“ pri odkaze, v ktorom
 * značka je. Prázdny reťazec znamená „nie je“.
 */
export type UtmZnacky = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
};

/**
 * Čo sa o cieľovej stránke zistilo. Všetko už stiahnuté, bez siete.
 *
 * VŠETKY TRI MERANÉ POLIA SÚ NEPOVINNÉ, a to je oprava, nie pohodlie.
 * Záznam sem nemusí prísť zo `stiahniStrankyReklam` — práve preto je
 * `stranka` pripínateľná ku každej reklame (riadok v DB, odložené meranie,
 * odpoveď iného procesu). Kým boli polia povinné, typ sľuboval čísla, ktoré
 * v dátach z JSONu neboli, všetky brány sa pri `undefined` otvorili a záznam
 * `{"maFormular":false}` skončil ako „ok“ s vetou o „HTTP undefined“.
 * Nepovinné pole si teraz musí každý čitateľ overiť — a keď chýba, hlási
 * „neviem“, nie „v poriadku“.
 */
export type StrankaReklamy = {
  /** HTTP stav; 0 znamená, že odpoveď neprišla vôbec (vtedy je `chyba`). */
  stav?: number;
  /** Veľkosť tela odpovede. 0 pri stave 200 je rozbitá stránka, nie prázdno. */
  bajtov?: number;
  /** V HTML je `form[data-form]` AJ `id="psb-skryte"` — teda cesta k dopytu. */
  maFormular?: boolean;
  /**
   * Adresa, na ktorej sťahovanie skončilo, keď vedie na INÚ stránku (líši sa
   * normalizovaný kľúč, nie len lomka či `www.`) — a bez nášho parametra
   * `kokpit`, aby veta hovorila o adrese, akú vidno v Ads Manageri.
   */
  presmerovanieNa?: string;
  /** Prečo sa stránka nedala stiahnuť (výnimka, časový limit). */
  chyba?: string;
  /** Prvých ~200 znakov odpovede — stavový kód sám nie je stopa. */
  ukazka?: string;
};

export type ReklamaNaKontrolu = {
  /** Id reklamy z Mety. Keď chýba, kľúč riadku sa odvodí z názvu. */
  id?: string;
  nazov: string;
  /** effective_status z Mety: ACTIVE, PAUSED, ARCHIVED, … */
  stav: string;
  /** Cieľová adresa. Prázdna pri boostnutom príspevku bez odkazu. */
  odkaz: string;
  /** Značky, ktoré Meta pripojí sama (url_tags) — objekt alebo dotaz. */
  utm?: UtmZnacky | string | null;
  /** Už stiahnutá cieľová stránka; keď chýba, hľadá sa v mape stránok. */
  stranka?: StrankaReklamy | null;
};

/** Koľko znakov odpovede ide do nálezu. Stavový kód sám nie je stopa. */
const UKAZKA = 200;

/**
 * Naše domény. Formulár sa vyžaduje len na nich: reklama smerovaná na
 * Instagram alebo na cudziu stránku je legitímna a hlásiť na nej chýbajúci
 * `form[data-form]` by bol falošný poplach. Že sa načíta, sa kontroluje aj
 * tam — za klik sa platí rovnako.
 */
const NASE_DOMENY = ["prosapiens.cz"];

/**
 * Reklama, ktorá naozaj beží. Vypnutá reklama na 404 nestojí nič.
 *
 * Uznáva dva tvary toho istého: `ACTIVE` (preložený stav doručovania) aj
 * `bezi` (hodnota, ktorú má v DB `mkt_kampane.stav_sad`). Len `ACTIVE` tu
 * stáť nemôže: volajúci, ktorý prečíta `stav_sad`, by dostal false pri KAŽDEJ
 * reklame, `skontrolujReklamy` by vrátila jediný riadok „žiadna z N reklám
 * nie je zapnutá“ a riadky o stránkach ani o značkách by nevznikli vôbec.
 * Navonok by to vyzeralo ako zámerne pozastavená kampaň — presne to ticho,
 * proti ktorému kontrola je.
 *
 * `skoncila`, `pozastavena` ani `bez-sad` bežiace nie sú; sú to tie isté
 * stavy, len pomenované slovom.
 */
export function jeBeziaca(stav: string): boolean {
  const s = String(stav ?? "").trim().toLowerCase();
  return s === "active" || s === "bezi";
}

/**
 * Beží to podľa SÚROVÝCH sád z Mety? Cesta pre volajúceho, ktorý má
 * `effective_status` a `end_time`, nie `stav_sad`.
 *
 * Nerobí sa to vlastným porovnaním s „ACTIVE“: `stavDorucovania`
 * v `kampanPlan.ts` už vie, že Meta nechá ACTIVE aj na sade s uplynutým
 * koncom, a druhá kópia toho pravidla by sa s ňou raz rozišla — pravidlo
 * „jedna definícia na jednom mieste“ platí aj tu.
 */
export function jeBeziacouPodlaSad(
  sady: { effective_status?: string; end_time?: string }[],
  teraz: Date = new Date(),
): boolean {
  return stavDorucovania(sady, teraz) === "bezi";
}

/**
 * UTM z dotazu („utm_source=meta&utm_medium=paid“).
 *
 * Vlastný parser tu nie je zámerne: `URLSearchParams` zvláda `+`, percentá
 * aj makrá Mety (`{{campaign.name}}`) a vracia `null`, nie `undefined` z
 * indexu do objektu.
 */
/**
 * Nerozbalené makro Mety sa NEPOČÍTA ako vyplnená značka.
 *
 * `utm_campaign={{campaign.name}}` je neprázdna hodnota, takže kontrola
 * „značka chýba" ju prepustí — a v GA4 potom stojí doslovné `{{campaign.name}}`
 * namiesto mena kampane. Platená cesta sa tým pripisuje nesprávne a cena za
 * dopyt je nepravdivá, teda presne to, čomu má tento riadok zabrániť. Meta
 * makrá rozbaľuje až pri kliku, takže v `url_tags` sú legitímne — ale len
 * v tvare, ktorý pozná; preklep v názve makra sa von nikdy nedostane.
 */
const NEROZBALENE = /\{\{|\}\}|%7B%7B|%7D%7D/i;

export function utmZRetazca(dotaz: string): UtmZnacky {
  const text = String(dotaz ?? "").replace(/^[?&]+/, "");
  const p = new URLSearchParams(text);
  const z = (meno: string): string => {
    const v = (p.get(meno) || "").trim();
    return NEROZBALENE.test(v) ? "" : v;
  };
  return { source: z("utm_source"), medium: z("utm_medium"), campaign: z("utm_campaign"), content: z("utm_content") };
}

/** UTM z celej adresy. Zvláda aj relatívny odkaz („/uvodni-trenink/?utm_…“). */
export function utmZOdkazu(odkaz: string): UtmZnacky {
  const cisty = String(odkaz ?? "").trim();
  if (!cisty) return utmZRetazca("");
  try {
    return utmZRetazca(new URL(cisty).search);
  } catch {
    const i = cisty.indexOf("?");
    return utmZRetazca(i < 0 ? "" : cisty.slice(i + 1));
  }
}

/**
 * Značky reklamy: z odkazu, doplnené o `url_tags`.
 *
 * Zlučuje sa, pretože Meta pripája `url_tags` k odkazu až pri kliku — značka,
 * ktorá je len tam, v odkaze chýba, a napriek tomu sa k človeku dostane.
 * Keby sa čítal len odkaz, kontrola by hlásila chybu tam, kde meranie beží.
 * Odkaz má prednosť: čo je v ňom, dorazí určite.
 */
export function utmReklamy(r: ReklamaNaKontrolu): UtmZnacky {
  const zOdkazu = utmZOdkazu(r.odkaz);
  const zTagov = typeof r.utm === "string" ? utmZRetazca(r.utm) : (r.utm || utmZRetazca(""));
  return {
    source: zOdkazu.source || zTagov.source || "",
    medium: zOdkazu.medium || zTagov.medium || "",
    campaign: zOdkazu.campaign || zTagov.campaign || "",
    content: zOdkazu.content || zTagov.content || "",
  };
}

/**
 * Adresa bez dotazu a bez schémy — identita STRÁNKY, nie odkazu.
 *
 * Dve reklamy na tú istú stránku sa líšia v `utm_content`, ale je to jedna
 * stránka a má byť jeden riadok v tabuľke; preto sa dotaz zahadzuje. Schéma
 * tiež: `http://` na živom webe skončí na `https://`, takže by z jednej
 * stránky robila dva riadky. `www.` sa odstraňuje z tej istej príčiny — a
 * KONCOVÁ LOMKA tiež: WordPress na `/uvodni-trenink` odpovedá 301 na
 * `/uvodni-trenink/` (overené naživo), takže bez tohto by jedna reklama bez
 * lomky znamenala druhý riadok v tabuľke a nález „adresa sa premenovala“ na
 * stránke, ktorú nikto nepremenoval.
 *
 * Kľúč je BEZ koncovej lomky (koreň zostáva „/“). Opačná voľba — všade lomku
 * dopísať — by z adresy súboru (`/sluzby.html/`) vyrobila cestu, ktorá
 * neexistuje, a kľúč v tabuľke čita aj človek.
 *
 * Nerozoberateľná adresa sa vracia, ako prišla — kľúč riadku musí vzniknúť aj
 * z nej, inak sa o práve tej chybnej reklame nikdy nedozvieme.
 */
export function normalizujOdkaz(odkaz: string): string {
  const cisty = String(odkaz ?? "").trim();
  if (!cisty) return "";
  try {
    const u = new URL(cisty);
    const host = u.host.toLowerCase().replace(/^www\./, "");
    const cesta = (u.pathname || "/").replace(/\/+$/, "");
    return `${host}${cesta || "/"}`;
  } catch {
    return cisty;
  }
}

/** Cesta na stránke — do vety pre človeka („/uvodni-trenink/“). */
export function cestaOdkazu(odkaz: string): string {
  const cisty = String(odkaz ?? "").trim();
  if (!cisty) return "";
  try {
    return new URL(cisty).pathname || "/";
  } catch {
    return cisty;
  }
}

/**
 * Stabilný kľúč reklamy.
 *
 * Id z Mety sa nemení ani pri premenovaní reklamy, preto má prednosť. Keď
 * chýba, berie sa názov — ten sa prepísaním zmení a história riadku sa
 * roztrhne, ale to je lepšie než kľúč z poradia v odpovedi, ktoré sa
 * premieša pri každom sťahovaní.
 */
export function klucReklamy(r: ReklamaNaKontrolu): string {
  const id = String(r.id ?? "").trim();
  if (id) return id;
  return slug(r.nazov) || "bez-nazvu";
}

/** Má stránka obe časti cesty k dopytu — vysádzaný formulár aj most na plugin? */
export function maFormularVHtml(html: string): boolean {
  const text = String(html ?? "");
  return /<form[^>]*\bdata-form\b/i.test(text) && text.includes('id="psb-skryte"');
}

export type VolbyStahovania = {
  /** Jednorazová značka v adrese. Bez nej odpovie CDN starou stránkou. */
  znacka?: string;
  ua?: string;
  /**
   * Strop na JEDNU stránku v ms. Dvadsať sekúnd je toľko, koľko má
   * `webKontrolaStranky.ts` — pristávacia stránka mala v septembri LCP 16 s,
   * takže kratší limit by hlásil chybu tam, kde je stránka len pomalá.
   */
  timeoutMs?: number;
};

/**
 * Predvolený strop na jednu stránku. Ten istý ako vo `webKontrolaStranky.ts`
 * — stojí tu znova len preto, že tam je to predvolená hodnota parametra, nie
 * pomenovaná konštanta, a `sLimitom` potrebuje číslo aj do vety pre človeka.
 */
const LIMIT_MS = 20_000;

/** Koľko to je slovami — „do 0 s“ v nálezoch nikomu nepomôže. */
function akDlho(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`;
}

/**
 * Práca s vlastným časovým limitom.
 *
 * `AbortSignal.timeout` sa posiela TIEŽ, ale sám nestačí: prerušenie musí
 * uznať ten, kto sťahuje, a `Nacitaj` je parameter — podstrčená implementácia
 * (test, iný klient, knižnica, ktorá signál ignoruje) by visela ďalej.
 * Vo Workeri to nie je teoretická možnosť: beh by zomrel na limit PRED
 * zápisom do `web_kontroly`, takže by nevznikol ani chybový riadok a kontrola
 * by o sebe mlčala — to isté, čo urobilo sťahovanie dvoch kalendárov naraz.
 * Limit preto drží aj nad `text()`: zaseknúť sa dá aj na čítaní tela.
 */
async function sLimitom<T>(praca: Promise<T>, limitMs: number): Promise<T> {
  let casovac: ReturnType<typeof setTimeout> | undefined;
  // Odmietnutie, ktoré príde po limite, už nikto nečaká. Bez tohto `catch` by
  // z neho bolo neodchytené odmietnutie a padlo by to inde, než kde vzniklo.
  praca.catch(() => {});
  try {
    return await Promise.race([
      praca,
      new Promise<never>((_, zamietni) => {
        casovac = setTimeout(() => zamietni(new Error(`časový limit ${akDlho(limitMs)}`)), limitMs);
      }),
    ]);
  } finally {
    if (casovac !== undefined) clearTimeout(casovac);
  }
}

/**
 * Adresa bez nášho parametra na obídenie kešu.
 *
 * Do vety pre človeka patrí adresa, akú Jerry vidí v Ads Manageri. Keby tam
 * svietilo `?kokpit=kontrola-…`, hľadal by parameter, ktorý v reklame nikdy
 * nebol. Ostatný dotaz (utm) zostáva — ten v odkaze naozaj je.
 */
function bezZnacky(adresa: string): string {
  const cisty = String(adresa ?? "").trim();
  if (!cisty) return "";
  try {
    const u = new URL(cisty);
    u.searchParams.delete("kokpit");
    const dotaz = u.searchParams.toString();
    return `${u.origin}${u.pathname}${dotaz ? `?${dotaz}` : ""}${u.hash}`;
  } catch {
    return cisty;
  }
}

/**
 * Odpoveď bodu 2 preložená na záznam o stránke z reklamy.
 *
 * Čo sa nezmeralo, sa NEDOPLŇUJE nulou: prázdne pole je tu „neviem“ a
 * `nalezStranky` z neho urobí varovanie. Nula by znamenala „stránka vrátila
 * prázdne telo“, čo je tvrdý nález — vymyslel by sa tým dôkaz.
 */
function zaznamZOdpovede(o: OdpovedStranky, kluc: string): StrankaReklamy {
  const z: StrankaReklamy = {
    stav: o.stav,
    bajtov: o.bajtov,
    // Bez tela sa o formulári nedá povedať nič. `false` by tvrdilo, že na
    // stránke nie je — a to je veta, pre ktorú by Jerry išiel opravovať web.
    maFormular: typeof o.telo === "string" ? maFormularVHtml(o.telo) : undefined,
    ukazka: o.ukazka,
  };
  if (o.chyba) z.chyba = o.chyba;
  // Presmerovanie sa hlási LEN keď vedie na inú stránku. Rovnaký kľúč znamená,
  // že sa zmenila len schéma, `www.` alebo koncová lomka — a 301 len na lomku
  // má web na každej adrese bez nej. Preto sa to tu neberie z bodu 2: ten
  // o každom presmerovaní hovorí, lebo nemá kľúč stránky, podľa ktorého by
  // rozlíšil premenovanú adresu od doplnenej lomky.
  const koniec = normalizujOdkaz(o.konecnaUrl || "");
  if (koniec && koniec !== kluc) z.presmerovanieNa = bezZnacky(o.konecnaUrl || "");
  return z;
}

/**
 * Stiahne cieľové stránky BEŽIACICH reklám. Jedna stránka raz, nech na ňu
 * vedie koľkokoľvek reklám.
 *
 * Vypnuté reklamy sa nesťahujú: ich adresa nikoho nestojí peniaze a každé
 * sťahovanie je ďalšia sekunda v nočnom behu.
 *
 * Výsledok je `Map`, nie `Record`: `get()` vracia `undefined`, ktoré typy
 * vidia, kým index do `Record` prepustí preklep ticho.
 */
export async function stiahniStrankyReklam(
  reklamy: ReklamaNaKontrolu[],
  nacitaj: Nacitaj,
  volby: VolbyStahovania = {},
): Promise<Map<string, StrankaReklamy>> {
  const out = new Map<string, StrankaReklamy>();
  const znacka = volby.znacka || String(Date.now());
  const limitMs = volby.timeoutMs && volby.timeoutMs > 0 ? volby.timeoutMs : LIMIT_MS;

  for (const r of reklamy || []) {
    if (!jeBeziaca(r.stav)) continue;
    const odkaz = String(r.odkaz ?? "").trim();
    if (!odkaz) continue;
    const kluc = normalizujOdkaz(odkaz);
    if (!kluc || out.has(kluc)) continue;

    let adresa: string;
    try {
      const u = new URL(odkaz);
      // Hosting aj WP Fastest Cache držia starú stránku hodiny; bez
      // jednorazového parametra sa meria to, čo bolo včera.
      u.searchParams.set("kokpit", `kontrola-${znacka}`);
      adresa = u.toString();
    } catch {
      // Bez `bajtov` a `maFormular`: nič sa nemeralo, tak sa nič netvrdí.
      out.set(kluc, { stav: 0, chyba: "adresa sa nedá rozobrať", ukazka: odkaz.slice(0, UKAZKA) });
      continue;
    }

    try {
      // Druhý limit nad limitom bodu 2: `stiahniStranku` posiela `AbortSignal`,
      // ale prerušenie musí uznať ten, kto sťahuje, a `Nacitaj` je parameter.
      const o = await sLimitom(stiahniStranku(adresa, nacitaj, { ua: volby.ua, timeoutMs: limitMs }), limitMs);
      out.set(kluc, zaznamZOdpovede(o, kluc));
    } catch (e) {
      const dovod = String(e instanceof Error ? e.message : e).slice(0, UKAZKA);
      // Prerušenie je iná správa než chyba siete: „TypeError: fetch failed“
      // posiela hľadať rozbitú adresu, kým stránka len neodpovedala včas.
      const prerusene = /abort|timeout|timed out|časový limit/i.test(dovod);
      out.set(kluc, {
        stav: 0,
        chyba: prerusene ? `odpoveď neprišla do ${akDlho(limitMs)} (${dovod})` : dovod,
      });
    }
  }
  return out;
}

type Stav = NalezKontroly["stav"];

/** Váha stavu. Nie mapa: index do `Record` typy nekontrolujú. */
function vaha(s: Stav): number {
  return s === "chyba" ? 2 : s === "varovanie" ? 1 : 0;
}

/** Horší z dvoch stavov — keď na jeden kľúč sedí viac reklám, rozhoduje najhorší. */
function horsi(a: Stav, b: Stav): Stav {
  return vaha(a) >= vaha(b) ? a : b;
}

function jeNasa(odkaz: string): boolean {
  try {
    const host = new URL(odkaz).host.toLowerCase().replace(/^www\./, "");
    return NASE_DOMENY.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * Počet so správnym tvarom slova („1 reklama“, „3 reklamy“, „5 reklám“).
 * Detail nálezu je veta pre človeka a „3 reklám“ v nej drhne.
 */
function pocet(n: number, tvary: [string, string, string]): string {
  const t = n === 1 ? tvary[0] : n >= 2 && n <= 4 ? tvary[1] : tvary[2];
  return `${n} ${t}`;
}

function mena(reklamy: ReklamaNaKontrolu[]): string {
  const m = reklamy.map((r) => r.nazov || klucReklamy(r));
  return m.length > 3 ? `${m.slice(0, 3).join(", ")} a ďalšie (${m.length})` : m.join(", ");
}

/**
 * Jedna cieľová stránka podľa JEDNÉHO záznamu: načíta sa a dá sa z nej ozvať?
 *
 * Veta je bez zoznamu reklám — ten dopíše `nalezStranky` raz na konci, aby sa
 * pri dvoch rozdielnych záznamoch o jednej stránke neopakoval v riadku dvakrát.
 */
function stavStranky(odkaz: string, cesta: string, s: StrankaReklamy | null | undefined): { stav: Stav; veta: string } {
  if (!s) {
    // Prázdna odpoveď nie je dôkaz: bez stiahnutej stránky sa nedá povedať
    // ani „v poriadku“, ani „rozbité“.
    return { stav: "varovanie", veta: `o stránke ${cesta} Kokpit nemá dáta — nestihla sa stiahnuť, takže sa nedá povedať, či reklama vedie na niečo živé` };
  }
  const kus = s.ukazka ? ` Odpoveď začínala: ${s.ukazka.slice(0, UKAZKA)}` : "";
  if (s.chyba) {
    return { stav: "chyba", veta: `stránka ${cesta} vôbec neodpovedala (${s.chyba}) — platené kliky vedú na stránku, ktorá sa nenačíta.${kus}` };
  }

  // ZÁZNAM BEZ ČÍSEL NIE JE MERANIE. Toto musí stáť PRED všetkými bránami
  // nižšie, lebo každá z nich sa pri `undefined` otvorí: `=== 0` je false,
  // `>= 400` aj `>= 300` je false, `< DNO_BAJTOV` je false — a stránka, o
  // ktorej Kokpit nevie nič, skončila ako „ok“ s vetou o „HTTP undefined“.
  // Typy to nezachytia nikdy úplne: polia sú síce nepovinné, ale záznam sa
  // dá postaviť aj z JSONu (`JSON.parse`), ktorý typom nikto nekontroluje.
  // Vzor je vedľa: `bajtyOdpovede()` v bode 2 vracia `null` a kontrola z toho
  // povie „neviem“, nie „v poriadku“.
  const stav = typeof s.stav === "number" && Number.isFinite(s.stav) ? s.stav : null;
  const bajtov = typeof s.bajtov === "number" && Number.isFinite(s.bajtov) ? s.bajtov : null;
  if (stav === null || bajtov === null) {
    const chybaju = [stav === null ? "HTTP stav" : "", bajtov === null ? "veľkosť odpovede" : ""].filter(Boolean);
    const zname = stav !== null ? `HTTP ${stav}` : bajtov !== null ? `${bajtov} bajtov` : "";
    return {
      stav: "varovanie",
      veta: `o stránke ${cesta} prišiel neúplný záznam — ${chybaju.length > 1 ? "chýbajú" : "chýba"} v ňom ${chybaju.join(" aj ")}${zname ? ` (vie sa len ${zname})` : ""}, takže sa nedá povedať, či sa stránka z reklamy načíta; pusti kontrolu znova a ak sa to zopakuje, over stránku očami`,
    };
  }

  if (stav === 0) {
    return { stav: "chyba", veta: `stránka ${cesta} vôbec neodpovedala a dôvod nie je známy — platené kliky vedú na stránku, ktorá sa nenačíta.${kus}` };
  }
  if (stav >= 400) {
    return { stav: "chyba", veta: `stránka ${cesta} vracia HTTP ${stav} — človek z reklamy ju neuvidí.${kus}` };
  }
  if (stav >= 300) {
    if (!s.presmerovanieNa) {
      // Bez cieľa na inej stránke sa o obsahu nedá povedať nič: 301 len na
      // koncovú lomku (alebo na https) má web na každej takej adrese a je to
      // normálny stav. Preto „neviem“, nie „v poriadku“ ani „chyba“.
      return {
        stav: "varovanie",
        veta: `stránka ${cesta} odpovedala presmerovaním (HTTP ${stav}), ktoré nevedie na inú stránku (líši sa len tvar adresy) alebo cieľ z odpovede nebolo vidieť — Kokpit teda nevie, čo je na stránke; sťahovanie presmerovanie nenasledovalo, over ju očami`,
      };
    }
    return { stav: "chyba", veta: `stránka ${cesta} vracia presmerovanie (HTTP ${stav}) na ${s.presmerovanieNa} — reklama teda nevedie tam, kam si myslíme` };
  }
  if (s.presmerovanieNa) {
    // Sem sa dostane len presmerovanie na INÚ stránku: zhodu v schéme, `www.`
    // a koncovej lomke zrovná `normalizujOdkaz` ešte pri sťahovaní.
    return { stav: "chyba", veta: `reklama vedie na ${cesta}, ale skončí na ${s.presmerovanieNa} — to je iná stránka, takže sa adresa premenovala a kampaň ukazuje na starú` };
  }
  if (bajtov === 0) {
    return { stav: "chyba", veta: `stránka ${cesta} vrátila HTTP ${stav}, ale telo je prázdne (0 bajtov) — návštevník z reklamy vidí bielu obrazovku` };
  }
  if (bajtov < DNO_BAJTOV) {
    // Hranica aj verdikt sú TIE ISTÉ ako v bode 2 (`DNO_BAJTOV`, chyba).
    // Vlastná nižšia hranica tu znamenala, že o jednej 1,2 kB stránke
    // hlásil bod 2 chybu a bod 5 „v poriadku“ — a z dvoch riadkov, ktoré si
    // protirečia, sa nedá vybrať ten pravdivý, dá sa len prestať čítať oba.
    return {
      stav: "chyba",
      veta: `stránka ${cesta} vrátila HTTP ${stav}, ale len ${bajtov} bajtov HTML pri spodnej hranici ${DNO_BAJTOV} — toľko HTML nie je úsporná stránka, ale zástupná stránka WordPressu, fatálna chyba alebo biela obrazovka.${kus}`,
    };
  }
  if (!jeNasa(odkaz)) {
    // Cudziu stránku nesúdime podľa nášho formulára, len či sa načíta.
    return { stav: "ok", veta: `cudzia stránka ${odkaz} sa načíta (HTTP ${stav}, ${bajtov} bajtov); formulár na nej nekontrolujeme` };
  }
  if (typeof s.maFormular !== "boolean") {
    // „Formulár tam nie je“ je veta, pre ktorú by Jerry išiel opravovať web.
    // Keď sa telo neuložilo, netvrdí sa ani to, ani opak.
    return {
      stav: "varovanie",
      veta: `stránka ${cesta} vracia HTTP ${stav} (${bajtov} bajtov), ale v zázname nie je, či je na nej formulár — telo sa neuložilo, tak sa cesta k dopytu neoverila`,
    };
  }
  if (!s.maFormular) {
    return { stav: "chyba", veta: `na stránke ${cesta} nie je formulár (chýba form[data-form] alebo most #psb-skryte) — reklama vedie na stránku, z ktorej sa klient nemá ako ozvať` };
  }
  return { stav: "ok", veta: `stránka ${cesta} vracia HTTP ${stav} (${bajtov} bajtov) a je na nej formulár` };
}

/**
 * Záznamy o jednej stránke zo VŠETKÝCH zdrojov, ktoré ju nesú.
 *
 * Do 8. 10. 2026 sa bral prvý pripnutý (`kto.find((x) => x.stranka)`) a
 * ostatné sa zahodili bez slova: dve bežiace reklamy na tú istú stránku,
 * prvá s HTTP 200 a druhá so 404, dali jediný zelený riadok a štyristovka,
 * ktorá v dátach bola, sa na výstup nedostala vôbec. Zahodiť sa nesmie ani
 * jeden — pri rozpore rozhoduje ten horší, rovnako ako pri značkovaní.
 *
 * Keď nič neprišlo, vracia sa `[null]`, nie prázdny zoznam: „nemám dáta“ je
 * nález (varovanie), prázdny zoznam by bol riadok bez vety.
 */
function zaznamyStranky(kto: ReklamaNaKontrolu[], zMapy: StrankaReklamy | null | undefined): (StrankaReklamy | null)[] {
  const von: StrankaReklamy[] = [];
  for (const r of kto) if (r.stranka) von.push(r.stranka);
  if (zMapy) von.push(zMapy);
  return von.length ? von : [null];
}

/** Jedna cieľová stránka ako riadok tabuľky — zo všetkých záznamov o nej. */
function nalezStranky(odkaz: string, zaznamy: (StrankaReklamy | null)[], kto: ReklamaNaKontrolu[]): { stav: Stav; detail: string } {
  const cesta = cestaOdkazu(odkaz) || odkaz;
  const vedie = `vedie na ňu ${pocet(kto.length, ["reklama", "reklamy", "reklám"])}: ${mena(kto)}`;

  // Toto sa pozná bez siete, tak sa to hlási aj bez stiahnutej stránky.
  let jeAdresa = true;
  try { new URL(odkaz); } catch { jeAdresa = false; }
  if (!jeAdresa) {
    return { stav: "chyba", detail: `cieľ reklamy nie je adresa (${odkaz.slice(0, UKAZKA)}) — klik z nej neskončí na webe a ${vedie}` };
  }

  const vety: { stav: Stav; veta: string }[] = [];
  for (const z of zaznamy.length ? zaznamy : [null]) {
    const v = stavStranky(odkaz, cesta, z);
    // Dva rovnaké závery nie sú rozpor: tri reklamy na jednu stránku nesú to
    // isté meranie a riadok by inak tvrdil, že si zdroje protirečia.
    if (!vety.some((x) => x.stav === v.stav && x.veta === v.veta)) vety.push(v);
  }
  const najhorsi = vety.reduce((a, b) => (vaha(b.stav) > vaha(a.stav) ? b : a));
  if (vety.length === 1) return { stav: najhorsi.stav, detail: `${najhorsi.veta} (${vedie})` };

  const ostatne = vety.filter((v) => v !== najhorsi).map((v) => v.veta);
  return {
    stav: najhorsi.stav,
    detail: `${najhorsi.veta} · POZOR, o tej istej stránke prišli rozdielne záznamy — ${ostatne.length > 1 ? "ďalšie hovoria" : "ďalší hovorí"}: ${ostatne.join(" · ")}; ktorý z nich platí, Kokpit nevie, tak riadok nesie ten horší (${vedie})`,
  };
}

/** Jedna reklama: dá sa jej dopyt priradiť ku kampani? */
function nalezUtm(r: ReklamaNaKontrolu): { stav: Stav; detail: string } {
  const u = utmReklamy(r);
  const cesta = cestaOdkazu(r.odkaz) || r.odkaz;
  const chyba: string[] = [];
  if (!u.campaign) chyba.push("utm_campaign");
  if (!u.source) chyba.push("utm_source");
  if (!u.medium) chyba.push("utm_medium");

  if (chyba.length) {
    // Bez source/medium GA4 zapíše návštevu ako priamu, takže dopyt z platenej
    // reklamy vypadne z platenej cesty celý; bez campaign sa nedá povedať,
    // ktorá kampaň ho priviedla. Oboje robí cenu za dopyt nepravdivou.
    return {
      stav: "chyba",
      detail: `odkazu reklamy ${r.nazov || klucReklamy(r)} na ${cesta} chýba ${chyba.join(" a ")} — dopyt z nej GA4 nepripíše platenej ceste a cena za dopyt bude nepravdivá`,
    };
  }
  if (!u.content) {
    return {
      stav: "varovanie",
      detail: `odkaz reklamy ${r.nazov || klucReklamy(r)} má kampaň ${u.campaign}, ale chýba utm_content — dopyty z viacerých kreatív tej istej kampane sa zlejú do jedného čísla a nedá sa povedať, ktorá kreatíva funguje`,
    };
  }
  return {
    stav: "ok",
    detail: `odkaz na ${cesta} je značkovaný celý: ${u.source} / ${u.medium} / ${u.campaign} / ${u.content}`,
  };
}

/**
 * Hlavná kontrola. Dostane už stiahnuté reklamy (a nepovinne mapu stránok
 * z `stiahniStrankyReklam`), vráti riadky pre tabuľku `web_kontroly`.
 *
 * Kľúče: `reklama:bezi`, `reklama:stranka:<host+cesta>`,
 * `reklama:utm:<id reklamy>`. Vypnuté reklamy sa nekontrolujú vôbec — riadok
 * o nich by svietil bez toho, aby niečo stálo peniaze.
 */
export function skontrolujReklamy(
  reklamy: ReklamaNaKontrolu[],
  stranky: Map<string, StrankaReklamy> = new Map(),
): NalezKontroly[] {
  const vsetky = Array.isArray(reklamy) ? reklamy : [];
  const bezia = vsetky.filter((r) => jeBeziaca(r.stav));
  const sOdkazom = bezia.filter((r) => String(r.odkaz ?? "").trim());
  const out: NalezKontroly[] = [];

  // ── Vedie reklama vôbec na web? ───────────────────────────────────────
  const bezi: NalezKontroly = { kluc: "reklama:bezi", nazov: "Reklama vedie na web", stav: "ok", detail: "" };
  if (!vsetky.length) {
    bezi.stav = "varovanie";
    bezi.detail = "Kokpit nedostal zo Mety ani jednu reklamu — nevie sa, či reklama beží a kam vedie; over sťahovanie kampaní, prázdna odpoveď nie je dôkaz, že je reklama vypnutá";
  } else if (!bezia.length) {
    bezi.stav = "varovanie";
    bezi.detail = `žiadna z ${pocet(vsetky.length, ["reklamy", "reklám", "reklám"])} nie je zapnutá (stavy: ${[...new Set(vsetky.map((r) => String(r.stav || "?").toUpperCase()))].join(", ")}) — ak to nie je zámer, kampaň sa zastavila sama a web nemá kto navštíviť`;
  } else if (!sOdkazom.length) {
    bezi.stav = "varovanie";
    bezi.detail = `beží ${pocet(bezia.length, ["reklama", "reklamy", "reklám"])}, ale ani jedna nemá odkaz na web (${mena(bezia)}) — sú to boosty príspevkov, takže platíme za dosah a nie za dopyt, a cesta z reklamy na formulár neexistuje`;
  } else {
    const kolkoStranok = new Set(sOdkazom.map((r) => normalizujOdkaz(r.odkaz))).size;
    const bezOdkazu = bezia.length - sOdkazom.length;
    bezi.detail = `beží ${pocet(bezia.length, ["reklama", "reklamy", "reklám"])}, z toho ${sOdkazom.length} vedie na ${pocet(kolkoStranok, ["stránku", "stránky", "stránok"])}${bezOdkazu ? `; ${bezOdkazu} bez odkazu (boost príspevku)` : ""}`;
  }
  out.push(bezi);

  // ── Cieľové stránky ───────────────────────────────────────────────────
  const podlaStranky = new Map<string, ReklamaNaKontrolu[]>();
  for (const r of sOdkazom) {
    const kluc = normalizujOdkaz(r.odkaz);
    const zoznam = podlaStranky.get(kluc);
    if (zoznam) zoznam.push(r);
    else podlaStranky.set(kluc, [r]);
  }
  for (const kluc of [...podlaStranky.keys()].sort()) {
    const kto = podlaStranky.get(kluc) || [];
    const prva = kto[0];
    if (!prva) continue;
    // Všetky záznamy o tej stránke, nie prvý: pripnuté k reklamám aj ten
    // z mapy. Pri rozpore rozhodne horší a druhý sa v riadku pomenuje.
    const v = nalezStranky(prva.odkaz, zaznamyStranky(kto, stranky.get(kluc)), kto);
    out.push({ kluc: `reklama:stranka:${kluc}`, nazov: `Stránka z reklamy ${cestaOdkazu(prva.odkaz) || kluc}`, stav: v.stav, detail: v.detail });
  }

  // ── Značkovanie odkazov ───────────────────────────────────────────────
  const podlaReklamy = new Map<string, ReklamaNaKontrolu[]>();
  for (const r of sOdkazom) {
    const kluc = klucReklamy(r);
    const zoznam = podlaReklamy.get(kluc);
    if (zoznam) zoznam.push(r);
    else podlaReklamy.set(kluc, [r]);
  }
  for (const kluc of [...podlaReklamy.keys()].sort()) {
    const kto = podlaReklamy.get(kluc) || [];
    let stav: Stav = "ok";
    const detaily: string[] = [];
    for (const r of kto) {
      const v = nalezUtm(r);
      stav = horsi(stav, v.stav);
      if (!detaily.includes(v.detail)) detaily.push(v.detail);
    }
    const prva = kto[0];
    out.push({
      kluc: `reklama:utm:${kluc}`,
      nazov: `Značkovanie odkazu — ${prva ? prva.nazov || kluc : kluc}`,
      stav,
      detail: detaily.join(" · "),
    });
  }

  return out;
}
