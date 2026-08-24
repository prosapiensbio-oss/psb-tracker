// Pure formatting + date helpers. No browser globals — SSR/server safe.

export const fmtDate = (d?: string | null): string =>
  d ? new Date(d).toLocaleDateString("cs-CZ") : "—";

export const fmtCZK = (n?: number | null): string =>
  n != null ? Math.round(n).toLocaleString("cs-CZ") + " CZK" : "—";

export const fmtNum = (n: number, digits = 0): string =>
  n.toLocaleString("cs-CZ", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const monthKey = (d?: string | null): string => {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

const MONTHS_SK = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];

// Monday (UTC) of the week the date falls in.
export const weekStart = (d: string | Date): Date => {
  const dt = new Date(d);
  const day = dt.getUTCDay(); // 0 = Sun
  const delta = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + delta));
};

// Sortable week key = the Monday's ISO date (unique per week, string-sortable).
export const weekKey = (d?: string | null): string => {
  if (!d) return "";
  return weekStart(d).toISOString().slice(0, 10);
};

// Human week label = the Monday's day.month, e.g. "14.7." — instantly readable.
export const weekLabel = (d?: string | null): string => {
  if (!d) return "";
  const m = weekStart(d);
  return `${m.getUTCDate()}.${m.getUTCMonth() + 1}.`;
};

export const quarterKey = (d?: string | null): string => {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getFullYear()}-Q${Math.floor(dt.getMonth() / 3) + 1}`;
};

export const quarterLabel = (qk: string): string => {
  const [y, q] = qk.split("-Q");
  return q ? `Q${q} ${y.slice(2)}` : qk;
};

// "2026-07" → "júl 26"
export const monthLabel = (mk: string): string => {
  const [y, m] = mk.split("-");
  return m ? `${MONTHS_SK[parseInt(m, 10) - 1]} ${y.slice(2)}` : mk;
};

export const monthsBetween = (d1: string, d2: string | Date): number => {
  const a = new Date(d1);
  const b = new Date(d2);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
};

export const daysBetween = (d1: string | Date, d2: string | Date): number =>
  Math.floor((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000);

// Normalise a person's name for tolerant matching across reports / user input:
// strip diacritics, lowercase, collapse whitespace. So "Jakub Stigut" == "Jakub Štigut".
export const normName = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// "2026-07-24T…" or "2026-07-24" → "24.7.2026" (Slovak short date).
export const fmtDMY = (d: string | Date): string => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
};

/**
 * Je to platný mesiac vo tvare RRRR-MM?
 *
 * PREČO NESTAČÍ `\d{4}-\d{2}`
 *
 * Ten vzor pustí „2026-13" aj „2026-00" — dva číslice sú dve číslice. 23. 8.
 * 2026 tak prešiel plán začínajúci trinástym mesiacom a appka z neho vyrobila
 * prázdne obdobie bez jediného varovania. Mesiac musí byť 01–12.
 */
export const jeMesiac = (v: unknown): boolean => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(v ?? ""));
  if (!m) return false;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12;
};
