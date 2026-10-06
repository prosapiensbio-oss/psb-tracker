import type { Udalost } from "./klientOsCasu";
import { denVTyzdni } from "./format";
import { nazovProduktu } from "./nazvyProduktov";
import { dnesPraha } from "./cas";
import { KOKPIT_OD } from "./sedeniaZKalendara";
import { CENNIK } from "./cennik";

/** Členstvo, ktoré skončilo deň pred KOKPIT_OD alebo neskôr, už končilo v Kokpite. */
const KONIEC_ZA_KOKPITU = new Date(Date.parse(`${KOKPIT_OD}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/**
 * VÝPIS HODÍN — čo klient kúpil, čo odtrénoval a koľko mu zostáva.
 *
 * Jerry, 26. 9. 2026: „v profile klienta v záložke všetko chcem vedieť vedľa
 * tréningov aj počty hodín, koľko bolo hodín, keď klient zaplatil, s možnosťou
 * vytvoriť z toho report a poslať to klientovi na kontrolu."
 *
 * DVE ČÍSLA, LEBO APPKA VIE DVE RÔZNE VECI
 *
 * Odtrénované hodiny appka pozná od prvého dňa — sedenia sú v exporte aj
 * v kalendári. Zostatok balíčka pozná len tam, kde vie aj NÁKUP, a balíčky
 * PTminder exportuje až od marca 2026 (55 zo 120 riadkov má dátum, najstarší
 * 3/2026). Anetka Přinosilová má v appke jediný balíček — z 2. 9. 2026 —
 * hoci chodí od januára 2025 a má za sebou 54 tréningov.
 *
 * Prvá verzia (26. 9.) počítala zostatok od začiatku osi a vyšlo jej −37 h.
 * Druhá zostatok zakotvila pri poslednom balíčku, ale tým zmizli čísla zo
 * zvyšku histórie a filter obdobia prestal čokoľvek meniť. Preto teraz:
 *
 * - **`spolu`** — koľko hodín má klient za sebou. Beží cez celú históriu
 *   a je to tvrdé číslo zo sedení.
 * - **`zostatok`** — koľko mu zostáva z balíčka. Existuje LEN od kotvy
 *   (`zaciatokBalicka`) ďalej; pred ňou je `null`, lebo nákup appka nevidí.
 *   Dopočítaný zostatok by bol výmysel a Jerry ho hovorí klientovi nahlas.
 *
 * HODINA JE HODINA, NIE TRÉNING. Sedenie nesie dĺžku (`duration_min`);
 * 3 698 ich má 60 minút a 11 má deväťdesiat. Tie sa počítajú ako 1,5 h.
 * Tréning z kalendára dĺžku nenesie — berie sa hodina.
 */

export type RiadokVypisu = {
  den: string;
  /** Čo sa stalo, ľudsky. */
  popis: string;
  /** +18 pri balíčku, −1 pri tréningu, 0 pri platbe. */
  zmena: number;
  /** Zostatok balíčka po tomto riadku; `null` tam, kde appka nákup nevidí. */
  zostatok: number | null;
  /** Koľkátý tréning na nezaplatenom členstve (1, 2, 3…) — inak `null`. */
  dlh: number | null;
  druh: Udalost["druh"];
  /** Tréning, ktorý je zatiaľ len v kalendári — v exporte ešte nie je. */
  zKalendara?: boolean;
  /** Hodiny balíčka sú z názvu, nie z exportu. */
  odvodene?: boolean;
  /** Koľko hodín si balíček odpísal za staršie tréningy hneď pri vzniku. */
  prevzate?: number;
  /** Dni tých tréningov — bez nich je to číslo bez odpovede. */
  prevzateDni?: string[];
  /** „Doplnenie členstva" — vnútorný záznam, nie predaj. */
  doplnenie?: boolean;
  /** Koľkou hodinou ďalšieho balíčka sa tréning stane po zaplatení (`StavRiadku.buduca`). */
  buduca?: number;
};

export type Vypis = {
  riadky: RiadokVypisu[];
  od: string;
  do: string;
  /** Stav hodín pred začiatkom obdobia (`null`, keď obdobie začína pred kotvou). */
  zaciatok: number | null;
  /** Stav hodín na konci (`null`, keď appka nemá ani jeden balíček). */
  koniec: number | null;
  /** Koľko hodín v období pribudlo, odtrénovalo sa a koľko klient zaplatil. */
  kupene: number;
  odtrenovane: number;
  zaplatene: number;
  /** Deň posledného členstva s hodinami. Prázdne = appka balíček nevidí. */
  kotva: string;
  /** Koľko tréningov v období padlo na nezaplatené členstvo. */
  naDlh: number;
};

/**
 * Dĺžka tréningu v hodinách. Bez údaja je to hodina — tak vyzerá 99,7 % z nich.
 * Tréning zadarmo je nula: odtrénoval sa, ale z členstva sa nestrhol.
 */
export const hodinTreningu = (u: Udalost): number => {
  if (u.druh !== "trening" || u.zdarma !== undefined) return 0;
  const m = u.minut && u.minut > 0 ? u.minut : 60;
  return Math.round((m / 60) * 4) / 4;
};

const zmenaZ = (u: Udalost): number => {
  if (u.druh === "balicekOd") return u.hodin || 0;
  if (u.druh === "trening") return -hodinTreningu(u);
  return 0;
};

/** Dátum pre človeka. Klient v maile nemá čítať ISO. */
const datum = (iso: string): string => {
  const [r, m, d] = iso.split("-");
  return r && m && d ? `${Number(d)}. ${Number(m)}. ${r}` : iso;
};

/**
 * Dátum s dňom v týždni — len tam, kde sa niečo stalo.
 *
 * Jerry, 27. 9. 2026: „u nej je to väčšinou streda, ale u ďalších sú to iné
 * dni." Pri platnosti členstva („do 28. 10.") deň v týždni nič nehovorí.
 */
const den = (iso: string): string => {
  const dt = denVTyzdni(iso);
  return dt ? `${dt} ${datum(iso)}` : datum(iso);
};

/**
 * Čas v jednom tvare. PTminder dáva „3:00pm", kalendár „15:00" — v jednom
 * výpise vedľa seba to vyzerá ako dva rôzne tréningy.
 */
export const cas24 = (c: string): string => {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(c.trim());
  if (!m) return c;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

const suma = (n: number): string => Math.round(n).toLocaleString("sk-SK").replace(/ /g, " ");

/** Hodiny bez zbytočnej nuly: 1 h, 1,5 h. */
export const hod = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "").replace(".", ","));

const METODY: Record<string, string> = { bank: "prevodom", cash: "v hotovosti", card: "kartou" };

const popisZ = (u: Udalost): string => {
  if (u.druh === "balicekOd") return `${nazovProduktu(u.nazov)}${u.hodin ? ` · ${u.odvodene ? "≈" : ""}${u.hodin} h` : ""}${u.doDna ? ` · do ${datum(u.doDna)}` : ""}`;
  if (u.druh === "balicekDo") return `koniec platnosti — ${u.nazov}`;
  if (u.druh === "platba") return `platba ${suma(u.suma)} Kč${u.metoda ? ` · ${METODY[u.metoda] || u.metoda}` : ""}`;
  const zdarma = u.zdarma !== undefined ? ` · zdarma${u.zdarma ? ` (${u.zdarma})` : ""}` : "";
  return `tréning${u.cas ? ` ${cas24(u.cas)}` : ""}${u.trener ? ` · ${u.trener}` : ""}${zdarma}`;
};

/** Posledný balíček s hodinami, ktorý už platí. */
export function poslednyBalicek(os: Udalost[], dnes = dnesPraha()) {
  let naj: Extract<Udalost, { druh: "balicekOd" }> | null = null;
  for (const u of os) {
    if (u.druh !== "balicekOd" || u.den > dnes || u.doplnenie || !u.hodin) continue;
    if (!naj || u.den > naj.den) naj = u;
  }
  return naj;
}

export function zaciatokBalicka(os: Udalost[], dnes = dnesPraha()): string {
  return poslednyBalicek(os, dnes)?.den || "";
}

const dniMedzi = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Chronologicky od najstaršieho; v rámci dňa tak, ako sa to naozaj stalo. */
const vCase = (os: Udalost[]): Udalost[] => {
  const poradie = { balicekOd: 0, trening: 1, platba: 2, balicekDo: 3 } as const;
  return [...os].sort((a, b) => a.den.localeCompare(b.den) || poradie[a.druh] - poradie[b.druh]);
};

export type StavRiadku = {
  /**
   * Ktorému členstvu riadok patrí — deň jeho začiatku.
   *
   * Obdobia už `priebehBalickov` počíta kvôli odpočtu; toto je len ich meno,
   * aby sa dali riadky zoskupiť. Profil klienta na tom stojí: klik na balíček
   * ukáže tréningy, ktoré sa naň vybrali (Jerry, 28. 9. 2026). Prázdne =
   * riadok je spred prvého známeho členstva.
   */
  usek: string;
  /**
   * Koľkátá hodina balíčka to je, počítané dolu — prvý tréning zo šiestich
   * ukáže 6, posledný 1. `null` = appka nevie alebo je riadok bez hodiny.
   */
  zostatok: number | null;
  /** Koľkátý tréning na nezaplatenom balíčku to je (1, 2, 3…). */
  dlh: number | null;
  /**
   * Koľko hodín si balíček hneď pri vzniku odpísal za staršie tréningy.
   *
   * Jerry, 2. 10. 2026 nad Lukášom Hanusom: „prečo tam chýba 5 h?" Balíček
   * mal 6 h a prvý tréning na ňom ukázal 4 — lebo dve hodiny zaplatili
   * tréningy z 25. 8. a 3. 9., ktoré predošlý balíček nepokryl. Appka to
   * robí správne (a presne tak, ako si to Jerry 28. 9. vypýtal), ale
   * nehovorila to nahlas, takže to vyzeralo ako preskočené číslo.
   *
   * Len na riadku balíčka a len keď je to viac než nula.
   */
  prevzate?: number;
  /** Dni prevzatých tréningov, v poradí, ako sa stali. */
  prevzateDni?: string[];
  /**
   * Koľkou hodinou ďalšieho balíčka sa tento tréning stane, keď klient
   * zaplatí. Len pri tréningoch bez hodiny na konci posledného balíčka.
   * Jerry, 3. 10. 2026: „−1 6h, −2 5h, −3 4h" — a 4. 10. nad Šašinkovou:
   * „prečo tam nemá odpočet 8 h, 7 h, 6 h?" Stránka za odkazom ho mala,
   * profil nie, lebo sa počítal len pri stránke. Odteraz tu, pre oboch.
   */
  buduca?: number;
};

/**
 * PRIEBEH BALÍČKOV — odpočet v rámci členstva a dlh, keď sa nezaplatilo.
 *
 * Jerry, 26. 9. 2026: „bol by začiatok balíčka, ten začína v nejaký konkrétny
 * deň, bolo by 6, 5, 4, 3, 2, 1 a to by sa odpočítavalo. A −1 by sa používalo
 * iba vtedy, keby balíček skončil a platba neprišla."
 *
 * Sú to dve nezávislé veci a preto dve čísla:
 *
 * 1. **Odpočet** sa pri každom začiatku členstva vráti na jeho hodiny a
 *    tréningom klesá. Číslo pri tréningu je stav PRED ním, teda koľkátá
 *    hodina balíčka to je: prvá zo šiestich ukáže 6, posledná 1 (Jerry,
 *    27. 9. 2026: „1 h = posledná v balíku a prvá hodina v balíku = 6 h").
 *    Riadok balíčka aj platby ostáva prázdny — balíček má počet hodín
 *    v názve a platba hodiny nemení. Paušál bez hodín v názve (SILVER, GOLD,
 *    ČLENSTVÍ ONE) odpočet UKONČÍ — appka o ňom nevie nič a tvrdiť číslo by
 *    bol výmysel.
 * 2. **Dlh** hovorí, koľký tréning si klient vybral skôr, než zaň zaplatil.
 *    Jerry, 27. 9. 2026: „má nový balík, ale je −1 (18), ďalší týždeň −2 (17),
 *    −3 (16), a na štvrtý týždeň zaplatila, tak to už len pokračuje 15, 14 —
 *    a je tam naznačené, že bol rozdiel medzi prvým tréningom a platbou."
 *    Značka teda po zaplatení NEZMIZNE, len sa ďalej nepridáva.
 *
 *    Za nezaplatené sa počíta tréning, ktorý padol:
 *      - na členstvo s OTVORENÝM poplatkom v PTminderi (Dan Kouřil: balíček
 *        z 2. 9., 7 790 Kč nezaplatených → −1, −2, −3, kým odpočet beží 5, 4, 3),
 *      - pred platbu za to členstvo,
 *      - alebo mimo hodín členstva, keď sa vyčerpalo a ďalšie nepribudlo.
 *    Odpočet preto pod nulu nejde; prebytok sa preleje do dlhu.
 *
 * Za platbu členstva sa berie len tá, ktorá prišla do MESIACA od jeho začiatku.
 * Bez tejto hranice by sa za ňu považovala aj platba za členstvo ďalšie:
 * Natália Pečková má balíček z 29. 4. a platbu 16. 9., a appke by vyšlo, že
 * celé leto trénovala na dlh.
 *
 * NEZAPLATENÉ ČLENSTVO HODINY NEDÁVA. Jerry, 3. 10. 2026: „nezaplatený balík
 * je 0." Členstvo s otvoreným poplatkom sa na osi otvorí, ale s nulou hodín:
 * každý tréning na ňom je bez hodiny a s mínusom, a až ďalší ZAPLATENÝ balíček
 * (alebo platba za tento) ich prepíše na hodiny. Lukáš Hanus 3. 10.: členstvo
 * 6 h od 9. 9. zaplatené, sedem tréningov, druhé členstvo od 2. 10. s otvoreným
 * poplatkom — koniec je −1, nie +5. To isté číslo ukazuje karta
 * (`zostatokKokpitu`), s tou istou definíciou „nezaplatený" (poplatok z dňa,
 * keď balíček začal).
 *
 * KONIEC MÁ ZNAMIENKO. `koniec` je zostatok na konci posledného členstva:
 * kladný = koľko hodín zostáva, záporný = koľko tréningov je bez hodiny.
 * Mínus nie je dlh v korunách — je to značka, ktorú ďalší balíček prepíše.
 *
 * POSLEDNÉ ČLENSTVO SA ZROVNÁ S KARTOU. Dopredný odpočet sedel na ostrých
 * dátach v 28 z 35 prípadov; rozdiel robia „Doplnenia členstva" (144 riadkov
 * v exporte, ani jedno nehovorí koľko hodín) a zrušené hodiny. Rad zostáva
 * taký, aký bol (6, 5, 4, 3, 2, 1 sú pevné), len KONIEC sa dorovná na číslo
 * z karty — od 1. 10. 2026 je to číslo z Kokpitu, nie z exportu PTmindera.
 */
/** Druh balíčka z názvu: „ON - …"/„… online" → on, „OFF - …"/offline z cenníka → off; inak neznámy. */
export function kanalBalicka(nazov: string): "on" | "off" | null {
  const n = String(nazov || "");
  if (/^\s*ON\b|online/i.test(n)) return "on";
  if (/^\s*OFF\b|offline/i.test(n)) return "off";
  return CENNIK.find((s) => s.nazov === n.trim())?.skupina === "Offline" ? "off" : null;
}
const kanalTreningu = (u: Extract<Udalost, { druh: "trening" }>): "on" | "off" | null =>
  /online/i.test(u.nazov || "") ? "on" : /offline/i.test(u.nazov || "") ? "off" : null;

export function priebehBalickov(
  os: Udalost[],
  zostatokTeraz: number | null = null,
  dnes = dnesPraha(),
): { stavy: Map<Udalost, StavRiadku>; koniec: number | null } {
  const rad = vCase(os).filter((u) => u.den <= dnes);
  const stavy = new Map<Udalost, StavRiadku>();

  // Hranice členstiev: každý balíček s hodinami otvára nové obdobie.
  type Usek = { balicek: Extract<Udalost, { druh: "balicekOd" }> | null; hodin: number; riadky: Udalost[]; prevzate?: number; prevzateDni?: string[] };
  const useky: Usek[] = [{ balicek: null, hodin: 0, riadky: [] }];
  /**
   * SAMOSTATNÁ HODINA INÉHO DRUHU NEDELÍ ČLENSTVO.
   *
   * Jerry, 6. 10. 2026: „Veronika chodí online a občas ide na offline, ale to
   * si platí ako samostatný tréning." Marcela Hrůzová to isté: ON 6 h od
   * 27. 8. a 18. 9. „OFF - 1 hodina offline" za 1 450 Kč. Os doteraz každým
   * balíčkom otvorila nové obdobie, takže jednotlivá offline hodina online
   * členstvo uťala — tréningy 24. 9. a 1. 10. stáli bez čísla, hoci z ON
   * zostávali hodiny. Kúpená hodina (najviac jedna) iného druhu než bežiace
   * členstvo preto pokryje svoj tréning a členstvo beží ďalej.
   *
   * Druh sa berie LEN z názvu balíčka. Z druhu tréningu nie: Lucia Podolová
   * má „ON - 6h" a tréningy vedené ako offline — prísne „online len z online"
   * by jej balíček nikdy nemínalo.
   */
  const samostatne = new Map<Udalost, Extract<Udalost, { druh: "balicekOd" }>>();
  const cakajuce: Extract<Udalost, { druh: "balicekOd" }>[] = [];
  /**
   * Index prvého tréningu, na ktorý už v členstve nezostala hodina.
   * −1 = všetko sa zmestilo (alebo je to obdobie bez hodín).
   */
  /**
   * „DOPLNENIE ČLENSTVA" BEZ POČTU HODÍN ZNAMENÁ NEZNÁMO, NIE NULU.
   *
   * PTminder vyváža doplnenie hodín ako službu „Doplnenie členstva" — bez
   * počtu v názve a s cenou 0. `hodinZNazvuBalicka` z toho vyčíta 0 a appka
   * to donedávna brala ako „nepridalo sa nič". Tým klientovi po každom
   * doplnení chýbali hodiny, ďalší balíček ich zhltol a ten deficit sa valil
   * dopredu: Lukáš Hanus mal 29. 9. 2026 na piatich tréningoch po sebe −1
   * až −5, hoci mal všetko zaplatené a odtrénoval presne toľko, koľko kúpil.
   *
   * Je to 223 doplnení u 80 klientov, čiže nie výnimka.
   *
   * Kokpit preto v takom období NEPOČÍTA dlh a NEPREBERÁ z neho tréningy do
   * ďalšieho balíčka. Nevieme, koľko hodín pribudlo — a vymyslené číslo by
   * išlo klientovi do mailu aj do SMS.
   */
  const neznameDoplnenie = (u: Usek): boolean =>
    u.riadky.some((r) => r.druh === "balicekOd" && r.doplnenie && !r.hodin);

  /**
   * PRIDÁVA DOPLNENIE HODINY, ALEBO LEN PREDLŽUJE TIE ISTÉ?
   *
   * Jerry, 29. 9. 2026: doplnenie dostane klient, keď mu skončila platnosť
   * a hodiny zostali — „presne toľko, koľko mu ostalo". Také doplnenie NIČ
   * NEPRIDÁVA, len drží pri živote hodiny, ktoré os už počíta. Sofia
   * Resnerová: členstvo do 13. 9. s dvoma hodinami, 16. 9. tréning, 20. 9.
   * doplnenie na tie isté dve hodiny — os ich pripočítala druhýkrát a mala 3
   * namiesto 1.
   *
   * Doplnenie POČAS platnosti je iná vec: Markéta Lozias 12. 9. dostala tri
   * hodiny k členstvu, ktoré platilo do 24. 9. a už bolo minuté. To sú
   * hodiny navyše.
   *
   * Keď koniec platnosti nepoznáme, pridáva sa ako doteraz.
   */
  const pridavaHodiny = (u: Extract<Udalost, { druh: "balicekOd" }>, clenstvo: Usek["balicek"]): boolean =>
    !(clenstvo?.doDna && u.den > clenstvo.doDna);

  /** Hodiny, z ktorých sa v období naozaj odpočítava: nezaplatené členstvo má nulu. */
  const hodinUseku = (u: Usek): number => (u.balicek?.nezaplatene ? 0 : u.hodin);

  const prvyNekryty = (u: Usek): number => {
    if (!u.balicek || neznameDoplnenie(u)) return -1;
    if (hodinUseku(u) <= 0) {
      // Bez hodín (nezaplatené) je nekrytý prvý tréning, ktorý tam je.
      const i = u.riadky.findIndex((r) => hodinTreningu(r) > 0);
      return i;
    }
    let zostava = hodinUseku(u);
    for (let i = 0; i < u.riadky.length; i++) {
      const r = u.riadky[i];
      if (r.druh === "balicekOd" && r.doplnenie && r.hodin > 0 && pridavaHodiny(r, u.balicek)) zostava += r.hodin;
      const h = samostatne.has(r) ? 0 : hodinTreningu(r);
      if (!h) continue;
      if (zostava < h) return i;
      zostava -= h;
    }
    return -1;
  };

  for (const u of rad) {
    if (u.druh === "trening" && u.zdarma === undefined && cakajuce.length) {
      const k = kanalTreningu(u);
      const i = cakajuce.findIndex((x) => (!x.doDna || u.den <= x.doDna) && (!k || k === kanalBalicka(x.nazov)));
      if (i >= 0) samostatne.set(u, cakajuce.splice(i, 1)[0]);
    }
    if (u.druh === "balicekOd" && !u.doplnenie) {
      const posl = useky[useky.length - 1];
      const hlavny = posl.balicek;
      const kanal = kanalBalicka(u.nazov);
      if (hlavny && u.hodin > 0 && u.hodin <= 1 && hlavny.hodin > 1 && (!hlavny.doDna || hlavny.doDna >= u.den)
        && kanal && kanalBalicka(hlavny.nazov) && kanal !== kanalBalicka(hlavny.nazov)) {
        cakajuce.push(u);
        posl.riadky.push(u);
        continue;
      }
      // Dve členstvá kúpené v ten istý deň sa SČÍTAJÚ, nezačínajú odznova.
      // PTminder ich vyváža ako dva riadky (Peter Gažo, Anna Nova) a Jerry to
      // pozná ako „akoby dve členstvá" — hodiny má klient obe.
      if (posl.balicek && posl.balicek.den === u.den) {
        posl.hodin += u.hodin;
        posl.riadky.push(u);
        continue;
      }
      const novy: Usek = { balicek: u, hodin: u.hodin, riadky: [] };
      /**
       * NOVÝ BALÍČEK PREBERÁ TRÉNINGY, NA KTORÉ UŽ HODINA NEBOLA.
       *
       * Jerry, 28. 9. 2026 nad Richardom Matlom: „keď mu nahodím nový balík,
       * chcem, aby sa od tej −1 znovu odpočítaval počet tréningov — keby mu
       * nahodím 18 h, vedľa −1 sa ukáže 18 h, ako keby tá −1 bola 18. hodina
       * z toho balíka."
       *
       * Je to tak, ako sa to naozaj deje: klient trénuje ďalej, hodiny mu
       * došli, a keď si balíček doplatí, tie tréningy sa z neho odpíšu.
       * Preberajú sa LEN tréningy z vyčerpaného členstva — obdobie bez hodín
       * (paušál, čas pred prvým balíčkom) by inak nový balíček zhltol celé.
       *
       * Mínus im zostáva: odtrénované boli skôr, než balíček vznikol, a to
       * je iná informácia než koľká hodina to bola.
       */
      /**
       * PREBERÁ SA LEN ZO ČLENSTVA, KTORÉ EŠTE PLATÍ.
       *
       * Jerry, 4. 10. 2026 nad Lukášom Hanusom: karta −1, zoznam −3. Zoznam
       * si do balíčka z 9. 9. preniesol dva tréningy zo skončeného augustového
       * členstva („2 h padlo na tréningy 25. 8. a 3. 9."), balíček začal na
       * 4 namiesto 6 a každý ďalší riadok bol o dva nižšie. Lenže o tom
       * augustovom členstve appka pozná len názov — hodiny z názvu, nie
       * skutočné (júl mal 8, nie 6; doplnenia bez počtu) — a deficit, ktorý
       * z toho vznikol, sa valil cez celý rok. Karta počíta len platné
       * balíčky a preto sedela s Jerrym.
       *
       * Prenášajú sa teda len tréningy z členstva, ktoré v deň nového ešte
       * PLATÍ (prekryv: „akoby dve členstvá"). Skončené členstvo si svoj mínus
       * nechá ako značku na vlastných riadkoch; nový balíček začína na svojich
       * hodinách. Bez známeho konca platnosti sa neprenáša nič — vymyslený
       * prenos je horší než žiadny.
       */
      // Ostro: členstvo, ktoré končí v deň, keď ďalšie začína, je obnova,
      // nie prekryv (PTminder: „10 Aug – 09 Sep", ďalšie „09 Sep – 08 Oct").
      const prekryv = !!(posl.balicek?.doDna && posl.balicek.doDna > u.den);
      if (u.hodin > 0 && prekryv) {
        const od = prvyNekryty(posl);
        if (od >= 0) {
          const prevzate = posl.riadky.splice(od);
          const treningy = prevzate.filter((x) => x.druh === "trening" && x.zdarma === undefined);
          novy.prevzate = treningy.length;
          // Dni sa nesú ďalej, lebo na otázku „tá hodina bola kedy?" odpovedá
          // len dátum. Jerry sa pýtal dvakrát (2. a 3. 10. 2026) — po prvý raz
          // som pridal iba počet, a to je to isté číslo, nie odpoveď.
          novy.prevzateDni = treningy.map((x) => x.den);
          novy.riadky.push(...prevzate);
        }
      }
      useky.push(novy);
    }
    useky[useky.length - 1].riadky.push(u);
  }

  // Samostatná hodina nie je „posledné členstvo“ — to beží ďalej popri nej.
  const singleBalicky = new Set<Udalost>([...samostatne.values(), ...cakajuce]);
  const posledny = poslednyBalicek(os.filter((u) => !singleBalicky.has(u)), dnes);
  // Číslo z karty platí ku dňu EXPORTU. Tréningy, ktoré prišli po ňom len
  // z kalendára, o nich PTminder ešte nevedel — zrovnávať sa musí k tomu dňu,
  // inak by sa balíček Dana Kouřila nafúkol zo 6 na 7 hodín.
  let denExportu = "";
  for (const u of rad) if (u.druh === "trening" && !u.zKalendara && u.den > denExportu) denExportu = u.den;

  /**
   * NOVÝ BALÍČEK PREBERÁ NEKRYTÉ TRÉNINGY PRED SEBOU — TOĽKO, KOĽKO HOVORÍ PTMINDER.
   *
   * Overené v PTminderi 5. 10. 2026 („Sessions allocation"): ročné členstvo
   * Jaroslava Broskvu (kúpené 9. 5.) obsahuje aj tréning z 5. 5. a Tomáša
   * Krčmara (2. 8.) tréningy z 23., 28. a 30. 7. — tie, na ktoré už
   * predošlé obdobie hodinu nemalo. Zoznam začínal balíček dňom kúpy a
   * vychádzal o 1 a 3 hodiny vyšší než karta.
   *
   * Koľko tréningov prešlo, sa z exportu presne nevyčíta (doplnenia bez
   * počtu, viď `neznameDoplnenie`). Číslo z karty ho ale prezradí: o koľko
   * by posledný balíček mal ku dňu exportu viac než karta, toľko
   * NAJNOVŠÍCH nekrytých tréningov pred ním mu patrí. Len do 60 dní pred
   * jeho začiatkom, len z obdobia, ktoré malo balíček s hodinami (nie čas
   * pred prvým balíčkom ani paušál), a nikdy viac, než koľko ich nekrytých je.
   */
  if (zostatokTeraz != null) {
    const iu = useky.findIndex((x) => x.balicek && x.balicek === posledny);
    const usek = iu > 0 ? useky[iu] : null;
    const prev = iu > 0 ? useky[iu - 1] : null;
    const nb = usek?.balicek;
    const vlastneDoplnenie = !!usek?.riadky.some((r) => r.druh === "balicekOd" && r.doplnenie && r.zKokpitu);
    // Len balíček, ktorý ešte PLATÍ. Po skončení platnosti karta hovorí
    // o niečom inom (doplnenie, prepadnuté hodiny — Klára Holubová, Jerry
    // 5. 10. 2026: „hodiny prepadli") a rozdiel nie je prevzatý tréning.
    // Koniec platnosti os často nepozná (balíček z knihy predajov), preto
    // aj druhá stráž: posledný tréning v ňom nie je starší než 60 dní.
    const poslTrening = usek?.riadky.filter((r) => r.druh === "trening").map((r) => r.den).sort().pop() || "";
    // Meria sa od DNEŠKA: `denExportu` je posledný tréning tohto klienta,
    // takže pri niekom, kto od mája nechodí, by bol tiež máj.
    const platiEste = (!nb?.doDna || nb.doDna >= dnes)
      && !!poslTrening && dniMedzi(poslTrening, dnes) <= 60;
    if (usek && prev && nb && platiEste && !nb.zKokpitu && !nb.nezaplatene && usek.hodin > 0 && !usek.prevzate && !vlastneDoplnenie
      && prev.balicek && prev.hodin > 0) {
      let k = hodinUseku(usek);
      for (const r of usek.riadky) {
        if (r.druh === "balicekOd" && r.doplnenie && r.hodin > 0 && pridavaHodiny(r, nb)) k += r.hodin;
        if (r.druh === "trening" && r.zdarma === undefined && !samostatne.has(r) && r.den <= (denExportu || dnes)) k -= hodinTreningu(r);
      }
      const navyse = k - zostatokTeraz;
      if (navyse > 0) {
        let bezi = hodinUseku(prev);
        const nekryte: number[] = [];
        prev.riadky.forEach((r, i) => {
          if (r.druh === "balicekOd" && r.doplnenie && r.hodin > 0 && pridavaHodiny(r, prev.balicek)) bezi += r.hodin;
          if (r.druh !== "trening" || r.zdarma !== undefined || samostatne.has(r)) return;
          const h = hodinTreningu(r);
          if (bezi < h) nekryte.push(i); else bezi -= h;
        });
        const treningy = nekryte.filter((i) => dniMedzi(prev.riadky[i].den, nb.den) <= 60).slice(-navyse);
        if (treningy.length) {
          // S tréningami idú aj platby od prvého z nich: balíček sa často
          // platí skôr, než ho PTminder zapíše (Krčmar zaplatil ročné
          // členstvo 23. a 24. 7. v dvoch častiach, zapísané je 2. 8.).
          // Bez nich by prevzaté tréningy vyšli ako nezaplatené.
          const odDna = prev.riadky[treningy[0]].den;
          const vyber = prev.riadky
            .map((_, i) => i)
            .filter((i) => treningy.includes(i) || (prev.riadky[i].druh === "platba" && prev.riadky[i].den >= odDna));
          const presun = vyber.map((i) => prev.riadky[i]);
          prev.riadky = prev.riadky.filter((_, i) => !vyber.includes(i));
          usek.riadky.unshift(...presun);
          usek.prevzate = presun.filter((x) => x.druh === "trening").length;
          usek.prevzateDni = presun.filter((x) => x.druh === "trening").map((x) => x.den);
        }
      }
    }
  }

  let koniec: number | null = null;

  for (const usek of useky) {
    const b = usek.balicek;
    // Nezaplatené členstvo pozná svoje hodiny, ale nedáva ich: beží od nuly.
    let bezi: number | null = b ? (usek.hodin > 0 ? hodinUseku(usek) : null) : null;
    /** Tréningy v období, na ktoré nebola hodina — pre znamienko konca. */
    let nekryte = 0;
    // Dokúpené hodiny sa k bežiacemu členstvu PRIPOČÍTAJÚ, nezačínajú odznova.
    /**
     * Zrovnaniu s kartou bráni LEN doplnenie zapísané v Kokpite.
     *
     * To karta nepozná (ráta z exportu PTmindera) a zrovnať by ho znamenalo
     * zmazať. Doplnenie z PTmindera karta pozná — od 29. 9. 2026 ho berie ako
     * aktuálny zostatok, keď členstvu skončila platnosť — a je to najpresnejšie
     * číslo, aké existuje. Bez zrovnania os pripočítala doplnenie navrch:
     * Patrik Lutonský mal na osi 10 h, v PTminderi 4, lebo doplnenie JE ten
     * zvyšok z členstva, nie hodiny navyše.
     */
    const maDokupene = usek.riadky.some((u) => u.druh === "balicekOd" && u.doplnenie && u.hodin > 0 && u.zKokpitu);

    const platbaKBalicku = b
      ? usek.riadky.find((u) => u.druh === "platba" && dniMedzi(b.den, u.den) <= 30)?.den
      : undefined;
    // Otvorený poplatok = nezaplatené dodnes. Inak platí deň platby; keď
    // v období platba nie je vôbec, predpokladá sa, že sa platilo dopredu.
    /**
     * OBDOBIE PRED PRVÝM BALÍČKOM MÁ TIEŽ PLATBY.
     *
     * Úvodný tréning sa platí sám za seba, bez členstva. Úsek bez balíčka
     * ale platby vôbec nečítal, takže prvý tréning klienta niesol −1 aj
     * vtedy, keď ho v ten istý deň zaplatil — a od 29. 9. 2026 ide os
     * v maili „celá história" priamo klientovi. Kryje sa prvou platbou
     * úseku, rovnako ako pri balíčku.
     */
    const zaplateneOd = b?.nezaplatene ? null
      : b ? (platbaKBalicku || b.den)
      : usek.riadky.find((u) => u.druh === "platba")?.den;

    const neznameHodiny = neznameDoplnenie(usek);
    let dlhPocet = 0;
    const doUseku: { u: Udalost; po: number | null }[] = [];
    for (const u of usek.riadky) {
      let dlh: number | null = null;
      let zostatok: number | null = null;
      if (u.druh === "balicekOd" && u.doplnenie && u.hodin > 0 && pridavaHodiny(u, b)) bezi = (bezi || 0) + u.hodin;
      /**
       * MÍNUS SA PLATBOU VYNULUJE.
       *
       * Jerry, 28. 9. 2026: „to sa nemá sčítavať naprieč históriou — keď
       * zaplatí, minusovanie sa vynuluje, a ak zase zaplatí neskoro, ide do
       * nového mínusu." Richard Matl mal na 28. 9. −3: dva tréningy z augusta
       * pred platbou (10. a 19. 8., zaplatené 23. 8.) a jeden nad rámec
       * balíčka. Dva z tých troch boli dávno vyrovnané a číslo tvrdilo, že je
       * tri hodiny v mínuse, hoci je jednu.
       *
       * Počítadlo preto beží po SÉRIÁCH, nie cez celý úsek: vynuluje ho
       * platba aj tréning, ktorý mal hodinu aj zaplatené. Čísla na starých
       * riadkoch zostávajú (10. 8. ďalej hovorí −1) — to je fakt o tom dni;
       * mení sa len to, odkiaľ začína ďalší mínus.
       */
      if (u.druh === "platba") dlhPocet = 0;
      // Tréning zadarmo do odpočtu ani do dlhu nevstupuje — je darovaný,
      // takže zaň nemá čo chýbať ani hodina, ani platba.
      const single = samostatne.get(u);
      if (single) {
        // Tréning na samostatnej hodine: jeho číslo je tá hodina, členstvo
        // sa nemení a séria mínusu tiež nie.
        zostatok = single.nezaplatene ? null : single.hodin;
        dlh = single.nezaplatene ? 1 : null;
      } else if (u.druh === "trening" && u.zdarma === undefined) {
        // Číslo pri tréningu je stav PRED ním. Keď už hodiny nie sú, riadok
        // číslo nemá a tréning sa počíta do dlhu.
        const vycerpane = bezi !== null && bezi < hodinTreningu(u);
        if (bezi !== null && !vycerpane) zostatok = bezi;
        if (bezi !== null) bezi = Math.max(0, bezi - hodinTreningu(u));
        if (bezi !== null && vycerpane) nekryte += 1;
        /**
         * Dlh sa nepočíta tam, kde appka nevie, koľko hodín obdobie malo.
         * Nulou to nie je — je to neznámo (viď `neznameDoplnenie`).
         *
         * ALE TRÉNING BEZ HODINY SA KRESLÍ VŽDY. Jerry, 4. 10. 2026 nad
         * Danielou Šašinkovou: „prečo tam nie je −1 −2 −3?" Mala nezaplatené
         * členstvo od 9. 9. a 12. 9. doplnenie bez počtu hodín; riadky pre to
         * mlčali, kým nadpis aj karta hovorili −4 — lebo koniec osi (`nekryte`)
         * tréningy bez hodiny počíta vždy. Ticho tu teda nechránilo pred
         * vymysleným číslom, len zatajilo, odkiaľ sa to číslo vzalo.
         *
         * LEN V AKTUÁLNOM BALÍČKU A LEN KEĎ AJ KARTA HOVORÍ MÍNUS. Riadky
         * majú vysvetliť číslo na karte, nie mu odporovať. V starších
         * obdobiach ticho zostáva — tam neznáme doplnenie 29. 9. 2026
         * vyrábalo Hanusovi vymyslené −1 až −5. A tam, kde karta mínus
         * nehlási, os pravdu nemá: Marcela Hrůzová má naraz online balíček
         * (4 h) a offline 1 h, os ich nevie viesť vedľa seba a online
         * tréningy by jej ukázala ako −1, −2; karta sčíta oba a hovorí 1 h.
         */
        const kartaVMinuse = zostatokTeraz != null && zostatokTeraz < 0;
        /**
         * PO SKONČENÍ PLATNOSTI NEZNÁME DOPLNENIE UŽ NIČ NEKRYJE.
         *
         * Jerry, 6. 10. 2026: „nové členstvo vzniká prvou hodinou (6 h), ak
         * nie je zaplatené, je to (6 h −1)." Markéta Resnerová: členstvo 8 h
         * do 5. 10. minuté, doplnenie z 20. 9. bez počtu hodín, tréning 6. 10.
         * Karta (z PTmindera, v Kokpite aktívny balíček nemá) hovorí 0, takže
         * stráž vyššie riadok umlčala — bez mínusu a bez budúcej hodiny a nový
         * balíček z prvého tréningu (`navrhNovehoBalicka`) nevznikol.
         * Tréning po konci platnosti, keď karta hodiny nemá, je prvá hodina
         * ďalšieho členstva.
         *
         * LEN PRI ČLENSTVE, KTORÉ SKONČILO, KEĎ UŽ PRAVDOU BOL KOKPIT. Staršia
         * história z PTmindera tomu nesedí (prepočet 6. 10. 2026: prenos
         * mínusu zo skončeného členstva dal pri 4 z 4 overiteľných klientov
         * iné číslo než PTminder) a návrh z nej by založil balíček do minulosti
         * — Jarek Heinrich trénuje od júla bez členstva a s doplneniami bez
         * počtu; to rozhodne Jerry, nie appka.
         */
        const poPlatnosti = !!(b?.doDna && b.doDna >= KONIEC_ZA_KOKPITU && u.den > b.doDna && zostatokTeraz != null && zostatokTeraz <= 0);
        if (neznameHodiny && !(vycerpane && b === posledny && (kartaVMinuse || poPlatnosti))) dlh = null;
        else if (vycerpane || !zaplateneOd || u.den < zaplateneOd) dlh = (dlhPocet += 1);
        else dlhPocet = 0;
      }
      // Stav po tréningu so znamienkom: pod nulou sú to tréningy bez hodiny.
      doUseku.push({ u, po: u.druh === "trening" && bezi !== null ? bezi - nekryte : null });
      stavy.set(u, {
        zostatok, dlh, usek: b?.den || "",
        prevzate: u === b && usek.prevzate ? usek.prevzate : undefined,
        prevzateDni: u === b && usek.prevzate ? usek.prevzateDni : undefined,
      });
    }

    // Posledné členstvo sa zrovná s číslom, ktoré appka ukazuje na karte.
    // Keď v členstve ešte nebol žiadny tréning, zrovnáva sa jeho otváracia
    // hodnota — inak by sa nemalo čoho chytiť a rad by ostal na hodinách
    // z názvu (Josef Šnirych: „SPECIAL 3" kúpené 20. 9., PTminder hovorí 2 z 3).
    const kExportu = [...doUseku].reverse().find((x) => x.u.den <= (denExportu || dnes) && x.po !== null)?.po
      ?? (bezi !== null ? bezi - nekryte : null);
    // Keď appka pozná dokúpené hodiny, je informovanejšia než karta klienta
    // (tá ráta len z aktívneho členstva) a zrovnávať sa nemá načím.
    // Balíček nahodený v Kokpite karta klienta NEPOZNÁ — tá ráta z exportu
    // PTmindera. Zrovnať sa s ňou by znamenalo stiahnuť nový balíček na
    // zostatok toho vyčerpaného, teda na nulu.
    /**
     * ZROVNÁVA SA LEN KONEČNÉ ČÍSLO, NIE JEDNOTLIVÉ RIADKY.
     *
     * Dovtedy sa rozdiel oproti karte rozpustil do celého radu: Lukášovi
     * Hanusovi tak stáli pred novým balíčkom riadky 8 h a 7 h, hoci z toho
     * starého mu zostávali 2 a 1. Jerry, 3. 10. 2026: „6, 5, 4, 3, 2, 1 sú
     * pevne dané, to sa nikdy nemá meniť." Odpočet teda zostáva taký, aký
     * naozaj bol, a rozdiel sedí tam, kde vznikol — na hranici balíčkov.
     *
     * Karta sa tým nemení: `bezi` (a teda nadpis „Zbývá ti…") sa dorovná
     * ďalej, len sa to už nepremieta do histórie.
     */
    let koniecUseku: number | null = bezi !== null ? bezi - nekryte : null;
    if (b && b === posledny && !b.zKokpitu && !maDokupene && zostatokTeraz != null && kExportu != null && kExportu !== zostatokTeraz) {
      if (koniecUseku !== null) koniecUseku += zostatokTeraz - kExportu;
    }

    if (b === posledny) {
      koniec = koniecUseku;
      // Tréningy bez hodiny na KONCI balíčka dostanú hodiny ďalšieho
      // (rovnako veľkého) balíčka: najstarší z nich je jeho prvá hodina.
      const bezHodiny: StavRiadku[] = [];
      for (let i = usek.riadky.length - 1; i >= 0; i--) {
        const u = usek.riadky[i];
        if (u.druh !== "trening" || u.zdarma !== undefined || samostatne.has(u)) continue;
        const st = stavy.get(u);
        if (!st || st.zostatok != null || !st.dlh) break;
        bezHodiny.unshift(st);
      }
      const hodinBalicka = b?.hodin || 0;
      bezHodiny.forEach((st, i) => { if (hodinBalicka - i > 0) st.buduca = hodinBalicka - i; });
    }
  }

  return { stavy, koniec };
}

/**
 * @param od            začiatok zobrazeného obdobia (staršie sa nezobrazí)
 * @param doDna         koniec obdobia
 * @param zostatokTeraz koľko hodín klientovi zostáva podľa appky
 *                      (`packageRemaining`). Bez neho sa zostatok nepočíta —
 *                      radšej prázdny stĺpec než vymyslené číslo.
 */
export function vypisHodin(os: Udalost[], od = "", doDna = "", zostatokTeraz: number | null = null): Vypis {
  const dnes = doDna || dnesPraha();
  const { stavy, koniec: konecnyZostatok } = priebehBalickov(os, zostatokTeraz, dnes);
  const vsetko = vCase(os);

  let zaciatok: number | null = null;
  const riadky: RiadokVypisu[] = [];
  let kupene = 0;
  let odtrenovane = 0;
  let zaplatene = 0;
  let naDlh = 0;

  for (const u of vsetko) {
    // Čo je za koncom obdobia, sa nepočíta vôbec — inak by „stav na konci"
    // hovoril o dnešku, hoci výpis končí v júni.
    if (doDna && u.den > doDna) continue;
    const stav = stavy.get(u);
    const zostatok = stav?.zostatok ?? null;
    if (od && u.den < od) {
      if (zostatok !== null) zaciatok = zostatok;
      continue;
    }
    const zmena = zmenaZ(u);
    if (zmena > 0) kupene += zmena;
    if (u.druh === "trening") odtrenovane += hodinTreningu(u);
    if (u.druh === "platba") zaplatene += u.suma;
    if (stav?.dlh) naDlh += 1;
    riadky.push({
      den: u.den,
      popis: popisZ(u),
      zmena,
      zostatok,
      dlh: stav?.dlh ?? null,
      druh: u.druh,
      zKalendara: u.druh === "trening" ? u.zKalendara : undefined,
      odvodene: u.druh === "balicekOd" || u.druh === "balicekDo" ? u.odvodene : undefined,
      doplnenie: u.druh === "balicekOd" ? u.doplnenie : undefined,
      prevzate: stav?.prevzate,
      prevzateDni: stav?.prevzateDni,
      buduca: stav?.buduca,
    });
  }

  return {
    riadky: riadky.reverse(),
    od: od || (vsetko[0]?.den ?? ""),
    do: doDna || (vsetko[vsetko.length - 1]?.den ?? ""),
    zaciatok,
    koniec: konecnyZostatok,
    kupene,
    odtrenovane,
    zaplatene,
    kotva: poslednyBalicek(os, dnes)?.den || "",
    naDlh,
  };
}

/** Obdobie „posledné N mesiace" ako dvojica dátumov. */
export function poslednychMesiacov(n: number, dnes = dnesPraha()): { od: string; do: string } {
  const d = new Date(`${dnes}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return { od: d.toISOString().slice(0, 10), do: dnes };
}

/** Výpis ako text do mailu — klient ho číta v tele správy, nie v prílohe. */
export function vypisAkoText(v: Vypis, klient: string): string {
  const riadky = [...v.riadky].reverse().map((r) => {
    // Číslo je stav PRED tréningom, preto „zostávalo" — v tej chvíli ich
    // toľko mal, vrátane tej, ktorú práve išiel odtrénovať.
    const stav = r.zostatok !== null ? `zostávalo ${hod(r.zostatok)} h` : "";
    const dlh = r.dlh ? `nezaplatené · ${r.dlh}. tréning` : "";
    const znacka = [stav, dlh].filter(Boolean).join(" · ");
    // padEnd nestačí: dlhší popis by sa zlepil so značkou („do 27. 10. 2026zostáva").
    const popis = r.popis.length >= 46 ? `${r.popis}  ` : r.popis.padEnd(46);
    return `${den(r.den).padEnd(17)} ${popis}${znacka}`.trimEnd();
  });
  return [
    `Výpis hodín — ${klient}`,
    `Obdobie ${den(v.od)} až ${den(v.do)}`,
    "",
    v.zaplatene > 0 ? `Zaplatené: ${suma(v.zaplatene)} Kč` : "",
    `Odtrénované: ${hod(v.odtrenovane)} h`,
    v.koniec !== null ? `Zostáva: ${hod(v.koniec)} h` : "",
    v.naDlh > 0 ? `Tréningov na nezaplatenom členstve: ${v.naDlh}` : "",
    "",
    ...riadky,
    "",
    v.riadky.some((r) => r.odvodene) ? "Hodiny označené ≈ sú z názvu členstva — PTminder ich vo výpise neuvádza." : "",
    "Dĺžka tréningu sa berie zo záznamu o sedení; bežný tréning je hodina.",
  ].filter((r, i, p) => r !== "" || p[i - 1] !== "").join("\n");
}

/**
 * SKUTOČNÝ STAV PRE SPRÁVU KLIENTOVI — aj so znamienkom.
 *
 * `koniec` sa na nule zastaví (`Math.max(0, …)`), lebo pre odpočet v balíčku
 * záporné hodiny nedávajú zmysel. Pre správu áno: klient, ktorý má dva
 * tréningy nad rámec, nemá „dochodený balíček", má −2. Mail aj SMS do
 * 29. 9. 2026 hovorili „balíček máš dochodený", hoci riadky osi ukazovali
 * −1 — náhľad pre Vítězslava bol stavaný ručne a ten rozdiel skryl.
 *
 * Mínus sa berie LEN z tréningu, na ktorý hodina nezostala (`zostatok`
 * je prázdny). Tréning s hodinou, ktorý ešte nie je zaplatený, má tiež
 * `dlh` — ale to je nezaplatená faktúra, nie hodina nad rámec, a klientovi
 * sa to hovorí inak.
 *
 * `dnesnyTrening` = posledný tréning bol v deň `dnes`; bez toho sa správa
 * na dnešok neodvoláva.
 */
export function stavPreSpravu(v: Vypis, dnes: string): { zostatok: number | null; dnesnyTrening: boolean } {
  const posledny = v.riadky.find((r) => r.druh === "trening");
  const dnesnyTrening = !!posledny && posledny.den.slice(0, 10) === dnes;
  if (posledny && posledny.zostatok == null && posledny.dlh) return { zostatok: -posledny.dlh, dnesnyTrening };
  return { zostatok: v.koniec, dnesnyTrening };
}
