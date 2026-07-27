// All derived analytics for the PSB Tracker. Pure functions over PSBData —
// no browser globals. Reused across every module.
import { monthKey, monthsBetween, weekKey } from "./format";
import type {
  PackageRow,
  PaymentRow,
  PSBData,
  SessionRow,
} from "./types";

export const TRAINERS = ["Jerry", "Terezka"] as const;
export type TrainerName = string;

// ── segmentation window ──────────────────────────────────────────────────────
const SEG_WEEKS = 18;
const ANCHOR_H = 1.08;
const STABLE_H = 0.66;
const SPORADIC_H = 0.33;
export const TARGET_H = 29;
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
  specialRate: boolean;
  specialRateNote: string;
  trainerNote: string;
  contractSigned: boolean;
  clientType: "6M Predplatné" | "Balíček";
  serviceCount: number;
  packageRemaining: number;
  packageTotal: number;
  packageStatus: string;
};

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
        clientType: "Balíček",
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

  const sixMSet = new Set(data.services.filter((s) => s.is6m).map((s) => s.client));
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
    c.attendance = hit / SEG_WEEKS;
    c.segment = c.attendance >= 0.84 ? "Anchor" : c.attendance >= 0.5 ? "Stabilný" : "Sporadický";

    const ov = data.clientOverrides?.[c.name];
    const autoPrimary =
      Object.entries(c.trainers).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    c.primaryTrainer = ov?.primaryTrainer || autoPrimary;
    c.primaryTrainerOverride = !!ov?.primaryTrainer;
    c.substituteCount = c.sessions.filter((s) => s.sessionTrainer !== c.primaryTrainer).length;

    c.statusAuto =
      c.attendance >= 0.5 ? "Aktívny" : c.attendance >= 0.16 ? "Sporadický" : "Neaktívny";
    c.status = ov?.status || c.statusAuto;
    c.statusOverride = !!ov?.status;
    c.specialRate = !!ov?.specialRate;
    c.specialRateNote = ov?.specialRateNote || "";
    c.trainerNote = ov?.trainerNote || "";
    c.contractSigned = !!ov?.contractSigned;
    c.clientType = sixMSet.has(c.name) ? "6M Predplatné" : "Balíček";
    c.serviceCount = serviceCounts[c.name] || 0;

    const packs = packByClient[c.name] || [];
    c.packageRemaining = packs.reduce((a, p) => a + p.remaining, 0);
    c.packageTotal = packs.reduce((a, p) => a + p.total, 0);
    c.packageStatus = packs[0]?.status || "";
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
  const first: Record<string, { date: string; trainer: string; price: number }> = {};
  for (const s of data.services.filter((x) => x.is6m)) {
    if (!first[s.client] || s.date < first[s.client].date)
      first[s.client] = { date: s.date, trainer: s.trainer, price: s.price };
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

const periodKey = (d: string, period: Period): string => {
  if (period === "week") return weekKey(d);
  if (period === "quarter") {
    const dt = new Date(d);
    return `Q${Math.floor(dt.getMonth() / 3) + 1}/${dt.getFullYear()}`;
  }
  return monthKey(d);
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
    const key = period === "custom" ? "Vlastné obdobie" : periodKey(s.date, period);
    let g = map[key];
    if (!g) {
      g = map[key] = {
        key,
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
  effHours: number;
  gap: number;
  advice: string;
};

export function capacityByTrainer(clients: Record<string, ClientAgg>): CapacityRow[] {
  return TRAINERS.map((trainer) => {
    const cl = Object.values(clients).filter(
      (c) => c.primaryTrainer === trainer && c.status !== "Neaktívny",
    );
    const anchor = cl.filter((c) => c.segment === "Anchor").length;
    const stable = cl.filter((c) => c.segment === "Stabilný").length;
    const sporadic = cl.filter((c) => c.segment === "Sporadický").length;
    const effHours = anchor * ANCHOR_H + stable * STABLE_H + sporadic * SPORADIC_H;
    const gap = TARGET_H - effHours;
    const advice =
      effHours > ZONE_HI
        ? `Nad zónou o ${(effHours - ZONE_HI).toFixed(1)}h — zváž presun klientov alebo zástup`
        : gap > 0
          ? `Do zdravej zóny treba +${Math.ceil(gap / ANCHOR_H)} Anchor alebo +${Math.ceil(gap / STABLE_H)} Stabilných klientov`
          : `V zdravej zóne — priestor na ${Math.floor((ZONE_HI - effHours) / STABLE_H)} ďalších Stabilných`;
    return { trainer, anchor, stable, sporadic, effHours, gap, advice };
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
  tone: "red" | "orange";
  label: string;
  detail: string;
  acked: boolean;
  note?: string;
};

export function deriveAnomalies(data: PSBData, clients: Record<string, ClientAgg>): Anomaly[] {
  const out: Anomaly[] = [];
  const ack = data.anomalyAck || {};
  const push = (key: string, tone: Anomaly["tone"], label: string, detail: string) =>
    out.push({ key, tone, label, detail, acked: !!ack[key], note: ack[key]?.note });

  const sixMSet = new Set(data.services.filter((s) => s.is6m).map((s) => s.client));
  const clientNames = new Set(Object.keys(clients));
  const serviceClients = new Set(data.services.map((s) => s.client));

  // Orphaned payments — a payment with no client or an unknown client.
  for (const p of data.payments as PaymentRow[]) {
    if (!p.client) {
      // Implausibly large empty-client rows are report totals, not payments.
      if (p.amount > 50000) continue;
      push(
        `orphan|${p.date}|${p.amount}`,
        "orange",
        "Osirotená platba",
        `Platba ${Math.round(p.amount).toLocaleString("cs-CZ")} CZK z ${new Date(p.date).toLocaleDateString("cs-CZ")} bez priradeného klienta`,
      );
    } else if (!clientNames.has(p.client) && !serviceClients.has(p.client)) {
      push(
        `orphan|${p.date}|${p.client}|${p.amount}`,
        "orange",
        "Platba bez sedení",
        `${p.client}: platba ${Math.round(p.amount).toLocaleString("cs-CZ")} CZK, ale klient nemá žiadne sedenia`,
      );
    }
  }

  // 6M-priced payment (6990) but client not in the 6M process.
  for (const p of data.payments) {
    if (Math.round(p.amount) === 6990 && p.client && !sixMSet.has(p.client)) {
      push(
        `sixm-pay|${p.date}|${p.client}`,
        "red",
        "Platba 6990 bez 6M zaradenia",
        `${p.client}: platba za "S viazanostou" sumu, ale klient nie je v 6M procese`,
      );
    }
  }

  // Client with recent sessions but no active package / service.
  const packSet = new Set(data.packages.filter((p) => p.remaining > 0).map((p) => p.client));
  const now = Date.now();
  for (const c of Object.values(clients)) {
    const recent = now - new Date(c.lastSession).getTime() < 45 * 86400000;
    if (
      recent &&
      c.status !== "Neaktívny" &&
      !packSet.has(c.name) &&
      c.serviceCount === 0 &&
      c.clientType !== "6M Predplatné"
    ) {
      push(
        `nopack|${c.name}`,
        "orange",
        "Sedenia bez balíčka",
        `${c.name}: aktívne sedenia, ale žiadny aktívny balíček ani predaj služby`,
      );
    }
  }

  return out.sort((a, b) => (a.acked === b.acked ? 0 : a.acked ? 1 : -1));
}

// ── unified "na čo sa pozrieť" register ──────────────────────────────────────
// One prioritised, actionable list merging 6M alerts, capacity warnings and
// anomalies. Each item can be accepted (with a note) or hidden via anomalyAck.
export type RegisterItem = {
  key: string;
  category: "6M" | "Kapacita" | "Anomália";
  tone: "red" | "orange" | "blue";
  title: string;
  detail: string;
  acked: boolean;
  note?: string;
  priority: number; // lower = more important
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
    });

  for (const c of sixM) {
    if (!c.alert) continue;
    const tone = c.alertTone === "red" ? "red" : "orange";
    add(`sixm|${c.client}|${c.phase}|${c.monthInPhase}`, "6M", tone, `${c.client} — 6M`, c.alert, 0);
  }
  for (const cap of capacity) {
    if (cap.effHours < ZONE_LO)
      add(`cap|${cap.trainer}|under`, "Kapacita", "orange", `${cap.trainer} — pod zónou`, cap.advice, 10);
    else if (cap.effHours > ZONE_HI)
      add(`cap|${cap.trainer}|over`, "Kapacita", "red", `${cap.trainer} — nad zónou`, cap.advice, 10);
  }
  for (const a of deriveAnomalies(data, clients)) {
    add(a.key, "Anomália", a.tone, a.label, a.detail, 20);
  }

  return items.sort((a, b) => {
    if (a.acked !== b.acked) return a.acked ? 1 : -1;
    return a.priority - b.priority;
  });
}

// ── earnings prediction (run-rate + prepaid, two-layer) ──────────────────────
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
    burnRate: number;
    monthlyRevenue: number;
    guaranteed3m: number;
    confidence: number;
  }[];
};

const nextMonthKeys = (n: number): string[] => {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};

export function predictEarnings(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  opts: { excludeSpecial: boolean; horizon?: number } = { excludeSpecial: false },
): Prediction {
  const horizon = opts.horizon ?? 3;
  const monthsArr = nextMonthKeys(horizon).map((m) => ({ month: m, guaranteed: 0, expected: 0 }));
  const sixM = deriveSixM(data, clients);
  const sixMPhase: Record<string, SixMRow> = {};
  for (const r of sixM) sixMPhase[r.client] = r;

  const scenarios = { optimistic: 0, realistic: 0, negative: 0 };
  const perClient: Prediction["perClient"] = [];
  let monthlyRunRate = 0;

  for (const c of Object.values(clients)) {
    if (c.status === "Neaktívny") continue;
    if (opts.excludeSpecial && c.specialRate) continue;

    // Expected monthly revenue from history: how often they come × avg paid price.
    const price = c.paidAvg || 1150;
    const monthsActive = Math.max(1, monthsBetween(c.firstSession, new Date()) + 1);
    const burnRate = Math.max(0.4, Math.min(10, c.sessionCount / monthsActive));
    const monthlyRevenue = burnRate * price;
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
    let balance = c.packageRemaining;
    let guaranteed3m = 0;
    for (let i = 0; i < horizon; i++) {
      const fromBalance = Math.min(balance, burnRate);
      balance -= fromBalance;
      const beyond = burnRate - fromBalance; // sessions needing renewal / ongoing pay
      const gRev = fromBalance * price;
      const eRev = beyond * price;
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
      monthlyRevenue,
      guaranteed3m,
      confidence,
    });
  }

  const guaranteedTotal = monthsArr.reduce((a, m) => a + m.guaranteed, 0);
  perClient.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
  return { months: monthsArr, guaranteedTotal, monthlyRunRate, scenarios, perClient };
}
