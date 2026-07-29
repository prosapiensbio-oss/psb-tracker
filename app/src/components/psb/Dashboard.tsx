import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  membershipBucket,
  MEMBERSHIP_ORDER,
  monthlyFinance,
  predictEarnings,
  TARGET_H,
  ZONE_HI,
  ZONE_LO,
  type CapacityRow,
  type ClientAgg,
  type RegisterItem,
  type SixMRow,
} from "../../lib/psb/compute";
import { fmtCZK, fmtDMY, monthLabel, weekKey, weekLabel } from "../../lib/psb/format";
import { C, MEMBERSHIP_COLORS, mix, S, badge, btn } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { IngestResult } from "../../lib/psb/db.server";
import type { Actions, NavFocus } from "./App";
import { AssistantInline, type AssistantChat } from "./Assistant";
import { SessionTrend } from "./SessionTrend";
import { ThemeSwitch } from "./ThemeSwitch";
import { Card, Donut, Empty, H3, Info, StatCard, StatGrid, ValueBars, ZoneBars } from "./ui";

const REPORTS: { key: keyof PSBData; label: string; path: string }[] = [
  { key: "sessions", label: "Payroll by Session", path: "Payroll Reports › By Session" },
  { key: "services", label: "Payroll by Service", path: "Payroll Reports › By Service" },
  { key: "payments", label: "Payments Recorded", path: "Financial Reports › Payments Recorded" },
  { key: "packages", label: "Packages & Memberships", path: "General Reports › Packages & Memberships" },
];

const catTone = (c: RegisterItem["category"]) => (c === "6M" ? "accent" : c === "Kapacita" ? "blue" : "orange");

const TRAINER_OPTS = [
  { value: "all", label: "Obaja" },
  { value: "Jerry", label: "Jerry" },
  { value: "Terezka", label: "Terezka" },
];

function TrainerPills({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.textMuted }}>Tréner:</span>
      {TRAINER_OPTS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: "5px 14px",
            borderRadius: 20,
            border: `1px solid ${value === o.value ? C.accent : C.border}`,
            background: value === o.value ? C.accentBg : "transparent",
            color: value === o.value ? C.accentLight : C.textMuted,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Reorderable dashboard layout (persisted in localStorage) ──────────────────
type WidgetMeta = { id: string; label: string; span: 1 | 2 };
const WIDGETS: WidgetMeta[] = [
  { id: "hodiny", label: "Odrobené hodiny / týždeň", span: 1 },
  { id: "zony", label: "Týždne v zdravej zóne", span: 1 },
  { id: "kapacita", label: "Kapacita & vyťaženie", span: 1 },
  { id: "6m", label: "6M klienti podľa fázy", span: 1 },
  { id: "tempo", label: "Ø tempo klienta", span: 1 },
  { id: "dovera", label: "Ø dôvera obnovy", span: 1 },
  { id: "zarobky", label: "Mesačné zárobky", span: 1 },
  { id: "balicky", label: "Klienti podľa balíčka", span: 1 },
  { id: "koniecBalicka", label: "Blíži sa koniec balíčka", span: 1 },
  { id: "asistent", label: "AI Asistent", span: 1 },
  { id: "trend", label: "Trend typov sedení", span: 2 },
  { id: "register", label: "Na čo sa pozrieť", span: 2 },
];
const DEFAULT_ORDER = WIDGETS.map((w) => w.id);
const DEFAULT_WIDTH: Record<string, number> = Object.fromEntries(WIDGETS.map((w) => [w.id, w.span]));
const ORDER_KEY = "psb-dash-order";
const HIDDEN_KEY = "psb-dash-hidden";
const WIDTH_KEY = "psb-dash-width";

function useDashLayout() {
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [hidden, setHidden] = useState<string[]>([]);
  const [widths, setWidths] = useState<Record<string, number>>(DEFAULT_WIDTH);

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
      if (Array.isArray(o)) {
        const known = o.filter((id: string) => DEFAULT_ORDER.includes(id));
        // Append any widget added in a later version that the saved order predates.
        setOrder([...known, ...DEFAULT_ORDER.filter((id) => !known.includes(id))]);
      }
      const h = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "null");
      if (Array.isArray(h)) setHidden(h.filter((id: string) => DEFAULT_ORDER.includes(id)));
      const w = JSON.parse(localStorage.getItem(WIDTH_KEY) || "null");
      if (w && typeof w === "object") {
        const merged: Record<string, number> = { ...DEFAULT_WIDTH };
        for (const id of DEFAULT_ORDER) if (w[id] === 1 || w[id] === 2) merged[id] = w[id];
        setWidths(merged);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistOrder = (o: string[]) => {
    setOrder(o);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(o));
    } catch {
      /* ignore */
    }
  };
  const persistHidden = (h: string[]) => {
    setHidden(h);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(h));
    } catch {
      /* ignore */
    }
  };
  const persistWidths = (w: Record<string, number>) => {
    setWidths(w);
    try {
      localStorage.setItem(WIDTH_KEY, JSON.stringify(w));
    } catch {
      /* ignore */
    }
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    persistOrder(next);
  };
  const dropOn = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;
    const next = order.filter((x) => x !== dragId);
    const at = next.indexOf(targetId);
    next.splice(at, 0, dragId);
    persistOrder(next);
  };
  const toggleHide = (id: string) =>
    persistHidden(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
  const setWidth = (id: string, w: 1 | 2) => persistWidths({ ...widths, [id]: w });
  const reset = () => {
    persistOrder(DEFAULT_ORDER);
    persistHidden([]);
    persistWidths(DEFAULT_WIDTH);
  };

  return { order, hidden, widths, move, dropOn, toggleHide, setWidth, reset };
}

// 2 columns on wide screens, 1 on narrow — inline styles can't hold media queries.
function useDashColumns() {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => setCols(mq.matches ? 1 : 2);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return cols;
}

// A compact clickable stat used in the weekly-hours summary strip.
function MiniStat({ label, value, color, onClick }: { label: ReactNode; value: string; color?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.track,
        borderRadius: 8,
        padding: "8px 10px",
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${onClick ? mix(C.accent, 22) : "transparent"}`,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? C.accentLight, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 3, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
        {onClick && <span style={{ color: C.textDim }}>→</span>}
      </div>
    </div>
  );
}

// Wrapper that gives a widget its grid span and, in arrange mode, the drag/move/hide chrome.
function WidgetShell({
  meta,
  cols,
  arranging,
  isHidden,
  layout,
  children,
}: {
  meta: WidgetMeta;
  cols: number;
  arranging: boolean;
  isHidden: boolean;
  layout: ReturnType<typeof useDashLayout>;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const storedW = layout.widths[meta.id] ?? meta.span;
  const span = Math.min(storedW, cols);
  // Grid gap handles spacing; the item stretches to its row height (equal-height rows).
  const wrap: CSSProperties = { gridColumn: `span ${span}`, minWidth: 0, display: "flex", flexDirection: "column" };

  if (!arranging) return <div style={wrap}>{children}</div>;

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", meta.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData("text/plain"); if (id) layout.dropOn(id, meta.id); }}
      style={{
        ...wrap,
        border: `2px dashed ${over ? C.accent : mix(C.accent, 30)}`,
        borderRadius: 12,
        padding: 6,
        background: over ? C.accentBg : "transparent",
        opacity: isHidden ? 0.45 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "2px 4px" }}>
        <span style={{ cursor: "grab", color: C.textDim, fontSize: 15, lineHeight: 1 }} title="Ťahaj myšou">⠿</span>
        <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{meta.label}</span>
        {cols > 1 && (
          <button
            onClick={() => layout.setWidth(meta.id, storedW === 2 ? 1 : 2)}
            title={storedW === 2 ? "Zúžiť na 1 stĺpec" : "Rozšíriť na 2 stĺpce"}
            style={{ ...arrBtn, minWidth: 34 }}
          >
            {storedW === 2 ? "▭▭" : "▭"}
          </button>
        )}
        <button onClick={() => layout.move(meta.id, -1)} title="Posunúť vyššie" style={arrBtn}>↑</button>
        <button onClick={() => layout.move(meta.id, 1)} title="Posunúť nižšie" style={arrBtn}>↓</button>
        <button onClick={() => layout.toggleHide(meta.id)} title={isHidden ? "Zobraziť" : "Skryť"} style={{ ...arrBtn, color: isHidden ? C.textDim : C.accentLight }}>
          {isHidden ? "🚫" : "👁"}
        </button>
      </div>
      <div style={{ pointerEvents: "none", flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

// Body wrapper that fills a stretched card and vertically centers short content (donuts, KPI numbers).
const centerBody: CSSProperties = { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" };

const arrBtn: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.textMuted,
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1,
  padding: "4px 7px",
};

export function Dashboard({
  data,
  clients,
  register,
  sixM,
  capacity,
  actions,
  onNavigate,
  assistantChat,
  onClientClick,
}: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  register: RegisterItem[];
  sixM: SixMRow[];
  capacity: CapacityRow[];
  actions: Actions;
  onNavigate: (tab: string, sub?: string, focus?: NavFocus) => void;
  assistantChat: AssistantChat;
  onClientClick: (name: string) => void;
}) {
  const [trainer, setTrainer] = useState("all");
  const [showAcked, setShowAcked] = useState(false);
  const [registerExpanded, setRegisterExpanded] = useState(false);
  const [tempoUnit, setTempoUnit] = useState<"mes" | "tyz">("mes");
  const [arranging, setArranging] = useState(false);
  const layout = useDashLayout();
  const cols = useDashColumns();
  const matchT = (t: string) => trainer === "all" || t === trainer;

  const predAgg = useMemo(() => {
    const list = predictEarnings(data, clients).perClient.filter((c) => matchT(c.trainer));
    const n = list.length || 1;
    return {
      tempoMes: list.reduce((a, c) => a + c.burnRate, 0) / n,
      tempoTyz: list.reduce((a, c) => a + c.burnWeek, 0) / n,
      conf: (list.reduce((a, c) => a + c.confidence, 0) / n) * 100,
    };
  }, [data, clients, trainer]);

  const stats = useMemo(() => {
    const list = Object.values(clients);
    // "Aktívny" = everyone except Neaktívny (matches the Klienti tab count).
    const active = list.filter((c) => c.status !== "Neaktívny" && matchT(c.primaryTrainer)).length;
    const weeks = data.sessions.map((s) => weekKey(s.date)).sort();
    const lastWeek = weeks[weeks.length - 1];
    const weekHours = data.sessions
      .filter((s) => weekKey(s.date) === lastWeek && matchT(s.sessionTrainer))
      .reduce((a, s) => a + s.duration / 60, 0);
    const months = monthlyFinance(data);
    const lastMonth = months[months.length - 1];
    const monthRevenue = lastMonth
      ? trainer === "all"
        ? lastMonth.revenue
        : lastMonth.byTrainer[trainer]?.revenue || 0
      : 0;
    const sixMCount = sixM.filter((c) => matchT(c.primaryTrainer)).length;
    return { active, weekHours, lastWeek, monthRevenue, lastMonth: lastMonth?.month, sixMCount };
  }, [clients, data, sixM, trainer]);

  // All weeks (chronological) — the chart scrolls horizontally.
  const weekRows = useMemo(() => {
    const map: Record<string, { Jerry: number; Terezka: number }> = {};
    for (const s of data.sessions) {
      const k = weekKey(s.date);
      const e = (map[k] ||= { Jerry: 0, Terezka: 0 });
      if (s.sessionTrainer === "Jerry") e.Jerry += s.duration / 60;
      else if (s.sessionTrainer === "Terezka") e.Terezka += s.duration / 60;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.sessions]);

  const weeklyHours = useMemo(() => {
    const series = trainer === "all"
      ? [{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]
      : [{ name: trainer, color: C.accent }];
    return {
      series,
      data: weekRows.map(([k, v]) => ({
        label: weekLabel(k),
        values: trainer === "all" ? [v.Jerry, v.Terezka] : [trainer === "Jerry" ? v.Jerry : v.Terezka],
      })),
    };
  }, [weekRows, trainer]);

  // Ø / max / min weekly hours (basis follows the trainer pill: "all" = PSB total per week).
  const weekStats = useMemo(() => {
    const pts = weekRows
      .map(([k, v]) => ({
        label: weekLabel(k),
        h: trainer === "all" ? v.Jerry + v.Terezka : trainer === "Jerry" ? v.Jerry : v.Terezka,
      }))
      .filter((p) => p.h > 0);
    if (!pts.length) return null;
    let max = pts[0], min = pts[0];
    let sum = 0;
    for (const p of pts) {
      sum += p.h;
      if (p.h > max.h) max = p;
      if (p.h < min.h) min = p;
    }
    return { avg: sum / pts.length, max, min, n: pts.length };
  }, [weekRows, trainer]);

  // How many trainer-weeks landed in / below / above the healthy zone.
  const zones = useMemo(() => {
    let zdrava = 0, pod = 0, nad = 0;
    const trainers = trainer === "all" ? (["Jerry", "Terezka"] as const) : [trainer];
    for (const [, v] of weekRows) {
      for (const t of trainers) {
        const h = (v as Record<string, number>)[t];
        if (!h) continue;
        if (h >= ZONE_LO && h <= ZONE_HI) zdrava++;
        else if (h < ZONE_LO) pod++;
        else nad++;
      }
    }
    return { zdrava, pod, nad, total: zdrava + pod + nad };
  }, [weekRows, trainer]);

  const earnings = useMemo(() => {
    const months = monthlyFinance(data); // all months, from Sep 2025 — chart scrolls
    const bars: { label: string; value: number; forecast?: boolean }[] = months.map((m) => ({
      label: monthLabel(m.month),
      value: trainer === "all" ? m.revenue : m.byTrainer[trainer]?.revenue || 0,
    }));
    if (trainer === "all") {
      const pred = predictEarnings(data, clients, { excludeSpecial: false });
      for (const pm of pred.months.slice(0, 2)) {
        bars.push({ label: monthLabel(pm.month), value: Math.round(pm.guaranteed + pm.expected), forecast: true });
      }
    }
    return bars;
  }, [data, clients, trainer]);

  // Ø / max / min monthly earnings over ACTUAL months (forecast excluded), following the trainer pill.
  const earningStats = useMemo(() => {
    const pts = monthlyFinance(data)
      .map((m) => ({ key: m.month, label: monthLabel(m.month), v: trainer === "all" ? m.revenue : m.byTrainer[trainer]?.revenue || 0 }))
      .filter((p) => p.v > 0);
    if (!pts.length) return null;
    let max = pts[0], min = pts[0];
    let sum = 0;
    for (const p of pts) {
      sum += p.v;
      if (p.v > max.v) max = p;
      if (p.v < min.v) min = p;
    }
    return { avg: sum / pts.length, max, min, n: pts.length };
  }, [data, trainer]);

  const sessionsT = useMemo(() => data.sessions.filter((s) => matchT(s.sessionTrainer)), [data.sessions, trainer]);

  const membershipDonut = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of Object.values(clients)) {
      if (c.status === "Neaktívny" || !matchT(c.primaryTrainer)) continue;
      const b = membershipBucket(c.membership);
      counts[b] = (counts[b] || 0) + 1;
    }
    return MEMBERSHIP_ORDER.filter((k) => counts[k]).map((k) => ({ label: k, value: counts[k], color: MEMBERSHIP_COLORS[k] }));
  }, [clients, trainer]);

  const sixMPhases = useMemo(() => {
    const f = sixM.filter((c) => matchT(c.primaryTrainer));
    const n = (p: string) => f.filter((c) => c.phase === p).length;
    return { total: f.length, data: [
      { label: "Obnova (1–6)", value: n("Obnova"), color: C.green },
      { label: "Integrácia (7–18)", value: n("Integrácia"), color: C.orange },
      { label: "Udržateľnosť (19+)", value: n("Udržateľnosť"), color: C.bark },
    ] };
  }, [sixM, trainer]);

  const missing = REPORTS.filter((r) => (data[r.key] as unknown[]).length === 0);
  const open = register.filter((r) => !r.acked);
  const acked = register.filter((r) => r.acked);
  // "Ukázať skryté" swaps to the hidden/accepted items only (so it's obvious they appeared).
  const visible = showAcked ? acked : open;

  // Click-through helpers: focus one week in Tréningy → Prehľad / one month in Financie → Zárobky.
  const openWeek = (weekLabelStr: string) => onNavigate("treningy", "prehled", { week: weekLabelStr, trainer, nonce: Date.now() });
  const openMonth = (monthKey: string) => onNavigate("financie", undefined, { month: monthKey, trainer, nonce: Date.now() });

  // Widget bodies, keyed by id — rendered in the user's saved order below.
  // Clients down to their last session (or 0) on their active package — renewal cues.
  const packageEnding = useMemo(
    () =>
      Object.values(clients)
        .filter((c) => c.packageTotal > 0 && c.packageRemaining <= 1 && c.status !== "Neaktívny" && matchT(c.primaryTrainer))
        .sort((a, b) => a.packageRemaining - b.packageRemaining || a.name.localeCompare(b.name)),
    [clients, trainer], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const nodes: Record<string, ReactNode> = {
    hodiny: (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3>
          <Info text="Odtrénované hodiny za týždeň. Otvára sa na najnovšom týždni — posúvaj doľava do minulosti. Zelené pásmo 24–34h je zdravá zóna na jedného trénera." label="Odrobené hodiny / týždeň" />
        </H3>
        {weeklyHours.data.length ? (
          <ZoneBars data={weeklyHours.data} series={weeklyHours.series} zone={{ lo: ZONE_LO, hi: ZONE_HI }} height={180} alignEnd />
        ) : (
          <Empty>Nahraj Payroll by Session.</Empty>
        )}
        {weekStats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 10 }}>
            <MiniStat label={`Ø / týždeň (${weekStats.n})`} value={`${weekStats.avg.toFixed(1)}h`} />
            <MiniStat label={`Max · ${weekStats.max.label}`} value={`${weekStats.max.h.toFixed(0)}h`} color={C.orange} onClick={() => openWeek(weekStats.max.label)} />
            <MiniStat label={`Min · ${weekStats.min.label}`} value={`${weekStats.min.h.toFixed(0)}h`} color={C.blue} onClick={() => openWeek(weekStats.min.label)} />
          </div>
        )}
      </Card>
    ),
    zony: (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info text="Koľko trénerských týždňov padlo do zdravej zóny (24–34h), pod ňu alebo nad ňu — za celé obdobie." label="Týždne v zdravej zóne" />
        </H3>
        <div style={centerBody}>
          {zones.total ? (
            <Donut
              size={140}
              centerLabel={`${Math.round((zones.zdrava / zones.total) * 100)}%`}
              data={[
                { label: "Zdravá zóna", value: zones.zdrava, color: C.green },
                { label: "Pod zónou", value: zones.pod, color: C.red },
                { label: "Nad zónou", value: zones.nad, color: C.orange },
              ]}
            />
          ) : (
            <Empty>Nahraj Payroll by Session.</Empty>
          )}
        </div>
      </Card>
    ),
    kapacita: <CapacityCard capacity={capacity} trainer={trainer} onNavigate={onNavigate} />,
    "6m": (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info text="Rozdelenie 6M klientov podľa fázy procesu: Obnova (1.–6. mesiac), Integrácia (7.–18.), Udržateľnosť (19+). Mení sa podľa prepínača trénera hore." label="6M klienti podľa fázy" />
        </H3>
        <div style={centerBody}>
          {sixMPhases.total ? (
            <Donut size={140} centerLabel={String(sixMPhases.total)} data={sixMPhases.data} />
          ) : (
            <Empty>{trainer === "all" ? "Žiadni 6M klienti." : `${trainer} nemá 6M klientov.`}</Empty>
          )}
        </div>
      </Card>
    ),
    tempo: (
      <Card style={{ marginBottom: 0, height: "100%", cursor: "pointer", display: "flex", flexDirection: "column" }}>
        <div style={centerBody} onClick={() => onNavigate("financie")}>
          <H3>
            <Info text="Priemerné tempo klienta = ako často klient chodí (sedení za mesiac/týždeň), priemer cez klientov. Mení sa podľa prepínača trénera. Klik → Financie → Predikcia (detail podľa klienta)." label="Ø tempo klienta" />
          </H3>
          <div style={{ fontSize: 34, fontWeight: 800, color: C.accentLight, lineHeight: 1 }}>
            {(tempoUnit === "mes" ? predAgg.tempoMes : predAgg.tempoTyz).toFixed(1)}
            <span style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}> sedení/{tempoUnit === "mes" ? "mes." : "týž."}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {(["mes", "tyz"] as const).map((u) => (
            <button key={u} onClick={(e) => { e.stopPropagation(); setTempoUnit(u); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${tempoUnit === u ? C.accent : C.border}`, background: tempoUnit === u ? C.accentBg : "transparent", color: tempoUnit === u ? C.accentLight : C.textMuted, fontSize: 11, cursor: "pointer" }}>
              tempo/{u === "mes" ? "mes." : "týž."}
            </button>
          ))}
        </div>
      </Card>
    ),
    dovera: (
      <Card style={{ marginBottom: 0, height: "100%", cursor: "pointer", display: "flex", flexDirection: "column" }}>
        <div style={centerBody} onClick={() => onNavigate("financie")}>
          <H3>
            <Info text="Priemerná dôvera obnovy = ako pravdepodobne klienti obnovia/pokračujú (podľa segmentu a 6M fázy), priemer cez klientov. Klik → Financie → Predikcia." label="Ø dôvera obnovy" />
          </H3>
          <div style={{ fontSize: 34, fontWeight: 800, color: predAgg.conf >= 70 ? C.green : predAgg.conf >= 50 ? C.orange : C.red, lineHeight: 1 }}>
            {predAgg.conf.toFixed(0)}%
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>priemer cez {trainer === "all" ? "všetkých" : trainer} klientov · klik → Predikcia →</div>
        </div>
      </Card>
    ),
    zarobky: (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3>
          <Info text="Vyfakturované zárobky za mesiac. Otvára sa na najnovšom mesiaci — posúvaj doľava do minulosti. Posledné 2 svetlé stĺpce (⌁) sú odhad na ďalšie mesiace. Priemer/max/min sú len z reálnych mesiacov (bez odhadu)." label={trainer === "all" ? "Mesačné zárobky + odhad" : `Mesačné zárobky — ${trainer}`} />
        </H3>
        {earnings.length ? <ValueBars data={earnings} color={C.accent} forecastColor={C.blue} fmt={(n) => `${Math.round(n / 1000)}k`} height={180} alignEnd /> : <Empty>Nahraj Payroll.</Empty>}
        {earningStats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 10 }}>
            <MiniStat label={`Ø / mes. (${earningStats.n})`} value={`${Math.round(earningStats.avg / 1000)}k`} />
            <MiniStat label={`Max · ${earningStats.max.label}`} value={`${Math.round(earningStats.max.v / 1000)}k`} color={C.green} onClick={() => openMonth(earningStats.max.key)} />
            <MiniStat label={`Min · ${earningStats.min.label}`} value={`${Math.round(earningStats.min.v / 1000)}k`} color={C.orange} onClick={() => openMonth(earningStats.min.key)} />
          </div>
        )}
      </Card>
    ),
    balicky: (
      <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <H3>
          <Info text="Koľko klientov má aký typ balíčka/predplatného (z reportu Packages & Memberships). Mení sa podľa prepínača trénera hore." label="Klienti podľa balíčka" />
        </H3>
        <div style={centerBody}>
          {membershipDonut.length ? <Donut size={130} centerLabel={String(membershipDonut.reduce((a, d) => a + d.value, 0))} data={membershipDonut} onSlice={() => onNavigate("klienti")} /> : <Empty>Nahraj Packages & Memberships.</Empty>}
        </div>
      </Card>
    ),
    koniecBalicka: (
      <Card style={{ marginBottom: 0, height: "100%" }}>
        <H3>
          <Info text="Klienti, ktorým ostáva 1 alebo 0 sedení z balíčka a stále chodia — čas poslať ponuku na obnovu / faktúru. Berie aktívny balíček klienta. Mení sa podľa prepínača trénera." label="Blíži sa koniec balíčka" />
        </H3>
        {packageEnding.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
            {packageEnding.map((c) => (
              <button key={c.name} onClick={() => onNavigate("klienti", undefined, { client: c.name, nonce: Date.now() })} title={`${c.name} — ${c.membership || "—"} · ${c.primaryTrainer}`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", background: mix(C.text, 4), border: `1px solid ${C.border}`, borderRadius: 9, cursor: "pointer", textAlign: "left", width: "100%", minWidth: 0 }}>
                <span style={{ ...badge(c.packageRemaining <= 0 ? "red" : "orange"), fontSize: 10, flexShrink: 0 }}>{c.packageRemaining}/{c.packageTotal}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: C.textDim, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.membership || "—"} · {c.primaryTrainer}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty>Nikomu sa balíček nekončí 🌿</Empty>
        )}
      </Card>
    ),
    trend: <SessionTrend sessions={sessionsT} onNavigate={() => onNavigate("treningy", "analyza")} />,
    asistent: <AssistantInline chat={assistantChat} onClientClick={onClientClick} />,
    register: (
      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <H3>
            <Info
              text="Zoznam vecí na akciu: 6M upozornenia, kapacita, klienti čo prestali chodiť, koniec pauzy. Skryť ich odstráni zo zoznamu (vieš ich vrátiť cez „Ukázať skryté“). Debatovať o nich vieš aj s AI asistentom."
              label={`Na čo sa pozrieť (${open.length})`}
            />
          </H3>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {visible.length > 3 && (
              <button onClick={() => setRegisterExpanded((v) => !v)} style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                {registerExpanded ? "Zbaliť" : `Rozbaliť všetky (${visible.length})`}
              </button>
            )}
            {(acked.length > 0 || showAcked) && (
              <button onClick={() => setShowAcked((v) => !v)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
                {showAcked ? "← Späť na aktívne" : `Ukázať skryté (${acked.length})`}
              </button>
            )}
          </div>
        </div>
        {visible.length ? (
          // Compact: ~3 items visible, the rest scrolls. Expanded: full list.
          <div style={{ overflowY: registerExpanded ? "visible" : "auto", maxHeight: registerExpanded ? undefined : 200, paddingRight: registerExpanded ? 0 : 2 }}>
            {visible.map((r) => <RegisterRow key={r.key} item={r} actions={actions} onNavigate={onNavigate} />)}
          </div>
        ) : (
          <Empty>{showAcked ? "Žiadne skryté položky." : "Nič nevyžaduje pozornosť 🌿"}</Empty>
        )}
      </Card>
    ),
  };

  const shown = arranging ? layout.order : layout.order.filter((id) => !layout.hidden.includes(id));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <TrainerPills value={trainer} onChange={setTrainer} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {arranging && (
            <button onClick={layout.reset} style={{ ...btn("ghost"), fontSize: 12, padding: "6px 12px" }}>Obnoviť rozloženie</button>
          )}
          <button
            onClick={() => setArranging((v) => !v)}
            style={{
              ...btn(arranging ? "accent" : "outline"),
              fontSize: 12,
              padding: "6px 14px",
            }}
          >
            {arranging ? "Hotovo" : "⠿ Usporiadať"}
          </button>
        </div>
      </div>

      {arranging && (
        <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 8, background: C.accentBg, border: `1px solid ${mix(C.accent, 33)}`, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          Ťahaj karty myšou alebo použi šípky <strong style={{ color: C.text }}>↑ ↓</strong>. Tlačidlom <strong style={{ color: C.text }}>▭ / ▭▭</strong> prepneš šírku karty (1 alebo 2 stĺpce) — široký graf zúž a vedľa neho daj malý. <strong style={{ color: C.text }}>👁</strong> kartu skryje. Karty v riadku sa výškovo zarovnajú a obsah vycentruje. Uloží sa v tomto prehliadači.
        </div>
      )}

      <StatGrid>
        <StatCard value={stats.active} label="Aktívnych klientov" onClick={() => onNavigate("klienti")} />
        <StatCard value={`${stats.weekHours.toFixed(0)}h`} label={stats.lastWeek ? `Odrobené (týž. ${weekLabel(stats.lastWeek)})` : "Týždenné hodiny"} onClick={() => onNavigate("treningy")} />
        <StatCard value={fmtCZK(stats.monthRevenue)} label={stats.lastMonth ? `Zárobky ${monthLabel(stats.lastMonth)}` : "Mesačné zárobky"} onClick={() => onNavigate("financie")} />
        <StatCard value={stats.sixMCount} label="6M klientov" onClick={() => onNavigate("6m")} />
      </StatGrid>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoFlow: "row dense", gap: 12, marginBottom: 12, alignItems: "stretch" }}>
        {shown.map((id) => {
          const meta = WIDGETS.find((w) => w.id === id);
          if (!meta) return null;
          return (
            <WidgetShell key={id} meta={meta} cols={cols} arranging={arranging} isHidden={layout.hidden.includes(id)} layout={layout}>
              {nodes[id]}
            </WidgetShell>
          );
        })}
      </div>

      <UploadCard data={data} missing={missing} actions={actions} />

      <Card>
        <H3>
          <Info text="Zmení farebnú schému celej appky. Uloží sa v tomto prehliadači." label="Vzhľad / farebná schéma" />
        </H3>
        <ThemeSwitch />
      </Card>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {data.uploadLog[0] ? `Posledný upload: ${new Date(data.uploadLog[0].date).toLocaleString("cs-CZ")}` : "Zatiaľ žiadny upload"}
        </div>
        <ResetButton onReset={actions.reset} />
      </div>
    </>
  );
}

function CapacityCard({ capacity, trainer, onNavigate }: { capacity: CapacityRow[]; trainer: string; onNavigate: (t: string) => void }) {
  const jerry = capacity.find((c) => c.trainer === "Jerry");
  const terezka = capacity.find((c) => c.trainer === "Terezka");

  // Follows the trainer pill: Obaja = Spolu PSB, else the selected trainer.
  const BUSY = ZONE_HI; // 34h
  let name: string, clients: number, avg: number, busy: number, canTake: number, util: number;
  if (trainer === "all") {
    name = "Spolu (PSB)";
    clients = (jerry?.clients || 0) + (terezka?.clients || 0);
    avg = (jerry?.recentWeekly || 0) + (terezka?.recentWeekly || 0);
    busy = (jerry?.busyWeekly || 0) + (terezka?.busyWeekly || 0);
    canTake = (jerry?.canTake || 0) + (terezka?.canTake || 0);
    util = Math.round(Math.max(avg / (TARGET_H * 2), busy / (BUSY * 2)) * 100);
  } else {
    const c = trainer === "Jerry" ? jerry : terezka;
    name = trainer;
    clients = c?.clients || 0;
    avg = c?.recentWeekly || 0;
    busy = c?.busyWeekly || 0;
    canTake = c?.canTake || 0;
    util = c?.util || 0;
  }
  const color = util <= 100 ? C.green : util <= 113 ? C.orange : C.red;

  return (
    <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <H3>
          <Info
            text={`Vyťaženie z REÁLNYCH hodín – „dvojitý strop". Rastie sa, kým buď typický týždeň (priemer) nedosiahne ideál ${TARGET_H}h, ALEBO rušný týždeň (80. percentil, nie jednorazová špička) nenarazí na strop ${BUSY}h – čo príde skôr. 100 % = jeden z týchto stropov je naplnený. „Zvládne ešte N" = koľko priemerných klientov pridať do tohto stropu. Mení sa podľa prepínača trénera.`}
            label={`Kapacita & vyťaženie — ${name}`}
          />
        </H3>
        <button onClick={() => onNavigate("klienti")} style={{ ...linkBtn, fontSize: 12 }}>Detail →</button>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flex: 1, marginTop: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1 }}>{util.toFixed(0)}%</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>vyťaženie (ideál {trainer === "all" ? TARGET_H * 2 : TARGET_H}h)</div>
        </div>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMuted, marginBottom: 4 }}>
            <span>Klienti</span>
            <strong style={{ color: C.text }}>{clients}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMuted, marginBottom: 4 }}>
            <span>Typický / rušný týždeň</span>
            <strong style={{ color: C.text }}>{avg.toFixed(0)}h / {busy.toFixed(0)}h</strong>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: util >= 100 ? C.orange : C.accentLight }}>
            {util >= 100 ? "Na strope kapacity" : `Zvládne ešte ~${canTake} klientov`}
          </div>
        </div>
      </div>
    </Card>
  );
}

const linkBtn = { background: "none", border: "none", color: C.accentLight, cursor: "pointer", fontSize: 12, padding: 0 } as const;

function RegisterRow({ item, actions, onNavigate }: { item: RegisterItem; actions: Actions; onNavigate: (tab: string, sub?: string, focus?: NavFocus) => void }) {
  const jump = item.category === "6M" ? "6m" : item.category === "Kapacita" ? "treningy" : "klienti";
  const openItem = () => onNavigate(jump, undefined, item.client ? { client: item.client, nonce: Date.now() } : undefined);
  return (
    <div style={{ padding: "9px 11px", marginBottom: 5, borderRadius: 8, background: item.acked ? C.track : item.tone === "red" ? C.redBg : item.tone === "blue" ? C.blueBg : C.orangeBg, opacity: item.acked ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <span style={badge(catTone(item.category))}>{item.category}</span>
        <span style={{ color: C.text }}>{item.detail}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {!item.acked && <button onClick={openItem} style={linkBtn}>Otvoriť →</button>}
          {item.acked ? (
            <button onClick={() => actions.ackAnomaly(item.key, "", false)} style={linkBtn}>Vrátiť</button>
          ) : (
            <button onClick={() => actions.ackAnomaly(item.key, "skryté")} style={{ ...linkBtn, color: C.textDim }}>Skryť</button>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadCard({ data, missing, actions }: { data: PSBData; missing: typeof REPORTS; actions: Actions }) {
  const [uploadResult, setUploadResult] = useState<IngestResult[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  // Collapsed by default — CSV can also be uploaded via the AI assistant. Auto-open when reports are missing.
  const [open, setOpen] = useState(missing.length > 0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setBusy(true);
    const files: { filename: string; text: string }[] = [];
    for (const f of Array.from(fileList)) files.push({ filename: f.name, text: await f.text() });
    const res = await actions.ingest(files);
    setUploadResult(res);
    setBusy(false);
    setTimeout(() => setUploadResult(null), 9000);
  };

  return (
    <Card>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <div style={{ ...S.h3, marginBottom: 0 }}>Upload CSV z PTmindera</div>
        {missing.length > 0 && <span style={{ ...badge("orange"), fontSize: 10 }}>{missing.length} chýba</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.textDim }}>{open ? "▲" : "▼ rozbaliť"}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 4 }}>Nahrať sa dá aj pretiahnutím do AI Asistenta (📎 vpravo dole).</div>
      {open && (
      <div style={{ marginTop: 12 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
        style={{ ...S.upload, borderColor: dragOver ? C.accent : `${mix(C.accent, 33)}`, background: dragOver ? C.accentBg : "transparent" }}
      >
        <div style={{ fontSize: 24, marginBottom: 6 }}>⬆</div>
        <div style={{ color: C.text }}>{busy ? "Spracúvam…" : "Pretiahni CSV súbory sem alebo klikni"}</div>
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>Automaticky rozpozná typ. Duplicity preskočí, históriu zachová.</div>
      </div>
      <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }} />
      {uploadResult && (
        <div style={{ marginTop: 12 }}>
          {uploadResult.map((r, i) => (
            <div key={i} style={{ padding: 9, marginBottom: 4, fontSize: 12, borderRadius: 8, background: r.error ? C.redBg : C.greenBg, color: r.error ? C.red : C.green }}>
              {r.filename}: {r.error ? r.error : `${r.type} — pridané ${r.added}${r.skipped ? `, preskočené ${r.skipped} (duplicity)` : ""}`}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, padding: 12, background: mix(C.accent, 6), borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 8 }}>Potrebné CSV z PTmindera (kde ich nájdeš · aktuálnosť):</div>
        {REPORTS.map((r) => {
          const arr = (data[r.key] as { date?: string }[]) || [];
          const present = arr.length > 0;
          let info = "";
          if (r.key === "packages") {
            const up = data.uploadLog?.find((l) => l.type === "packages");
            info = up ? `nahrané ${fmtDMY(up.date)}` : "";
          } else if (present) {
            let mx = "";
            for (const x of arr) if (x.date && x.date > mx) mx = x.date;
            info = mx ? `dáta do ${fmtDMY(mx)}` : "";
          }
          return (
            <div key={r.label} style={{ fontSize: 12, color: C.textMuted, marginBottom: 5, display: "flex", gap: 8 }}>
              <span style={{ color: present ? C.green : C.orange, flexShrink: 0 }}>{present ? "✓" : "✗"}</span>
              <span>
                <strong style={{ color: C.text }}>{r.label}</strong>
                {info && <span style={{ color: present ? C.accentLight : C.textDim, fontWeight: 500 }}> · {info}</span>}
                <br /><span style={{ color: C.textDim }}>PTminder → {r.path}</span>
              </span>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
          Packages report môže PTminder dávať po častiach (podľa typu balíčka) — nahraj všetky časti, každá sa bezpečne pripočíta po klientovi. Rovnaký súbor nič nezduplikuje.
        </div>
      </div>
      </div>
      )}
    </Card>
  );
}

function ResetButton({ onReset }: { onReset: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button onClick={() => setConfirm(true)} style={{ ...btn("outline"), color: C.red, borderColor: mix(C.red, 33) }}>
        Vymazať všetky dáta
      </button>
    );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.red }}>Naozaj vymazať všetky dáta?</span>
      <button onClick={() => { void onReset(); setConfirm(false); }} style={{ ...btn("danger"), fontSize: 12, padding: "6px 12px" }}>Áno</button>
      <button onClick={() => setConfirm(false)} style={{ ...btn("ghost"), fontSize: 12, padding: "6px 12px" }}>Zrušiť</button>
    </div>
  );
}
