// All derived analytics for the PSB Tracker. Pure functions over PSBData —
// no browser globals. Reused across every module.
import { daysBetween, fmtDMY, monthKey, monthLabel, monthsBetween, normName, quarterKey, quarterLabel, weekKey, weekLabel } from "./format";
import type {
  PackageRow,
  PaymentRow,
  PSBData,
  SessionRow,
} from "./types";

export const TRAINERS = ["Jerry", "Terezka"] as const;
export type TrainerName = string;

// Group a raw membership name into a friendly package bucket (shared by the
// dashboard + Klienti donuts and the Klienti package filter).
export const membershipBucket = (m: string): string => {
  const s = (m || "").toLowerCase();
  if (/s viazanost/.test(s)) return "6h S viazanostou (6M)";
  if (/one year|ročn|rok/.test(s)) return "Ročné (ONE YEAR)";
  // "^on[ -]" matches the online product prefix ("ON - 6h…") without catching
  // words that merely start with "on" (e.g. "ONE YEAR", handled just above).
  if (/^on[ -]|online/.test(s)) return "Online balíček";
  if (/18 hod/.test(s)) return "18 hodín";
  if (/8 hod/.test(s)) return "8 hodín";
  if (/1 hod/.test(s)) return "1 hodina";
  if (/bez viazanosti/.test(s)) return "6h BEZ viazanosti";
  if (/doplnenie/.test(s)) return "Doplnenie členstva";
  if (/special|špeci/.test(s)) return "Špeciál";
  if (!m) return "Bez balíčka";
  return "Iné";
};
export const MEMBERSHIP_ORDER = [
  "6h S viazanostou (6M)",
  "6h BEZ viazanosti",
  "8 hodín",
  "18 hodín",
  "1 hodina",
  "Online balíček",
  "Ročné (ONE YEAR)",
  "Doplnenie členstva",
  "Špeciál",
  "Bez balíčka",
  "Iné",
] as const;

// ── segmentation window ──────────────────────────────────────────────────────
const SEG_WEEKS = 18;
const ANCHOR_H = 1.08;
const STABLE_H = 0.66;
const SPORADIC_H = 0.33;
export const TARGET_H = 29; // ideal weekly hours per trainer (golden middle of 24–34)
export const ZONE_LO = 24;
export const ZONE_HI = 34;

const refNow = (data: PSBData): Date => {
  let max = 0;
  for (const s of data.sessions) {
    const t = new Date(s.date).getTime();
    if (t > max) max = t;
  }
  const now = Date.now();
  // Use the later of "today" and the newest data point so a fresh live upload
  // and an all-historical seed both behave sensibly.
  return new Date(Math.max(now, max || now));
};

const lastWeekKeys = (ref: Date): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < SEG_WEEKS; i++) {
    const d = new Date(ref.getTime() - i * 7 * 86400000);
    set.add(weekKey(d.toISOString()));
  }
  return set;
};

export type ClientAgg = {
  name: string;
  sessions: SessionRow[];
  sessionCount: number;
  totalHours: number;
  totalPrice: number;
  paidAvg: number;
  avgPrice: number;
  firstSession: string;
  lastSession: string;
  attendance: number; // 0..1 over last 18 weeks
  segment: "Anchor" | "Stabilný" | "Sporadický";
  trainers: Record<string, number>;
  primaryTrainer: string;
  primaryTrainerOverride: boolean;
  substituteCount: number;
  statusAuto: string;
  status: string;
  statusOverride: boolean;
  pauseUntil?: string; // ISO date — when a "Pauza" is meant to end (from status override "Pauza|YYYY-MM-DD")
  specialRate: boolean;
  specialRateNote: string;
  trainerNote: string;
  contractSigned: boolean;
  bitcoin: boolean;
  duch: string;
  zdroj: string;
  zdrojKto: string;
  clientType: "6M Predplatné" | "Balíček";
  is6m: boolean;
  membership: string; // current product from Packages report (e.g. "OFF - 6h S viazanostou")
  modality: "Offline" | "Online";
  serviceCount: number;
  packageRemaining: number;
  packageTotal: number;
  packageStatus: string;
};

// A client is in the 6M process if a "S viazanostou" service was sold to them
// OR their current membership (Packages report) is a "S viazanostou" product.
// The service report attributes all such sales to the seller (Jerry), so the
// packages source is essential to catch the other trainer's 6M clients.
export function sixMClientSet(data: PSBData): Set<string> {
  const set = new Set<string>();
  for (const s of data.services) if (s.is6m) set.add(s.client);
  for (const p of data.packages) if (/s viazanost/i.test(p.package)) set.add(p.client);
  return set;
}

export function deriveClients(data: PSBData): Record<string, ClientAgg> {
  const ref = refNow(data);
  const window = lastWeekKeys(ref);
  const map: Record<string, ClientAgg> = {};

  for (const s of data.sessions) {
    let c = map[s.client];
    if (!c) {
      c = map[s.client] = {
        name: s.client,
        sessions: [],
        sessionCount: 0,
        totalHours: 0,
        totalPrice: 0,
        paidAvg: 0,
        avgPrice: 0,
        firstSession: s.date,
        lastSession: s.date,
        attendance: 0,
        segment: "Sporadický",
        trainers: {},
        primaryTrainer: "—",
        primaryTrainerOverride: false,
        substituteCount: 0,
        statusAuto: "Neaktívny",
        status: "Neaktívny",
        statusOverride: false,
        specialRate: false,
        specialRateNote: "",
        trainerNote: "",
        contractSigned: false,
        bitcoin: false,
        duch: "",
        zdroj: "",
        zdrojKto: "",
        clientType: "Balíček",
        is6m: false,
        membership: "",
        modality: "Offline",
        serviceCount: 0,
        packageRemaining: 0,
        packageTotal: 0,
        packageStatus: "",
      };
    }
    c.sessions.push(s);
    c.trainers[s.sessionTrainer] = (c.trainers[s.sessionTrainer] || 0) + 1;
    if (s.date < c.firstSession) c.firstSession = s.date;
    if (s.date > c.lastSession) c.lastSession = s.date;
    c.totalHours += s.duration / 60;
    c.totalPrice += s.price;
  }

  const sixMSet = sixMClientSet(data);
  const serviceCounts: Record<string, number> = {};
  for (const s of data.services) serviceCounts[s.client] = (serviceCounts[s.client] || 0) + 1;
  const packByClient: Record<string, PackageRow[]> = {};
  for (const p of data.packages) (packByClient[p.client] ||= []).push(p);

  for (const c of Object.values(map)) {
    c.sessionCount = c.sessions.length;
    c.avgPrice = c.sessionCount ? c.totalPrice / c.sessionCount : 0;
    const paid = c.sessions.filter((s) => s.price > 0);
    c.paidAvg = paid.length ? paid.reduce((a, s) => a + s.price, 0) / paid.length : 0;

    const clientWeeks = new Set(c.sessions.map((s) => weekKey(s.date)));
    let hit = 0;
    for (const w of clientWeeks) if (window.has(w)) hit++;
    // Menovateľ je počet týždňov, ktoré klient MOHOL odchodiť — nie vždy 18.
    // Predtým sa delilo natvrdo osemnástimi, takže klient, ktorý chodí dva
    // týždne, vyšiel na 2/18 = 0,11 a appka ho označila za neaktívneho a skryla
    // ho zo zoznamu klientov. Merala ho za obdobie, v ktorom ešte neexistoval.
    // Dolná hranica 6 týždňov bráni opačnému extrému: jeden tréning v prvom
    // týždni by inak spravil 1/1 = Anchor.
    const prve = c.sessions.reduce((min, s) => (s.date < min ? s.date : min), c.sessions[0]?.date || "");
    const tyzdnovOdZaciatku = prve ? Math.floor(daysBetween(prve, new Date()) / 7) + 1 : SEG_WEEKS;
    c.attendance = hit / Math.max(6, Math.min(SEG_WEEKS, tyzdnovOdZaciatku));
    c.segment = c.attendance >= 0.84 ? "Anchor" : c.attendance >= 0.5 ? "Stabilný" : "Sporadický";

    const ov = data.clientOverrides?.[c.name];
    const autoPrimary =
      Object.entries(c.trainers).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    c.primaryTrainer = ov?.primaryTrainer || autoPrimary;
    c.primaryTrainerOverride = !!ov?.primaryTrainer;
    c.substituteCount = c.sessions.filter((s) => s.sessionTrainer !== c.primaryTrainer).length;

    c.statusAuto =
      c.attendance >= 0.5 ? "Aktívny" : c.attendance >= 0.16 ? "Sporadický" : "Neaktívny";
    // A "Pauza" override may carry an end date encoded as "Pauza|YYYY-MM-DD".
    const rawStatus = ov?.status || null;
    if (rawStatus && rawStatus.startsWith("Pauza")) {
      c.status = "Pauza";
      const bar = rawStatus.indexOf("|");
      c.pauseUntil = bar >= 0 ? rawStatus.slice(bar + 1).trim() || undefined : undefined;
    } else {
      c.status = rawStatus || c.statusAuto;
      c.pauseUntil = undefined;
    }
    c.statusOverride = !!ov?.status;
    c.specialRate = !!ov?.specialRate;
    c.specialRateNote = ov?.specialRateNote || "";
    c.trainerNote = ov?.trainerNote || "";
    c.contractSigned = !!ov?.contractSigned;
    c.bitcoin = !!ov?.bitcoin;
    c.duch = ov?.duch || "";
    c.zdroj = ov?.zdroj || "";
    c.zdrojKto = ov?.zdrojKto || "";
    c.is6m = sixMSet.has(c.name);
    c.clientType = c.is6m ? "6M Predplatné" : "Balíček";
    c.serviceCount = serviceCounts[c.name] || 0;

    const packs = packByClient[c.name] || [];
    // Use only the ACTIVE package, not the sum across rows — a renewed client has
    // an old depleted row (0/18) plus a new one (17/18); summing gave a wrong 17/36.
    // Pick the row with the most sessions remaining (the live package); if all are
    // depleted, the one with the largest total (the most significant package).
    const active = packs.slice().sort((a, b) => b.remaining - a.remaining || b.total - a.total)[0];
    c.packageRemaining = active?.remaining ?? 0;
    c.packageTotal = active?.total ?? 0;
    c.packageStatus = active?.status || "";
    c.membership = active?.package || "";

    let off = 0;
    let on = 0;
    for (const s of c.sessions) s.sessionType === "OFFLINE" || s.sessionType === "UVODNE" ? off++ : on++;
    c.modality = on > off ? "Online" : "Offline";
  }
  return map;
}

// ── 6M tracker ───────────────────────────────────────────────────────────────
export type SixMRow = {
  client: string;
  startDate: string;
  price: number;
  primaryTrainer: string;
  months: number;
  phase: "Obnova" | "Integrácia" | "Udržateľnosť";
  monthInPhase: number;
  alert: string;
  alertTone: "red" | "orange" | "";
  historyBefore: string;
  lastSession?: string;
  contractSigned: boolean;
  trainerNote: string;
};

export function deriveSixM(data: PSBData, clients: Record<string, ClientAgg>): SixMRow[] {
  const members = sixMClientSet(data);
  // Earliest 6M signal per client: a "S viazanostou" service, or a 6990 monthly
  // payment (the recurring price). This recovers the true start for clients
  // whose sale isn't in the service report (e.g. the other trainer's clients).
  const first: Record<string, { date: string; trainer: string; price: number }> = {};
  const consider = (client: string, date: string, trainer: string, price: number) => {
    if (!members.has(client)) return;
    if (!first[client] || date < first[client].date) first[client] = { date, trainer, price };
  };
  for (const s of data.services) if (s.is6m) consider(s.client, s.date, s.trainer, s.price);
  for (const p of data.payments) if (Math.round(p.amount) === 6990) consider(p.client, p.date, "", 6990);
  // Any 6M member still without a start date: fall back to their first session.
  for (const client of members) {
    if (first[client]) continue;
    const cl = clients[client];
    if (cl) first[client] = { date: cl.firstSession, trainer: cl.primaryTrainer, price: 6990 };
  }
  const now = new Date();
  return Object.entries(first)
    .map(([client, info]) => {
      const months = monthsBetween(info.date, now);
      let phase: SixMRow["phase"];
      let monthInPhase: number;
      if (months <= 6) {
        phase = "Obnova";
        monthInPhase = months;
      } else if (months <= 18) {
        phase = "Integrácia";
        monthInPhase = months - 6;
      } else {
        phase = "Udržateľnosť";
        monthInPhase = months - 18;
      }
      let alert = "";
      let alertTone: SixMRow["alertTone"] = "";
      if (phase === "Obnova" && monthInPhase === 5) {
        alert = "⚠️ 5. MESIAC — HODNOTIACI ROZHOVOR";
        alertTone = "red";
      } else if (phase === "Obnova" && monthInPhase >= 6) {
        alert = "🔄 Prechod — Integrácia";
        alertTone = "orange";
      } else if (phase === "Integrácia" && monthInPhase >= 12) {
        alert = "🔄 Prechod — Udržateľnosť";
        alertTone = "orange";
      }
      const cl = clients[client];
      const historyBefore =
        cl?.firstSession && new Date(cl.firstSession) < new Date(info.date)
          ? `Balíček ${monthsBetween(cl.firstSession, info.date)}m pred vstupom`
          : "";
      const ov = data.clientOverrides?.[client];
      return {
        client,
        startDate: info.date,
        price: info.price,
        primaryTrainer: cl?.primaryTrainer || info.trainer,
        months,
        phase,
        monthInPhase,
        alert,
        alertTone,
        historyBefore,
        lastSession: cl?.lastSession,
        contractSigned: !!ov?.contractSigned,
        trainerNote: ov?.trainerNote || "",
      };
    })
    .sort(
      (a, b) =>
        (a.primaryTrainer || "").localeCompare(b.primaryTrainer || "") ||
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
}

// ── period grouping (Prehľad) ────────────────────────────────────────────────
export type Period = "week" | "month" | "quarter" | "custom";

// Returns a sortable grouping key + a human display label per period type.
const periodInfo = (d: string, period: Period): { key: string; label: string } => {
  if (period === "week") return { key: weekKey(d), label: weekLabel(d) };
  if (period === "quarter") return { key: quarterKey(d), label: quarterLabel(quarterKey(d)) };
  return { key: monthKey(d), label: monthLabel(monthKey(d)) };
};

export type PeriodRow = {
  key: string;
  ts: number; // earliest timestamp in the period, for chronological sorting
  total: { hours: number; sessions: number; clients: number; revenue: number };
  byTrainer: Record<string, { hours: number; sessions: number; clients: Set<string> }>;
  score: number;
  recommendation: string;
};

const zoneForPeriod = (period: Period) => {
  // Weekly zone 24–34; scale for month (~4.3x) and quarter (~13x).
  const factor = period === "week" ? 1 : period === "quarter" ? 13 : 4.33;
  const lo = ZONE_LO * factor;
  const hi = ZONE_HI * factor;
  return { lo, hi };
};

export function groupTrainings(
  sessions: SessionRow[],
  period: Period,
  trainerFilter: string,
  range?: { from?: string; to?: string },
): PeriodRow[] {
  const map: Record<string, PeriodRow> = {};
  for (const s of sessions) {
    if (trainerFilter !== "all" && s.sessionTrainer !== trainerFilter) continue;
    if (range?.from && s.date < range.from) continue;
    if (range?.to && s.date > range.to + "T23:59:59.999Z") continue;
    const info = period === "custom" ? { key: "custom", label: "Vlastné obdobie" } : periodInfo(s.date, period);
    let g = map[info.key];
    if (!g) {
      g = map[info.key] = {
        key: info.label,
        ts: new Date(s.date).getTime(),
        total: { hours: 0, sessions: 0, clients: 0, revenue: 0 },
        byTrainer: {},
        score: 0,
        recommendation: "",
      };
    }
    g.ts = Math.min(g.ts, new Date(s.date).getTime());
    g.total.hours += s.duration / 60;
    g.total.sessions++;
    g.total.revenue += s.price;
    const bt = (g.byTrainer[s.sessionTrainer] ||= { hours: 0, sessions: 0, clients: new Set() });
    bt.hours += s.duration / 60;
    bt.sessions++;
    bt.clients.add(s.client);
  }
  const rows = Object.values(map);
  for (const g of rows) {
    const allClients = new Set<string>();
    for (const bt of Object.values(g.byTrainer)) for (const c of bt.clients) allClients.add(c);
    g.total.clients = allClients.size;
    // Score 1–10 from proximity to the healthy zone midpoint per active trainer.
    const activeTrainers = TRAINERS.filter((t) => g.byTrainer[t]);
    const { lo, hi } = zoneForPeriod(period);
    const mid = (lo + hi) / 2;
    let sc = 0;
    const denom = activeTrainers.length || 1;
    for (const t of activeTrainers) {
      const h = g.byTrainer[t].hours;
      const dev = Math.abs(h - mid) / mid; // 0 = perfect
      sc += Math.max(0, 10 - dev * 12);
    }
    g.score = Math.round(Math.min(10, sc / denom));
    const totalH = g.total.hours;
    if (totalH < lo) g.recommendation = "Pod zónou — priestor prijať klientov";
    else if (totalH > hi) g.recommendation = "Nad zónou — riziko preťaženia";
    else g.recommendation = "Zdravá zóna";
  }
  return rows.sort((a, b) => a.ts - b.ts);
}

export const periodZone = zoneForPeriod;

// ── session type analysis ────────────────────────────────────────────────────
export type AnalysisRow = {
  month: string;
  trainer: string;
  OFFLINE: number;
  ONLINE: number;
  TRUECOACH: number;
  UVODNE: number;
  total: number;
};

export function sessionAnalysis(sessions: SessionRow[]): AnalysisRow[] {
  const map: Record<string, AnalysisRow> = {};
  for (const s of sessions) {
    const mk = monthKey(s.date);
    const k = `${mk}|${s.sessionTrainer}`;
    const r = (map[k] ||= {
      month: mk,
      trainer: s.sessionTrainer,
      OFFLINE: 0,
      ONLINE: 0,
      TRUECOACH: 0,
      UVODNE: 0,
      total: 0,
    });
    r[s.sessionType]++;
    r.total++;
  }
  return Object.values(map).sort(
    (a, b) => a.month.localeCompare(b.month) || a.trainer.localeCompare(b.trainer),
  );
}

// PSB total per month, Online + TrueCoach combined per spec.
export type PsbAnalysisRow = { month: string; offline: number; onlineTc: number; uvodne: number; total: number };
export function sessionAnalysisPSB(sessions: SessionRow[]): PsbAnalysisRow[] {
  const map: Record<string, PsbAnalysisRow> = {};
  for (const s of sessions) {
    const mk = monthKey(s.date);
    const r = (map[mk] ||= { month: mk, offline: 0, onlineTc: 0, uvodne: 0, total: 0 });
    if (s.sessionType === "OFFLINE") r.offline++;
    else if (s.sessionType === "UVODNE") r.uvodne++;
    else r.onlineTc++; // ONLINE + TRUECOACH combined
    r.total++;
  }
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

// ── capacity calculator ──────────────────────────────────────────────────────
export type CapacityRow = {
  trainer: string;
  anchor: number;
  stable: number;
  sporadic: number;
  clients: number;
  effHours: number; // segment-weighted (portfolio quality) — kept for reference
  // "Dvojitý strop" real-hours capacity:
  recentWeekly: number; // avg hours/week over the last ~8 weeks — the typical week
  busyWeekly: number; // 80th-percentile week over 12 weeks — a typically busy week
  peakWeekly: number; // absolute max week (12 wks) — reference only
  canTake: number; // more avg clients until typical→29h OR busy→34h, whichever first
  util: number; // the binding constraint as % — how full you really are
  advice: string;
};

const CAP_AVG_WEEKS = 8;
const CAP_PEAK_WEEKS = 12;
const BUSY_CAP = ZONE_HI; // 34h — busy weeks must not exceed the zone top

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  return lo >= a.length - 1 ? a[lo] : a[lo] + (a[lo + 1] - a[lo]) * (i - lo);
}

export function capacityByTrainer(clients: Record<string, ClientAgg>, sessions: SessionRow[]): CapacityRow[] {
  const allWeeks = [...new Set(sessions.map((s) => weekKey(s.date)))].sort();
  const avgWeeks = new Set(allWeeks.slice(-CAP_AVG_WEEKS));
  const peakWeeks = allWeeks.slice(-CAP_PEAK_WEEKS);
  const nAvg = avgWeeks.size || 1;

  return TRAINERS.map((trainer) => {
    const cl = Object.values(clients).filter((c) => c.primaryTrainer === trainer && c.status !== "Neaktívny");
    const anchor = cl.filter((c) => c.segment === "Anchor").length;
    const stable = cl.filter((c) => c.segment === "Stabilný").length;
    const sporadic = cl.filter((c) => c.segment === "Sporadický").length;
    const clientCount = cl.length;
    const effHours = anchor * ANCHOR_H + stable * STABLE_H + sporadic * SPORADIC_H;

    const perWeek: Record<string, number> = {};
    let avgHours = 0;
    for (const s of sessions) {
      if (s.sessionTrainer !== trainer) continue;
      const w = weekKey(s.date);
      perWeek[w] = (perWeek[w] || 0) + s.duration / 60;
      if (avgWeeks.has(w)) avgHours += s.duration / 60;
    }
    const recentWeekly = avgHours / nAvg;
    const peakVals = peakWeeks.map((w) => perWeek[w] || 0);
    const busyWeekly = percentile(peakVals, 0.8);
    const peakWeekly = Math.max(0, ...peakVals);

    // Double cap: grow until the TYPICAL week reaches 29h OR a BUSY week reaches
    // 34h — whichever comes first. Each added client behaves like the current
    // average client (raises load by load/clientCount).
    const roomTypical = recentWeekly > 0 ? clientCount * ((TARGET_H - recentWeekly) / recentWeekly) : 0;
    const roomBusy = busyWeekly > 0 ? clientCount * ((BUSY_CAP - busyWeekly) / busyWeekly) : 0;
    const canTake = Math.max(0, Math.floor(Math.min(roomTypical, roomBusy)));
    // Utilisation = the tighter constraint (typical vs 29h, busy vs 34h).
    const util = Math.round(Math.max(recentWeekly / TARGET_H, busyWeekly / BUSY_CAP) * 100);

    const advice =
      util >= 100
        ? `Na strope — typický ${recentWeekly.toFixed(0)}h / rušný ${busyWeekly.toFixed(0)}h; priestor len cez zástup`
        : `Zvládne ešte ~${canTake} klientov (typický týždeň → ${TARGET_H}h, rušný → ${BUSY_CAP}h)`;

    return { trainer, anchor, stable, sporadic, clients: clientCount, effHours, recentWeekly, busyWeekly, peakWeekly, canTake, util, advice };
  });
}

// ── finance ──────────────────────────────────────────────────────────────────
export type FinanceMonth = {
  month: string;
  revenue: number;
  sessions: number;
  cash: number;
  byTrainer: Record<string, { revenue: number; sessions: number }>;
};

export function monthlyFinance(data: PSBData): FinanceMonth[] {
  const map: Record<string, FinanceMonth> = {};
  const get = (mk: string) =>
    (map[mk] ||= { month: mk, revenue: 0, sessions: 0, cash: 0, byTrainer: {} });
  for (const s of data.sessions) {
    const m = get(monthKey(s.date));
    m.revenue += s.price;
    m.sessions++;
    const bt = (m.byTrainer[s.sessionTrainer] ||= { revenue: 0, sessions: 0 });
    bt.revenue += s.price;
    bt.sessions++;
  }
  // Skip unattributable rows (empty client) — those are report summary/total
  // lines, not real payments, and would blow up the cashflow total.
  for (const p of data.payments) {
    if (!p.client) continue;
    get(monthKey(p.date)).cash += p.amount;
  }
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

// ── anomalies (persistent register) ──────────────────────────────────────────
export type Anomaly = {
  key: string;
  tone: "red" | "orange" | "blue";
  label: string;
  detail: string;
  acked: boolean;
  note?: string;
  client?: string; // the client this item is about (for click-through to Klienti)
};

// Practical, client-centric signals — one item per client per type (deduped),
// the actionable things a trainer should follow up on this week.
export function deriveAnomalies(data: PSBData, clients: Record<string, ClientAgg>): Anomaly[] {
  const out: Anomaly[] = [];
  const ack = data.anomalyAck || {};
  const push = (key: string, tone: Anomaly["tone"], label: string, detail: string, client?: string) =>
    out.push({ key, tone, label, detail, acked: !!ack[key], note: ack[key]?.note, client });

  const serviceClients = new Set(data.services.map((s) => s.client));
  const now = new Date();

  for (const c of Object.values(clients)) {
    // "Pauza" = agreed temporary break — silences activity/renewal anomalies.
    // But once a DATED pause is over, surface a reminder to reach out.
    if (c.status === "Pauza") {
      if (c.pauseUntil && daysBetween(c.pauseUntil, now) >= 0) {
        push(`pauzakoniec|${c.name}`, "orange", "Pauza sa skončila", `${c.name}: dohodnutá pauza sa skončila (${fmtDMY(c.pauseUntil)}) — ozvi sa a naplánujte tréning`, c.name);
      }
      continue;
    }
    if (c.status === "Neaktívny") continue;
    const days = daysBetween(c.lastSession, now);

    // Regular client who stopped coming — reach out before they churn.
    // (Package-balance + no-package signals live in the "Blíži sa koniec balíčka"
    // widget / Klienti, so they're intentionally NOT duplicated here.)
    if ((c.segment === "Anchor" || c.segment === "Stabilný") && days >= 14 && days <= 60) {
      push(`gone|${c.name}`, days >= 21 ? "red" : "orange", "Prestal chodiť", `${c.name}: ${days} dní bez tréningu (${c.segment}) — ozvi sa`, c.name);
    }

    // "Duch": kúpi balíček, odchodí pár hodín a prestane chodiť AJ odpisovať.
    // Jerryho najčastejší spôsob odchodu — kúpi 7 hodín, príde na 3, zvyšok
    // prepadne. Krátkodobo hotovosť za neodrobenú prácu, dlhodobo stratený
    // klient za ~27 000 Kč a blokované miesto.
    //
    // Ducha definuje TICHO, nie počet nedochodených hodín. Klient, ktorý si
    // minulý týždeň kúpil balíček a odtrénoval tri hodiny, vyzerá v dátach
    // rovnako ako ten, čo po troch hodinách zmizol — líšia sa len tým, kedy
    // naposledy prišli. Preto je jediná podmienka mesiac bez tréningu.
    //
    // A preto je to OTÁZKA, nie tvrdenie: appka nevie, či si medzitým nepísali,
    // či klient nie je na dovolenke a či sa už nedohodli na termíne. Odpoveď sa
    // uloží (duch = "ano" / "nie"), takže sa tá istá otázka nepýta dokola.
    if (days >= 30 && !c.duch) {
      const hodiny = c.packageRemaining > 0
        ? ` a ešte má ${c.packageRemaining} z ${c.packageTotal} zaplatených hodín`
        : "";
      push(
        `duch|${c.name}`,
        days >= 60 ? "red" : "orange",
        "Je toto duch?",
        `${c.name}: ${days} dní bez tréningu${hodiny} — je to duch, alebo to má vysvetlenie?`,
        c.name,
      );
    }
  }

  // Rozhodnutie, ktorému prešiel termín overenia. Bez tohto by záver z debaty
  // žil len v Jarvisovom prompte a vrátil by sa k nemu, len keď sa naň niekto
  // sám spýta — čiže nikdy. Tu sa ozve sám.
  const dnes = new Date().toISOString().slice(0, 10);
  for (const z of data.zavery || []) {
    if (!z.overitDo || z.overitDo > dnes) continue;
    push(
      `zaver|${z.id}`,
      "blue",
      "Čas overiť rozhodnutie",
      `Z ${z.datum}: ${z.zaver}${z.overit ? ` — malo sa overiť: ${z.overit}` : ""}. Zabralo to?`,
    );
  }

  // A referral that actually converted earns the referrer a 10 % thank-you —
  // easy to forget, and forgetting it quietly kills the studio's best channel.
  // "Did they convert?" is not asked — it's read from PTminder: the referred
  // name showing up among clients IS the conversion.
  const byNorm: Record<string, string> = {};
  for (const n of Object.keys(clients)) byNorm[normName(n)] = n;
  for (const l of data.leads || []) {
    if (l.source !== "referencia" || !l.referrer || !l.name) continue;
    if (!byNorm[normName(l.name)]) continue;
    const ref = clients[byNorm[normName(l.referrer)] ?? l.referrer];
    if (!ref || ref.status === "Neaktívny") continue;
    push(
      `referral|${l.id}`,
      "orange",
      "Odmena za odporúčanie",
      `${l.referrer} odporučil${l.name ? ` ${l.name}` : "a nového klienta"} — nezabudni na 10 % zľavu za doporučenie`,
      l.referrer,
    );
  }

  // Payments from a name with no sessions at all (one per client).
  const seen = new Set<string>();
  for (const p of data.payments as PaymentRow[]) {
    if (!p.client || p.amount > 50000) continue; // skip report-total rows
    if (clients[p.client] || serviceClients.has(p.client) || seen.has(p.client)) continue;
    seen.add(p.client);
    push(`orphan|${p.client}`, "orange", "Platba bez sedení", `${p.client}: má platby, ale žiadne sedenia — over meno/priradenie`, p.client);
  }

  return out.sort((a, b) => (a.acked === b.acked ? 0 : a.acked ? 1 : -1));
}

// ── unified "na čo sa pozrieť" register ──────────────────────────────────────
// One prioritised, actionable list merging 6M alerts, capacity warnings and
// anomalies. Each item can be accepted (with a note) or hidden via anomalyAck.
export type RegisterItem = {
  key: string;
  category: "6M" | "Kapacita" | "Anomália" | "Rozhodnutie";
  tone: "red" | "orange" | "blue";
  title: string;
  detail: string;
  acked: boolean;
  note?: string;
  priority: number; // lower = more important
  client?: string; // client this item is about → "Otvoriť" focuses them in Klienti
};

const toneRank: Record<string, number> = { red: 0, orange: 1, blue: 2 };

export function deriveRegister(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  sixM: SixMRow[],
  capacity: CapacityRow[],
): RegisterItem[] {
  const ack = data.anomalyAck || {};
  const items: RegisterItem[] = [];
  const add = (
    key: string,
    category: RegisterItem["category"],
    tone: RegisterItem["tone"],
    title: string,
    detail: string,
    basePriority: number,
    client?: string,
  ) =>
    items.push({
      key,
      category,
      tone,
      title,
      detail,
      acked: !!ack[key],
      note: ack[key]?.note,
      priority: basePriority + toneRank[tone],
      client,
    });

  for (const c of sixM) {
    if (!c.alert) continue;
    const tone = c.alertTone === "red" ? "red" : "orange";
    add(`sixm|${c.client}|${c.phase}|${c.monthInPhase}`, "6M", tone, `${c.client} — 6M`, c.alert, 0, c.client);
  }
  // Capacity signal uses the SAME real-hours utilisation the capacity card and the
  // assistant show (util = tighter of typical→29h / busy→34h), NOT the reference-only
  // effHours — that segment-weighted proxy sits far below the 24–34h zone and used to
  // flag both trainers "pod zónou" permanently. Only surface the actionable extremes:
  // genuinely at the cap (burnout risk) or a lot of free room (fill the schedule).
  for (const cap of capacity) {
    if (cap.util >= 100)
      add(`cap|${cap.trainer}|over`, "Kapacita", "red", `${cap.trainer} — na strope kapacity`, cap.advice, 10, undefined);
    else if (cap.util < 60)
      add(`cap|${cap.trainer}|under`, "Kapacita", "orange", `${cap.trainer} — veľa voľného priestoru`, cap.advice, 10, undefined);
  }
  for (const a of deriveAnomalies(data, clients)) {
    // Záver z debaty nie je anomália — je to sľub, ktorý si sám pripomenul.
    add(a.key, a.key.startsWith("zaver|") ? "Rozhodnutie" : "Anomália", a.tone, a.label, a.detail, 20, a.client);
  }

  return items.sort((a, b) => {
    if (a.acked !== b.acked) return a.acked ? 1 : -1;
    return a.priority - b.priority;
  });
}

// ── earnings prediction (run-rate + prepaid, two-layer) ──────────────────────
//
// Predplatené hodiny sú najtvrdší údaj, aký o budúcnosti máme — sú zaplatené a
// niekto ich musí odchodiť. Model ich preto berie ako záruku, ale až odkedy
// poznáme dve veci, ktoré predtým ignoroval:
//
//  1. ČLENSTVÁ MAJÚ PLATNOSŤ. Päť hodín na mesačnom členstve sa nedá rozložiť
//     do troch mesiacov — buď sa odchodia, alebo prepadnú. Rozprestierať ich
//     rovnomerne znamenalo sľubovať prácu, ktorá už nemôže nastať.
//  2. TICHO ZNAMENÁ RIZIKO. Klient, ktorý mesiac nedal o sebe vedieť, má
//     zaplatené hodiny, ale nie je isté, že po ne príde — to je presne vzorec
//     „ducha". Jeho zostatok nie je záruka, je to nádej.

/** Koľko mesiacov platí členstvo podľa názvu balíčka (viď prevadzka.md). */
export function platnostMesiacov(nazovBalicka: string): number {
  const n = (nazovBalicka || "").toLowerCase();
  if (n.includes("one year")) return 12;
  if (n.includes("18 hod")) return 6;
  if (n.includes("s viazanost")) return 1;      // mesačné, max 2 h sa prenášajú
  if (n.includes("bez viazanost")) return 2;    // 8 týždňov
  if (n.includes("8 hod")) return 2;            // 8 týždňov
  if (n.includes("1 hodina")) return 1;         // 4 týždne
  return 2;                                     // doplnenie členstva a neznáme
}
export type PredMonth = { month: string; guaranteed: number; expected: number };
export type Prediction = {
  months: PredMonth[];
  guaranteedTotal: number; // 3-month revenue backed by prepaid package balances
  monthlyRunRate: number; // sum of clients' expected monthly revenue (gross)
  scenarios: { optimistic: number; realistic: number; negative: number }; // 3-month totals
  perClient: {
    name: string;
    trainer: string;
    type: string;
    remaining: number;
    burnRate: number; // sessions/month
    burnWeek: number; // sessions/week
    monthlyRevenue: number;
    guaranteed3m: number;
    confidence: number;
  }[];
};

// The next `n` FULL months, starting next month (forward-looking forecast).
// Predpoveď má začínať tam, kde končia DÁTA, nie tam, kde končí kalendár.
// Uzávierka je až prvý víkend nasledujúceho mesiaca, takže začiatkom mesiaca
// ešte nie sú nahraté žiadne tréningy — a bez tohto by aktuálny mesiac vypadol
// úplne: nebol by ani skutočnosť, ani odhad (2. 8. viedol graf júl → september).
const nextMonthKeys = (n: number, poslednyZDat?: string): string[] => {
  const out: string[] = [];
  const teraz = new Date();
  const zaciatok = poslednyZDat && poslednyZDat < `${teraz.getFullYear()}-${String(teraz.getMonth() + 1).padStart(2, "0")}`
    ? new Date(Number(poslednyZDat.slice(0, 4)), Number(poslednyZDat.slice(5, 7)) - 1, 1)
    : teraz;
  const d = zaciatok;
  d.setMonth(d.getMonth() + 1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};

// ── predikcia PRIJATÝCH tržieb (peniaze, nie odpracované hodiny) ─────────────
//
// Tržby a zárobky sú dve rôzne veci a doteraz sa predpovedali rovnako naivne:
// priemerom posledných mesiacov. Lenže peniaze nechodia rovnomerne — chodia,
// keď niekomu skončí členstvo a kúpi si ďalšie. To je predvídateľné:
//   posledná platba + platnosť členstva = kedy pravdepodobne príde ďalšia.
//
// Suma sa berie z POSLEDNEJ platby klienta, nie z cenníka. Je to elegantnejšie
// aj presnejšie: posledná platba už v sebe nesie jeho zľavy — bitcoin, referral,
// Jarkových 40 %, Dominikinu pätnástku — bez toho, aby ich model musel poznať.
export type CashPred = { month: string; expected: number; lo: number; hi: number };

export function predictCash(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  horizon = 3,
): { months: CashPred[]; perClient: { name: string; kedy: string; suma: number; confidence: number; tyzdnov: number }[] } {
  const poslednyMesiacDat = data.payments.reduce((max, p) => (p.date.slice(0, 7) > max ? p.date.slice(0, 7) : max), "");
  const keys = nextMonthKeys(horizon, poslednyMesiacDat);
  const months: CashPred[] = keys.map((m) => ({ month: m, expected: 0, lo: 0, hi: 0 }));
  const perClient: { name: string; kedy: string; suma: number; confidence: number; tyzdnov: number }[] = [];
  const sixM = deriveSixM(data, clients);
  const sixMPhase: Record<string, SixMRow> = {};
  for (const r of sixM) sixMPhase[r.client] = r;
  const teraz = new Date();
  const mesiacKluc = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  for (const c of Object.values(clients)) {
    if (c.status === "Neaktívny") continue;
    const platby = data.payments
      .filter((p) => p.client === c.name && p.amount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!platby.length) continue;
    const posledna = platby[platby.length - 1];
    // Úvodný tréning nie je členstvo — nepredpovedaj podľa neho ďalšiu platbu.
    if (posledna.amount <= 1500 && platby.length > 1) continue;

    // Tempo v hodinách za týždeň z posledných 90 dní. Bez neho sa nedá povedať
    // nič — klient bez tréningov v poslednom štvrťroku nekupuje ďalší balíček.
    const sedeni90 = c.sessions.filter((x) => daysBetween(x.date, teraz) <= 90).length;
    const tempoTyzdenne = sedeni90 / 13;
    if (tempoTyzdenne <= 0.05) continue;

    // Koľko hodín si naposledy kúpil — z ceny, nie z názvu balíčka. Názov je
    // momentka a u klienta dochádzajúceho staré hodiny píše „Doplnenie
    // členstva" aj pri ročnom členstve za 77 tisíc.
    const cenaHodiny = c.paidAvg || 1150;
    const hodinyKupene = Math.max(1, Math.min(100, posledna.amount / cenaHodiny));

    // ── Jadro: platba nepríde podľa kalendára, ale keď dôjdu hodiny ──────────
    // Šesťhodinový balíček s dvojmesačnou platnosťou minie klient chodiaci raz
    // týždenne za šesť týždňov, nie za dva mesiace — a vtedy platí znova.
    // Preto sa termín počíta zo ZOSTATKU a TEMPA, a platnosť je len strop:
    // po nej hodiny prepadnú a ďalšia platba už nie je obnova, ale nová dohoda.
    const zostatok = Math.max(0, c.packageRemaining);
    const tyzdnovDoMinutia = zostatok / tempoTyzdenne;
    const zoZostatku = new Date(teraz.getTime() + tyzdnovDoMinutia * 7 * 86400000);
    // Zostatok 0 neznamená „platí zajtra". Export balíčkov je momentka a u
    // klienta dochádzajúceho staré hodiny ukazuje nulu aj deň po tom, čo si
    // kúpil rok dopredu — Krčmár zaplatil 24. 7. za 70 hodín a model ho čakal
    // znova v auguste. Druhá kotva je preto samotná platba: kto si kúpil N
    // hodín, nemôže potrebovať ďalšie skôr, než ich stihne odchodiť.
    const zPlatby = new Date(posledna.date);
    zPlatby.setDate(zPlatby.getDate() + Math.round((hodinyKupene / tempoTyzdenne) * 7));
    const prvaObnova = new Date(Math.max(zoZostatku.getTime(), zPlatby.getTime(), teraz.getTime()));

    const platnost = platnostMesiacov(c.membership);
    const expiracia = new Date(posledna.date);
    expiracia.setMonth(expiracia.getMonth() + platnost);
    // Zostatok, ktorý sa do platnosti nestihne minúť, prepadne — vtedy je
    // dátumom ďalšej platby koniec platnosti, nie dopočítané minutie.
    const kedyDatum = prvaObnova > expiracia && c.membership && !c.membership.toLowerCase().includes("doplnenie")
      ? expiracia
      : prvaObnova;

    // Dĺžka ďalšieho cyklu = koľko hodín si kupuje / ako rýchlo ich míňa.
    const cyklusTyzdnov = Math.max(2, hodinyKupene / tempoTyzdenne);

    const is6m = c.clientType === "6M Predplatné";
    let confidence = is6m ? 0.9 : c.segment === "Anchor" ? 0.8 : c.segment === "Stabilný" ? 0.6 : 0.35;
    if (sixMPhase[c.name]?.phase === "Obnova" && sixMPhase[c.name]?.monthInPhase === 5) confidence = 0.7;
    // Pravidelnosť dochádzky rozhoduje o tom, či sa dá termínu veriť. Kto chodí
    // poctivo každý týždeň, minie šesť hodín naozaj za šesť týždňov; kto chodil
    // pol roka ledabolo, to isté rozťahuje a termín je len zbožné prianie.
    confidence *= 0.6 + 0.4 * Math.min(1, c.attendance / 0.7);
    if (daysBetween(c.lastSession, teraz) >= 30) confidence *= 0.5;   // ticho = riziko

    // Obnovy sa opakujú v rytme cyklu, každá ďalšia je o niečo menej istá.
    const d = new Date(kedyDatum);
    let konf = Math.max(0.05, Math.min(0.95, confidence));
    let prva = true;
    for (let guard = 0; guard < 24; guard++) {
      const idx = keys.indexOf(mesiacKluc(d));
      if (idx >= 0) {
        months[idx].expected += posledna.amount * konf;
        months[idx].lo += posledna.amount * Math.max(0, konf - 0.2);
        months[idx].hi += posledna.amount * Math.min(1, konf + 0.15);
        if (prva) {
          perClient.push({
            name: c.name, kedy: mesiacKluc(d), suma: posledna.amount,
            confidence: konf,
            tyzdnov: Math.max(0, Math.round(((prvaObnova.getTime() - teraz.getTime()) / (7 * 86400000)) * 10) / 10),
          });
          prva = false;
        }
        konf *= 0.85;
      }
      d.setDate(d.getDate() + Math.round(cyklusTyzdnov * 7));
      if (mesiacKluc(d) > keys[keys.length - 1]) break;
    }
  }

  for (const m of months) { m.expected = Math.round(m.expected); m.lo = Math.round(m.lo); m.hi = Math.round(m.hi); }
  perClient.sort((a, b) => b.suma * b.confidence - a.suma * a.confidence);
  return { months, perClient };
}

export function predictEarnings(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  opts: { excludeSpecial: boolean; horizon?: number } = { excludeSpecial: false },
): Prediction {
  const horizon = opts.horizon ?? 3;
  const poslednyMesiacDat = data.sessions.reduce((max, x) => (x.date.slice(0, 7) > max ? x.date.slice(0, 7) : max), "");
  const monthsArr = nextMonthKeys(horizon, poslednyMesiacDat).map((m) => ({ month: m, guaranteed: 0, expected: 0 }));
  const sixM = deriveSixM(data, clients);
  const sixMPhase: Record<string, SixMRow> = {};
  for (const r of sixM) sixMPhase[r.client] = r;

  const scenarios = { optimistic: 0, realistic: 0, negative: 0 };
  const perClient: Prediction["perClient"] = [];
  let monthlyRunRate = 0;

  for (const c of Object.values(clients)) {
    if (c.status === "Neaktívny") continue;
    if (opts.excludeSpecial && c.specialRate) continue;

    // Tempo: nedávne správanie váži viac než celoživotný priemer. Klient, ktorý
    // pred rokom chodil štyrikrát mesačne a dnes raz, nie je klient na štyri.
    const price = c.paidAvg || 1150;
    const teraz = new Date();
    const monthsActive = Math.max(1, monthsBetween(c.firstSession, teraz) + 1);
    // Len posledných 90 dní. Miešať do toho celoživotný priemer znie opatrne, ale
    // v rastúcej firme to systematicky podstreľuje: run-rate vychádzal 147k,
    // hoci posledné tri mesiace boli 176k — rozdiel ťahal nadol slabší rok 2025.
    // Kto chodí kratšie než 90 dní, delí sa počtom mesiacov, ktoré naozaj mal.
    const oknoMesiacov = Math.max(1, Math.min(3, monthsActive));
    const tempo = c.sessions.filter((x) => daysBetween(x.date, teraz) <= 90).length / oknoMesiacov;
    const burnRate = Math.max(0.4, Math.min(10, tempo));
    // Sedenia za 0 Kč (doplnenie členstva, darované tréningy) sú ~19 % všetkých.
    // Do práce sa počítajú, do tržieb nie — inak by predikcia nafúkla obe.
    const platenych = c.sessions.filter((x) => x.price > 0).length;
    const podielPlatenych = c.sessionCount ? Math.max(0.5, platenych / c.sessionCount) : 1;
    const monthlyRevenue = burnRate * price * podielPlatenych;
    if (c.status === "Aktívny" || c.status === "Sporadický") monthlyRunRate += monthlyRevenue;

    // Renewal confidence by segment / 6M phase (per spec).
    const is6m = c.clientType === "6M Predplatné";
    let confidence: number;
    if (is6m && sixMPhase[c.name]?.phase === "Obnova" && sixMPhase[c.name]?.monthInPhase === 5)
      confidence = 0.7;
    else if (is6m) confidence = 0.95;
    else if (c.segment === "Anchor" && c.serviceCount >= 2) confidence = 0.85;
    else if (c.segment === "Stabilný") confidence = 0.6;
    else if (c.serviceCount <= 1) confidence = 0.4;
    else confidence = 0.3; // Sporadický

    // Walk the next `horizon` months. While a prepaid package balance lasts the
    // month's sessions are GUARANTEED; sessions beyond the balance (or all of
    // them for clients without package data) are EXPECTED, weighted by renewal
    // confidence. This keeps totals close to the real monthly run-rate instead
    // of adding a full package price per client.
    // Ticho = riziko. Po 30 dňoch bez tréningu prestáva byť zostatok zárukou.
    const dniTicha = daysBetween(c.lastSession, new Date());
    const mlci = dniTicha >= 30;
    if (mlci) confidence = Math.max(0.1, confidence * 0.5);

    // Dokedy sa dá zostatok minúť: od poslednej platby + platnosť členstva.
    // Bez platby to nevieme, tak nechávame celý horizont (ako predtým).
    const poslednaPlatba = (data.payments || [])
      .filter((pmt) => pmt.client === c.name)
      .reduce((max, pmt) => (pmt.date > max ? pmt.date : max), "");
    const mesiacovPlatnosti = poslednaPlatba
      ? Math.max(0, platnostMesiacov(c.membership) - monthsBetween(poslednaPlatba, new Date()))
      : horizon;

    let balance = c.packageRemaining;
    let guaranteed3m = 0;
    for (let i = 0; i < horizon; i++) {
      // Po vypršaní platnosti (alebo keď klient mlčí) zostatok už nie je záruka —
      // hodiny buď prepadnú, alebo sa dochodia cez „doplnenie členstva", čo je
      // nová dohoda, nie istota.
      const zostatokPlati = i < mesiacovPlatnosti && !mlci;
      const fromBalance = zostatokPlati ? Math.min(balance, burnRate) : 0;
      balance -= fromBalance;
      const beyond = burnRate - fromBalance; // sessions needing renewal / ongoing pay
      const gRev = fromBalance * price * podielPlatenych;
      const eRev = beyond * price * podielPlatenych;
      guaranteed3m += gRev;
      monthsArr[i].guaranteed += gRev;
      monthsArr[i].expected += eRev * confidence;
      scenarios.realistic += gRev + eRev * confidence;
      scenarios.optimistic += gRev + eRev * Math.min(1, confidence + 0.15);
      scenarios.negative += gRev + eRev * Math.max(0, confidence - 0.2);
    }

    perClient.push({
      name: c.name,
      trainer: c.primaryTrainer,
      type: c.clientType,
      remaining: c.packageRemaining,
      burnRate,
      burnWeek: burnRate / 4.33,
      monthlyRevenue,
      guaranteed3m,
      confidence,
    });
  }

  const guaranteedTotal = monthsArr.reduce((a, m) => a + m.guaranteed, 0);
  perClient.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
  return { months: monthsArr, guaranteedTotal, monthlyRunRate, scenarios, perClient };
}
