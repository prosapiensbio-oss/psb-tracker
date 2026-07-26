import { useMemo, useState } from "react";

import { monthlyFinance, predictEarnings, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { BarRow, Card, Empty, H3, MiniBars, SubTabs, TableWrap } from "./ui";

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

function Zarobky({ monthly }: { monthly: ReturnType<typeof monthlyFinance> }) {
  return (
    <Card>
      <H3>Mesačné zárobky — Jerry / Terezka / PSB (zdroj: Payroll by Session)</H3>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 12 }}>Sedenia s CZK0 sa počítajú do počtu, nie do zárobkov.</div>
      <TableWrap>
        <thead>
          <tr>
            {["Mesiac", "Jerry", "Terezka", "PSB spolu", "Sedení", "MoM %", ""].map((h) => (
              <th key={h} style={S.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthly.map((m, i) => {
            const prev = monthly[i - 1];
            const mom = prev && prev.revenue ? ((m.revenue - prev.revenue) / prev.revenue) * 100 : null;
            return (
              <tr key={m.month}>
                <td style={S.td}>{monthLabel(m.month)}</td>
                <td style={S.td}>{fmtCZK(m.byTrainer["Jerry"]?.revenue || 0)}</td>
                <td style={S.td}>{fmtCZK(m.byTrainer["Terezka"]?.revenue || 0)}</td>
                <td style={{ ...S.td, fontWeight: 600, color: C.accentLight }}>{fmtCZK(m.revenue)}</td>
                <td style={S.td}>{m.sessions}</td>
                <td style={{ ...S.td, color: arrowColor(mom) }}>{mom == null ? "—" : mom.toFixed(1) + "%"}</td>
                <td style={{ ...S.td, color: arrowColor(mom) }}>{arrow(mom)}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {!monthly.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}
    </Card>
  );
}

function Cashflow({ monthly }: { monthly: ReturnType<typeof monthlyFinance> }) {
  const max = Math.max(1, ...monthly.map((m) => Math.max(m.revenue, m.cash)));
  return (
    <Card>
      <H3>Cashflow — prijaté platby vs. vyfakturované zárobky</H3>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>
        Cash &gt; zárobky = klienti platia vopred. Cash &lt; zárobky = čerpajú z balíčkov.
      </div>
      {monthly.map((m) => (
        <div key={m.month} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>{monthLabel(m.month)}</div>
          <BarRow label="Zárobky" value={m.revenue} max={max} color={C.accent} sub={fmtCZK(m.revenue)} />
          <BarRow label="Platby (cash)" value={m.cash} max={max} color={C.blue} sub={fmtCZK(m.cash)} />
        </div>
      ))}
      {!monthly.length && <Empty>Nahraj Payroll by Session + Payments Recorded CSV.</Empty>}
    </Card>
  );
}

function Sedenia({ monthly }: { monthly: ReturnType<typeof monthlyFinance> }) {
  const chart = monthly.map((m) => ({
    label: monthLabel(m.month),
    values: [m.byTrainer["Jerry"]?.sessions || 0, m.byTrainer["Terezka"]?.sessions || 0],
  }));
  return (
    <>
      <Card>
        <H3>Počet sedení podľa trénera</H3>
        {monthly.length ? (
          <MiniBars data={chart} series={[{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]} height={140} />
        ) : (
          <Empty>Nahraj Payroll by Session CSV.</Empty>
        )}
      </Card>
      <Card>
        <H3>Cena za sedenie a využitie kapacity</H3>
        <TableWrap>
          <thead>
            <tr>
              {["Mesiac", "Sedení", "Zárobky", "CZK/sedenie", "Využitie kapacity", "Status"].map((h) => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => {
              const perSess = m.sessions ? m.revenue / m.sessions : 0;
              const util = (m.sessions / MAX_SESSIONS_MONTH) * 100;
              const healthy = util >= 40;
              return (
                <tr key={m.month}>
                  <td style={S.td}>{monthLabel(m.month)}</td>
                  <td style={S.td}>{m.sessions}</td>
                  <td style={S.td}>{fmtCZK(m.revenue)}</td>
                  <td style={S.td}>{fmtCZK(perSess)}</td>
                  <td style={S.td}>{util.toFixed(0)}%</td>
                  <td style={{ ...S.td, color: healthy ? C.green : C.orange }}>{healthy ? "Zdravá" : "Slabšia"}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        {!monthly.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}
      </Card>
    </>
  );
}

function Predikcia({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [excludeSpecial, setExcludeSpecial] = useState(false);
  const pred = useMemo(
    () => predictEarnings(data, clients, { excludeSpecial }),
    [data, clients, excludeSpecial],
  );
  const chart = pred.months.map((m) => ({ label: monthLabel(m.month), values: [m.guaranteed, m.renewal] }));
  const hasData = pred.perClient.length > 0;

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <H3>Predikcia zárobkov — nasledujúce 3 mesiace</H3>
          <label style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={excludeSpecial} onChange={(e) => setExcludeSpecial(e.target.checked)} style={{ accentColor: C.accent }} />
            Bez špeciálnych sadzieb
          </label>
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>
          Vrstva 1 = čerpanie existujúcich balíčkov (garantované). Vrstva 2 = odhad obnov podľa dôvery segmentu.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <div style={{ ...S.card, marginBottom: 0, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.green }}>{fmtCZK(pred.scenarios.optimistic)}</div>
            <div style={S.statLabel}>Optimistický</div>
          </div>
          <div style={{ ...S.card, marginBottom: 0, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.accentLight }}>{fmtCZK(pred.scenarios.realistic)}</div>
            <div style={S.statLabel}>Realistický</div>
          </div>
          <div style={{ ...S.card, marginBottom: 0, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.orange }}>{fmtCZK(pred.scenarios.negative)}</div>
            <div style={S.statLabel}>Negatívny</div>
          </div>
          <div style={{ ...S.card, marginBottom: 0, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>{fmtCZK(pred.guaranteedTotal)}</div>
            <div style={S.statLabel}>Garantované (Vrstva 1)</div>
          </div>
        </div>

        {hasData ? (
          <MiniBars data={chart} series={[{ name: "Garantované (balíčky)", color: C.accent }, { name: "Odhad obnov", color: C.blue }]} height={140} />
        ) : (
          <Empty>Nahraj Packages &amp; Memberships + Payroll CSV pre predikciu.</Empty>
        )}
      </Card>

      {hasData && (
        <Card>
          <H3>Detail podľa klienta</H3>
          <TableWrap>
            <thead>
              <tr>
                {["Klient", "Tréner", "Typ", "Zostatok sedení", "Tempo/mes.", "Mes. do konca", "Garantované", "Dôvera obnovy"].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pred.perClient.slice(0, 40).map((c) => (
                <tr key={c.name}>
                  <td style={{ ...S.td, fontWeight: 500 }}>{c.name}</td>
                  <td style={S.td}>{c.trainer}</td>
                  <td style={S.td}>{c.type === "6M Predplatné" ? "6M" : "Balíček"}</td>
                  <td style={S.td}>{c.remaining || "—"}</td>
                  <td style={S.td}>{c.burnRate.toFixed(1)}</td>
                  <td style={S.td}>{c.remaining ? c.monthsLeft.toFixed(1) : "—"}</td>
                  <td style={S.td}>{fmtCZK(c.guaranteed)}</td>
                  <td style={{ ...S.td, color: c.confidence >= 0.8 ? C.green : c.confidence >= 0.5 ? C.orange : C.red }}>{(c.confidence * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
