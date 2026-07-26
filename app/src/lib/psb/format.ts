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

// ISO-ish week key (matches the reference prototype).
export const weekKey = (d?: string | null): string => {
  if (!d) return "";
  const dt = new Date(d);
  const yr = dt.getFullYear();
  const start = new Date(yr, 0, 1);
  const diff = Math.floor((dt.getTime() - start.getTime()) / 86400000);
  const wk = Math.ceil((diff + start.getDay() + 1) / 7);
  return `T${wk}/${yr}`;
};

export const quarterKey = (d?: string | null): string => {
  if (!d) return "";
  const dt = new Date(d);
  return `Q${Math.floor(dt.getMonth() / 3) + 1}/${dt.getFullYear()}`;
};

export const monthLabel = (mk: string): string => {
  const [y, m] = mk.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "Máj", "Jún", "Júl", "Aug", "Sep", "Okt", "Nov", "Dec"];
  return m ? `${names[parseInt(m, 10) - 1]} ${y}` : mk;
};

export const monthsBetween = (d1: string, d2: string | Date): number => {
  const a = new Date(d1);
  const b = new Date(d2);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
};

export const daysBetween = (d1: string | Date, d2: string | Date): number =>
  Math.floor((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000);
