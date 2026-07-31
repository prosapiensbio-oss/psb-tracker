import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";

import { fetchWeekEntries, saveWeekEntry, type WeekEntry } from "../../lib/psb/client";
import { groupTrainings, periodZone, sessionAnalysis, TARGET_H, type ClientAgg, type Period } from "../../lib/psb/compute";
import { fmtCZK, monthLabel, weekKey } from "../../lib/psb/format";
import { C, mix, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { NavFocus } from "./App";
import { SessionTrend } from "./SessionTrend";
import { Card, Donut, Empty, H3, Info, LineChart, Select, SortTh, StatCard, SubTabs, TableWrap, Toolbar, useSort } from "./ui";

const PEOPLE = [
  { key: "jerry", label: "Jerry" },
  { key: "terezka", label: "Terezka" },
] as const;

export const wkScore = (p: string) => `${p}_score`;
export const wkHours = (p: string) => `${p}_hours`;
export const wkNote = (p: string) => `${p}_note`;

// Energy belongs next to the hours it has to be read against — the app only
// sees training hours, so the "iné hodiny" estimate is what makes a score
// interpretable at all. Asked weekly because by month-end you only remember
// the last week.
function WeekEnergyRow({ weekKeyIso, colSpan, entry, onSave }: {
  weekKeyIso: string; colSpan: number; entry: WeekEntry; onSave: (week: string, data: WeekEntry) => void;
}) {
  const [draft, setDraft] = useState<WeekEntry>(entry);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    setSaving(true);
    await saveWeekEntry(weekKeyIso, draft);
    setSaving(false);
    setSaved(true);
    onSave(weekKeyIso, draft);
    setTimeout(() => setSaved(false), 2000);
  };
  const field: CSSProperties = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 12.5, padding: "6px 9px", fontFamily: "inherit",
  };
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "12px 14px", background: mix(C.accent, 5), borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 }}>
          {PEOPLE.map((p) => {
            const score = Number(draft[wkScore(p.key)] ?? 7);
            const col = score >= 7 ? C.green : score >= 4 ? C.orange : C.red;
            return (
              <div key={p.key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", background: mix(C.accent, 4) }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: p.key === "jerry" ? C.accent : C.blue, marginBottom: 6 }}>{p.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                  <input type="range" min={1} max={10} step={1} value={score}
                    onChange={(e) => set(wkScore(p.key), e.target.value)} style={{ flex: 1, accentColor: col }} />
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 40, textAlign: "right", color: col, fontVariantNumeric: "tabular-nums" }}>{score} / 10</span>
                </div>
                <label style={{ fontSize: 11.5, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                  Iné hodiny (mimo tréningov)
                  <input type="number" min={0} max={120} value={draft[wkHours(p.key)] ?? ""}
                    onChange={(e) => set(wkHours(p.key), e.target.value)} placeholder="napr. 8" style={{ ...field, width: 78 }} />
                </label>
                <input value={draft[wkNote(p.key)] ?? ""} onChange={(e) => set(wkNote(p.key), e.target.value)}
                  placeholder="jedna veta…" style={{ ...field, width: "100%" }} />
              </div>
            );
          })}
        </div>
        {/* Studio-level counts. A cancelled session is deleted from the calendar,
            so nothing can recover it later — it has to be logged when it happens. */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          {([["zrusene", "Zrušené", "koľko tréningov klienti tento týždeň zrušili"],
             ["presunute", "Presunuté", "koľko sa ich presunulo na iný termín"],
            ] as const).map(([k, lbl, hint]) => (
            <label key={k} style={{ fontSize: 11.5, color: C.textMuted, display: "flex", alignItems: "center", gap: 6 }} title={hint}>
              {lbl}
              <input type="number" min={0} max={99} value={draft[k] ?? ""} onChange={(e) => set(k, e.target.value)}
                placeholder="0" style={{ ...field, width: 62 }} />
            </label>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <button onClick={save} disabled={saving}
            style={{ padding: "5px 14px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 12.5, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Ukladám…" : "Uložiť"}
          </button>
          {saved && <span style={{ fontSize: 12, color: C.green }}>✓ Uložené</span>}
        </div>
      </td>
    </tr>
  );
}

export function Treningy({ data, sub, onSub, focus }: { data: PSBData; clients: Record<string, ClientAgg>; sub: string; onSub: (s: string) => void; focus?: NavFocus | null }) {
  return (
    <>
      <SubTabs tabs={[{ id: "prehled", label: "Prehľad" }, { id: "analyza", label: "Analýza sedení" }]} value={sub} onChange={onSub} />
      {sub === "prehled" && <Prehlad data={data} focus={focus} />}
      {sub === "analyza" && <Analyza data={data} />}
    </>
  );
}

function Prehlad({ data, focus }: { data: PSBData; focus?: NavFocus | null }) {
  const [period, setPeriod] = useState<Period>("week");
  const [trainerF, setTrainerF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [win, setWin] = useState("all"); // days window over history
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { sort, toggle, sorted } = useSort({ key: "period", dir: "desc" });

  // Deep-link from the Dashboard: focus a specific week (weekLabel is the row key).
  useEffect(() => {
    if (!focus?.week) return;
    setPeriod("week");
    setWin("all");
    setTrainerF(focus.trainer && focus.trainer !== "all" ? focus.trainer : "all");
    setSelectedKey(focus.week);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const range = useMemo(() => {
    if (period === "custom") return { from, to };
    const days = Number(win);
    if (days > 0) return { from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) };
    return undefined;
  }, [period, from, to, win]);

  const rows = useMemo(
    () => groupTrainings(data.sessions, period, trainerF, range),
    [data.sessions, period, trainerF, range],
  );
  const chrono = useMemo(() => [...rows].sort((a, b) => a.ts - b.ts), [rows]);
  const both = trainerF === "all";
  const weekly = period === "week";
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<Record<string, WeekEntry>>({});
  useEffect(() => { fetchWeekEntries().then(setWeeks); }, []);

  // Totals from the weekly log, limited to the weeks currently in the table.
  const shownWeeks = useMemo(() => new Set(rows.map((g) => weekKey(new Date(g.ts).toISOString()))), [rows]);
  const logged = useMemo(() => {
    let zrusene = 0, presunute = 0;
    for (const [wk, e] of Object.entries(weeks)) {
      if (!shownWeeks.has(wk)) continue;
      zrusene += Number(e.zrusene) || 0;
      presunute += Number(e.presunute) || 0;
    }
    return { zrusene, presunute, any: zrusene + presunute > 0 };
  }, [weeks, shownWeeks]);
  // Úvodné tréningy over the same window — the middle step of the funnel.
  const uvodne = useMemo(() => {
    const from = range?.from, to = range?.to;
    return data.sessions.filter((s) => {
      if (s.sessionType !== "UVODNE") return false;
      if (from && s.date < from) return false;
      if (to && s.date > to + "T23:59:59.999Z") return false;
      return true;
    }).length;
  }, [data.sessions, range]);
  const sortedRows = useMemo(
    () =>
      sorted(selectedKey ? rows.filter((g) => g.key === selectedKey) : rows, {
        period: (g) => g.ts,
        jerry: (g) => g.byTrainer["Jerry"]?.hours || 0,
        terezka: (g) => g.byTrainer["Terezka"]?.hours || 0,
        total: (g) => g.total.hours,
        sessions: (g) => g.total.sessions,
        revenue: (g) => g.total.revenue,
        czk: (g) => (g.total.sessions ? g.total.revenue / g.total.sessions : 0),
        score: (g) => g.score,
      }),
    [rows, sorted, selectedKey],
  );

  const summary = useMemo(() => {
    if (!rows.length) return null;
    const n = rows.length;
    return {
      avgH: rows.reduce((a, g) => a + g.total.hours, 0) / n,
      avgScore: rows.reduce((a, g) => a + g.score, 0) / n,
      avgCzk: rows.reduce((a, g) => a + (g.total.sessions ? g.total.revenue / g.total.sessions : 0), 0) / n,
    };
  }, [rows]);

  const zoneColor = (hours: number) => {
    const { lo, hi } = periodZone(period);
    if (hours >= lo && hours <= hi) return C.green;
    if (hours > hi) return C.orange;
    return C.red;
  };

  const chart = useMemo(
    () =>
      chrono.map((g) =>
        both
          ? { label: g.key, values: [g.byTrainer["Jerry"]?.hours || 0, g.byTrainer["Terezka"]?.hours || 0, g.total.hours] }
          : { label: g.key, values: [g.total.hours] },
      ),
    [chrono, both],
  );
  const zone = periodZone(period);
  const lineSeries = both
    ? [{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }, { name: "Spolu", color: C.blue }]
    : [{ name: trainerF, color: C.accent }];

  return (
    <Card>
      <H3>
        <Info text="Odtrénované hodiny po obdobiach, chronologicky. Zelené pásmo = zdravá zóna na jedného trénera (týždeň 24–34h). Klik na hlavičku = zoradenie." label="Odrobené hodiny" />
      </H3>
      <Toolbar>
        <Select value={period} onChange={(v) => setPeriod(v as Period)} options={[
          { value: "week", label: "Týždeň" },
          { value: "month", label: "Mesiac" },
          { value: "quarter", label: "Kvartál" },
          { value: "custom", label: "Vlastné obdobie" },
        ]} />
        <Select value={trainerF} onChange={setTrainerF} options={[
          { value: "all", label: "Obaja tréneri" },
          { value: "Jerry", label: "Jerry" },
          { value: "Terezka", label: "Terezka" },
        ]} />
        {period !== "custom" && (
          <Select value={win} onChange={setWin} options={[
            { value: "all", label: "Celá história" },
            { value: "365", label: "Posledný rok" },
            { value: "180", label: "Posledných 6 mes." },
            { value: "90", label: "Posledný kvartál" },
          ]} />
        )}
        {period === "custom" && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
            <span style={{ color: C.textDim }}>–</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
          </>
        )}
      </Toolbar>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
          <StatCard value={`${summary.avgH.toFixed(1)}h`} label={`Ø hodín / ${period === "week" ? "týždeň" : period === "quarter" ? "kvartál" : "mesiac"}`} />
          <StatCard value={summary.avgScore.toFixed(1)} label="Ø skóre (1–10)" color={summary.avgScore >= 7 ? C.green : summary.avgScore >= 4 ? C.orange : C.red} />
          <StatCard value={fmtCZK(summary.avgCzk)} label="Ø CZK / sedenie" />
        </div>
      )}

      {weekly && logged.any && (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: mix(C.accent, 5) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 9 }}>
            Z týždenných zápisov
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            <StatCard value={String(logged.zrusene)} label="Zrušené tréningy" color={C.red} />
            <StatCard value={String(logged.presunute)} label="Presunuté" color={C.orange} />
            <StatCard value={String(uvodne)} label="Úvodné tréningy" color={C.accentLight} />
          </div>
          {logged.zrusene > 0 && (
            <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 9 }}>
              Zrušené tréningy sú stratená kapacita — pri Ø {fmtCZK(summary?.avgCzk ?? 0)} za sedenie to je zhruba{" "}
              <b style={{ color: C.red }}>{fmtCZK(logged.zrusene * (summary?.avgCzk ?? 0))}</b> nezarobených za zvolené obdobie.
            </div>
          )}
        </div>
      )}

      {period !== "custom" && chart.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <LineChart
            data={chart}
            series={lineSeries}
            zone={zone}
            height={210}
            fmt={(n) => `${Math.round(n)}h`}
            pointWidth={48}
            alignEnd
            onPoint={(i) => setSelectedKey((k) => (k === chrono[i]?.key ? null : chrono[i]?.key ?? null))}
          />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
            Trend odtrénovaných hodín — stúpa/klesá. Otvára sa na aktuálnom období, posúvaj doľava. Klik na bod = detail obdobia v tabuľke dole.
          </div>
        </div>
      )}

      {selectedKey && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => setSelectedKey(null)} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "5px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>
            Vybraté obdobie: {selectedKey} ✕
          </button>
        </div>
      )}

      <TableWrap>
        <thead>
          <tr>
            <SortTh label="Obdobie" sortKey="period" sort={sort} onSort={toggle} />
            {both ? (
              <>
                <SortTh label="Jerry h" sortKey="jerry" sort={sort} onSort={toggle} align="right" />
                {weekly && <th style={{ ...S.th, textAlign: "right" }}><Info text="Subjektívna energia Jerryho za týždeň (1–10). Klikni na riadok a nastav ju posuvníkom." label="Jerry E" /></th>}
                <SortTh label="Terezka h" sortKey="terezka" sort={sort} onSort={toggle} align="right" />
                {weekly && <th style={{ ...S.th, textAlign: "right" }}><Info text="Subjektívna energia Terezky za týždeň (1–10). Klikni na riadok a nastav ju posuvníkom." label="Terezka E" /></th>}
              </>
            ) : null}
            <SortTh label="Spolu h" sortKey="total" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Zárobky" sortKey="revenue" sort={sort} onSort={toggle} align="right" />
            <SortTh label="CZK/sed." sortKey="czk" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Skóre" sortKey="score" sort={sort} onSort={toggle} align="right" info="Blízkosť k stredu zdravej zóny (29h/týž) na trénera. 10 = ideál." />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((g) => {
            const jerry = g.byTrainer["Jerry"];
            const terezka = g.byTrainer["Terezka"];
            const czk = g.total.sessions ? g.total.revenue / g.total.sessions : 0;
            const wk = weekly ? weekKey(new Date(g.ts).toISOString()) : null;
            const entry = wk ? (weeks[wk] ?? {}) : {};
            const energyCell = (person: string) => {
              const v = entry[wkScore(person)];
              if (!v) return <td style={{ ...S.td, textAlign: "right", color: C.textDim }}>—</td>;
              const n = Number(v);
              return <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: n >= 7 ? C.green : n >= 4 ? C.orange : C.red }}>{n}</td>;
            };
            const nCols = 5 + (both ? (weekly ? 4 : 2) : 0);
            return (
              <Fragment key={g.key}>
              <tr>
                <td onClick={() => wk && setOpenWeek(openWeek === wk ? null : wk)}
                  style={{ ...S.td, cursor: wk ? "pointer" : undefined, whiteSpace: "nowrap" }}>
                  {wk && <span style={{ display: "inline-block", width: 14, color: C.textDim, fontSize: 9 }}>{openWeek === wk ? "▼" : "▶"}</span>}
                  {g.key}
                </td>
                {both ? (
                  <>
                    <td style={{ ...S.td, textAlign: "right", color: jerry ? zoneColor(jerry.hours) : C.textDim }}>{jerry ? jerry.hours.toFixed(0) : "—"}</td>
                    {weekly && energyCell("jerry")}
                    <td style={{ ...S.td, textAlign: "right", color: terezka ? zoneColor(terezka.hours) : C.textDim }}>{terezka ? terezka.hours.toFixed(0) : "—"}</td>
                    {weekly && energyCell("terezka")}
                  </>
                ) : null}
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: zoneColor(g.total.hours) }}>{g.total.hours.toFixed(0)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{g.total.sessions}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(g.total.revenue)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(czk)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: g.score >= 7 ? C.green : g.score >= 4 ? C.orange : C.red }}>{g.score}</td>
              </tr>
              {wk && openWeek === wk && (
                <WeekEnergyRow weekKeyIso={wk} colSpan={nCols} entry={entry}
                  onSave={(w, d) => setWeeks((prev) => ({ ...prev, [w]: d }))} />
              )}
              </Fragment>
            );
          })}
        </tbody>
      </TableWrap>
      {!rows.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}
      {rows.length > 0 && <div style={{ marginTop: 10, fontSize: 12, color: C.textDim }}>Cieľ {TARGET_H}h/týždeň na trénera · zdravá zóna 24–34h.</div>}
    </Card>
  );
}

const WINDOWS = [
  { value: "all", label: "Celé obdobie", days: 0 },
  { value: "7", label: "Posledný týždeň", days: 7 },
  { value: "30", label: "Posledný mesiac", days: 30 },
  { value: "90", label: "Posledný kvartál", days: 90 },
  { value: "custom", label: "Vlastné obdobie", days: -1 },
];

function Analyza({ data }: { data: PSBData }) {
  const [trainerF, setTrainerF] = useState("all");
  const [win, setWin] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "asc" });

  const filtered = useMemo(() => {
    let lo = 0;
    let hi = Infinity;
    if (win === "custom") {
      lo = from ? new Date(from).getTime() : 0;
      hi = to ? new Date(to).getTime() + 86400000 : Infinity;
    } else {
      const days = Number(WINDOWS.find((w) => w.value === win)?.days || 0);
      if (days > 0) lo = Date.now() - days * 86400000;
    }
    return data.sessions.filter((s) => {
      if (trainerF !== "all" && s.sessionTrainer !== trainerF) return false;
      const t = new Date(s.date).getTime();
      return t >= lo && t <= hi;
    });
  }, [data.sessions, trainerF, win, from, to]);

  const donut = useMemo(() => {
    let off = 0, onTc = 0, uvod = 0;
    for (const s of filtered) {
      if (s.sessionType === "OFFLINE") off++;
      else if (s.sessionType === "UVODNE") uvod++;
      else onTc++;
    }
    return [
      { label: "Offline", value: off, color: C.accent },
      { label: "Online + TrueCoach", value: onTc, color: C.blue },
      { label: "Úvodné", value: uvod, color: C.orange },
    ];
  }, [filtered]);

  const detail = useMemo(
    () =>
      sorted(sessionAnalysis(filtered), {
        month: (r) => r.month,
        trainer: (r) => r.trainer,
        uvodne: (r) => r.UVODNE,
        offline: (r) => r.OFFLINE,
        online: (r) => r.ONLINE + r.TRUECOACH,
        total: (r) => r.total,
      }),
    [filtered, sorted],
  );

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <H3>Pomer typov sedení</H3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Select value={trainerF} onChange={setTrainerF} options={[
              { value: "all", label: "Obaja" },
              { value: "Jerry", label: "Jerry" },
              { value: "Terezka", label: "Terezka" },
            ]} />
            <Select value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
            {win === "custom" && (
              <>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
                <span style={{ color: C.textDim, alignSelf: "center" }}>–</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
              </>
            )}
          </div>
        </div>
        {filtered.length ? <Donut data={donut} size={160} centerLabel={String(filtered.length)} /> : <Empty>Žiadne sedenia pre tento filter.</Empty>}
      </Card>

      <SessionTrend sessions={filtered} />

      <Card>
        <H3>Detail po mesiacoch a trénerovi</H3>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Mesiac" sortKey="month" sort={sort} onSort={toggle} />
              <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
              <SortTh label="Úvodné" sortKey="uvodne" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Offline" sortKey="offline" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Online" sortKey="online" sort={sort} onSort={toggle} align="right" info="Online sedenia vrátane TrueCoach (počítajú sa spolu)." />
              <SortTh label="Celkom" sortKey="total" sort={sort} onSort={toggle} align="right" />
            </tr>
          </thead>
          <tbody>
            {detail.map((r, i) => (
              <tr key={i}>
                <td style={S.td}>{monthLabel(r.month)}</td>
                <td style={S.td}>{r.trainer}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.UVODNE}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.OFFLINE}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.ONLINE + r.TRUECOACH}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!detail.length && <Empty>Žiadne dáta pre tento filter.</Empty>}
      </Card>
    </>
  );
}
