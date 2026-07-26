import { useMemo, useState } from "react";

import {
  capacityByTrainer,
  groupTrainings,
  periodZone,
  sessionAnalysis,
  sessionAnalysisPSB,
  TARGET_H,
  type CapacityRow,
  type ClientAgg,
  type Period,
} from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Empty, H3, MiniBars, Select, SubTabs, TableWrap, Toolbar } from "./ui";

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
  const [trainerF, setTrainerF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(
    () => groupTrainings(data.sessions, period, trainerF, period === "custom" ? { from, to } : undefined),
    [data.sessions, period, trainerF, from, to],
  );

  const zoneColor = (hours: number) => {
    const { lo, hi } = periodZone(period);
    if (hours >= lo && hours <= hi) return C.green;
    if (hours > hi) return C.orange;
    return C.red;
  };

  const summary = useMemo(() => {
    if (!rows.length) return null;
    const avgH = rows.reduce((a, r) => a + r.total.hours, 0) / rows.length;
    const zones = { green: 0, red: 0, orange: 0 };
    const { lo, hi } = periodZone(period);
    for (const r of rows) {
      if (r.total.hours >= lo && r.total.hours <= hi) zones.green++;
      else if (r.total.hours > hi) zones.orange++;
      else zones.red++;
    }
    return { avgH, zones };
  }, [rows, period]);

  return (
    <Card>
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
        {period === "custom" && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
            <span style={{ color: C.textDim }}>–</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
          </>
        )}
      </Toolbar>

      <TableWrap>
        <thead>
          <tr>
            <th style={S.th}>Obdobie</th>
            {trainerF === "all" ? (
              <>
                <th style={S.th}>Jerry h</th>
                <th style={S.th}>Jerry kl.</th>
                <th style={S.th}>Terezka h</th>
                <th style={S.th}>Terezka kl.</th>
              </>
            ) : (
              <>
                <th style={S.th}>Hodiny</th>
                <th style={S.th}>Klienti</th>
              </>
            )}
            <th style={S.th}>Spolu h</th>
            <th style={S.th}>Sedení</th>
            <th style={S.th}>h/klient</th>
            <th style={S.th}>Zárobky</th>
            <th style={S.th}>CZK/sed.</th>
            <th style={S.th}>Skóre</th>
            <th style={S.th}>Odporúčanie</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const hPerClient = g.total.clients ? (g.total.hours / g.total.clients).toFixed(2) : "—";
            const czkPerSess = g.total.sessions ? g.total.revenue / g.total.sessions : 0;
            const jerry = g.byTrainer["Jerry"];
            const terezka = g.byTrainer["Terezka"];
            const only = trainerF !== "all" ? g.byTrainer[trainerF] : null;
            return (
              <tr key={g.key}>
                <td style={S.td}>{g.key}</td>
                {trainerF === "all" ? (
                  <>
                    <td style={{ ...S.td, color: jerry ? zoneColor(jerry.hours) : C.textDim }}>{jerry ? jerry.hours.toFixed(0) : "—"}</td>
                    <td style={S.td}>{jerry ? jerry.clients.size : "—"}</td>
                    <td style={{ ...S.td, color: terezka ? zoneColor(terezka.hours) : C.textDim }}>{terezka ? terezka.hours.toFixed(0) : "—"}</td>
                    <td style={S.td}>{terezka ? terezka.clients.size : "—"}</td>
                  </>
                ) : (
                  <>
                    <td style={{ ...S.td, color: only ? zoneColor(only.hours) : C.textDim }}>{only ? only.hours.toFixed(0) : "—"}</td>
                    <td style={S.td}>{only ? only.clients.size : "—"}</td>
                  </>
                )}
                <td style={{ ...S.td, fontWeight: 600, color: zoneColor(g.total.hours) }}>{g.total.hours.toFixed(0)}</td>
                <td style={S.td}>{g.total.sessions}</td>
                <td style={S.td}>{hPerClient}</td>
                <td style={S.td}>{fmtCZK(g.total.revenue)}</td>
                <td style={S.td}>{fmtCZK(czkPerSess)}</td>
                <td style={{ ...S.td, fontWeight: 600, color: g.score >= 7 ? C.green : g.score >= 4 ? C.orange : C.red }}>{g.score}</td>
                <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>{g.recommendation}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {!rows.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}

      {summary && (
        <div style={{ display: "flex", gap: 20, marginTop: 14, fontSize: 12, color: C.textMuted, flexWrap: "wrap" }}>
          <span>Ø {period === "week" ? "hodín/týž." : "hodín/obdobie"}: <strong style={{ color: C.text }}>{summary.avgH.toFixed(1)}h</strong></span>
          <span style={{ color: C.green }}>● Zdravá zóna: {summary.zones.green}</span>
          <span style={{ color: C.red }}>● Pod zónou: {summary.zones.red}</span>
          <span style={{ color: C.orange }}>● Nad zónou: {summary.zones.orange}</span>
          <span style={{ color: C.textDim }}>Cieľ {TARGET_H}h/týž. (zóna 24–34h)</span>
        </div>
      )}
    </Card>
  );
}

function Analyza({ data }: { data: PSBData }) {
  const perTrainer = useMemo(() => sessionAnalysis(data.sessions), [data.sessions]);
  const psb = useMemo(() => sessionAnalysisPSB(data.sessions), [data.sessions]);

  const chartData = psb.map((r) => ({ label: monthLabel(r.month), values: [r.offline, r.onlineTc, r.uvodne] }));

  return (
    <>
      <Card>
        <H3>PSB celkovo — trend sedení podľa typu (Online + TrueCoach spolu)</H3>
        {psb.length ? (
          <MiniBars
            data={chartData}
            series={[
              { name: "Offline", color: C.accent },
              { name: "Online + TrueCoach", color: C.blue },
              { name: "Úvodné", color: C.orange },
            ]}
            height={150}
          />
        ) : (
          <Empty>Nahraj Payroll by Session CSV.</Empty>
        )}
      </Card>

      <Card>
        <H3>Detail podľa trénera a mesiaca</H3>
        <TableWrap>
          <thead>
            <tr>
              {["Mesiac", "Tréner", "Offline", "Online", "TrueCoach", "Úvodné", "Celkom", "% Offline"].map((h) => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perTrainer.map((r, i) => (
              <tr key={i}>
                <td style={S.td}>{monthLabel(r.month)}</td>
                <td style={S.td}>{r.trainer}</td>
                <td style={S.td}>{r.OFFLINE}</td>
                <td style={S.td}>{r.ONLINE}</td>
                <td style={S.td}>{r.TRUECOACH}</td>
                <td style={S.td}>{r.UVODNE}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{r.total}</td>
                <td style={S.td}>{r.total ? ((r.OFFLINE / r.total) * 100).toFixed(0) + "%" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!perTrainer.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}
      </Card>
    </>
  );
}

function Kapacita({ capacity }: { capacity: CapacityRow[] }) {
  return (
    <Card>
      <H3>Kapacitný kalkulátor</H3>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>
        Efektívne hodiny = Anchor × 1.08 + Stabilný × 0.66 + Sporadický × 0.33. Cieľ {TARGET_H}h/týždeň (zdravá zóna 24–34h).
      </div>
      {capacity.map((cap) => (
        <div key={cap.trainer} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.accentLight, marginBottom: 10 }}>{cap.trainer}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 10 }}>
            {[
              { l: "Anchor", v: cap.anchor, c: C.green },
              { l: "Stabilný", v: cap.stable, c: C.orange },
              { l: "Sporadický", v: cap.sporadic, c: C.red },
              { l: "Efekt. h/týž.", v: cap.effHours.toFixed(1), c: cap.effHours >= 24 ? C.green : C.red },
            ].map((s) => (
              <div key={s.l} style={{ ...S.card, padding: 10, marginBottom: 0 }}>
                <div style={{ fontSize: 11, color: C.textMuted }}>{s.l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: cap.gap > 0 ? C.orange : C.green }}>{cap.advice}</div>
        </div>
      ))}
      {!capacity.some((c) => c.anchor + c.stable + c.sporadic > 0) && <Empty>Nahraj CSV pre výpočet kapacity.</Empty>}
    </Card>
  );
}
