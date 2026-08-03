// PTminder CSV parsing + normalization. Pure functions — run server-side on
// ingest. Handles the PTminder quirks: UTF-8 BOM, "CZK1,165.00" thousands,
// "Jun 29; 2026" dates, and the hierarchical Payments Recorded format.
import type { CSVType, PackageRow, PaymentRow, ServiceRow, SessionRow } from "./types";

export const parseCZK = (s: string | number | null | undefined): number => {
  if (s == null) return 0;
  return parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;
};

export const parsePTDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const clean = String(s).replace(/;/g, ",").trim();
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
};

// Normalize a parsed date to UTC midnight of its calendar Y/M/D, so month/week
// grouping is identical whether parsing runs on a UTC server or a local box.
const toUtcMidnight = (d: Date): string =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();

// Payments Recorded rows carry only "Jun 27" (no year). The year(s) live in the
// report title, e.g. "( 27 June 2026 - 26 July 2026 )". Derive a month→year map.
function paymentYearResolver(text: string): (monthIdx: number) => number {
  const head = text.slice(0, 300);
  const matches = [...head.matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g)];
  const parsed = matches
    .map((m) => {
      const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
      return isNaN(d.getTime()) ? null : { month: d.getMonth(), year: d.getFullYear() };
    })
    .filter((x): x is { month: number; year: number } => !!x);
  if (parsed.length === 0) {
    const y = new Date().getFullYear();
    return () => y;
  }
  const start = parsed[0];
  const end = parsed[parsed.length - 1];
  if (start.year === end.year) return () => start.year;
  // Range crosses a year boundary (e.g. Dec 2025 – Jan 2026).
  return (monthIdx: number) => (monthIdx >= start.month ? start.year : end.year);
}

// Session type mapping — recognises both the current and legacy PTminder names.
const SESSION_TYPE_MAP: Record<string, SessionRow["sessionType"]> = {
  "offline - 60min": "OFFLINE",
  "offline - 90min": "OFFLINE",
  "offline-60min": "OFFLINE",
  "offline-90min": "OFFLINE",
  "online - 60min": "ONLINE",
  "online - 90min": "ONLINE",
  "online-60min": "ONLINE",
  "online-90min": "ONLINE",
  "functional patterns - 60min": "OFFLINE",
  "functional patterns - 90min": "OFFLINE",
  "functional patterns": "OFFLINE",
  "functional patterns offline": "OFFLINE",
  "functional patterns online": "ONLINE",
  "fp online": "ONLINE",
  truecoach: "TRUECOACH",
  "úvodný trénik offline": "UVODNE",
  "úvodný trénik online": "UVODNE",
  "úvodný trénik": "UVODNE",
  "úvodný trénink": "UVODNE",
  "uvodny trenink offline": "UVODNE",
  "uvodny trenink online": "UVODNE",
  "uvodny trenink": "UVODNE",
};

export const getSessionType = (name: string): SessionRow["sessionType"] => {
  const k = (name || "").toLowerCase().trim();
  if (SESSION_TYPE_MAP[k]) return SESSION_TYPE_MAP[k];
  if (k.includes("truecoach")) return "TRUECOACH";
  if (k.includes("uvod") || k.includes("úvod")) return "UVODNE";
  if (k.includes("online") || k.includes("fp online")) return "ONLINE";
  return "OFFLINE";
};

export const trainerShort = (s: string): string => {
  if (!s) return "—";
  if (s.includes("Jerry")) return "Jerry";
  if (s.includes("Terezka") || s.includes("Zaťková") || s.includes("Zatkova")) return "Terezka";
  if (s.includes("Matyáš") || s.includes("Matyas") || s.includes("Rozbořil")) return "Matyáš";
  if (s.includes("ProSapiens")) return "PSB";
  return s.trim();
};

// Minimal CSV line splitter honouring double-quoted fields (PTminder rarely
// quotes, but amounts like "CZK1,165.00" are the reason we still guard commas).
const splitCSVLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
};

export type CennikRiadok = { nazov: string; cena: number; obdobie: string; sedeni: string; aktivnych: number };

/** Cenníkový prehľad — šablóny balíčkov aj členstiev, bez mien klientov. */
export function parseCennik(text: string): CennikRiadok[] {
  const ls = lines(text);
  if (ls.length < 2) return [];
  const out: CennikRiadok[] = [];
  for (let i = 1; i < ls.length; i++) {
    const p = splitCSVLine(ls[i]);
    if (p.length < 5 || !p[0].trim()) continue;
    const cena = Number((p[1] || "").replace(/[^\d.]/g, ""));
    const aktivnych = Number((p[p.length - 3] || "").replace(/[^\d]/g, "")) || 0;
    out.push({
      nazov: p[0].trim(),
      cena: Number.isFinite(cena) ? cena : 0,
      obdobie: (p[2] || "").trim(),
      sedeni: (p[3] || "").trim(),
      aktivnych,
    });
  }
  return out;
}

export function detectCSVType(text: string): CSVType | null {
  const h = text.slice(0, 600).toLowerCase();
  if (h.includes("payments recorded report")) return "payments";
  if (h.includes("session name")) return "sessions";
  if (h.includes("staff,date,service type") || h.includes("service type,service description"))
    return "services";
  if (h.includes("first name,last name,client status") || h.includes("packages & memberships"))
    return "packages";
  if (h.includes("staff,date,time")) return "sessions";
  // Cenníkové prehľady z toho istého reportu: nemajú mená klientov, len šablóny
  // s cenou a počtom aktívnych. Bez kotvy na začiatok — súbor môže začínať BOM.
  if (h.includes("name,payment,duration")) return "cennik";

  // Marketingové exporty. Zatiaľ sa neparsujú do obrazoviek — ukladajú sa tak,
  // ako prišli. Dôvod je termín, nie lenivosť: v novembri Metricoolu prepadnú
  // staršie príspevky a spracovanie sa dá dorobiť kedykoľvek, dáta nie.
  if (h.includes("id,type,image,url,content,timestamp") || h.includes("id,url,image,title,date")
    || h.includes("hashtag,count,views")) return "metricool";
  if (h.includes("prehľad stavu prehľadov") || (h.startsWith("# ---") && h.includes("vlastníctvo"))) return "ga4";
  if (h.includes("kliknutia,zobrazenia,mp,pozícia") || h.includes("filter,hodnota")) return "gsc";

  // Anamnéza z Google formulára. Kotva je otázka o zdroji — je to jediný stĺpec,
  // ktorý appka z tohto exportu naozaj potrebuje, a zároveň sa nevyskytuje inde.
  if (h.includes("dozvěděli") || h.includes("časová pečiatka")) return "anamneza";
  return null;
}

const stripBOM = (t: string) => t.replace(/^﻿/, "");
const lines = (t: string) => stripBOM(t).split(/\r?\n/).filter((l) => l.trim());

export function parseSessions(text: string): SessionRow[] {
  const ls = lines(text);
  const rows: SessionRow[] = [];
  for (let i = 1; i < ls.length; i++) {
    const parts = splitCSVLine(ls[i]);
    if (parts.length < 6) continue;
    const staff = parts[0].trim();
    const dateStr = parts[1].trim();
    const time = parts[2].trim();
    const sessionName = parts[3].trim();
    const client = parts[4].trim();
    const price = parseCZK(parts[5]);
    const date = parsePTDate(dateStr);
    if (!date || !client) continue;
    rows.push({
      date: toUtcMidnight(date),
      time,
      client,
      sessionTrainer: trainerShort(staff),
      sessionName,
      sessionType: getSessionType(sessionName),
      price,
      duration: sessionName.includes("90") ? 90 : 60,
    });
  }
  return rows;
}

export function parseServices(text: string): ServiceRow[] {
  const ls = lines(text);
  const rows: ServiceRow[] = [];
  for (let i = 1; i < ls.length; i++) {
    const parts = splitCSVLine(ls[i]);
    if (parts.length < 6) continue;
    const staff = parts[0].trim();
    const dateStr = parts[1].trim();
    const serviceType = parts[2].trim();
    const desc = parts[3].trim();
    const client = parts[4].trim();
    const price = parseCZK(parts[5]);
    const date = parsePTDate(dateStr);
    if (!date || !client) continue;
    rows.push({
      date: toUtcMidnight(date),
      client,
      serviceType,
      description: desc,
      price,
      is6m: desc.toLowerCase().includes("s viazanost"),
      trainer: trainerShort(staff),
    });
  }
  return rows;
}

// Hierarchical: the day's date sits on a summary row (first column). Individual
// payments follow underneath with no date — propagate the current date down.
export function parsePayments(text: string): PaymentRow[] {
  const ls = lines(text);
  const rows: PaymentRow[] = [];
  const yearFor = paymentYearResolver(text);
  let currentDate: string | null = null;
  for (let i = 1; i < ls.length; i++) {
    const parts = splitCSVLine(ls[i]);
    const first = parts[0].trim();
    if (first && first.toLowerCase() !== "period") {
      const d = parsePTDate(first);
      if (d) {
        // Row date has no year — inject the year from the report title range.
        const m = d.getMonth();
        currentDate = new Date(Date.UTC(yearFor(m), m, d.getDate())).toISOString();
        continue;
      }
    }
    const detail = parts.length > 1 ? parts.slice(0, -1).join(",").trim() : "";
    const amount = parseCZK(parts[parts.length - 1]);
    if (!detail || !amount || !currentDate) continue;
    // Only real individual payments read "Payment (…) by Name:". This drops the
    // report's day-summary and grand-total rows that otherwise get counted as a
    // single giant anonymous payment.
    if (!/\bby\b/i.test(detail)) continue;
    const nameMatch = detail.match(/by\s+(.+?):/i);
    const client = nameMatch ? nameMatch[1].trim() : "";
    const method = detail.toLowerCase().includes("bank")
      ? "bank"
      : detail.toLowerCase().includes("cash")
        ? "cash"
        : "other";
    // Celý popis si necháme — môže v ňom byť kód zľavy (BTC10, RF10, Sleva30…),
    // ktorý je jediná cesta, ako prestať hádať dôvod nižšej sumy.
    rows.push({ date: currentDate, client, amount, method, note: detail.slice(0, 300) });
  }
  return rows;
}

// Find "X left from Y" (or the common variants "X/Y", "X of Y") anywhere in the
// row, so a shifted "# of sessions" column still parses. Ignores the classes
// column ("0 left from 0") in favour of the first non-zero-total match.
function extractSessions(parts: string[]): { remaining: number; total: number } {
  let fallback: { remaining: number; total: number } | null = null;
  for (const raw of parts) {
    const s = raw.trim();
    const m =
      s.match(/(\d+)\s+left\s+from\s+(\d+)/i) ||
      s.match(/^(\d+)\s*of\s*(\d+)$/i) ||
      s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) {
      const remaining = parseInt(m[1], 10);
      const total = parseInt(m[2], 10);
      if (total > 0) return { remaining, total }; // prefer a real session package
      fallback ||= { remaining, total };
    }
  }
  return fallback ?? { remaining: 0, total: 0 };
}

// "05 Jul; 2026" | "30 Jun  2026" → ISO deň
function ptDatum(s: string): string {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*;?\s+(\d{4})/.exec(s || "");
  if (!m) return "";
  const mes = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(m[2].toLowerCase().slice(0, 3));
  if (mes < 0) return "";
  return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function parsePackages(text: string): PackageRow[] {
  const ls = lines(text);
  if (!ls.length) return [];
  // Ten istý report má dva tvary: „Package" (bez platnosti) a „Membership"
  // (s obdobím a s hodinami v aktuálnom období). Rozlíšia sa podľa hlavičky.
  const hlavicka = splitCSVLine(ls[0]).map((h) => h.trim().toLowerCase());
  const idx = (...m: string[]) => hlavicka.findIndex((h) => m.some((x) => h.includes(x)));
  const iPlatba = idx("payment");
  const iPridane = idx("added");
  const iObdobie = idx("dates");
  const iExpiry = idx("expiry");
  const jeClenstvo = hlavicka.some((h) => h.includes("membership"));

  const rows: PackageRow[] = [];
  for (let i = 1; i < ls.length; i++) {
    const parts = splitCSVLine(ls[i]);
    if (parts.length < 4) continue;
    const name = `${parts[0].trim()} ${parts[1].trim()}`.trim();
    const status = parts.find((p) => /\b(active|inactive)\s+client\b/i.test(p))?.trim() || parts[2].trim();
    const pkg = parts[3].trim();
    const { remaining, total } = extractSessions(parts);

    // Platnosť: pri členstvách je to rozsah „30 Jun 2026 - 24 Aug 2026",
    // pri balíčkoch samostatný stĺpec Expiry (často prázdny).
    let od = "", do_ = "";
    if (iObdobie >= 0 && parts[iObdobie]) {
      const kusy = parts[iObdobie].split(/\s+-\s+/);
      od = ptDatum(kusy[0] || "");
      do_ = ptDatum(kusy[1] || "");
    }
    if (!do_ && iExpiry >= 0) do_ = ptDatum(parts[iExpiry] || "");

    const platba = iPlatba >= 0 ? Number((parts[iPlatba] || "").replace(/[^\d.]/g, "")) : NaN;

    rows.push({
      client: name, status, package: pkg, remaining, total,
      added: iPridane >= 0 ? ptDatum(parts[iPridane] || "") : "",
      validFrom: od, validTo: do_,
      payment: Number.isFinite(platba) && platba > 0 ? platba : undefined,
      kind: jeClenstvo ? "membership" : "package",
    });
  }
  return rows;
}

// Dedup keys per report type.
export const sessionKey = (r: SessionRow) => `${r.date}|${r.time}|${r.client}|${r.sessionTrainer}`;
export const serviceKey = (r: ServiceRow) => `${r.date}|${r.client}|${r.description}`;
export const paymentKey = (r: PaymentRow) => `${r.date}|${r.client}|${r.amount}`;

// ── Anamnéza (export z Google formulára) ─────────────────────────────────────
//
// Formulár zostáva tam, kde je — funguje a prerábať ho do appky by znamenalo
// riešiť prístupy aj zdravotné údaje v cudzej databáze. Appka si z exportu berie
// jedinú vec, ktorú inak nemá odkiaľ vziať: **odkiaľ sa klient o PSB dozvedel**.
// To je jediné miesto, kde sa marketing spája s peniazmi.
//
// Zdravotná časť anamnézy sa zámerne NEUKLADÁ. Nie je na ňu v appke dôvod a
// bola by to najcitlivejšia vec v celej databáze.
export type AnamnezaRiadok = { meno: string; zdroj: string; zdrojKto: string };

// Odpovede sú voľný text z formulára a ľudia píšu, čo chcú. Preto sa mapuje na
// pevný zoznam ZDROJE a všetko, čo vyzerá ako meno človeka, sa berie ako
// referencia — v praxi to tak vždy bolo („Knapcok", „manzelkina sestra…").
const zdrojZOdpovede = (raw: string): { zdroj: string; kto: string } => {
  const t = raw.trim();
  if (!t) return { zdroj: "", kto: "" };
  // Viacnásobná odpoveď: „Instagram;Functional Patterns" alebo „Reference;Meno".
  const casti = t.split(";").map((x) => x.trim()).filter(Boolean);
  const prva = casti[0].toLowerCase();
  const zvysok = casti.slice(1).join(", ");

  if (prva.startsWith("refer")) return { zdroj: "referencia", kto: zvysok };
  if (prva.includes("google")) return { zdroj: "google", kto: "" };
  if (prva.includes("instagram")) return { zdroj: "instagram", kto: "" };
  if (prva.includes("functional") || prva === "fp") return { zdroj: "fp", kto: "" };
  if (/tabul|bilboard|billboard|letak|letáč|leták|vonku|vonkajš|reklama z/.test(prva)) return { zdroj: "offline", kto: "" };
  if (/\bai\b|chatgpt|umel/.test(prva)) return { zdroj: "ai", kto: "" };
  // Zostáva voľný text. Ak obsahuje meno alebo vzťah, je to referencia; inak iné.
  if (/[a-zá-ž]/i.test(t)) return { zdroj: "referencia", kto: t };
  return { zdroj: "ine", kto: "" };
};

// Odpovede z formulára obsahujú odriadkovania vnútri úvodzoviek (ľudia píšu
// odseky), takže rozdelenie po riadkoch tu nestačí — potrebný je parser, ktorý
// vie, že nový záznam začína až mimo úvodzoviek.
const csvZaznamy = (text: string): string[][] => {
  const out: string[][] = [];
  let riadok: string[] = [];
  let cur = "";
  let inQ = false;
  const t = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') {
      if (inQ && t[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) { riadok.push(cur); cur = ""; }
    else if (ch === "\n" && !inQ) { riadok.push(cur); out.push(riadok); riadok = []; cur = ""; }
    else cur += ch;
  }
  if (cur || riadok.length) { riadok.push(cur); out.push(riadok); }
  return out.filter((r) => r.some((c) => c.trim()));
};

export function parseAnamneza(text: string): AnamnezaRiadok[] {
  const rows = csvZaznamy(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (frag: string) => head.findIndex((h) => h.includes(frag));
  const iMeno = idx("meno");
  const iPriezvisko = idx("příjmení") >= 0 ? idx("příjmení") : idx("priezvisko");
  const iZdroj = idx("dozvěděli") >= 0 ? idx("dozvěděli") : idx("dozvedeli");
  if (iMeno < 0 || iZdroj < 0) return [];

  const out: AnamnezaRiadok[] = [];
  for (const r of rows.slice(1)) {
    const meno = `${(r[iMeno] || "").trim()} ${(iPriezvisko >= 0 ? r[iPriezvisko] || "" : "").trim()}`.trim();
    if (!meno) continue;
    const { zdroj, kto } = zdrojZOdpovede(r[iZdroj] || "");
    if (!zdroj) continue;
    out.push({ meno, zdroj, zdrojKto: kto });
  }
  return out;
}

// ── Metricool ────────────────────────────────────────────────────────────────
//
// Tri tvary exportu (posty, reels, stories) s trochu inými hlavičkami. Namiesto
// troch parserov jeden, ktorý si stĺpce nájde podľa názvu — Metricool ich
// premenúva medzi verziami a pevné poradie by sa raz ticho rozsypalo.
export type MktPrispevok = {
  id: string;
  druh: "reel" | "post" | "story";
  datum: string;
  mesiac: string;
  url: string;
  hook: string;
  views: number;
  dosah: number;
  ulozenia: number;
  zdielania: number;
  komentare: number;
  lajky: number;
  spend: number;
  viewRate: number;
};

const cislo = (s: string | undefined): number => {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
};

/** „2026-05-18 15:42" aj „2026-05-18T…" → ISO deň. */
const denZDatumu = (s: string | undefined): string => {
  const t = (s || "").trim();
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(t);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

export function parseMetricool(text: string): MktPrispevok[] {
  const rows = csvZaznamy(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.replace(/^﻿/, "").trim().toLowerCase());
  const col = (...frag: string[]) => {
    for (const f of frag) {
      const i = head.findIndex((h) => h === f);
      if (i >= 0) return i;
    }
    for (const f of frag) {
      const i = head.findIndex((h) => h.includes(f));
      if (i >= 0) return i;
    }
    return -1;
  };
  const at = (r: string[], i: number) => (i >= 0 ? r[i] || "" : "");

  // Druh sa pozná podľa stĺpcov, nie podľa názvu súboru — ten si používateľ
  // premenuje alebo stiahne dvakrát ako „(1)".
  const jeReel = head.includes("% view rate (+3 secs)") || head.some((h) => h.includes("avg watch time"));
  const jeStory = head.some((h) => h.includes("taps forward")) || head.some((h) => h.includes("taps back"));
  const druh: MktPrispevok["druh"] = jeStory ? "story" : jeReel ? "reel" : "post";

  const iId = col("id");
  const iUrl = col("url", "post url");
  const iDatum = col("date", "timestamp");
  const iHook = col("title", "content");
  const iViews = col("views (organic)", "views", "impressions (organic)");
  const iDosah = col("reach (organic)");
  const iUloz = col("saved (organic)", "saved");
  const iZdiel = col("shares (organic)", "shares", "reposts");
  const iKom = col("comments (organic)", "comments", "replies");
  const iLajk = col("likes (organic)", "likes");
  const iSpend = col("spend");
  const iVr = col("% view rate (+3 secs)");

  const out: MktPrispevok[] = [];
  for (const r of rows.slice(1)) {
    const datum = denZDatumu(at(r, iDatum));
    if (!datum) continue;
    // Stories nemajú Id — kľúčom je URL. Bez stabilného kľúča by každý ďalší
    // export pridal tie isté príspevky znova.
    const id = (at(r, iId) || at(r, iUrl)).trim();
    if (!id) continue;
    out.push({
      id,
      druh,
      datum,
      mesiac: datum.slice(0, 7),
      url: at(r, iUrl).trim(),
      hook: at(r, iHook).replace(/\s+/g, " ").trim().slice(0, 300),
      views: Math.round(cislo(at(r, iViews))),
      dosah: Math.round(cislo(at(r, iDosah))),
      ulozenia: Math.round(cislo(at(r, iUloz))),
      zdielania: Math.round(cislo(at(r, iZdiel))),
      komentare: Math.round(cislo(at(r, iKom))),
      lajky: Math.round(cislo(at(r, iLajk))),
      spend: cislo(at(r, iSpend)),
      viewRate: cislo(at(r, iVr)),
    });
  }
  return out;
}
