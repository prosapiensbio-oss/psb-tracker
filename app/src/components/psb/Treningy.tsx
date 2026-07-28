import { useMemo, useState } from "react";

import { groupTrainings, periodZone, sessionAnalysis, TARGET_H, type ClientAgg, type Period } from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { SessionTrend } from "./SessionTrend";
import { Card, Donut, Empty, H3, Info, LineChart, Select, SortTh, StatCard, SubTabs, TableWrap, Toolbar, useSort } from "./ui";

export function Treningy({ data, sub, onSub }: { data: PSBData; clients: Record<string, ClientAgg>; sub: string; onSub: (s: string) => void }) {
  return (
    <>
      <SubTabs tabs={[{ id: "prehled", label: "Prehľad" }, { id: "analyza", label: "Analýza sedení" }]} value={sub} onChange={onSub} />
      {sub === "prehled" && <Prehlad data={data} />}
      {sub === "analyza" && <Analyza data={data} />}
    </>
  );
}

function Prehlad({ data }: { data: PSBData }) {
  const [period, setPeriod] = useState<Period>("week");
  const [trainerF, setTrainerF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [win, setWin] = useState("all"); // days window over history
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { sort, toggle, sorted } = useSort({ key: "period", dir: "desc" });

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
                <SortTh label="Terezka h" sortKey="terezka" sort={sort} onSort={toggle} align="right" />
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
            return (
              <tr key={g.key}>
                <td style={S.td}>{g.key}</td>
                {both ? (
                  <>
                    <td style={{ ...S.td, textAlign: "right", color: jerry ? zoneColor(jerry.hours) : C.textDim }}>{jerry ? jerry.hours.toFixed(0) : "—"}</td>
                    <td style={{ ...S.td, textAlign: "right", color: terezka ? zoneColor(terezka.hours) : C.textDim }}>{terezka ? terezka.hours.toFixed(0) : "—"}</td>
                  </>
                ) : null}
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: zoneColor(g.total.hours) }}>{g.total.hours.toFixed(0)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{g.total.sessions}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(g.total.revenue)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(czk)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: g.score >= 7 ? C.green : g.score >= 4 ? C.orange : C.red }}>{g.score}</td>
              </tr>
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
