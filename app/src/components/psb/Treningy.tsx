import { useMemo, useState } from "react";

import {
  capacityByTrainer,
  groupTrainings,
  periodZone,
  sessionAnalysis,
  TARGET_H,
  type CapacityRow,
  type ClientAgg,
  type Period,
} from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Donut, Empty, H3, Info, Select, SortTh, StatCard, SubTabs, TableWrap, Toolbar, useSort, ZoneBars } from "./ui";

export function Treningy({ data, clients, capacity }: { data: PSBData; clients: Record<string, ClientAgg>; capacity: CapacityRow[] }) {
  const [sub, setSub] = useState("prehled");
  return (
    <>
      <SubTabs
        tabs={[
          { id: "prehled", label: "Prehľad" },
          { id: "analyza", label: "Analýza sedení" },
          { id: "kapacita", label: "Kapacitný kalkulátor" },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === "prehled" && <Prehlad data={data} />}
      {sub === "analyza" && <Analyza data={data} />}
      {sub === "kapacita" && <Kapacita capacity={capacity ?? capacityByTrainer(clients)} />}
    </>
  );
}

function Prehlad({ data }: { data: PSBData }) {
  const [period, setPeriod] = useState<Period>("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { sort, toggle, sorted } = useSort({ key: "period", dir: "asc" });

  const rows = useMemo(
    () => groupTrainings(data.sessions, period, "all", period === "custom" ? { from, to } : undefined),
    [data.sessions, period, from, to],
  );
  const sortedRows = useMemo(
    () =>
      sorted(rows, {
        period: (g) => g.ts,
        jerry: (g) => g.byTrainer["Jerry"]?.hours || 0,
        terezka: (g) => g.byTrainer["Terezka"]?.hours || 0,
        total: (g) => g.total.hours,
        sessions: (g) => g.total.sessions,
        revenue: (g) => g.total.revenue,
        czk: (g) => (g.total.sessions ? g.total.revenue / g.total.sessions : 0),
        score: (g) => g.score,
      }),
    [rows, sorted],
  );

  const zoneColor = (hours: number) => {
    const { lo, hi } = periodZone(period);
    if (hours >= lo && hours <= hi) return C.green;
    if (hours > hi) return C.orange;
    return C.red;
  };

  const chart = useMemo(() => {
    const chrono = [...rows].sort((a, b) => a.ts - b.ts).slice(-10);
    return chrono.map((g) => ({ label: g.key, values: [g.byTrainer["Jerry"]?.hours || 0, g.byTrainer["Terezka"]?.hours || 0] }));
  }, [rows]);
  const zone = periodZone(period);

  return (
    <Card>
      <H3>
        <Info text="Odtrénované hodiny po obdobiach, chronologicky. Zelené pásmo je zdravá zóna na jedného trénera (týždeň 24–34h, mesiac ~104–147h). Klik na hlavičku stĺpca = zoradenie." label="Odrobené hodiny" />
      </H3>
      <Toolbar>
        <Select value={period} onChange={(v) => setPeriod(v as Period)} options={[
          { value: "week", label: "Týždeň" },
          { value: "month", label: "Mesiac" },
          { value: "quarter", label: "Kvartál" },
          { value: "custom", label: "Vlastné obdobie" },
        ]} />
        {period === "custom" && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
            <span style={{ color: C.textDim }}>–</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
          </>
        )}
      </Toolbar>
      {period !== "custom" && chart.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ZoneBars data={chart} series={[{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]} zone={zone} height={170} />
        </div>
      )}
      <TableWrap>
        <thead>
          <tr>
            <SortTh label="Obdobie" sortKey="period" sort={sort} onSort={toggle} />
            <SortTh label="Jerry h" sortKey="jerry" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Terezka h" sortKey="terezka" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Spolu h" sortKey="total" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Zárobky" sortKey="revenue" sort={sort} onSort={toggle} align="right" />
            <SortTh label="CZK/sed." sortKey="czk" sort={sort} onSort={toggle} align="right" />
            <SortTh label="Skóre" sortKey="score" sort={sort} onSort={toggle} align="right" info="Blízkosť k stredu zdravej zóny (29h/týž) na trénera. 10 = ideál, nízke = pod alebo nad zónou." />
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
                <td style={{ ...S.td, textAlign: "right", color: jerry ? zoneColor(jerry.hours) : C.textDim }}>{jerry ? jerry.hours.toFixed(0) : "—"}</td>
                <td style={{ ...S.td, textAlign: "right", color: terezka ? zoneColor(terezka.hours) : C.textDim }}>{terezka ? terezka.hours.toFixed(0) : "—"}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{g.total.hours.toFixed(0)}</td>
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
];

function Analyza({ data }: { data: PSBData }) {
  const [trainerF, setTrainerF] = useState("all");
  const [win, setWin] = useState("all");
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "asc" });

  const filtered = useMemo(() => {
    const days = Number(WINDOWS.find((w) => w.value === win)?.days || 0);
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    return data.sessions.filter((s) => (trainerF === "all" || s.sessionTrainer === trainerF) && new Date(s.date).getTime() >= cutoff);
  }, [data.sessions, trainerF, win]);

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
        offline: (r) => r.OFFLINE,
        online: (r) => r.ONLINE,
        truecoach: (r) => r.TRUECOACH,
        uvodne: (r) => r.UVODNE,
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
          </div>
        </div>
        {filtered.length ? <Donut data={donut} size={160} centerLabel={String(filtered.length)} /> : <Empty>Žiadne sedenia pre tento filter.</Empty>}
      </Card>

      <Card>
        <H3>Detail po mesiacoch a trénerovi</H3>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Mesiac" sortKey="month" sort={sort} onSort={toggle} />
              <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
              <SortTh label="Offline" sortKey="offline" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Online" sortKey="online" sort={sort} onSort={toggle} align="right" />
              <SortTh label="TrueCoach" sortKey="truecoach" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Úvodné" sortKey="uvodne" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Celkom" sortKey="total" sort={sort} onSort={toggle} align="right" />
            </tr>
          </thead>
          <tbody>
            {detail.map((r, i) => (
              <tr key={i}>
                <td style={S.td}>{monthLabel(r.month)}</td>
                <td style={S.td}>{r.trainer}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.OFFLINE}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.ONLINE}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.TRUECOACH}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{r.UVODNE}</td>
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

function Kapacita({ capacity }: { capacity: CapacityRow[] }) {
  const empty = !capacity.some((c) => c.anchor + c.stable + c.sporadic > 0);
  return (
    <Card>
      <H3>
        <Info text="Koľko klientov ešte tréner potrebuje (alebo koľko má navyše), aby bol v zdravej zóne. Efekt. h/týž = odhad reálneho zaťaženia: každý klient prispieva podľa toho, ako často chodí." label="Kapacitný kalkulátor" />
      </H3>
      {empty && <Empty>Nahraj CSV pre výpočet kapacity.</Empty>}
      {capacity.map((cap) => (
        <div key={cap.trainer} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.accentLight, marginBottom: 10 }}>{cap.trainer}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 10 }}>
            <StatCard value={cap.anchor} label="Anchor" color={C.green} />
            <StatCard value={cap.stable} label="Stabilný" color={C.orange} />
            <StatCard value={cap.sporadic} label="Sporadický" color={C.red} />
            <div style={{ ...S.card, marginBottom: 0, textAlign: "center", padding: 14 }}>
              <div style={{ ...S.statNum, color: cap.effHours >= 24 && cap.effHours <= 34 ? C.green : C.orange }}>{cap.effHours.toFixed(1)}</div>
              <div style={S.statLabel}>
                <Info text="Efektívne hodiny za týždeň — odhad reálneho zaťaženia trénera z frekvencie klientov." label="Efekt. h/týž" />
              </div>
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: cap.effHours > 34 || cap.gap > 0 ? C.orange : C.green, padding: "8px 12px", background: C.bg, borderRadius: 8 }}>
            {cap.advice}
          </div>
        </div>
      ))}
    </Card>
  );
}
