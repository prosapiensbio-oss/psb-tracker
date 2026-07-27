import { useMemo, useState } from "react";

import { monthlyFinance, predictEarnings, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { BarRow, Card, Empty, H3, Info, Select, SortTh, StatCard, SubTabs, TableWrap, Toolbar, useSort, ZoneBars } from "./ui";

const MAX_SESSIONS_MONTH = 260; // 2 trainers capacity reference

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
  const chart = monthly.slice(-8).map((m) => ({
    label: monthLabel(m.month),
    values: [m.byTrainer["Jerry"]?.revenue || 0, m.byTrainer["Terezka"]?.revenue || 0],
  }));

  return (
    <>
      <Card>
        <H3>Mesačné zárobky (Jerry / Terezka)</H3>
        {chart.length ? <ZoneBars data={chart} series={[{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]} stacked height={170} /> : <Empty>Nahraj Payroll by Session.</Empty>}
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
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <H3>
          <Info text="Prijaté platby = peniaze reálne prijaté na účet/v hotovosti (report Payments Recorded). Vyfakturované zárobky = hodnota odtrénovaných sedení (Payroll by Session). Platby > zárobky = klient zaplatil dopredu; platby < zárobky = čerpá z balíčka." label="Cashflow — prijaté platby vs. zárobky" />
        </H3>
        <Select value={win} onChange={setWin} options={[
          { value: "all", label: "Celé obdobie" },
          { value: "6", label: "Posledných 6 mes." },
          { value: "12", label: "Posledných 12 mes." },
        ]} />
      </div>
      <div style={{ marginTop: 12 }}>
        {shown.map((m) => (
          <div key={m.month} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>{monthLabel(m.month)}</div>
            <BarRow label="Vyfakturované zárobky" value={m.revenue} max={max} color={C.accent} sub={fmtCZK(m.revenue)} />
            <BarRow label="Prijaté platby" value={m.cash} max={max} color={C.blue} sub={fmtCZK(m.cash)} />
          </div>
        ))}
      </div>
      {!monthly.length && <Empty>Nahraj Payroll by Session + Payments Recorded CSV.</Empty>}
    </Card>
  );
}

function Sedenia({ monthly }: { monthly: Monthly }) {
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "asc" });
  const rows = sorted(
    monthly.map((m) => ({ ...m, perSess: m.sessions ? m.revenue / m.sessions : 0, util: (m.sessions / MAX_SESSIONS_MONTH) * 100 })),
    {
      month: (m) => m.month,
      sessions: (m) => m.sessions,
      revenue: (m) => m.revenue,
      perSess: (m) => m.perSess,
      util: (m) => m.util,
    },
  );
  const chart = monthly.slice(-8).map((m) => ({ label: monthLabel(m.month), values: [m.byTrainer["Jerry"]?.sessions || 0, m.byTrainer["Terezka"]?.sessions || 0] }));
  return (
    <>
      <Card>
        <H3>Počet sedení podľa trénera</H3>
        {monthly.length ? <ZoneBars data={chart} series={[{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]} height={150} /> : <Empty>Nahraj Payroll by Session.</Empty>}
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
  const { sort, toggle, sorted } = useSort({ key: "monthlyRevenue", dir: "desc" });
  const pred = useMemo(() => predictEarnings(data, clients, { excludeSpecial }), [data, clients, excludeSpecial]);
  const chart = pred.months.map((m) => ({ label: monthLabel(m.month), values: [m.guaranteed, m.expected] }));
  const hasData = pred.perClient.length > 0;
  const rows = sorted(pred.perClient, {
    name: (c) => c.name,
    trainer: (c) => c.trainer,
    remaining: (c) => c.remaining,
    burnRate: (c) => c.burnRate,
    monthlyRevenue: (c) => c.monthlyRevenue,
    guaranteed3m: (c) => c.guaranteed3m,
    confidence: (c) => c.confidence,
  });

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <H3>
            <Info
              text="Odhad príjmu na nasledujúce 3 mesiace z reálnej histórie. Vrstva 1 (garantované) = sedenia kryté už zaplateným balíčkom. Vrstva 2 (očakávané) = bežný príjem z pravidelnosti klienta, vážený dôverou obnovy podľa segmentu. Nie je to súčet plných cien balíčkov."
              label="Predikcia zárobkov — najbližšie 3 mesiace"
            />
          </H3>
          <label style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={excludeSpecial} onChange={(e) => setExcludeSpecial(e.target.checked)} style={{ accentColor: C.accent }} />
            Bez špeciálnych sadzieb
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "14px 0 18px" }}>
          <StatCard value={fmtCZK(pred.scenarios.optimistic)} label="Optimistický (3 mes.)" color={C.green} />
          <StatCard value={fmtCZK(pred.scenarios.realistic)} label="Realistický (3 mes.)" color={C.accentLight} />
          <StatCard value={fmtCZK(pred.scenarios.negative)} label="Negatívny (3 mes.)" color={C.orange} />
          <StatCard value={fmtCZK(pred.monthlyRunRate)} label="Očak. mesačný run-rate" color={C.blue} />
        </div>

        {hasData ? (
          <ZoneBars data={chart} series={[{ name: "Garantované (balíčky)", color: C.accent }, { name: "Očakávané (obnovy)", color: C.blue }]} stacked height={150} />
        ) : (
          <Empty>Nahraj Payroll + Packages & Memberships CSV pre predikciu.</Empty>
        )}
      </Card>

      {hasData && (
        <Card>
          <H3>Detail podľa klienta</H3>
          <TableWrap>
            <thead>
              <tr>
                <SortTh label="Klient" sortKey="name" sort={sort} onSort={toggle} />
                <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
                <SortTh label="Zostatok" sortKey="remaining" sort={sort} onSort={toggle} align="right" info="Zostatok sedení z reportu Packages & Memberships. „—“ = klient tam nie je (napr. platí mesačne alebo za sedenie)." />
                <SortTh label="Tempo/mes." sortKey="burnRate" sort={sort} onSort={toggle} align="right" info="Priemerný počet sedení za mesiac z histórie klienta." />
                <SortTh label="Ø mes. príjem" sortKey="monthlyRevenue" sort={sort} onSort={toggle} align="right" info="Očakávaný mesačný príjem = tempo × priemerná cena sedenia." />
                <SortTh label="Garantované 3m" sortKey="guaranteed3m" sort={sort} onSort={toggle} align="right" info="Príjem krytý už zaplateným balíčkom počas najbližších 3 mesiacov." />
                <SortTh label="Dôvera obnovy" sortKey="confidence" sort={sort} onSort={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((c) => (
                <tr key={c.name}>
                  <td style={{ ...S.td, fontWeight: 500 }}>{c.name}</td>
                  <td style={S.td}>{c.trainer}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{c.remaining || "—"}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{c.burnRate.toFixed(1)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(c.monthlyRevenue)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{c.guaranteed3m ? fmtCZK(c.guaranteed3m) : "—"}</td>
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
