import { useEffect, useMemo, useState } from "react";

import { monthlyFinance, predictCash, predictEarnings, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { NavFocus } from "./App";
import { BarRow, Card, Empty, H3, Info, LineChart, Select, SortTh, StatCard, SubTabs, TableWrap, useSort, ValueBars } from "./ui";

const MAX_SESSIONS_MONTH = 260;

export function Financie({ data, clients, focus }: { data: PSBData; clients: Record<string, ClientAgg>; focus?: NavFocus | null }) {
  const [sub, setSub] = useState("zarobky");
  const [focusMonth, setFocusMonth] = useState<string | null>(null);
  const monthly = useMemo(() => monthlyFinance(data), [data]);

  // Deep-link from the Dashboard: jump to Mesačné zárobky and highlight one month.
  useEffect(() => {
    if (!focus?.month) return;
    setSub("zarobky");
    setFocusMonth(focus.month);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <SubTabs
        tabs={[
          { id: "zarobky", label: "Mesačné zárobky" },
          { id: "trzby", label: "Tržby (prijaté)" },
          { id: "sedenia", label: "Sedenia & cena" },
          { id: "predikcia", label: "Predikcia" },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === "trzby" && <Trzby monthly={monthly} data={data} clients={clients} />}
      {sub === "zarobky" && <Zarobky monthly={monthly} focusMonth={focusMonth} onClearFocus={() => setFocusMonth(null)} />}
      {sub === "sedenia" && <Sedenia monthly={monthly} />}
      {sub === "predikcia" && <Predikcia data={data} clients={clients} />}
    </>
  );
}

const arrow = (mom: number | null) => (mom == null ? "►" : mom > 2 ? "▲" : mom < -2 ? "▼" : "►");
const arrowColor = (mom: number | null) => (mom == null ? C.textDim : mom > 2 ? C.green : mom < -2 ? C.red : C.textMuted);
type Monthly = ReturnType<typeof monthlyFinance>;

// ── shared period filter for the finance tabs ────────────────────────────────
const RANGE_OPTS = [
  { value: "all", label: "Celé obdobie" },
  { value: "3", label: "Posledné 3 mes." },
  { value: "6", label: "Posledných 6 mes." },
  { value: "12", label: "Posledných 12 mes." },
  { value: "custom", label: "Vlastné" },
];

function windowFilter<T extends { month: string }>(arr: T[], win: string, from: string, to: string): T[] {
  if (win === "custom") {
    let lo = from || arr[0]?.month || "";
    let hi = to || arr[arr.length - 1]?.month || "";
    if (lo > hi) [lo, hi] = [hi, lo]; // tolerate od > do
    return arr.filter((m) => m.month >= lo && m.month <= hi);
  }
  const n = Number(win);
  return n > 0 ? arr.slice(-n) : arr;
}

function useMonthWindow() {
  const [win, setWin] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return { win, setWin, from, setFrom, to, setTo };
}

// Dropdown row: Celé obdobie / Posledné N / Vlastné (+ from–to month pickers).
function RangeControls({ w, monthly }: { w: ReturnType<typeof useMonthWindow>; monthly: Monthly }) {
  const opts = monthly.map((m) => ({ value: m.month, label: monthLabel(m.month) }));
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Select value={w.win} onChange={w.setWin} options={RANGE_OPTS} />
      {w.win === "custom" && monthly.length > 0 && (
        <>
          <Select value={w.from || monthly[0].month} onChange={w.setFrom} options={opts} />
          <span style={{ color: C.textDim }}>–</span>
          <Select value={w.to || monthly[monthly.length - 1].month} onChange={w.setTo} options={opts} />
        </>
      )}
    </div>
  );
}

function Zarobky({ monthly, focusMonth, onClearFocus }: { monthly: Monthly; focusMonth?: string | null; onClearFocus?: () => void }) {
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "asc" });
  const w = useMonthWindow();
  const withMom = useMemo(
    () =>
      monthly.map((m, i) => {
        const prev = monthly[i - 1];
        const mom = prev && prev.revenue ? ((m.revenue - prev.revenue) / prev.revenue) * 100 : null;
        return { ...m, mom };
      }),
    [monthly],
  );
  const view = useMemo(() => windowFilter(withMom, w.win, w.from, w.to), [withMom, w.win, w.from, w.to]);
  const rows = sorted(view, {
    month: (m) => m.month,
    jerry: (m) => m.byTrainer["Jerry"]?.revenue || 0,
    terezka: (m) => m.byTrainer["Terezka"]?.revenue || 0,
    total: (m) => m.revenue,
    sessions: (m) => m.sessions,
    mom: (m) => m.mom ?? -999,
  });
  const chart = view.map((m) => ({ label: monthLabel(m.month), value: m.revenue }));
  // Súhrn za zvolené obdobie (vyfakturované = hodnota odtrénovaných sedení).
  const revVals = view.map((m) => m.revenue);
  const total = revVals.reduce((a, b) => a + b, 0);
  const sessTotal = view.reduce((a, m) => a + m.sessions, 0);
  const avgAll = revVals.length ? total / revVals.length : 0;
  const avgOf = (n: number) => {
    const s = revVals.slice(-n);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  };
  const avg3 = avgOf(3), avg6 = avgOf(6);

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <H3>Mesačné zárobky (spolu)</H3>
          <RangeControls w={w} monthly={monthly} />
        </div>
        {chart.length ? <ValueBars data={chart} color={C.accent} fmt={(n) => `${Math.round(n / 1000)}k`} height={170} alignEnd /> : <Empty>Žiadne dáta pre zvolené obdobie.</Empty>}
      </Card>

      {view.length > 0 && (
        <Card>
          <H3>
            <Info text="Súhrn vyfakturovaných zárobkov za zvolené obdobie (podľa filtra vpravo hore). Spolu = súčet všetkých mesiacov v období; priemery sú za daný počet posledných mesiacov v ňom. Zdroj Payroll by Session — sedenia s CZK0 sa rátajú do počtu, nie do súm." label="Súhrn zárobkov (za zvolené obdobie)" />
          </H3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
            <StatCard value={fmtCZK(total)} label={`Spolu za obdobie · ${view.length} mes.`} color={C.accentLight} />
            <StatCard value={fmtCZK(avgAll)} label="Ø / mesiac" color={C.accent} />
            {view.length > 3 && <StatCard value={fmtCZK(avg3)} label="Ø posledné 3 mes." color={C.green} />}
            {view.length > 6 && <StatCard value={fmtCZK(avg6)} label="Ø posledných 6 mes." color={C.blue} />}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Sedení spolu za obdobie: {sessTotal}</div>
        </Card>
      )}
      <Card>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>Zdroj: Payroll by Session. Sedenia s CZK0 sa počítajú do počtu, nie do zárobkov.</div>
        {focusMonth && (
          <div style={{ marginBottom: 10 }}>
            <button onClick={onClearFocus} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "5px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>
              Vybraný mesiac: {monthLabel(focusMonth)} ✕
            </button>
          </div>
        )}
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
            {(focusMonth ? rows.filter((m) => m.month === focusMonth) : rows).map((m) => (
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

// Tržby = money actually received per month (Payments Recorded) — what PTminder
// shows as "Payments". Lumpy (clients pre-pay packages), so the forecast uses
// trailing averages rather than the session run-rate.
function Trzby({ monthly, data, clients }: { monthly: Monthly; data: PSBData; clients: Record<string, ClientAgg> }) {
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "asc" });
  const w = useMonthWindow();
  const withMom = useMemo(
    () =>
      monthly.map((m, i) => {
        const prev = monthly[i - 1];
        const mom = prev && prev.cash ? ((m.cash - prev.cash) / prev.cash) * 100 : null;
        return { ...m, mom };
      }),
    [monthly],
  );
  const view = useMemo(() => windowFilter(withMom, w.win, w.from, w.to), [withMom, w.win, w.from, w.to]);
  const rows = sorted(view, { month: (m) => m.month, cash: (m) => m.cash, revenue: (m) => m.revenue, mom: (m) => m.mom ?? -999 });
  const chart = view.map((m) => ({ label: monthLabel(m.month), value: m.cash }));

  // Súhrn za zvolené obdobie.
  const totalCash = view.reduce((a, m) => a + m.cash, 0);
  const totalRev = view.reduce((a, m) => a + m.revenue, 0);

  // Trailing-average forecast — vždy z celej histórie (výhľad dopredu, nezávislý od filtra).
  const cashVals = monthly.map((m) => m.cash);
  const avgOf = (n: number) => {
    const s = cashVals.slice(-n);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  };
  const avg3 = avgOf(3), avg6 = avgOf(6), avg12 = avgOf(12);
  // Predikcia z obnov členstiev — priemery zostávajú ako porovnanie, ale hlavné
  // číslo je teraz bodový odhad: kto má kedy skončiť členstvo a koľko naposledy
  // zaplatil.
  const cashPred = useMemo(() => predictCash(data, clients, 2), [data, clients]);
  const buduci = cashPred.months[0];

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <H3>
            <Info text="Mesačné tržby = peniaze reálne prijaté za mesiac (report Payments Recorded). Presne to, čo v PTminderi vidíš ako Payments. Skáče, keď si niekto kúpi väčší balíček dopredu — tie tréningy sa potom čerpajú ďalšie mesiace (preto sa tržby líšia od vyfakturovaných zárobkov)." label="Mesačné tržby (prijaté platby)" />
          </H3>
          <RangeControls w={w} monthly={monthly} />
        </div>
        {chart.length ? <ValueBars data={chart} color={C.blue} fmt={(n) => `${Math.round(n / 1000)}k`} height={180} alignEnd /> : <Empty>Žiadne dáta pre zvolené obdobie.</Empty>}
      </Card>

      {view.length > 0 && (
        <Card>
          <H3>
            <Info text="Súčet za zvolené obdobie (podľa filtra vpravo hore): prijaté platby (report Payments) aj vyfakturované zárobky (hodnota odtrénovaných sedení)." label="Súhrn tržieb (za zvolené obdobie)" />
          </H3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
            <StatCard value={fmtCZK(totalCash)} label={`Prijaté spolu · ${view.length} mes.`} color={C.blue} />
            <StatCard value={fmtCZK(totalCash / (view.length || 1))} label="Ø prijaté / mesiac" color={C.accent} />
            <StatCard value={fmtCZK(totalRev)} label="Vyfakturované spolu" color={C.accentLight} />
          </div>
        </Card>
      )}

      {monthly.length > 0 && (
        <Card>
          <H3>
            <Info text="Peniaze nechodia rovnomerne — chodia, keď niekomu skončí členstvo a kúpi si ďalšie. Odhad preto ide klient po klientovi: posledná platba + platnosť jeho členstva = kedy pravdepodobne príde ďalšia, a suma sa berie z jeho POSLEDNEJ platby (tá už v sebe nesie jeho zľavy — bitcoin, referral, Jarek). Vážené dôverou obnovy; kto mlčí 30+ dní, má polovičnú. Priemery vedľa sú len na porovnanie — ukazujú, čo bolo, nie čo príde." label={`Odhad tržieb — ${monthLabel(buduci?.month || "")}`} />
          </H3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
            <StatCard value={fmtCZK(buduci?.expected || 0)} label={`Odhad · ${monthLabel(buduci?.month || "")}`} color={C.green} />
            <StatCard value={`${fmtCZK(buduci?.lo || 0)} – ${fmtCZK(buduci?.hi || 0)}`} label="Rozpätie" color={C.accentLight} />
            <StatCard value={fmtCZK(avg3)} label="Ø posledné 3 mes." color={C.blue} />
            <StatCard value={fmtCZK(avg12)} label="Ø celé obdobie" color={C.textMuted} />
          </div>
          {cashPred.perClient.length > 0 && (
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 1.55 }}>
              Najväčšie očakávané obnovy: {cashPred.perClient.slice(0, 4).map((x) => `«${x.name}» ${fmtCZK(x.suma)} v ${monthLabel(x.kedy)} (${Math.round(x.confidence * 100)} %)`).join(" · ")}
            </div>
          )}
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>Zdroj: Payments Recorded. Zoradené najstaršie → najnovšie.</div>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Mesiac" sortKey="month" sort={sort} onSort={toggle} />
              <SortTh label="Prijaté (tržby)" sortKey="cash" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Vyfakturované" sortKey="revenue" sort={sort} onSort={toggle} align="right" info="Pre porovnanie: hodnota odtrénovaných sedení za mesiac." />
              <SortTh label="MoM %" sortKey="mom" sort={sort} onSort={toggle} align="right" info="Zmena tržieb oproti predošlému mesiacu." />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month}>
                <td style={S.td}>{monthLabel(m.month)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.blue }}>{fmtCZK(m.cash)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{fmtCZK(m.revenue)}</td>
                <td style={{ ...S.td, textAlign: "right", color: arrowColor(m.mom) }}>{m.mom == null ? "—" : `${arrow(m.mom)} ${m.mom.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!monthly.length && <Empty>Nahraj Payments Recorded CSV.</Empty>}
      </Card>
    </>
  );
}

function Sedenia({ monthly }: { monthly: Monthly }) {
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "asc" });
  const w = useMonthWindow();
  const view = useMemo(() => windowFilter(monthly, w.win, w.from, w.to), [monthly, w.win, w.from, w.to]);
  const rows = sorted(
    view.map((m) => ({ ...m, perSess: m.sessions ? m.revenue / m.sessions : 0, util: (m.sessions / MAX_SESSIONS_MONTH) * 100 })),
    { month: (m) => m.month, sessions: (m) => m.sessions, revenue: (m) => m.revenue, perSess: (m) => m.perSess, util: (m) => m.util },
  );
  const chart = view.map((m) => ({ label: monthLabel(m.month), value: m.sessions }));
  // Súhrn za zvolené obdobie.
  const sessTotal = view.reduce((a, m) => a + m.sessions, 0);
  const revTotal = view.reduce((a, m) => a + m.revenue, 0);
  const avgSess = view.length ? sessTotal / view.length : 0;
  const perSessAll = sessTotal ? revTotal / sessTotal : 0;
  const avgUtil = view.length ? view.reduce((a, m) => a + (m.sessions / MAX_SESSIONS_MONTH) * 100, 0) / view.length : 0;
  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <H3>Počet sedení / mesiac</H3>
          <RangeControls w={w} monthly={monthly} />
        </div>
        {chart.length ? <ValueBars data={chart} color={C.accent} fmt={(n) => String(Math.round(n))} height={150} alignEnd /> : <Empty>Žiadne dáta pre zvolené obdobie.</Empty>}
      </Card>

      {view.length > 0 && (
        <Card>
          <H3>
            <Info text="Súhrn za zvolené obdobie (podľa filtra vpravo hore): spolu sedení, priemer na mesiac, priemerná cena za sedenie (zárobky ÷ sedenia) a priemerné využitie kapacity (z max. 260 sedení/mes. pre 2 trénerov)." label="Súhrn sedení (za zvolené obdobie)" />
          </H3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
            <StatCard value={String(sessTotal)} label={`Sedení spolu · ${view.length} mes.`} color={C.accentLight} />
            <StatCard value={avgSess.toFixed(0)} label="Ø sedení / mesiac" color={C.accent} />
            <StatCard value={fmtCZK(perSessAll)} label="Ø CZK / sedenie" color={C.blue} />
            <StatCard value={`${avgUtil.toFixed(0)} %`} label="Ø využitie kapacity" color={C.green} />
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Zárobky spolu za obdobie: {fmtCZK(revTotal)}</div>
        </Card>
      )}
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
  const [horizon, setHorizon] = useState(1);
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
          <StatCard value={fmtCZK(pred.monthlyRunRate)} label={<Info text="Run-rate = koľko mesačne hodí portfólio, ak klienti chodia ako TERAZ. Tempo sa berie z posledných 90 dní, cena z reálne zaplatených sedení (sedenia za 0 Kč sa počítajú do práce, nie do tržieb). Pred vážením dôverou obnovy. POZOR na rozdiel oproti priemeru posledných 3 mesiacov: ten obsahuje aj klientov, ktorí medzitým prestali chodiť. K 2. 8. 2026 to bolo 15 klientov a 26 736 Kč mesačne — presne o toľko je run-rate nižší. Nie je to pesimizmus modelu, je to odchod, ktorý sa už stal." label="Očak. mesačný run-rate" />} color={C.blue} />
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
