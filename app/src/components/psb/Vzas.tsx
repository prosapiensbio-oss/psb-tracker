import { useMemo, useState, type ReactNode } from "react";

import { fmtCZK } from "../../lib/psb/format";
import { C, mix, S } from "../../lib/psb/theme";
import {
  DEBT_OPENING,
  JAREK_SPLATKY,
  PNL,
  PRIJMY,
  SALARY,
  SPOLOCNE,
  VZAS_MONTH_LABELS,
  VZAS_TARGETS,
  jarekCalc,
  pnlCalc,
  salaryCalc,
  spolocneHalf,
  spolocneTotal,
  sumItems,
  sumSection,
  vSum,
  type PersonKey,
  type Vals,
} from "../../lib/psb/vzas";
import { Card, Empty, H3, Info, LineChart, Select, StatCard, SubTabs, useScrollEnd } from "./ui";

const MONTHS = VZAS_MONTH_LABELS;
const money = (n: number) => (n === 0 ? "—" : fmtCZK(n).replace(" CZK", ""));
const signColor = (n: number) => (n > 0 ? C.green : n < 0 ? C.red : C.textMuted);
const avg = (a: Vals) => (a.length ? vSum(a) / a.length : 0);
const pct = (cur: number, prev: number) => (prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null);
const pctStr = (v: number | null) => (v == null ? "—" : `${v > 0 ? "▲" : v < 0 ? "▼" : "►"} ${v.toFixed(1)} %`);

// ── period filter shared by the tabs ─────────────────────────────────────────
const RANGES = [
  { value: "all", label: "Celé obdobie" },
  { value: "q1", label: "Q1 (jan–mar)" },
  { value: "q2", label: "Q2 (apr–jún)" },
  { value: "custom", label: "Vlastné" },
];

function useRange() {
  const [win, setWin] = useState("all");
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(MONTHS.length - 1);
  const idx = useMemo(() => {
    if (win === "q1") return [0, 1, 2];
    if (win === "q2") return [3, 4, 5];
    if (win === "custom") {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
    return MONTHS.map((_, i) => i);
  }, [win, from, to]);
  return { win, setWin, from, setFrom, to, setTo, idx };
}
type Range = ReturnType<typeof useRange>;

const pick = (v: Vals, idx: number[]) => idx.map((i) => v[i]);

function RangeBar({ r, extra }: { r: Range; extra?: ReactNode }) {
  const opts = MONTHS.map((m, i) => ({ value: String(i), label: `${m} 26` }));
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Select value={r.win} onChange={r.setWin} options={RANGES} />
      {r.win === "custom" && (
        <>
          <Select value={String(r.from)} onChange={(v) => r.setFrom(Number(v))} options={opts} />
          <span style={{ color: C.textDim }}>–</span>
          <Select value={String(r.to)} onChange={(v) => r.setTo(Number(v))} options={opts} />
        </>
      )}
      {extra}
    </div>
  );
}

// ── table primitives ─────────────────────────────────────────────────────────
function MonthHead({ idx, first = "Položka", showAvg = true }: { idx: number[]; first?: string; showAvg?: boolean }) {
  const th = (extra?: object) => ({ textAlign: "right" as const, padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600, whiteSpace: "nowrap" as const, ...extra });
  return (
    <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
      <th style={{ ...th(), textAlign: "left", minWidth: 190 }}>{first}</th>
      {idx.map((i) => <th key={i} style={th()}>{MONTHS[i]}</th>)}
      <th style={th({ borderLeft: `1px solid ${C.border}` })}>Celkom</th>
      {showAvg && <th style={th()}>Ø / mes.</th>}
    </tr>
  );
}

function Row({ label, values, depth = 0, bold = false, color, children, showAvg = true }: {
  label: ReactNode; values: Vals; depth?: number; bold?: boolean; color?: string; children?: ReactNode; showAvg?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasKids = !!children;
  const fs = depth === 0 ? 13 : 12;
  const cell = { textAlign: "right" as const, padding: "6px 10px", fontSize: fs, fontWeight: bold ? 600 : 400, fontVariantNumeric: "tabular-nums" as const, borderBottom: `1px solid ${mix(C.border, 55)}`, whiteSpace: "nowrap" as const };
  return (
    <>
      <tr onClick={() => hasKids && setOpen(!open)} style={{ background: depth === 0 ? mix(C.accent, 7) : "transparent", cursor: hasKids ? "pointer" : "default" }}>
        <td style={{ padding: "6px 10px", paddingLeft: depth * 16 + 10, fontSize: fs, fontWeight: bold ? 600 : 400, color: C.text, whiteSpace: "nowrap", borderBottom: `1px solid ${mix(C.border, 55)}` }}>
          <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{hasKids ? (open ? "▼" : "▶") : ""}</span>
          {label}
        </td>
        {values.map((v, i) => (
          <td key={i} style={{ ...cell, color: color || (v < 0 ? C.red : C.textMuted) }}>{money(v)}</td>
        ))}
        <td style={{ ...cell, color: color || (vSum(values) < 0 ? C.red : C.text), borderLeft: `1px solid ${C.border}`, fontWeight: 600 }}>{money(vSum(values))}</td>
        {showAvg && <td style={{ ...cell, color: C.textMuted }}>{money(avg(values))}</td>}
      </tr>
      {open && children}
    </>
  );
}

function Divider({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <td colSpan={span} style={{ padding: "14px 10px 5px", fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${mix(C.accent, 30)}` }}>{label}</td>
    </tr>
  );
}

function TotalRow({ label, values, color, big = false, showAvg = true, onClick, open }: {
  label: string; values: Vals; color: string; big?: boolean; showAvg?: boolean; onClick?: () => void; open?: boolean;
}) {
  const cell = { textAlign: "right" as const, padding: big ? "10px" : "8px 10px", fontWeight: 700, fontSize: big ? 14 : 13, color, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };
  return (
    <tr onClick={onClick} style={{ background: big ? mix(C.accent, 12) : "transparent", borderTop: `2px solid ${mix(C.accent, 45)}`, cursor: onClick ? "pointer" : "default" }}>
      <td style={{ padding: big ? "10px" : "8px 10px", fontWeight: 700, fontSize: big ? 14 : 13, color: C.text, whiteSpace: "nowrap" }}>
        {onClick && <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{open ? "▼" : "▶"}</span>}
        {label}
      </td>
      {values.map((v, i) => <td key={i} style={cell}>{money(v)}</td>)}
      <td style={{ ...cell, borderLeft: `1px solid ${C.border}` }}>{money(vSum(values))}</td>
      {showAvg && <td style={cell}>{money(avg(values))}</td>}
    </tr>
  );
}

const ScrollX = ({ children }: { children: ReactNode }) => <div style={{ overflowX: "auto" }}>{children}</div>;
const tableStyle = { width: "100%", borderCollapse: "collapse" as const, minWidth: 760 };

// Bar chart with a zero baseline — the shared ValueBars clamps negatives to
// zero height, which would hide loss months entirely.
function SignedBars({ data, fmt, height = 190, posColor = C.accent, negColor = C.red }: {
  data: { label: string; value: number }[];
  fmt: (n: number) => string;
  height?: number;
  posColor?: string;
  negColor?: string;
}) {
  const plotH = height - 46;
  const max = Math.max(0, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const range = max - min || 1;
  const posH = (max / range) * plotH;
  const negH = (-min / range) * plotH;
  // Open scrolled to the newest month on the right; scroll left for history.
  const scrollRef = useScrollEnd<HTMLDivElement>(true, data.length);
  return (
    <div ref={scrollRef} style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
      {data.map((d, i) => {
        const up = d.value >= 0;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 54px" }}>
            <div style={{ height: posH, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", width: "100%" }}>
              {up && <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 3, whiteSpace: "nowrap" }}>{fmt(d.value)}</div>}
              {up && (
                <div title={`${d.label}: ${fmt(d.value)}`} style={{ width: "78%", maxWidth: 46, height: Math.max(2, (d.value / range) * plotH), background: posColor, borderRadius: "4px 4px 0 0" }} />
              )}
            </div>
            <div style={{ width: "100%", height: 1, background: mix(C.border, 90) }} />
            <div style={{ height: negH, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
              {!up && (
                <div title={`${d.label}: ${fmt(d.value)}`} style={{ width: "78%", maxWidth: 46, height: Math.max(2, (-d.value / range) * plotH), background: negColor, borderRadius: "0 0 4px 4px" }} />
              )}
              {!up && <div style={{ fontSize: 10.5, color: negColor, marginTop: 3, whiteSpace: "nowrap" }}>{fmt(d.value)}</div>}
            </div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 5, whiteSpace: "nowrap" }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── VZAS 2026 (P&L) ──────────────────────────────────────────────────────────
function PnlTab() {
  const p = pnlCalc();
  const r = useRange();
  const [mode, setMode] = useState<"avg" | "sum">("avg"); // default: priemer
  const i = r.idx;
  const sel = {
    prijmy: pick(p.prijmy, i),
    naklady: pick(p.celkoveNaklady, i),
    zisk: pick(p.hrubyZisk, i),
  };
  const agg = (v: Vals) => (mode === "avg" ? avg(v) : vSum(v));
  const marza = vSum(sel.prijmy) > 0 ? (vSum(sel.zisk) / vSum(sel.prijmy)) * 100 : 0;
  const suffix = mode === "avg" ? "Ø / mesiac" : `spolu · ${i.length} mes.`;

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <RangeBar r={r} />
          <div style={{ display: "flex", gap: 4 }}>
            {(["avg", "sum"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${mode === m ? C.accent : C.border}`, background: mode === m ? C.accentBg : "transparent", color: mode === m ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
                {m === "avg" ? "Priemer" : "Súčet"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <StatCard value={fmtCZK(agg(sel.prijmy))} label={`Príjmy · ${suffix}`} color={C.green} />
          <StatCard value={fmtCZK(agg(sel.naklady))} label={`Náklady · ${suffix}`} color={C.red} />
          <StatCard value={fmtCZK(agg(sel.zisk))} label={`Hrubý zisk · ${suffix}`} color={signColor(agg(sel.zisk))} />
          <StatCard value={`${marza.toFixed(1)} %`} label={<Info text={`Marža za zvolené obdobie. Cieľ 12–15 % (medzikrok), dlhodobo 20 %.`} label="Marža" />} color={marza >= VZAS_TARGETS.marzaPct ? C.green : marza >= 0 ? C.orange : C.red} />
        </div>
      </Card>

      <Card>
        <H3><Info text="Mesačný výkaz ziskov a strát. Klikni na kategóriu pre rozklad na položky. Hrubý zisk = Celkové príjmy − Celkové náklady (vrátane výplat)." label="VZAS 2026 — mesačný P&L" /></H3>
        <ScrollX>
          <table style={tableStyle}>
            <thead><MonthHead idx={i} /></thead>
            <tbody>
              <Divider label="Fixné náklady" span={i.length + 3} />
              {Object.entries(PNL.fixne.subcategories).map(([k, g]) => (
                <Row key={k} label={g.label} values={pick(sumItems(g.items), i)}>
                  {Object.entries(g.items).map(([ik, it]) => <Row key={ik} label={it.label} values={pick(it.values, i)} depth={1} />)}
                </Row>
              ))}
              <Row label="Fixné náklady spolu" values={pick(sumSection(PNL.fixne), i)} bold color={C.red} />

              <Divider label="Variabilné náklady" span={i.length + 3} />
              {Object.entries(PNL.variabilne.subcategories).map(([k, g]) => (
                <Row key={k} label={g.label} values={pick(sumItems(g.items), i)}>
                  {Object.entries(g.items).map(([ik, it]) => <Row key={ik} label={it.label} values={pick(it.values, i)} depth={1} />)}
                </Row>
              ))}
              <Row label="Variabilné náklady spolu" values={pick(sumSection(PNL.variabilne), i)} bold color={C.red} />

              <Divider label="Bez výplat" span={i.length + 3} />
              <Row label="Fix + Var bez výplat" values={pick(p.bezVyplat, i)} bold />

              <Divider label="Výplaty" span={i.length + 3} />
              <Row label="Jerry (Poslané)" values={pick(p.poslaneJerry, i)} />
              <Row label="Terezka (Poslané)" values={pick(p.poslaneTerezka, i)} />
              <Row label={<Info text="Matyáš bol zamestnanec jan–mar 2026 — nemá nárokovo-dlhovú logiku zakladateľov, len mzdový náklad." label="Matyáš (jan–mar)" />} values={pick(p.matyas, i)} />
              <Row label="Výplaty spolu" values={pick(p.vyplatySpolu, i)} bold color={C.red} />

              <TotalRow label="Celkové náklady" values={pick(p.celkoveNaklady, i)} color={C.red} />

              <Divider label="Tržby & Príjmy" span={i.length + 3} />
              <Row label="Celkové príjmy" values={pick(p.prijmy, i)} bold color={C.green} />

              <TotalRow label="Hrubý zisk" values={pick(p.hrubyZisk, i)} color={signColor(vSum(sel.zisk))} big />
              <tr>
                <td style={{ padding: "5px 10px", fontSize: 11, color: C.textMuted }}>Marža %</td>
                {i.map((mi) => (
                  <td key={mi} style={{ textAlign: "right", padding: "5px 10px", fontSize: 11, fontVariantNumeric: "tabular-nums", color: p.marza[mi] >= VZAS_TARGETS.marzaPct ? C.green : p.marza[mi] >= 0 ? C.orange : C.red }}>{p.marza[mi].toFixed(1)}%</td>
                ))}
                <td style={{ textAlign: "right", padding: "5px 10px", fontSize: 11, color: C.textMuted, borderLeft: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" }}>{marza.toFixed(1)}%</td>
                <td style={{ textAlign: "right", padding: "5px 10px", fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{(avg(i.map((mi) => p.marza[mi]))).toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </ScrollX>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>Zdroj: VZAS 2026 (Excel), jan–jún 2026. Bankový import pribudne v ďalšom kroku.</div>
      </Card>
    </>
  );
}

// ── J&T Výplaty ──────────────────────────────────────────────────────────────
function PersonCard({ pk, idx }: { pk: PersonKey; idx: number[] }) {
  const [open, setOpen] = useState(false);
  const [narokOpen, setNarokOpen] = useState(false);
  const [poslaneOpen, setPoslaneOpen] = useState(false);
  const s = SALARY[pk];
  const c = salaryCalc(pk);
  const konecny = c.cumDebt[c.cumDebt.length - 1];
  const cell = { textAlign: "right" as const, padding: "5px 8px", fontSize: 12, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };
  const lbl = { ...S.td, fontSize: 12, color: C.textMuted } as const;
  const detailBtn = (on: boolean, fn: () => void) => (
    <button onClick={(e) => { e.stopPropagation(); fn(); }}
      style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 6, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentBg : "transparent", color: on ? C.accentLight : C.textDim, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
      {on ? "▼ detail" : "▶ detail"}
    </button>
  );
  const money2 = (v: Vals) => idx.map((i) => v[i]);

  return (
    <Card>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
          <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{open ? "▼" : "▶"}</span>
          {s.label}
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.textMuted }}>Ø hodín / mes.</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{avg(money2(s.hours)).toFixed(1)} h</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.textMuted }}>Kumulovaný dlh</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: signColor(konecny), fontVariantNumeric: "tabular-nums" }}>{fmtCZK(konecny)}</div>
          </div>
        </div>
      </div>

      {open && (
        <ScrollX>
          <table style={{ ...tableStyle, marginTop: 12, minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 170 }} />
                {idx.map((i) => <th key={i} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{MONTHS[i]}</th>)}
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Ø</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={lbl}>Hodiny{detailBtn(narokOpen, () => setNarokOpen(!narokOpen))}</td>
                {idx.map((i) => <td key={i} style={{ ...cell, color: C.text }}>{s.hours[i]}</td>)}
                <td style={{ ...cell, color: C.textMuted, borderLeft: `1px solid ${C.border}` }}>{avg(money2(s.hours)).toFixed(0)}</td>
              </tr>
              {narokOpen && (
                <>
                  <tr>
                    <td style={{ ...lbl, paddingLeft: 24, fontSize: 11 }}>Fix</td>
                    {idx.map((i) => <td key={i} style={{ ...cell, fontSize: 11, color: C.textDim }}>{money(s.fix)}</td>)}
                    <td style={{ ...cell, fontSize: 11, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(s.fix)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...lbl, paddingLeft: 24, fontSize: 11 }}>Variabil (nad {s.hoursThreshold}h)</td>
                    {idx.map((i) => <td key={i} style={{ ...cell, fontSize: 11, color: C.textDim }}>{money(c.variabil[i])}</td>)}
                    <td style={{ ...cell, fontSize: 11, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(avg(money2(c.variabil)))}</td>
                  </tr>
                </>
              )}
              <tr style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...lbl, fontWeight: 600, color: C.text }}>Nárok</td>
                {idx.map((i) => <td key={i} style={{ ...cell, color: C.green, fontWeight: 600 }}>{money(c.narok[i])}</td>)}
                <td style={{ ...cell, color: C.green, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>{money(avg(money2(c.narok)))}</td>
              </tr>

              <tr>
                <td style={{ ...lbl, fontWeight: 600, color: C.text }}>Poslané spolu{detailBtn(poslaneOpen, () => setPoslaneOpen(!poslaneOpen))}</td>
                {idx.map((i) => <td key={i} style={{ ...cell, color: C.red, fontWeight: 600 }}>{money(c.poslane[i])}</td>)}
                <td style={{ ...cell, color: C.red, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>{money(avg(money2(c.poslane)))}</td>
              </tr>
              {poslaneOpen && (
                <>
                  {Object.entries(s.personal).map(([k, vals]) => (
                    <tr key={k}>
                      <td style={{ ...lbl, paddingLeft: 24, fontSize: 11 }}>{k}</td>
                      {idx.map((i) => <td key={i} style={{ ...cell, fontSize: 11, color: vals[i] > 0 ? C.textMuted : C.textDim }}>{money(vals[i])}</td>)}
                      <td style={{ ...cell, fontSize: 11, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(avg(money2(vals)))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...lbl, paddingLeft: 24, fontSize: 11, color: C.orange, fontStyle: "italic" }}>+ Spoločné / 2</td>
                    {idx.map((i) => <td key={i} style={{ ...cell, fontSize: 11, color: C.orange }}>{money(c.spolocneHalf[i])}</td>)}
                    <td style={{ ...cell, fontSize: 11, color: C.orange, borderLeft: `1px solid ${C.border}` }}>{money(avg(money2(c.spolocneHalf)))}</td>
                  </tr>
                </>
              )}

              <tr style={{ background: mix(C.accent, 10), borderTop: `2px solid ${mix(C.accent, 40)}` }}>
                <td style={{ ...lbl, fontWeight: 700, color: C.text }}>
                  <Info text="Rozdiel = Nárok − Poslané. Kladný = firma dlží trénerovi (dlh klesá). Záporný = tréner si vzal viac než nárok (dlh rastie)." label="Rozdiel" />
                </td>
                {idx.map((i) => <td key={i} style={{ ...cell, color: signColor(c.rozdiel[i]), fontWeight: 700 }}>{money(c.rozdiel[i])}</td>)}
                <td style={{ ...cell, color: signColor(avg(money2(c.rozdiel))), fontWeight: 700, borderLeft: `1px solid ${C.border}` }}>{money(avg(money2(c.rozdiel)))}</td>
              </tr>
              <tr>
                <td style={{ ...lbl, fontWeight: 600, color: C.text }}>
                  <Info text={`Kumulovaný dlh(N) = dlh(N−1) + Rozdiel(N). Počiatočný stav k 1.1.2026: ${fmtCZK(DEBT_OPENING[pk])}.`} label="Kumulovaný dlh" />
                </td>
                {idx.map((i) => <td key={i} style={{ ...cell, color: signColor(c.cumDebt[i]), fontWeight: 600 }}>{money(c.cumDebt[i])}</td>)}
                <td style={{ ...cell, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>—</td>
              </tr>
            </tbody>
          </table>
        </ScrollX>
      )}
    </Card>
  );
}

// Is the split fair? The model pays for hours, so the honest comparison is
// hours → nárok → poslané. A gap between the last two is not pay, it's a loan.
function FairnessCard({ idx }: { idx: number[] }) {
  const rows = (["jerry", "terezka"] as const).map((k) => {
    const c = salaryCalc(k);
    const h = vSum(idx.map((i) => SALARY[k].hours[i]));
    const narok = vSum(idx.map((i) => c.narok[i]));
    const poslane = vSum(idx.map((i) => c.poslane[i]));
    return { k, label: SALARY[k].label, h, narok, poslane, narokH: h ? narok / h : 0, poslaneH: h ? poslane / h : 0, dlh: c.cumDebt[c.cumDebt.length - 1] };
  });
  const [j, t] = rows;
  const diff = (a: number, b: number) => (b !== 0 ? ((a / b - 1) * 100) : 0);
  const dH = diff(j.h, t.h), dN = diff(j.narok, t.narok), dP = diff(j.poslane, t.poslane);
  const cell = { textAlign: "right" as const, padding: "7px 10px", fontSize: 12.5, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const, borderBottom: `1px solid ${mix(C.border, 55)}` };
  const line = (label: ReactNode, get: (r: typeof j) => string, delta: number, invert = false) => (
    <tr>
      <td style={{ padding: "7px 10px", fontSize: 12.5, color: C.text, borderBottom: `1px solid ${mix(C.border, 55)}` }}>{label}</td>
      {rows.map((r) => <td key={r.k} style={{ ...cell, color: C.text }}>{get(r)}</td>)}
      <td style={{ ...cell, color: signColor(invert ? -delta : delta), borderLeft: `1px solid ${C.border}` }}>{delta > 0 ? "+" : ""}{delta.toFixed(1)} %</td>
    </tr>
  );

  return (
    <Card>
      <H3>
        <Info text="Model platí za hodiny: Nárok = Fix + (hodiny − 60) × sadzba. Preto sa férovosť posudzuje reťazcom hodiny → nárok → poslané. Ak niekto berie viac, než je jeho nárok, nejde o vyššiu výplatu, ale o pôžičku od firmy — a tá sa kumuluje v dlhu." label="Férovosť výplat — hodiny vs. výplata" />
      </H3>
      <ScrollX>
        <table style={{ ...tableStyle, minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600, minWidth: 170 }} />
              {rows.map((r) => <th key={r.k} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>{r.label}</th>)}
              <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none", borderLeft: `1px solid ${C.border}` }}>Jerry vs T.</th>
            </tr>
          </thead>
          <tbody>
            {line("Odrobené hodiny", (r) => `${r.h.toFixed(0)} h`, dH)}
            {line("Nárok (podľa modelu)", (r) => money(r.narok), dN)}
            {line("Poslané (reálne vzaté)", (r) => money(r.poslane), dP)}
            {line("Nárok / hodinu", (r) => `${Math.round(r.narokH)} Kč`, diff(j.narokH, t.narokH))}
            {line("Reálne vzaté / hodinu", (r) => `${Math.round(r.poslaneH)} Kč`, diff(j.poslaneH, t.poslaneH))}
            <tr style={{ background: mix(C.accent, 10) }}>
              <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: C.text }}>Kumulovaný dlh</td>
              {rows.map((r) => <td key={r.k} style={{ ...cell, fontWeight: 700, color: signColor(r.dlh), borderBottom: "none" }}>{money(r.dlh)}</td>)}
              <td style={{ ...cell, borderBottom: "none", borderLeft: `1px solid ${C.border}` }} />
            </tr>
          </tbody>
        </table>
      </ScrollX>
      <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: mix(C.orange, 12), border: `1px solid ${mix(C.orange, 35)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
        <b>Ako to čítať:</b> Jerry odrobil o <b>{dH.toFixed(1)} %</b> viac hodín, takže mu podľa modelu patrí o <b>{dN.toFixed(1)} %</b> viac —
        to je férové. Reálne si ale vzal o <b>{dP.toFixed(1)} %</b> viac. Ten rozdiel nie je výplata navyše, ale <b>pôžička od firmy</b>,
        ktorá sa mu kumuluje v dlhu ({money(j.dlh)} vs {money(t.dlh)}).
      </div>
    </Card>
  );
}

function SalaryTab() {
  const r = useRange();
  const idx = r.idx;
  const [showJ, setShowJ] = useState(true);
  const [showT, setShowT] = useState(true);
  const [showAvg, setShowAvg] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [spolOpen, setSpolOpen] = useState(false);
  const j = salaryCalc("jerry");
  const t = salaryCalc("terezka");
  const total = spolocneTotal();
  const half = spolocneHalf();
  const cell = { textAlign: "right" as const, padding: "5px 8px", fontSize: 12, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };

  const series: { name: string; color: string }[] = [];
  if (showJ) series.push({ name: "Jerry", color: C.accent });
  if (showT) series.push({ name: "Terezka", color: C.blue });
  if (showAvg) series.push({ name: "Priemer", color: C.orange });
  const chart = idx.map((i) => {
    const vals: number[] = [];
    if (showJ) vals.push(j.poslane[i]);
    if (showT) vals.push(t.poslane[i]);
    if (showAvg) vals.push((j.poslane[i] + t.poslane[i]) / 2);
    return { label: MONTHS[i], values: vals };
  });
  const toggle = (on: boolean, set: (v: boolean) => void, label: string, color: string) => (
    <button onClick={() => set(!on)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7, border: `1px solid ${on ? color : C.border}`, background: on ? mix(color, 15) : "transparent", color: on ? C.text : C.textDim, fontSize: 12, cursor: "pointer" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: on ? color : C.textDim }} /> {label}
    </button>
  );

  return (
    <>
      <Card>
        <div onClick={() => setChartOpen(!chartOpen)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", cursor: "pointer" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{chartOpen ? "▼" : "▶"}</span>
            Vývoj výplat v čase
          </div>
          {chartOpen && <div onClick={(e) => e.stopPropagation()}><RangeBar r={r} /></div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
          <StatCard value={fmtCZK(avg(idx.map((i) => j.poslane[i])))} label="Ø Jerry / mes." color={C.accent} />
          <StatCard value={fmtCZK(avg(idx.map((i) => t.poslane[i])))} label="Ø Terezka / mes." color={C.blue} />
          <StatCard value={fmtCZK(avg(idx.map((i) => j.poslane[i] + t.poslane[i])))} label="Ø výplaty spolu / mes." color={C.red} />
        </div>

        {chartOpen && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0 12px" }}>
              {toggle(showJ, setShowJ, "Jerry", C.accent)}
              {toggle(showT, setShowT, "Terezka", C.blue)}
              {toggle(showAvg, setShowAvg, "Priemer", C.orange)}
            </div>
            {series.length ? (
              <LineChart data={chart} series={series} height={220} fmt={(n) => `${Math.round(n / 1000)}k`} autoY alignEnd />
            ) : <Empty>Zapni aspoň jednu sériu.</Empty>}
          </>
        )}
      </Card>

      <FairnessCard idx={idx} />

      <PersonCard pk="jerry" idx={idx} />
      <PersonCard pk="terezka" idx={idx} />

      <Card>
        <div onClick={() => setSpolOpen(!spolOpen)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{spolOpen ? "▼" : "▶"}</span>
              Spoločné výdavky
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginLeft: 15 }}>Sčítajú sa a delia /2 — polovica Jerrymu, polovica Terezke</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.textMuted }}>Ø spolu / mes.</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.orange, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(avg(idx.map((i) => total[i])))}</div>
          </div>
        </div>
        {spolOpen && (
          <ScrollX>
            <table style={{ ...tableStyle, marginTop: 12, minWidth: 660 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 150 }} />
                  {idx.map((i) => <th key={i} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{MONTHS[i]}</th>)}
                  <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Ø</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(SPOLOCNE).map(([k, vals]) => (
                  <tr key={k}>
                    <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>{k}</td>
                    {idx.map((i) => <td key={i} style={{ ...cell, color: vals[i] > 0 ? C.text : C.textDim }}>{money(vals[i])}</td>)}
                    <td style={{ ...cell, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(avg(idx.map((i) => vals[i])))}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.orange }}>Spolu</td>
                  {idx.map((i) => <td key={i} style={{ ...cell, color: C.orange, fontWeight: 600 }}>{money(total[i])}</td>)}
                  <td style={{ ...cell, color: C.orange, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>{money(avg(idx.map((i) => total[i])))}</td>
                </tr>
                <tr>
                  <td style={{ ...S.td, fontSize: 12, color: C.orange, fontStyle: "italic" }}>→ na osobu (/2)</td>
                  {idx.map((i) => <td key={i} style={{ ...cell, color: C.orange, fontStyle: "italic" }}>{money(half[i])}</td>)}
                  <td style={{ ...cell, color: C.orange, fontStyle: "italic", borderLeft: `1px solid ${C.border}` }}>{money(avg(idx.map((i) => half[i])))}</td>
                </tr>
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>
    </>
  );
}

// ── Jarek ────────────────────────────────────────────────────────────────────
function JarekTab() {
  const [kanalyOpen, setKanalyOpen] = useState(false);
  const jk = jarekCalc();
  const stav = jk.stav;
  const last = stav[stav.length - 1];
  // Payoff estimate at the current pace = average monthly repayment across the
  // tracked months (months with no payment count as 0 — that IS the real pace).
  const pace = avg(jk.splatkySpolu);
  const monthsLeft = pace > 0 ? Math.ceil(Math.abs(last) / pace) : null;
  const payoff = useMemo(() => {
    if (monthsLeft == null) return null;
    const d = new Date(2026, 5, 1); // jún 2026 = last tracked month
    d.setMonth(d.getMonth() + monthsLeft);
    const MN = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
    return `${MN[d.getMonth()]} ${d.getFullYear()}`;
  }, [monthsLeft]);
  const cell = { textAlign: "right" as const, padding: "5px 8px", fontSize: 12, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };

  return (
    <>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <StatCard value={fmtCZK(last)} label="Stav dlhu k jún 26" color={C.red} />
          <StatCard value={fmtCZK(pace)} label="Ø splátka / mes." color={C.green} />
          <StatCard
            value={monthsLeft != null ? `${payoff} · ${monthsLeft} mes.` : "—"}
            label={<Info text="Odhadované splatenie pri aktuálnom tempe (priemer za sledované obdobie vrátane mesiacov bez splátky). Nezohľadňuje nové vklady ani zmenu splátky." label="Predpokladané splatenie" />}
            color={C.blue}
          />
        </div>
      </Card>

      <Card>
        <H3><Info text="Zostatok dlhu voči externému investorovi. Krivka klesá, ako sa dlh spláca — čím nižšie, tým lepšie." label="Vývoj dlhu v čase" /></H3>
        <LineChart
          data={MONTHS.map((m, i) => ({ label: m, values: [Math.abs(stav[i])] }))}
          series={[{ name: "Zostatok dlhu", color: C.red }]}
          height={220}
          fmt={(n) => `${Math.round(n / 1000)}k`}
          autoY
          alignEnd
        />
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
          Počiatočný stav k 1.1.2026: {fmtCZK(DEBT_OPENING.jarek)} · za H1 splatené {fmtCZK(vSum(jk.splatkySpolu))}.
        </div>
      </Card>

      <Card>
        <H3><Info text="Fix splátka je zároveň náklad v P&L aj zníženie dlhu. „Sofia“ a 20 % zľava z ročného nie sú bankové platby — sú to len dlhové operácie (vzdaná tržba)." label="Kanály splácania" /></H3>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 660 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 180 }} />
                {MONTHS.map((m) => <th key={m} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{m}</th>)}
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Spolu</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.text }}>
                  Splátka spolu
                  <button onClick={() => setKanalyOpen(!kanalyOpen)}
                    style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 6, border: `1px solid ${kanalyOpen ? C.accent : C.border}`, background: kanalyOpen ? C.accentBg : "transparent", color: kanalyOpen ? C.accentLight : C.textDim, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {kanalyOpen ? "▼ detail" : "▶ detail"}
                  </button>
                </td>
                {jk.splatkySpolu.map((v, i) => <td key={i} style={{ ...cell, color: C.green, fontWeight: 600 }}>{money(v)}</td>)}
                <td style={{ ...cell, color: C.green, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>{money(vSum(jk.splatkySpolu))}</td>
              </tr>
              {kanalyOpen && Object.entries(JAREK_SPLATKY).map(([k, vals]) => (
                <tr key={k}>
                  <td style={{ ...S.td, fontSize: 11, color: C.textMuted, paddingLeft: 26 }}>{k}</td>
                  {vals.map((v, i) => <td key={i} style={{ ...cell, fontSize: 11, color: v > 0 ? C.textMuted : C.textDim }}>{money(v)}</td>)}
                  <td style={{ ...cell, fontSize: 11, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(vSum(vals))}</td>
                </tr>
              ))}
              <tr style={{ background: mix(C.accent, 10) }}>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 700, color: C.text }}>Stav dlhu</td>
                {stav.map((v, i) => <td key={i} style={{ ...cell, color: C.red, fontWeight: 700 }}>{money(v)}</td>)}
                <td style={{ ...cell, borderLeft: `1px solid ${C.border}` }} />
              </tr>
            </tbody>
          </table>
        </ScrollX>
      </Card>
    </>
  );
}

// ── Kvartálne výsledky ───────────────────────────────────────────────────────
function KvartalneTab() {
  const p = pnlCalc();
  const [openQ, setOpenQ] = useState<string | null>(null);
  const quarters = [
    { id: "q1", label: "Q1 2026", idx: [0, 1, 2] },
    { id: "q2", label: "Q2 2026", idx: [3, 4, 5] },
  ];
  const agg = (idx: number[]) => {
    const prijmy = vSum(pick(p.prijmy, idx));
    const fix = vSum(pick(p.fixneTotal, idx));
    const varN = vSum(pick(p.varTotal, idx));
    const vypl = vSum(pick(p.vyplatySpolu, idx));
    const naklady = fix + varN + vypl;
    const zisk = prijmy - naklady;
    return { prijmy, fix, varN, vypl, naklady, zisk, marza: prijmy > 0 ? (zisk / prijmy) * 100 : 0 };
  };
  const a = quarters.map((q) => ({ ...q, ...agg(q.idx) }));
  const d = { prijmy: pct(a[1].prijmy, a[0].prijmy), naklady: pct(a[1].naklady, a[0].naklady), zisk: pct(a[1].zisk, a[0].zisk), marza: a[1].marza - a[0].marza };
  const cell = { textAlign: "right" as const, padding: "8px 10px", fontSize: 13, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };
  const sub = { ...cell, fontSize: 11, color: C.textDim, padding: "4px 10px" };

  return (
    <>
      <Card>
        <H3><Info text="Klikni na riadok Náklady — rozbalí sa na fixné, variabilné a výplaty." label="Kvartálne porovnanie" /></H3>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 520 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600, minWidth: 150 }}>Položka</th>
                {a.map((q) => <th key={q.id} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{q.label}</th>)}
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Zmena</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...S.td, fontSize: 13, color: C.text }}>Tržby</td>
                {a.map((q) => <td key={q.id} style={{ ...cell, color: C.green }}>{money(q.prijmy)}</td>)}
                <td style={{ ...cell, color: signColor(d.prijmy ?? 0), borderLeft: `1px solid ${C.border}` }}>{pctStr(d.prijmy)}</td>
              </tr>
              <tr onClick={() => setOpenQ(openQ === "n" ? null : "n")} style={{ cursor: "pointer", background: mix(C.accent, 6) }}>
                <td style={{ ...S.td, fontSize: 13, color: C.text }}>
                  <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{openQ === "n" ? "▼" : "▶"}</span>Náklady
                </td>
                {a.map((q) => <td key={q.id} style={{ ...cell, color: C.red }}>{money(q.naklady)}</td>)}
                <td style={{ ...cell, color: signColor(-(d.naklady ?? 0)), borderLeft: `1px solid ${C.border}` }}>{pctStr(d.naklady)}</td>
              </tr>
              {openQ === "n" && (["fix", "varN", "vypl"] as const).map((k) => (
                <tr key={k}>
                  <td style={{ ...S.td, fontSize: 11, color: C.textDim, paddingLeft: 34 }}>{k === "fix" ? "Fixné náklady" : k === "varN" ? "Variabilné náklady" : "Výplaty"}</td>
                  {a.map((q) => <td key={q.id} style={sub}>{money(q[k])}</td>)}
                  <td style={{ ...sub, borderLeft: `1px solid ${C.border}` }}>{pctStr(pct(a[1][k], a[0][k]))}</td>
                </tr>
              ))}
              <tr style={{ background: mix(C.accent, 12), borderTop: `2px solid ${mix(C.accent, 45)}` }}>
                <td style={{ ...S.td, fontSize: 14, fontWeight: 700, color: C.text }}>Zisk</td>
                {a.map((q) => <td key={q.id} style={{ ...cell, fontWeight: 700, color: signColor(q.zisk) }}>{money(q.zisk)}</td>)}
                <td style={{ ...cell, fontWeight: 700, color: signColor(d.zisk ?? 0), borderLeft: `1px solid ${C.border}` }}>{pctStr(d.zisk)}</td>
              </tr>
              <tr>
                <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>Marža</td>
                {a.map((q) => <td key={q.id} style={{ ...cell, fontSize: 12, color: q.marza >= VZAS_TARGETS.marzaPct ? C.green : q.marza >= 0 ? C.orange : C.red }}>{q.marza.toFixed(1)} %</td>)}
                <td style={{ ...cell, fontSize: 12, color: signColor(d.marza), borderLeft: `1px solid ${C.border}` }}>{d.marza > 0 ? "▲" : d.marza < 0 ? "▼" : "►"} {Math.abs(d.marza).toFixed(1)} b.p.</td>
              </tr>
            </tbody>
          </table>
        </ScrollX>
      </Card>

    </>
  );
}

// ── Mesačné výsledky ─────────────────────────────────────────────────────────
const METRICS = [
  { value: "prijmy", label: "Príjmy" },
  { value: "naklady", label: "Náklady" },
  { value: "zisk", label: "Zisk" },
  { value: "marza", label: "Marža %" },
];

function MesacneTab() {
  const p = pnlCalc();
  const r = useRange();
  const [metric, setMetric] = useState("prijmy");
  const idx = r.idx;
  const seriesFor = (k: string): Vals =>
    k === "prijmy" ? p.prijmy : k === "naklady" ? p.celkoveNaklady : k === "zisk" ? p.hrubyZisk : p.marza;
  const vals = seriesFor(metric);
  const sel = idx.map((i) => ({ i, label: MONTHS[i], v: vals[i] }));
  const isPct = metric === "marza";
  const fmtV = (n: number) => (isPct ? `${n.toFixed(1)} %` : money(n));
  // "higher is better" for everything except náklady
  const better = metric !== "naklady";
  const sorted = [...sel].sort((a, b) => b.v - a.v);
  const best = better ? sorted[0] : sorted[sorted.length - 1];
  const worst = better ? sorted[sorted.length - 1] : sorted[0];
  const cell = { textAlign: "right" as const, padding: "7px 10px", fontSize: 12.5, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const, borderBottom: `1px solid ${mix(C.border, 55)}` };

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Vyber ukazovateľ a obdobie — pravý graf, priemer aj najlepší/najhorší mesiac sa prepočítajú." label="Mesačné výsledky" /></H3>
          <RangeBar r={r} extra={<Select value={metric} onChange={setMetric} options={METRICS} />} />
        </div>
      </Card>

      {/* Both charts open on the newest month (right) — scroll left for history. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <Card>
          <H3>Tržby vs. náklady</H3>
          <LineChart
            data={idx.map((i) => ({ label: MONTHS[i], values: [p.prijmy[i], p.celkoveNaklady[i]] }))}
            series={[{ name: "Tržby", color: C.green }, { name: "Náklady", color: C.red }]}
            height={220}
            fmt={(n) => `${Math.round(n / 1000)}k`}
            pointWidth={64}
            autoY
            alignEnd
          />
        </Card>
        <Card>
          <H3>{METRICS.find((m) => m.value === metric)?.label} po mesiacoch</H3>
          <SignedBars
            data={sel.map((s) => ({ label: s.label, value: s.v }))}
            posColor={metric === "naklady" ? C.red : metric === "zisk" ? C.accent : C.green}
            fmt={(n) => (isPct ? `${n.toFixed(1)}%` : `${Math.round(n / 1000)}k`)}
            height={220}
          />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>Červené stĺpce pod nulou = záporná hodnota.</div>
        </Card>
      </div>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <StatCard value={fmtV(avg(sel.map((s) => s.v)))} label={`Ø ${METRICS.find((m) => m.value === metric)?.label} / mes.`} color={C.accentLight} />
          <StatCard value={`${best.label} · ${fmtV(best.v)}`} label="Najlepší mesiac" color={C.green} />
          <StatCard value={`${worst.label} · ${fmtV(worst.v)}`} label="Najhorší mesiac" color={C.red} />
          <StatCard
            value={pctStr(pct(sel[sel.length - 1].v, sel[0].v))}
            label={<Info text={`Porovnáva posledný mesiac obdobia (${sel[sel.length - 1].label}) s prvým (${sel[0].label}) — o koľko % sa hodnota za obdobie posunula. Nie je to priemerný rast.`} label={`Zmena ${sel[0].label} → ${sel[sel.length - 1].label}`} />}
            color={signColor((sel[sel.length - 1].v - sel[0].v) * (better ? 1 : -1))}
          />
        </div>
      </Card>

      <Card>
        <H3>Detail po mesiacoch</H3>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Mesiac</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Príjmy</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Náklady</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Zisk</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Marža</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none", borderLeft: `1px solid ${C.border}` }}>MoM zisk</th>
              </tr>
            </thead>
            <tbody>
              {idx.map((i, n) => {
                const prev = n > 0 ? p.hrubyZisk[idx[n - 1]] : null;
                return (
                  <tr key={i}>
                    <td style={{ padding: "7px 10px", fontSize: 12.5, color: C.text, borderBottom: `1px solid ${mix(C.border, 55)}` }}>{MONTHS[i]} 26</td>
                    <td style={{ ...cell, color: C.green }}>{money(p.prijmy[i])}</td>
                    <td style={{ ...cell, color: C.red }}>{money(p.celkoveNaklady[i])}</td>
                    <td style={{ ...cell, color: signColor(p.hrubyZisk[i]), fontWeight: 600 }}>{money(p.hrubyZisk[i])}</td>
                    <td style={{ ...cell, color: p.marza[i] >= VZAS_TARGETS.marzaPct ? C.green : p.marza[i] >= 0 ? C.orange : C.red }}>{p.marza[i].toFixed(1)}%</td>
                    <td style={{ ...cell, color: prev == null ? C.textDim : signColor(p.hrubyZisk[i] - prev), borderLeft: `1px solid ${C.border}` }}>{prev == null ? "—" : pctStr(pct(p.hrubyZisk[i], prev))}</td>
                  </tr>
                );
              })}
              <tr style={{ background: mix(C.accent, 10) }}>
                <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: C.text }}>Ø / mesiac</td>
                <td style={{ ...cell, color: C.green, fontWeight: 700, borderBottom: "none" }}>{money(avg(pick(p.prijmy, idx)))}</td>
                <td style={{ ...cell, color: C.red, fontWeight: 700, borderBottom: "none" }}>{money(avg(pick(p.celkoveNaklady, idx)))}</td>
                <td style={{ ...cell, color: signColor(avg(pick(p.hrubyZisk, idx))), fontWeight: 700, borderBottom: "none" }}>{money(avg(pick(p.hrubyZisk, idx)))}</td>
                <td style={{ ...cell, color: C.textMuted, fontWeight: 700, borderBottom: "none" }}>{avg(pick(p.marza, idx)).toFixed(1)}%</td>
                <td style={{ ...cell, borderBottom: "none", borderLeft: `1px solid ${C.border}` }} />
              </tr>
            </tbody>
          </table>
        </ScrollX>
      </Card>
    </>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, target, unit = "" }: { label: ReactNode; value: number; target?: number; unit?: string }) {
  const p = target ? (value / target) * 100 : 0;
  const color = !target ? C.accentLight : p >= 100 ? C.green : p >= 75 ? C.orange : C.red;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{unit === " Kč" ? fmtCZK(value) : `${Math.round(value)}${unit}`}</div>
      {target != null && <div style={{ fontSize: 11, color, marginTop: 4 }}>Cieľ: {unit === " Kč" ? fmtCZK(target) : `${target}${unit}`} ({p.toFixed(0)} %)</div>}
    </div>
  );
}

function KpiTab() {
  const p = pnlCalc();
  const marzaH1 = vSum(p.prijmy) > 0 ? (vSum(p.hrubyZisk) / vSum(p.prijmy)) * 100 : 0;
  return (
    <>
      <Card>
        <H3><Info text="Kľúčové ukazovatele voči cieľom roka 2026. H1 je polovica roka — pri ročnom cieli je ~50 % na pláne." label="KPI voči cieľom 2026" /></H3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <KpiCard label="Tržby H1 / ročný cieľ" value={vSum(PRIJMY)} target={VZAS_TARGETS.rocneTrzby} unit=" Kč" />
          <KpiCard label="Marža H1" value={marzaH1} target={VZAS_TARGETS.marzaPct} unit=" %" />
          <KpiCard label="Ø hodín/mes · Jerry" value={avg(SALARY.jerry.hours)} target={VZAS_TARGETS.hodinyJerry} unit="h" />
          <KpiCard label="Ø hodín/mes · Terezka" value={avg(SALARY.terezka.hours)} target={VZAS_TARGETS.hodinyTerezka} unit="h" />
        </div>
      </Card>
      <Card>
        <H3>Vybavenie, Ciele 2026 a marketing štatistiky</H3>
        <Empty>Editovateľné zoznamy pribudnú neskôr — túto sekciu riešime až po importe z banky.</Empty>
      </Card>
    </>
  );
}

// ── module shell ─────────────────────────────────────────────────────────────
export function Vzas({ sub, onSub }: { sub: string; onSub: (s: string) => void }) {
  // Výsledky is one menu entry with its own second level (Kvartálne/Mesačné/KPI).
  const [vysledkySub, setVysledkySub] = useState("kvartalne");
  const isVysledky = sub === "vysledky";
  return (
    <>
      <SubTabs
        tabs={[
          { id: "pnl", label: "VZAS 2026" },
          { id: "vyplaty", label: "J&T Výplaty" },
          { id: "jarek", label: "Jarek dlh" },
          { id: "vysledky", label: "Výsledky" },
        ]}
        value={isVysledky ? "vysledky" : sub}
        onChange={onSub}
      />
      {sub === "pnl" && <PnlTab />}
      {sub === "vyplaty" && <SalaryTab />}
      {sub === "jarek" && <JarekTab />}
      {isVysledky && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "kvartalne", label: "Kvartálne" },
              { id: "mesacne", label: "Mesačné" },
              { id: "kpi", label: "KPI" },
            ].map((t) => {
              const on = vysledkySub === t.id;
              return (
                <button key={t.id} onClick={() => setVysledkySub(t.id)}
                  style={{ padding: "5px 13px", borderRadius: 999, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentBg : "transparent", color: on ? C.accentLight : C.textMuted, fontSize: 12.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {t.label}
                </button>
              );
            })}
          </div>
          {vysledkySub === "kvartalne" && <KvartalneTab />}
          {vysledkySub === "mesacne" && <MesacneTab />}
          {vysledkySub === "kpi" && <KpiTab />}
        </>
      )}
    </>
  );
}
