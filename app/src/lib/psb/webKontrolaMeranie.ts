import type { NalezKontroly } from "./webKontrola";
import { dnesPraha, posunDen } from "./cas";

/**
 * Bod 4 nočnej kontroly webu — MERANIE NEMLČÍ.
 *
 * PREČO TO VZNIKLO
 *
 * Body 1 a 3 odpovedajú na otázku „dá sa formulár odoslať?" tak, že stránku
 * prečítajú a syntetický dopyt pretlačia celou cestou. To je silné, ale slepé
 * voči jednej veci: čo sa stane ŽIVÉMU človeku na jeho prehliadači. Od 23. 9.
 * do 7. 10. 2026 plugin odmietal test postury na skrytom poli a jediný, kto to
 * videl, bol návštevník, ktorý potom odišiel.
 *
 * Od 30. 9. 2026 web do GA4 hlási štyri udalosti (cta_formular, formular_start,
 * formular_odoslany, formular_zlyhal). Toto sú oči na ten istý lievik zvonku:
 * keď niekomu odoslanie padne, je to riadok v GA4 ešte v ten deň.
 *
 * JADRO BODU 4: TICHO SA NESMIE ČÍTAŤ AKO ÚSPECH
 *
 * Nula zlyhaní môže znamenať dve veci — nikomu to nepadlo, alebo sa meranie
 * pokazilo (prestavba témy vymazala js/formulare.js a nikto si to nevšimol).
 * Sú na nerozoznanie, kým sa nepriloží druhé číslo: návštevy. Preto modul
 * nikdy nehlási „v poriadku" z toho, že nič neprišlo — vtedy hlási „neviem".
 *
 * A platí to aj O ÚROVEŇ NIŽŠIE, po udalostiach: nula odoslaní pri štyridsiatich
 * klikoch nie je „v poriadku“, lebo kliky sa posielajú z odkazu, kým odoslanie
 * z formulára. Súčet všetkých štyroch udalostí by svietil zeleno nad tým istým
 * tvarom poruchy, pre ktorý tento bod vznikol.
 *
 * A O ÚROVEŇ EŠTE NIŽŠIE: nerozhoduje SÚČET za okno, ale VEK poslednej
 * udalosti. Súčet za sedem dní drží riadok zeleno ešte šesť dní po tom, čo sa
 * most rozbil — jeden začatý formulár z prvého dňa okna prehlasuje šesť dní
 * ticha. To je presne ten tvar poruchy, pre ktorý bod 4 vznikol, len rozložený
 * v čase; preto „v poriadku“ platí len vtedy, keď udalosť z formulára prišla
 * v posledný deň okna alebo v ten pred ním.
 *
 * ČO TU NIE JE A PREČO
 *
 * Nie je tu sieť ani token. Rozhodovanie musí byť otestovateľné na vstupoch,
 * ktoré sa v živej GA4 stanú raz za rok (prázdna odpoveď, chýbajúci rozmer,
 * nula) — s volaním GA4 vo vnútri by sa tie prípady testovať nedali.
 * Sťahovanie je v `webKontrolaMeranie.server.ts`.
 */

/** Udalosti, ktoré téma psb-spready posiela z js/formulare.js. */
export const UDALOSTI = ["cta_formular", "formular_start", "formular_odoslany", "formular_zlyhal"] as const;
export type Udalost = (typeof UDALOSTI)[number];

export type UdalostRiadok = {
  /** Meno udalosti; iné než tie štyri sa ignorujú. */
  udalost: string;
  /** Deň v tvare RRRR-MM-DD. */
  den: string;
  /** `pagePath`, alebo prázdne, keď ho GA4 nedala. */
  stranka: string;
  /** Parameter `duvod` pri zlyhaní; prázdny, kým rozmer nie je v GA4 registrovaný. */
  duvod: string;
  /** Parameter `pole` (ktoré pole plugin odmietol); od 7. 10. 2026, dtto. */
  pole: string;
  pocet: number;
};

export type MeranieData = {
  /** Udalosti za okno kontroly. Čo je mimo okna, si funkcia odfiltruje sama. */
  udalosti: UdalostRiadok[];
  /** Návštevy po dňoch. Bez nich sa ticho v udalostiach nedá vyhodnotiť. */
  navstevy: { den: string; pocet: number }[];
  /**
   * Rozmery, ktoré sa prečítať nedali — holé mená („duvod", „pole", „stranka").
   * K 7. 10. 2026 nie sú `duvod` ani `pole` v GA4 registrované ako vlastné
   * rozmery, takže dopyt na ne vráti HTTP 400. To nie je chyba webu a kontrola
   * na tom nesmie spadnúť — len to povie v detaile a pracuje s tým, čo má.
   */
  chybajuceRozmery: string[];
  /**
   * Prečo sa nedali prečítať NÁVŠTEVY (druhý dopyt). Prázdne = prečítali sa.
   *
   * Je to vlastné pole, nie ďalšia značka v `chybajuceRozmery`: tam patria
   * mená rozmerov, ktoré GA4 nepozná, kým toto je stav druhého dopytu. Dve
   * veci v jednom poli znamenali, že sa dôvod nemal kam zapísať a zahodil sa
   * — a holé „návštevy sa prečítať nedali“ zastaví pátranie rovnako ako
   * „HTTP 400“. Veta „GA4 odmietla dopyt (HTTP 429): Exhausted property
   * tokens“ naproti tomu povie, že sa má o hodinu skúsiť znova.
   */
  navstevyChyba?: string;
  /** Prečo dáta neprišli vôbec. Prázdne = prišli (hoci možno nulové). */
  chyba: string;
};

export type Pocty = { cta: number; start: number; odoslany: number; zlyhal: number; spolu: number };

/** „20261006" → „2026-10-06". Prázdny reťazec pri čomkoľvek inom. */
export const denZGa4 = (v: string): string =>
  /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

const cislo = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** Odpoveď `runReport`. Hlavičky sú tu zámerne — viď `udalostiZGa4`. */
export type Ga4Odpoved = {
  dimensionHeaders?: { name?: string }[];
  metricHeaders?: { name?: string }[];
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
};

const pole = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const polozka = (v: unknown, k: string): unknown => (v && typeof v === "object" ? Reflect.get(v, k) : undefined);
const text = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/**
 * Rozobratá odpoveď GA4 z `JSON.parse`.
 *
 * Prečo nie `as Ga4Odpoved`: pretypovanie by umlčalo kontrolu typov nad
 * dátami zvonku — a stačí, aby Google zmenil tvar odpovede, a appka by čítala
 * `undefined.value` a spadla na niečom, čo sa dá len prečítať zle. Tu sa
 * z každej hodnoty vyberie to, čo z nej má byť, a nič iné sa nepredstiera.
 */
export function odpovedZJson(j: unknown): Ga4Odpoved {
  return {
    dimensionHeaders: pole(polozka(j, "dimensionHeaders")).map((h) => ({ name: text(polozka(h, "name")) })),
    metricHeaders: pole(polozka(j, "metricHeaders")).map((h) => ({ name: text(polozka(h, "name")) })),
    rows: pole(polozka(j, "rows")).map((r) => ({
      dimensionValues: pole(polozka(r, "dimensionValues")).map((d) => ({ value: text(polozka(d, "value")) })),
      metricValues: pole(polozka(r, "metricValues")).map((m) => ({ value: text(polozka(m, "value")) })),
    })),
  };
}

/** Meno rozmeru → jeho poradie v riadku. */
const hlavicky = (o: Ga4Odpoved): Record<string, number> => {
  const m: Record<string, number> = {};
  (o.dimensionHeaders || []).forEach((h, i) => { if (h?.name) m[h.name] = i; });
  return m;
};

const hodnota = (r: { dimensionValues?: { value?: string }[] }, i: number | undefined): string =>
  i === undefined ? "" : String(r.dimensionValues?.[i]?.value || "").trim();

/**
 * Riadky udalostí z odpovede GA4.
 *
 * Číta sa podľa MIEN rozmerov v hlavičke, nie podľa poradia, v akom sa dopyt
 * poslal. Sťahovanie skúša viac zostáv rozmerov (neregistrovaný `duvod` vráti
 * HTTP 400 a musí sa vypustiť), takže `pagePath` je raz tretie a raz piate.
 * Pevné indexy by po takom ústupe ticho čítali deň ako dôvod.
 */
export function udalostiZGa4(o: Ga4Odpoved): UdalostRiadok[] {
  const h = hlavicky(o);
  return (o.rows || [])
    .map((r) => ({
      udalost: hodnota(r, h.eventName),
      den: denZGa4(hodnota(r, h.date)),
      stranka: hodnota(r, h.pagePath),
      duvod: hodnota(r, h["customEvent:duvod"]),
      pole: hodnota(r, h["customEvent:pole"]),
      pocet: cislo(r.metricValues?.[0]?.value),
    }))
    .filter((r) => !!r.udalost && !!r.den);
}

/** Návštevy po dňoch (rozmer `date`, prvá metrika). */
export function navstevyZGa4(o: Ga4Odpoved): { den: string; pocet: number }[] {
  const h = hlavicky(o);
  return (o.rows || [])
    .map((r) => ({ den: denZGa4(hodnota(r, h.date)), pocet: cislo(r.metricValues?.[0]?.value) }))
    .filter((r) => !!r.den);
}

/** Súčty po udalostiach. Riadky s nulou sa sčítajú ako nula, nie ako výskyt. */
export function pocty(riadky: UdalostRiadok[]): Pocty {
  const p: Pocty = { cta: 0, start: 0, odoslany: 0, zlyhal: 0, spolu: 0 };
  for (const r of riadky) {
    const n = cislo(r.pocet);
    if (n <= 0) continue;
    if (r.udalost === "cta_formular") p.cta += n;
    else if (r.udalost === "formular_start") p.start += n;
    else if (r.udalost === "formular_odoslany") p.odoslany += n;
    else if (r.udalost === "formular_zlyhal") p.zlyhal += n;
    else continue;
    p.spolu += n;
  }
  return p;
}

/** Riadky v okne `od`–`do` (oba dni vrátane). Deň bez dátumu von. */
const vOkne = <T extends { den: string }>(r: T[], od: string, do_: string): T[] =>
  r.filter((x) => {
    const d = denZGa4(String(x.den || ""));
    return !!d && d >= od && d <= do_;
  });

const KDE_NEVIEM = "(stránku GA4 nedala)";

/**
 * Zlyhania zoskupené po stránkach — človek sa najprv pýta „kde", nie „koľko".
 *
 * Dôvod aj odmietnuté pole sa pridávajú, len keď naozaj prišli. Vypísať
 * „dôvod: —" by vyzeralo ako zistenie, hoci je to len neregistrovaný rozmer.
 */
export function zlyhaniaPoStrankach(riadky: UdalostRiadok[]): { stranka: string; pocet: number; dovody: string[]; polia: string[] }[] {
  const mapa = new Map<string, { stranka: string; pocet: number; dovody: Set<string>; polia: Set<string> }>();
  for (const r of riadky) {
    if (r.udalost !== "formular_zlyhal") continue;
    const n = cislo(r.pocet);
    if (n <= 0) continue;
    const kde = String(r.stranka || "").trim() || KDE_NEVIEM;
    const e = mapa.get(kde) || { stranka: kde, pocet: 0, dovody: new Set<string>(), polia: new Set<string>() };
    e.pocet += n;
    const d = String(r.duvod || "").trim();
    if (d && d !== "(not set)") e.dovody.add(d);
    const p = String(r.pole || "").trim();
    if (p && p !== "(not set)") e.polia.add(p);
    mapa.set(kde, e);
  }
  return [...mapa.values()]
    .map((e) => ({ stranka: e.stranka, pocet: e.pocet, dovody: [...e.dovody], polia: [...e.polia] }))
    .sort((a, b) => b.pocet - a.pocet || a.stranka.localeCompare(b.stranka));
}

/**
 * Zlyhania po dňoch, NAJNOVŠÍ DEŇ PRVÝ.
 *
 * Riadok sa súdi nad celým oknom, takže musí povedať, kedy sa to dialo —
 * „za týždeň 80 zlyhaní“ bez dní nepovie, či je porucha živá alebo doznela
 * v nedeľu. Prvý prvok je zároveň odpoveď na „naposledy kedy“, takže sa deň
 * najnovšieho zlyhania nemusí hľadať druhým prechodom.
 */
export function zlyhaniaPoDnoch(riadky: UdalostRiadok[]): { den: string; pocet: number }[] {
  const mapa = new Map<string, number>();
  for (const r of riadky) {
    if (r.udalost !== "formular_zlyhal") continue;
    const n = cislo(r.pocet);
    if (n <= 0) continue;
    const den = denZGa4(String(r.den || ""));
    if (!den) continue;
    mapa.set(den, (mapa.get(den) || 0) + n);
  }
  return [...mapa.entries()].map(([den, pocet]) => ({ den, pocet })).sort((a, b) => b.den.localeCompare(a.den));
}

/** Udalosti, ktoré visia na FORMULÁRI a na moste — `cta_formular` je z odkazu. */
const UDALOSTI_FORMULARA: string[] = ["formular_start", "formular_odoslany", "formular_zlyhal"];

/**
 * Koľko posledných dní okna musí niesť udalosť z formulára, aby riadok smel
 * povedať „v poriadku“.
 *
 * Dva dni, nie jeden: nikto nemusí v nedeľu otvoriť formulár a riadok, ktorý
 * svieti aj vtedy, keď je všetko v poriadku, sa prestane čítať. A nie celé
 * okno (teda súčet, ako to bolo pôvodne): septembrová porucha trvala dva
 * týždne a sedemdňová tolerancia by ju prepustila takmer celú — zmysel bodu 4
 * je povedať to v ten istý týždeň, nie po ňom.
 */
const DNI_TICHA = 2;

const vetaOChybajucich = (ch: string[]): string => {
  const m = ch.filter((x) => x === "duvod" || x === "pole");
  if (!m.length) return "";
  return m.length === 2
    ? " GA4 nemá registrované vlastné rozmery duvod ani pole, takže prečo plugin odoslanie odmietol sa odtiaľ prečítať nedá — vidno len stránku; zaregistruj ich v GA4 → Vlastné definície"
    : ` GA4 nemá registrovaný vlastný rozmer ${m[0]}, takže táto časť v detaile chýba — zaregistruj ho v GA4 → Vlastné definície`;
};

const kusy = (p: Pocty): string =>
  `${p.cta} klikov na formulár, ${p.start} začatých, ${p.odoslany} odoslaných, ${p.zlyhal} zlyhaných`;

/**
 * Dve otázky, dva riadky, oba s pevným kľúčom.
 *
 * Prečo nie jeden riadok: podľa `kluc` sa v tabuľke `web_kontroly` číta
 * „odkedy to nefunguje". Keby zlyhania aj mlčanie merania zdieľali jeden
 * kľúč, história by vedela len to, že „niečo s meraním", a presne to sa
 * 7. 10. 2026 zisťovalo najťažšie. Prečo nie tri (s riadkom o spojení na
 * GA4): dôvod, prečo dáta neprišli, je v detaile oboch riadkov a tretí
 * riadok by ho len zopakoval — register nesmie svietiť celý.
 *
 * `dnes` je pražský deň; GA4 aj Jerry počítajú „včera" podľa Prahy, nie UTC.
 */
export function skontrolujMeranie(d: MeranieData, dnes: string = dnesPraha()): NalezKontroly[] {
  const vcera = posunDen(dnes, -1);
  const od = posunDen(dnes, -7);

  const zlyhaniaNalez = (stav: NalezKontroly["stav"], detail: string): NalezKontroly =>
    ({ kluc: "meranie:zlyhania", nazov: "Zlyhané odoslania formulárov (7 dní)", stav, detail });
  const tichoNalez = (stav: NalezKontroly["stav"], detail: string): NalezKontroly =>
    ({ kluc: "meranie:ticho", nazov: "Meranie formulárov nemlčí", stav, detail });

  // Dáta vôbec neprišli. Prázdna odpoveď nie je dôkaz, že je ticho na webe —
  // je dôkaz, že nevieme. Preto varovanie s dôvodom, nikdy nie „ok".
  if (d.chyba) {
    const dovod = d.chyba.slice(0, 300);
    return [
      zlyhaniaNalez("varovanie", `neviem — dáta z GA4 neprišli: ${dovod}. Bez nich sa nedá povedať ani to, že včera nikomu odoslanie nepadlo.`),
      tichoNalez("varovanie", `neviem — dáta z GA4 neprišli: ${dovod}. Kým sa to nespraví, kontrola o meraní lievika nehovorí nič; over servisný účet a property ID v Údajoch.`),
    ];
  }

  const udalostiTyzden = vOkne(d.udalosti, od, vcera);
  const udalostiVcera = udalostiTyzden.filter((r) => denZGa4(r.den) === vcera);
  const tyzden = pocty(udalostiTyzden);
  const vceraP = pocty(udalostiVcera);
  const navstevyTyzden = vOkne(d.navstevy, od, vcera).reduce((s, x) => s + cislo(x.pocet), 0);
  const chybaju = vetaOChybajucich(d.chybajuceRozmery);

  // Dôkazom života merania sú len udalosti z FORMULÁRA, nie súčet všetkých
  // štyroch. `cta_formular` sa posiela z kliku na odkaz (formulare.js riadok
  // 58), kým `formular_start` aj oba výsledky visia na formulári a na moste
  // (riadky 65, 164, 204, 211). Keď sa most rozbije alebo sa zmení značka
  // formulára, kliky chodia ďalej — a súčet by svietil zeleno nad presne tou
  // poruchou, proti ktorej tento bod vznikol. Nula sa nesmie čítať ako
  // úspech ani po udalostiach, nielen v súčte.
  //
  // Prečo sa počíta aj `formular_start` a nie len výsledky: start sedí na tom
  // istom moste, takže dokazuje to isté. Prísnejšie „len odoslané a zlyhané“
  // by z každého týždňa, v ktorom nikto formulár nedopísal, spravilo
  // varovanie — a riadok, ktorý svieti aj vtedy, keď je všetko v poriadku, sa
  // prestane čítať.
  //
  // Súčet sám o SEBE ale o dnešku nehovorí nič (viď hlavička modulu), takže
  // rozhoduje spolu s vekom poslednej takej udalosti nižšie.
  const zFormulara = tyzden.start + tyzden.odoslany + tyzden.zlyhal;

  // Najnovší deň okna, v ktorý prišla udalosť z FORMULÁRA. Dni sa porovnávajú
  // ako reťazce a hranica sa počíta `posunDen`-om — žiadna aritmetika nad
  // milisekundami, ktorá by sa pri prechode na letný čas mýlila o deň.
  const poslednyFormular = udalostiTyzden
    .filter((r) => UDALOSTI_FORMULARA.includes(r.udalost) && cislo(r.pocet) > 0)
    .map((r) => denZGa4(String(r.den || "")))
    .reduce((a, b) => (b > a ? b : a), "");
  const svieziFormular = !!poslednyFormular && poslednyFormular >= posunDen(vcera, -(DNI_TICHA - 1));
  // Čo prišlo PO poslednej udalosti formulára: tým sa ticho dá vyhodnotiť.
  // Kliky na odkaz pri nula začatých formulároch sú ten najsilnejší tvar
  // poruchy (človek na formulár klikol a most o tom nepovedal nič).
  const odvtedy = poslednyFormular ? posunDen(poslednyFormular, 1) : vcera;
  const navstevyPo = vOkne(d.navstevy, odvtedy, vcera).reduce((s, x) => s + cislo(x.pocet), 0);
  const ctaPo = pocty(vOkne(udalostiTyzden, odvtedy, vcera)).cta;

  const nalezy: NalezKontroly[] = [];

  // ── Zlyhania za celé okno ───────────────────────────────────────────────
  //
  // Prečo celé okno a nie „včera“: dáta za sedem dní sú aj tak v ruke a cron
  // v tomto repe vie beh vynechať (kalendár ~1 z 3 pokusov). Vynechaná noc
  // pri včerajšom horizonte znamená, že o zlyhaniach z tých dní neohlási
  // nikto nič — a práve pri tomto riadku je to osemdesiat stratených dopytov,
  // ktoré stáli len ako číslo vo vete zeleného riadku. Prečo nie tretí kľúč
  // („zlyhania za týždeň“): podľa `kluc` sa číta „odkedy to nefunguje“ a dva
  // riadky o tom istom by tú odpoveď rozdelili na polovice.
  //
  // Menovateľ pre „nula zlyhaní“ sú POKUSY o odoslanie (odoslané + zlyhané),
  // nie všetky udalosti. Deväť klikov na odkaz a štyri začaté formuláre sú
  // trinásť udalostí, ale o odoslaní nehovoria nič — a „ani jedno zlyhanie
  // pri 13 udalostiach“ je potom nula z nuly, teda presne to, čo vetva nižšie
  // pri úplnom tichu správne odmieta. Prečo nie striktne len `odoslany`:
  // zlyhanie je tiež pokus a tú vetvu rieši prvá podmienka, takže by sa
  // menovateľ zbytočne líšil od toho, čo sa v detaile vypisuje.
  const pokusyTyzden = tyzden.odoslany + tyzden.zlyhal;

  if (tyzden.zlyhal > 0) {
    const kde = zlyhaniaPoStrankach(udalostiTyzden).map((z) => {
      const casti: string[] = [];
      if (z.dovody.length) casti.push(z.dovody.join(", "));
      if (z.polia.length) casti.push(`pole ${z.polia.join(", ")}`);
      return `${z.stranka} ${z.pocet}×${casti.length ? ` (${casti.join("; ")})` : ""}`;
    });
    const dni = zlyhaniaPoDnoch(udalostiTyzden);
    // „Včera“ zostalo len ako meno dňa: keď v ňom nepadlo nič, riadok musí
    // povedať, prečo svieti nad starším dňom — inak to vyzerá ako chyba
    // kontroly a nasledujúcu noc to niekto umlčí.
    const vceraTicho = vceraP.zlyhal === 0
      ? ` Včera (${vcera}) nepadlo ani jedno; riadok sa preto súdi za celé okno — keby kontrola v tie noci nebežala, o tých zlyhaniach by sa nedozvedel nikto.`
      : "";
    /**
     * ČERSTVÉ ZLYHANIE JE POPLACH, STARÉ UŽ LEN STOPA.
     *
     * Okno je sedemdňové zámerne — keby kontrola jednu noc nebežala, nález
     * sa nesmie stratiť. Lenže červený riadok nad chybou, ktorá sa už dva dni
     * neopakuje a je opravená, svieti ďalších päť dní nad vecou, s ktorou sa
     * nedá nič urobiť; to je presne to, po čom register prestane fungovať
     * (CLAUDE.md: otázka, s ktorou sa už nedá nič robiť, doň nepatrí).
     *
     * Hranica je deň: zlyhanie zo včera alebo z dneška = porucha, ktorá beží
     * TERAZ. Staršie zostáva na obrazovke ako varovanie s vetou, dokedy ho
     * bude vidieť — a keď sa vráti, vráti sa aj červená.
     */
    const poslednyPad = dni[0]?.den || "";
    /*
     * Rozhoduje DÔKAZ, NIE DÁTUM.
     *
     * Prvá verzia merala čerstvosť kalendárom („zlyhanie zo včera") — lenže
     * cron vie beh vynechať a živá porucha spred dvoch dní by sa tým stíšila
     * na varovanie. Preto sa pýtame inak: odoslal sa od posledného zlyhania
     * formulár ÚSPEŠNE? Keď áno, cesta zase funguje a riadok je stopa po
     * oprave. Keď od vtedy nikto neodoslal nič, nevieme nič a svieti červená.
     */
    // Prísne `>`: úspech v ten istý deň môže byť z INÉHO formulára (rozbitý
    // test postury vedľa funkčného kontaktu) a poradie v rámci dňa GA4 nedá.
    const odoslaneOdVtedy = udalostiTyzden
      .filter((r) => r.udalost === "formular_odoslany" && r.den > poslednyPad)
      .reduce((a, r) => a + r.pocet, 0);
    /*
     * JEDEN POKUS NIE JE VÝPADOK.
     *
     * 9. 10. 2026 svietilo „Web nefunguje" nad jediným zlyhaním z 8. 10. —
     * formuláre aj skúšobný dopyt v tú istú noc prešli. `formular_zlyhal`
     * padá aj na preklep v maile a na spam (`formulare.js`), a kým v GA4 nie
     * sú zaregistrované rozmery `duvod`/`pole`, nedá sa to od poruchy
     * rozoznať. Červená preto chce VZOR: aspoň dve zlyhania od posledného
     * úspechu. Porucha z 2. 10. (desať pokusov) by ňou prešla rovnako.
     */
    const posledneOdoslanie = udalostiTyzden
      .filter((r) => r.udalost === "formular_odoslany")
      .reduce((m, r) => (r.den > m ? r.den : m), "");
    const padovOdUspechu = dni.filter((x) => x.den >= posledneOdoslanie).reduce((a, x) => a + x.pocet, 0);
    const cerstve = odoslaneOdVtedy === 0;
    const ojedinele = cerstve && padovOdUspechu < 2;
    const dozvuk = !cerstve
      ? ` Odvtedy sa ${odoslaneOdVtedy}× podarilo odoslať, takže cesta zase funguje a toto je stopa po oprave — riadok zhasne sám, keď ${poslednyPad} vypadne zo sedemdňového okna.`
      : ojedinele
        ? " Od posledného úspechu je to jediné zlyhanie — môže to byť preklep v maile alebo spam, nie porucha; poplach sa spustí pri druhom."
        : "";
    nalezy.push(zlyhaniaNalez(cerstve && !ojedinele ? "chyba" : "varovanie",
      // `dni[0]` tu z definície existuje (zlyhanie v okne má deň, inak by ho
      // `vOkne` nepustilo), ale cez `?.`: táto funkcia beží v nočnej kontrole,
      // v ktorej sú aj body 1 a 3, a výnimka by zhodila zápis všetkých troch.
      /*
       * ZLYHANIE JE POKUS, NIE ČLOVEK.
       *
       * Prvá verzia hovorila „10× nepodarilo odoslať — každé jedno je stratený
       * dopyt". 2. 10. 2026 to bolo DESAŤ POKUSOV JEDNÉHO ČLOVEKA: GA4 hlási
       * v ten deň jediný `formular_start`. Kto dostane chybu, skúša znova —
       * a kontrola, ktorá z toho spraví desať stratených dopytov, preháňa
       * presne to číslo, kvôli ktorému sa na ňu Jerry pozerá. Preto sa vedľa
       * pokusov hovorí, koľko ľudí sa vôbec pustilo do písania.
       */
      `za posledných 7 dní (${od} až ${vcera}) sa ${tyzden.zlyhal}× nepodarilo odoslať formulár${tyzden.start > 0 ? ` (do písania sa pustilo ${tyzden.start}× — jeden človek po chybe skúša znova, takže ľudí je menej než pokusov)` : ""} — a aj jeden stratený dopyt je človek, ktorý videl chybu a odišiel. Naposledy ${dni[0]?.den || vcera}, po dňoch: ${dni.map((x) => `${x.den} ${x.pocet}×`).join(" · ")}. Kde: ${kde.join(" · ")}.${vceraTicho}${dozvuk}${chybaju}`));
  } else if (tyzden.spolu === 0) {
    // Nula zlyhaní z nuly udalostí nie je zistenie. Či je ticho na webe alebo
    // v meraní, patrí druhému riadku a tu by sa to len zdvojilo.
    nalezy.push(zlyhaniaNalez("varovanie",
      `neviem — za posledných 7 dní (${od} až ${vcera}) neprišla z webu ani jedna udalosť formulárov, takže nula zlyhaní nie je dobrá správa; pozri riadok „Meranie formulárov nemlčí“.`));
  } else if (pokusyTyzden === 0) {
    // Udalosti prišli, ale ani jeden človek sa o odoslanie nepokúsil.
    // „Ani jedno zlyhanie“ by tu bola nula z nuly pokusov.
    nalezy.push(zlyhaniaNalez("varovanie",
      `neviem — za posledných 7 dní (${od} až ${vcera}) sa o odoslanie formulára nikto ani nepokúsil, takže nula zlyhaní nič nedokazuje: ${kusy(tyzden)}.${zFormulara > 0 ? "" : " A boli to len kliky na odkaz — či sa meria samotný formulár, povie riadok „Meranie formulárov nemlčí“."}`));
  } else {
    nalezy.push(zlyhaniaNalez("ok",
      `za posledných 7 dní (${od} až ${vcera}) ani jedno zlyhanie pri ${pokusyTyzden} pokusoch o odoslanie (z ${tyzden.spolu} udalostí): ${kusy(tyzden)}.`));
  }

  // ── Mlčí meranie? ───────────────────────────────────────────────────────
  //
  // Keď sa nepodarilo prečítať návštevy, nula návštev je chýbajúci údaj, nie
  // prázdny web — a bez nich sa ticho v udalostiach vyhodnotiť nedá.
  const navstevyNezname = !!d.navstevyChyba;
  const navstevyDovod = String(d.navstevyChyba || "").slice(0, 300);
  const kdeNavstevy = navstevyNezname
    ? `(návštevy sa z GA4 tentoraz prečítať nedali: ${navstevyDovod})`
    : `pri ${navstevyTyzden} návštevách`;

  if (svieziFormular) {
    nalezy.push(tichoNalez("ok",
      `za posledných 7 dní (${od} až ${vcera}) ${tyzden.spolu} udalostí formulárov ${kdeNavstevy}: ${kusy(tyzden)}. Posledná udalosť z formulára ${poslednyFormular}.`));
  } else if (poslednyFormular && !navstevyNezname && navstevyPo === 0 && ctaPo === 0) {
    // Udalosti z formulára prestali chodiť, ale odvtedy nikto na web neprišiel
    // — ticho nemá z čoho vzniknúť a porucha sa z toho tvrdiť nedá. Prázdna
    // odpoveď nie je dôkaz ani tu, preto „neviem“, nie „v poriadku“.
    nalezy.push(tichoNalez("varovanie",
      `neviem — posledná udalosť z formulára prišla ${poslednyFormular} a odvtedy web nemal ani jednu návštevu (okno ${od} až ${vcera}). Či mlčí web alebo meranie, sa z toho povedať nedá; keď návštevy chodiť začnú a udalosti nie, tento riadok to povie.`));
  } else if (poslednyFormular) {
    // JADRO OPRAVY: riadok sa nesúdi zo súčtu za okno, ale z veku poslednej
    // udalosti. Takto vyzerá rozbitý most od prvého dňa, nie až keď zo
    // sedemdňového súčtu vypadne aj posledná stará udalosť.
    nalezy.push(tichoNalez("varovanie",
      `za posledných 7 dní (${od} až ${vcera}) chodili udalosti z formulára naposledy ${poslednyFormular} a odvtedy ani jedna. Medzitým prišlo ${ctaPo} klikov na odkaz ${navstevyNezname ? `(návštevy sa z GA4 tentoraz prečítať nedali: ${navstevyDovod})` : `pri ${navstevyPo} návštevách`}. Najčastejšia príčina je rozbitý most (js/formulare.js) alebo zmenená značka formulára. Kým to platí, o zlyhaniach formulárov sa nedozvieme — a takto vyzerali aj tie dva septembrové týždne, keď sa test postury nedal odoslať.`));
  } else if (tyzden.cta > 0) {
    nalezy.push(tichoNalez("varovanie",
      `za posledných 7 dní (${od} až ${vcera}) prišlo ${tyzden.cta} klikov na formulár ${kdeNavstevy}, ale ani jeden začatý, odoslaný či zlyhaný formulár — meria sa teda len kliknutie na odkaz, nie samotný formulár. Najčastejšia príčina je rozbitý most (js/formulare.js) alebo zmenená značka formulára. Kým to platí, o zlyhaniach formulárov sa nedozvieme — a takto vyzerali aj tie dva septembrové týždne, keď sa test postury nedal odoslať.`));
  } else if (navstevyNezname) {
    nalezy.push(tichoNalez("varovanie",
      `neviem — za posledných 7 dní (${od} až ${vcera}) neprišla ani jedna udalosť formulárov a návštevy sa z GA4 prečítať nedali: ${navstevyDovod}. Nedá sa teda povedať, či je ticho na webe alebo v meraní. Pozri dopyt na návštevy (metrika sessions).`));
  } else if (navstevyTyzden > 0) {
    // Toto je jadro bodu 4. Web má prevádzku, ale lievik nehlási nič — to je
    // takmer vždy pokazené meranie, nie dva týždne bez jediného kliku.
    nalezy.push(tichoNalez("varovanie",
      `za posledných 7 dní (${od} až ${vcera}) má web ${navstevyTyzden} návštev, ale neprišla ani jedna z udalostí ${UDALOSTI.join(", ")} — pravdepodobne sa pokazilo meranie, nie že nikto neklikol. Najčastejšia príčina: prestavba témy vymazala js/formulare.js alebo sa prestal načítavať. Kým to platí, o zlyhaniach formulárov sa nedozvieme.`));
  } else {
    nalezy.push(tichoNalez("varovanie",
      `neviem — GA4 za posledných 7 dní (${od} až ${vcera}) nevrátila ani návštevy, ani udalosti formulárov. To nie je dôkaz, že web je v poriadku: skôr to vyzerá na nesprávne property ID alebo odobraný prístup servisného účtu.`));
  }

  return nalezy;
}
