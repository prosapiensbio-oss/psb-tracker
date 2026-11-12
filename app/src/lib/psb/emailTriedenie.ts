import type { ImapSprava } from "./imapParse";
import { naDopyt, rozdelAdresu, zFormulara } from "./mailDopyt";

/**
 * KARTA EMAIL — triedenie schránky info@ (Jerry, 12. 11. 2026, návrh D).
 *
 * Štyri skupiny v poradí, v akom ich čítaš:
 *   klient    — píše niekto, koho Kokpit pozná (e-mail z PTmindera,
 *               fakturačných údajov alebo dopytu klienta)
 *   novy      — možný dopyt: formulár z webu, človek, ktorý niečo chce,
 *               odpoveď niekoho, kto už v dopytoch je
 *   prevadzka — web, služby, faktúry dodávateľov, vlastné kópie
 *   ostatne   — obchodné ponuky a všetko, čo nič nechce (zbalené)
 *
 * Rozhoduje to ISTÉ pravidlo ako import dopytov (`naDopyt`) — keby si karta
 * triedila po svojom, ten istý mail by bol v dopytoch nový a tu „ostatné".
 * Klient má prednosť pred všetkým: odpoveď klienta na našu faktúru je
 * „odpoveď v rozhovore", no patrí k nemu, nie do prevádzky.
 */

export type Kategoria = "klient" | "novy" | "prevadzka" | "ostatne";

export const PORADIE_KATEGORII: Kategoria[] = ["klient", "novy", "prevadzka", "ostatne"];

export const NAZVY_KATEGORII: Record<Kategoria, string> = {
  klient: "Klienti",
  novy: "Noví ľudia — možný dopyt",
  prevadzka: "Web a prevádzka",
  ostatne: "Ostatné",
};

export type Roztriedene = {
  kategoria: Kategoria;
  klient: string | null;
  dovod: string;
  odMeno: string;
  odMail: string;
  /** Kam ide odpoveď: Reply-To, pri formulári adresa z formulára. */
  odpovedatMail: string;
};

export type ZnamiLudia = {
  /** e-mail (malými) → meno klienta */
  klientPodlaMailu: Map<string, string>;
  /** normalizované meno → meno klienta (len jednoznačné mená) */
  klientPodlaMena: Map<string, string>;
  /** e-maily z dopytov, ktoré ešte nie sú klientmi */
  dopytoveMaily: Set<string>;
};

/** Meno bez diakritiky a veľkosti písmen — na párovanie „Od:" s klientom. */
export function normMeno(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
}

const PREVADZKA_SLOVA = ["energi", "elektřin", "elektrin", "přepis", "prepis", "plyn", "pojistn", "poistn", "faktur", "vyúčtov", "vyuctov", "nájem", "najem", "nájom", "smlouv", "objednávk", "objednavk", "zásilk", "zasilk", "doménu", "domén", "hosting", "platba přijata", "potvrzení platby"];

const PREVADZKA_DOVODY = /^(vlastná adresa|vlastná doména|technická adresa|služba|strojový predmet)/;

export function roztried(v: ImapSprava, vlastne: string[], ignoruj: string[], znami: ZnamiLudia): Roztriedene {
  const od = rozdelAdresu(v.od);
  const reply = rozdelAdresu(v.odpovedat || "");
  const vlastneDomeny = vlastne.map((a) => a.split("@")[1]).filter(Boolean);
  const form = zFormulara(v, vlastneDomeny);
  // Človek za správou: pri formulári ten z formulára, inak Reply-To, inak Od.
  const odMail = (form?.email || reply.email || od.email || "").toLowerCase();
  const odMeno = (form?.meno || (reply.email ? reply.meno : "") || od.meno || odMail).trim();
  const zaklad = { odMeno: odMeno.slice(0, 120), odMail: odMail.slice(0, 160), odpovedatMail: odMail.slice(0, 160) };

  const klientMailom = odMail ? znami.klientPodlaMailu.get(odMail) : undefined;
  if (klientMailom) return { ...zaklad, kategoria: "klient", klient: klientMailom, dovod: "e-mail klienta" };
  const vlastnaDomena = vlastneDomeny.includes(odMail.split("@")[1] || "");
  const klientMenom = !vlastnaDomena && odMeno ? znami.klientPodlaMena.get(normMeno(odMeno)) : undefined;
  if (klientMenom) return { ...zaklad, kategoria: "klient", klient: klientMenom, dovod: "meno klienta" };

  // Naša vlastná pošta z inej adresy (Gmail ProSapiens, DocuSeal v našom
  // mene) — nie je to nový človek (12. 11. 2026: pozvánka na podpis padla
  // medzi nových ľudí, lebo slovo „trénink“ bolo v pätičke).
  if (!form && (/prosapiens/i.test(od.email.split("@")[0] || "") || /^prosapiens\b/i.test(normMeno(od.meno)))) {
    return { ...zaklad, kategoria: "prevadzka", klient: null, dovod: "naša adresa" };
  }

  const r = naDopyt(v, vlastne, ignoruj);
  if ("dopyt" in r) {
    return { ...zaklad, kategoria: "novy", klient: null, dovod: r.dopyt.zFormulara ? "formulár z webu" : "píše o tréningu" };
  }
  if ("historia" in r) {
    const k = znami.klientPodlaMena.get(normMeno(r.historia.meno)) || null;
    return { ...zaklad, kategoria: "klient", klient: k, dovod: "žiada celú históriu" };
  }
  const preco = r.preskocene;
  // Faktúry, vyúčtovanie, energie — prevádzka aj vtedy, keď je to „Re:“ alebo „Fwd:“
  // (12. 11. 2026: vyúčtovanie od správy domu padlo medzi nových ľudí).
  const predmetMaly = (v.predmet || "").toLowerCase();
  if (!znami.dopytoveMaily.has(odMail) && PREVADZKA_SLOVA.some((x) => predmetMaly.includes(x))) {
    return { ...zaklad, kategoria: "prevadzka", klient: null, dovod: "faktúra / prevádzka" };
  }
  if (preco === "odpoveď v rozhovore") {
    // Odpoveď na náš mail od človeka, ktorý je v dopytoch, je pokračovanie
    // dopytu. Od neznámeho tiež — Terezka má radšej vidieť o jeden navyše.
    return { ...zaklad, kategoria: "novy", klient: null, dovod: znami.dopytoveMaily.has(odMail) ? "odpoveď z dopytu" : "odpoveď na náš mail" };
  }
  if (PREVADZKA_DOVODY.test(preco)) return { ...zaklad, kategoria: "prevadzka", klient: null, dovod: preco };
  const predmet = (v.predmet || "").toLowerCase();
  if (PREVADZKA_SLOVA.some((s) => predmet.includes(s))) return { ...zaklad, kategoria: "prevadzka", klient: null, dovod: "faktúra / prevádzka" };
  if (znami.dopytoveMaily.has(odMail)) return { ...zaklad, kategoria: "novy", klient: null, dovod: "už je v dopytoch" };
  return { ...zaklad, kategoria: "ostatne", klient: null, dovod: preco };
}

/** Mapy známych ľudí z riadkov databázy. Meno, ktoré nosia dvaja, sa nepáruje. */
export function postavZnamych(v: {
  maily: { email: string; klient: string }[];
  klienti: string[];
  dopyty: { email: string; meno: string }[];
}): ZnamiLudia {
  const klientPodlaMailu = new Map<string, string>();
  for (const m of v.maily) {
    for (const e of (m.email || "").split(/[,;\s]+/)) {
      const x = e.trim().toLowerCase();
      if (x.includes("@") && m.klient && !klientPodlaMailu.has(x)) klientPodlaMailu.set(x, m.klient);
    }
  }
  const pocet = new Map<string, number>();
  for (const k of v.klienti) pocet.set(normMeno(k), (pocet.get(normMeno(k)) || 0) + 1);
  const klientPodlaMena = new Map<string, string>();
  for (const k of v.klienti) {
    const n = normMeno(k);
    // Len celé meno (dve slová) — samotné „Martin" by sadlo na troch.
    if (n.includes(" ") && pocet.get(n) === 1) klientPodlaMena.set(n, k);
  }
  const dopytoveMaily = new Set<string>();
  for (const d of v.dopyty) {
    const e = (d.email || "").trim().toLowerCase();
    if (!e.includes("@")) continue;
    const k = klientPodlaMena.get(normMeno(d.meno));
    if (k) { if (!klientPodlaMailu.has(e)) klientPodlaMailu.set(e, k); } else dopytoveMaily.add(e);
  }
  return { klientPodlaMailu, klientPodlaMena, dopytoveMaily };
}

/**
 * Má odpoveď vlastný obsah? Predvyplnený pozdrav a podpis nie sú správa.
 * 12. 11. 2026 tak odišiel prvý mail z karty — „Dobrý den, S pozdravem
 * Filip“ a nič medzi tým. Platí na serveri aj na obrazovke.
 */
export function maObsah(text: string): boolean {
  const ZDVORILOST = /^(dobr[ýy] den|dobr[ýy] de[ňn]|ahoj|zdrav[íi]m|s pozdravem|s pozdravom|d[ěe]kuji|filip str[áa][ňn]avsk[ýy]|filip|terezka|ter[ée]zi[ae] za[ťt]kov[áa]|prosapiens biomechanic)[\s,.!]*$/i;
  return (text || "").split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !ZDVORILOST.test(r)).length > 0;
}

/**
 * Nová časť mailu a citovaný starý rozhovor zvlášť (Jerry, 12. 11. 2026: „celé
 * to splýva“). Citát začína riadkom „Dne … napsal(a):“, „On … wrote:“,
 * hlavičkou preposlanej správy alebo prvým riadkom s „>“. Karta ho zbalí.
 */
export function rozdelCitat(text: string): { nove: string; citat: string } {
  const riadky = (text || "").replace(/\r\n/g, "\n").split("\n");
  const zaciatok = riadky.findIndex((r, i) => {
    const t = r.trim();
    if (/^>/.test(t)) return true;
    if (/^(dne|d[ňn]a)\b.{3,160}(napsal|nap[íi]sal|napísal|napisal)/i.test(t)) return true;
    if (/^on\b.{3,160}wrote:?$/i.test(t)) return true;
    if (/^-{2,}\s*(p[ůu]vodn[íi] zpr[áa]va|original message|forwarded message|p[ôo]vodn[áa] spr[áa]va)/i.test(t)) return true;
    // „Dne … uživatel X <\nmail> napsal:“ býva zalomené do dvoch riadkov
    if (/^(dne|d[ňn]a)\b/i.test(t) && /(napsal|wrote)/i.test(riadky[i + 1] || "")) return true;
    return false;
  });
  if (zaciatok <= 0) return { nove: (text || "").trim(), citat: zaciatok === 0 ? (text || "").trim() : "" };
  return { nove: riadky.slice(0, zaciatok).join("\n").trim(), citat: riadky.slice(zaciatok).join("\n").trim() };
}
