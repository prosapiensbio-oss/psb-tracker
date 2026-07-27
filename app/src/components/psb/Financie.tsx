import { useMemo, useState } from "react";

import { monthlyFinance, predictEarnings, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { BarRow, Card, Empty, H3, Info, LineChart, Select, SortTh, StatCard, SubTabs, TableWrap, useSort, ValueBars } from "./ui";

const MAX_SESSIONS_MONTH = 260;

export function Financie({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [sub, setSub] = useState("zarobky");
  const monthly = useMemo(() => monthlyFinance(data), [data]);
  return (
    <>
      <SubTabs
        tabs={[
          { id: "zarobky", label: "Mesačné zárobky" },
          { id: "cashflow", label: "Cashflow" },
          { id: "sedenia", label: "Sedenia & cena" },
          { id: "predikcia", label: "Predikcia" },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === "zarobky" && <Zarobky monthly={monthly} />}
      {sub === "cashflow" && <Cashflow monthly={monthly} />}
      {sub === "sedenia" && <Sedenia monthly={monthly} />}
      {sub === "predikcia" && <Predikcia data={data} clients={clients} />}
    </>
  );
}

const arrow = (mom: number | null) => (mom == null ? "►" : mom > 2 ? "▲" : mom < -2 ? "▼" : "►");
const arrowColor = (mom: number | null) => (mom == null ? C.textDim : mom > 2 ? C.green : mom < -2 ? C.red : C.textMuted);
type Monthly = ReturnType<typeof monthlyFinance>;

function Zarobky({ monthly }: { monthly: Monthly }) {
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "asc" });
  const withMom = useMemo(
    () =>
      monthly.map((m, i) => {
        const prev = monthly[i - 1];
        const mom = prev && prev.revenue ? ((m.revenue - prev.revenue) / prev.revenue) * 100 : null;
        return { ...m, mom };
      }),
    [monthly],
  );
  const rows = sorted(withMom, {
    month: (m) => m.month,
    jerry: (m) => m.byTrainer["Jerry"]?.revenue || 0,
    terezka: (m) => m.byTrainer["Terezka"]?.revenue || 0,
    total: (m) => m.revenue,
    sessions: (m) => m.sessions,
    mom: (m) => m.mom ?? -999,
  });
  const chart = monthly.slice(-8).map((m) => ({ label: monthLabel(m.month), value: m.revenue }));

  return (
    <>
      <Card>
        <H3>Mesačné zárobky (spolu)</H3>
        {chart.length ? <ValueBars data={chart} color={C.accent} fmt={(n) => `${Math.round(n / 1000)}k`} height={170} /> : <Empty>Nahraj Payroll by Session.</Empty>}
      </Card>
      <Card>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>Zdroj: Payroll by Session. Sedenia s CZK0 sa počítajú do počtu, nie do zárobkov.</div>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Mesiac" sortKey="month" sort={sort} onSort={toggle} />
              <SortTh label="Jerry" sortKey="jerry" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Terezka" sortKey="terezka" sort={sort} onSort={toggle} align="right" />
              <SortTh label="PSB spolu" sortKey="total" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" />
              <SortTh label="MoM %" sortKey="mom" sort={sort} onSort={toggle} align="right" info="Month-over-Month — percentuálna zmena zárobkov oproti predošlému mesiacu. Kladné = rast, záporné = pokles." />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month}>
                <td style={S.td}>{monthLabel(m.month)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(m.byTrainer["Jerry"]?.revenue || 0)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(m.byTrainer["Terezka"]?.revenue || 0)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.accentLight }}>{fmtCZK(m.revenue)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{m.sessions}</td>
                <td style={{ ...S.td, textAlign: "right", color: arrowColor(m.mom) }}>{m.mom == null ? "—" : `${arrow(m.mom)} ${m.mom.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!monthly.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}
      </Card>
    </>
  );
}

function Cashflow({ monthly }: { monthly: Monthly }) {
  const [win, setWin] = useState("all");
  const shown = win === "all" ? monthly : monthly.slice(-Number(win));
  const max = Math.max(1, ...shown.map((m) => Math.max(m.revenue, m.cash)));
  const totals = shown.reduce((a, m) => ({ cash: a.cash + m.cash, rev: a.rev + m.revenue }), { cash: 0, rev: 0 });
  const diff = totals.cash - totals.rev;
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <H3>
          <Info text="Prijaté platby = peniaze reálne prijaté (report Payments Recorded). Vyfakturované zárobky = hodnota odtrénovaných sedení (Payroll by Session)." label="Cashflow — prijaté platby vs. zárobky" />
        </H3>
        <Select value={win} onChange={setWin} options={[
          { value: "all", label: "Celé obdobie" },
          { value: "6", label: "Posledných 6 mes." },
          { value: "12", label: "Posledných 12 mes." },
        ]} />
      </div>
      <div style={{ padding: "10px 12px", marginTop: 10, marginBottom: 14, borderRadius: 8, background: diff >= 0 ? C.greenBg : C.orangeBg, fontSize: 13, color: C.text }}>
        {diff >= 0
          ? `Za zvolené obdobie ste prijali o ${fmtCZK(diff)} viac, než vyfakturovali → klienti platia dopredu (kredit na balíčkoch).`
          : `Za zvolené obdobie ste vyfakturovali o ${fmtCZK(-diff)} viac, než prijali → klienti čerpajú z vopred zaplatených balíčkov.`}
      </div>
      {shown.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <LineChart
            data={shown.map((m) => ({ label: monthLabel(m.month), values: [m.revenue, m.cash] }))}
            series={[{ name: "Vyfakturované zárobky", color: C.accent }, { name: "Prijaté platby", color: C.blue }]}
            height={210}
            fmt={(n) => `${Math.round(n / 1000)}k`}
          />
        </div>
      )}
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Detail po mesiacoch:</div>
      {shown.map((m) => (
        <div key={m.month} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>{monthLabel(m.month)}</div>
          <BarRow label="Vyfakturované zárobky" value={m.revenue} max={max} color={C.accent} sub={fmtCZK(m.revenue)} />
          <BarRow label="Prijaté platby" value={m.cash} max={max} color={C.blue} sub={fmtCZK(m.cash)} />
        </div>
      ))}
      {!monthly.length && <Empty>Nahraj Payroll by Session + Payments Recorded CSV.</Empty>}
    </Card>
  );
}

function Sedenia({ monthly }: { monthly: Monthly }) {
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "asc" });
  const rows = sorted(
    monthly.map((m) => ({ ...m, perSess: m.sessions ? m.revenue / m.sessions : 0, util: (m.sessions / MAX_SESSIONS_MONTH) * 100 })),
    { month: (m) => m.month, sessions: (m) => m.sessions, revenue: (m) => m.revenue, perSess: (m) => m.perSess, util: (m) => m.util },
  );
  const chart = monthly.slice(-8).map((m) => ({ label: monthLabel(m.month), value: m.sessions }));
  return (
    <>
      <Card>
        <H3>Počet sedení / mesiac</H3>
        {monthly.length ? <ValueBars data={chart} color={C.accent} fmt={(n) => String(Math.round(n))} height={150} /> : <Empty>Nahraj Payroll by Session.</Empty>}
      </Card>
      <Card>
        <H3>Cena za sedenie a využitie kapacity</H3>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Mesiac" sortKey="month" sort={sort} onSort={toggle} />
              <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Zárobky" sortKey="revenue" sort={sort} onSort={toggle} align="right" />
              <SortTh label="CZK/sedenie" sortKey="perSess" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Využitie kapacity" sortKey="util" sort={sort} onSort={toggle} align="right" info="Podiel z teoretického maxima 260 sedení/mesiac pre 2 trénerov." />
              <th style={S.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month}>
                <td style={S.td}>{monthLabel(m.month)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{m.sessions}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(m.revenue)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(m.perSess)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{m.util.toFixed(0)}%</td>
                <td style={{ ...S.td, color: m.util >= 40 ? C.green : C.orange }}>{m.util >= 40 ? "Zdravá" : "Slabšia"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!monthly.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}
      </Card>
    </>
  );
}

function Predikcia({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [excludeSpecial, setExcludeSpecial] = useState(false);
  const [horizon, setHorizon] = useState(3);
  const [tempoUnit, setTempoUnit] = useState<"mes" | "tyz">("mes");
  const [trainerF, setTrainerF] = useState("all");
  const { sort, toggle, sorted } = useSort({ key: "monthlyRevenue", dir: "desc" });
  const pred = useMemo(() => predictEarnings(data, clients, { excludeSpecial, horizon }), [data, clients, excludeSpecial, horizon]);
  const perClientF = useMemo(() => (trainerF === "all" ? pred.perClient : pred.perClient.filter((c) => c.trainer === trainerF)), [pred.perClient, trainerF]);
  const rows = sorted(perClientF, {
    name: (c) => c.name,
    trainer: (c) => c.trainer,
    remaining: (c) => c.remaining,
    tempo: (c) => c.burnRate,
    monthlyRevenue: (c) => c.monthlyRevenue,
    confidence: (c) => c.confidence,
  });
  const hasData = pred.perClient.length > 0;
  const label = horizon === 1 ? "1 mesiac" : "3 mesiace";
  const monthsCovered = pred.months.length
    ? horizon === 1
      ? monthLabel(pred.months[0].month)
      : `${monthLabel(pred.months[0].month)} – ${monthLabel(pred.months[pred.months.length - 1].month)}`
    : "";

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <H3>
            <Info
              text="Odhad príjmu z reálnej histórie na budúce mesiace. Očakávaný mesačný príjem klienta = ako často chodí × priemerná cena sedenia, vážené dôverou obnovy podľa segmentu. Optimistický/realistický/negatívny = horné/stredné/dolné pásmo dôvery."
              label={`Predikcia zárobkov — ${monthsCovered || label}`}
            />
          </H3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Select value={String(horizon)} onChange={(v) => setHorizon(Number(v))} options={[{ value: "1", label: "1 mesiac" }, { value: "3", label: "3 mesiace" }]} />
            <label style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={excludeSpecial} onChange={(e) => setExcludeSpecial(e.target.checked)} style={{ accentColor: C.accent }} />
              Bez špeciálnych sadzieb
            </label>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "14px 0 6px" }}>
          <StatCard value={fmtCZK(pred.scenarios.optimistic)} label={`Optimistický · ${monthsCovered}`} color={C.green} />
          <StatCard value={fmtCZK(pred.scenarios.realistic)} label={`Realistický · ${monthsCovered}`} color={C.accentLight} />
          <StatCard value={fmtCZK(pred.scenarios.negative)} label={`Negatívny · ${monthsCovered}`} color={C.orange} />
          <StatCard value={fmtCZK(pred.monthlyRunRate)} label="Očak. mesačný run-rate" color={C.blue} />
        </div>
        {!hasData && <Empty>Nahraj Payroll + Packages & Memberships CSV pre predikciu.</Empty>}
      </Card>

      {hasData && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <H3>Detail podľa klienta</H3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Select value={trainerF} onChange={setTrainerF} options={[
                { value: "all", label: "Obaja tréneri" },
                { value: "Jerry", label: "Jerry" },
                { value: "Terezka", label: "Terezka" },
              ]} />
              <div style={{ display: "flex", gap: 4 }}>
              {(["mes", "tyz"] as const).map((u) => (
                <button key={u} onClick={() => setTempoUnit(u)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${tempoUnit === u ? C.accent : C.border}`, background: tempoUnit === u ? C.accentBg : "transparent", color: tempoUnit === u ? C.accentLight : C.textMuted, fontSize: 11, cursor: "pointer" }}>
                  tempo/{u === "mes" ? "mes." : "týž."}
                </button>
              ))}
              </div>
            </div>
          </div>
          <TableWrap>
            <thead>
              <tr>
                <SortTh label="Klient" sortKey="name" sort={sort} onSort={toggle} />
                <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
                <SortTh label="Zostatok" sortKey="remaining" sort={sort} onSort={toggle} align="right" info="Zostatok sedení z reportu Packages & Memberships. „—“ = nie je tam (napr. platí mesačne)." />
                <SortTh label={`Tempo/${tempoUnit === "mes" ? "mes." : "týž."}`} sortKey="tempo" sort={sort} onSort={toggle} align="right" info="Priemerný počet sedení za dané obdobie z histórie klienta." />
                <SortTh label="Ø mes. príjem" sortKey="monthlyRevenue" sort={sort} onSort={toggle} align="right" info="Očakávaný mesačný príjem = tempo × priemerná cena sedenia." />
                <SortTh label="Dôvera obnovy" sortKey="confidence" sort={sort} onSort={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((c) => (
                <tr key={c.name}>
                  <td style={{ ...S.td, fontWeight: 500 }}>{c.name}</td>
                  <td style={S.td}>{c.trainer}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{c.remaining || "—"}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{(tempoUnit === "mes" ? c.burnRate : c.burnWeek).toFixed(1)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(c.monthlyRevenue)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: c.confidence >= 0.8 ? C.green : c.confidence >= 0.5 ? C.orange : C.red }}>{(c.confidence * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
