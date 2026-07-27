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

export function detectCSVType(text: string): CSVType | null {
  const h = text.slice(0, 600).toLowerCase();
  if (h.includes("payments recorded report")) return "payments";
  if (h.includes("session name")) return "sessions";
  if (h.includes("staff,date,service type") || h.includes("service type,service description"))
    return "services";
  if (h.includes("first name,last name,client status") || h.includes("packages & memberships"))
    return "packages";
  if (h.includes("staff,date,time")) return "sessions";
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
    rows.push({ date: currentDate, client, amount, method });
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

export function parsePackages(text: string): PackageRow[] {
  const ls = lines(text);
  const rows: PackageRow[] = [];
  for (let i = 1; i < ls.length; i++) {
    const parts = splitCSVLine(ls[i]);
    if (parts.length < 4) continue;
    const name = `${parts[0].trim()} ${parts[1].trim()}`.trim();
    const status = parts.find((p) => /\b(active|inactive)\s+client\b/i.test(p))?.trim() || parts[2].trim();
    const pkg = parts[3].trim();
    const { remaining, total } = extractSessions(parts);
    rows.push({ client: name, status, package: pkg, remaining, total });
  }
  return rows;
}

// Dedup keys per report type.
export const sessionKey = (r: SessionRow) => `${r.date}|${r.time}|${r.client}|${r.sessionTrainer}`;
export const serviceKey = (r: ServiceRow) => `${r.date}|${r.client}|${r.description}`;
export const paymentKey = (r: PaymentRow) => `${r.date}|${r.client}|${r.amount}`;
