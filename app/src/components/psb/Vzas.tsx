import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchMonthNotes, fetchWeekEntries, saveMonthNote, type MonthNote, type WeekEntry } from "../../lib/psb/client";
import { fmtCZK } from "../../lib/psb/format";
import { C, mix, S } from "../../lib/psb/theme";
import {
  CURRENT_ERA,
  DEBT_CHECKPOINT_2026,
  JAREK_SPLATKY,
  JAREK_VKLADY,
  PNL,
  PRIJMY,
  PRIJMY_INE,
  PRIJMY_PTMINDER,
  QUARTERS,
  SALARY,
  SALARY_ERAS,
  SPOLOCNE,
  MONTH_QUESTIONS,
  SEED_ANSWERS,
  SEED_NOTES,
  YEAR_IDX,
  answerKey,
  eraAt,
  itemNote,
  VZAS_MONTH_LABELS,
  VZAS_TARGETS,
  VZAS_TARGETS_BY_YEAR,
  byCommitment,
  commitmentTotal,
  jarekCalc,
  monthDeviations,
  monthKeyOf,
  pnlCalc,
  salaryCalc,
  spolocneHalf,
  spolocneTotal,
  sumItems,
  sumSection,
  vSum,
  yearOf,
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
const ALL_IDX = MONTHS.map((_, i) => i);
const RANGES = [
  { value: "all", label: "Celé obdobie (18 mes.)" },
  { value: "2026", label: "2026 (jan–jún)" },
  { value: "2025", label: "2025 (celý rok)" },
  { value: "last6", label: "Posledných 6 mes." },
  { value: "last12", label: "Posledných 12 mes." },
  { value: "custom", label: "Vlastné" },
];

function useRange(initial = "all") {
  const [win, setWin] = useState(initial);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(MONTHS.length - 1);
  const idx = useMemo(() => {
    if (YEAR_IDX[win]) return YEAR_IDX[win];
    if (win === "last6") return ALL_IDX.slice(-6);
    if (win === "last12") return ALL_IDX.slice(-12);
    if (win === "custom") {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
    return ALL_IDX;
  }, [win, from, to]);
  return { win, setWin, from, setFrom, to, setTo, idx };
}
type Range = ReturnType<typeof useRange>;

const pick = (v: Vals, idx: number[]) => idx.map((i) => v[i]);

function RangeBar({ r, extra }: { r: Range; extra?: ReactNode }) {
  const opts = MONTHS.map((m, i) => ({ value: String(i), label: m }));
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
// With 18 columns the label column scrolls out of sight, and a row of numbers
// with no name is useless — so the first column is pinned. mix() is
// transparent-based, so a pinned cell needs an opaque base under the tint.
const sticky = (tint?: string) => ({
  position: "sticky" as const,
  left: 0,
  zIndex: 1,
  backgroundColor: C.card,
  ...(tint ? { backgroundImage: `linear-gradient(${tint}, ${tint})` } : {}),
});

function MonthHead({ idx, first = "Položka", showAvg = true }: { idx: number[]; first?: string; showAvg?: boolean }) {
  const th = (extra?: object) => ({ textAlign: "right" as const, padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600, whiteSpace: "nowrap" as const, ...extra });
  return (
    <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
      <th style={{ ...th(), textAlign: "left", minWidth: 190, ...sticky(), zIndex: 2 }}>{first}</th>
      {idx.map((i) => <th key={i} style={th()}>{MONTHS[i]}</th>)}
      <th style={th({ borderLeft: `1px solid ${C.border}` })}>Celkom</th>
      {showAvg && <th style={th()}>Ø / mes.</th>}
    </tr>
  );
}

function Row({ label, values, depth = 0, bold = false, color, children, showAvg = true, noteFor }: {
  label: ReactNode; values: Vals; depth?: number; bold?: boolean; color?: string; children?: ReactNode; showAvg?: boolean;
  // Per-cell hover text (what that purchase actually was), by column position.
  noteFor?: (col: number) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const hasKids = !!children;
  const fs = depth === 0 ? 13 : 12;
  const cell = { textAlign: "right" as const, padding: "6px 10px", fontSize: fs, fontWeight: bold ? 600 : 400, fontVariantNumeric: "tabular-nums" as const, borderBottom: `1px solid ${mix(C.border, 55)}`, whiteSpace: "nowrap" as const };
  return (
    <>
      <tr onClick={() => hasKids && setOpen(!open)} style={{ background: depth === 0 ? mix(C.accent, 7) : "transparent", cursor: hasKids ? "pointer" : "default" }}>
        <td style={{ padding: "6px 10px", paddingLeft: depth * 16 + 10, fontSize: fs, fontWeight: bold ? 600 : 400, color: C.text, whiteSpace: "nowrap", borderBottom: `1px solid ${mix(C.border, 55)}`, ...sticky(depth === 0 ? mix(C.accent, 7) : undefined) }}>
          <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{hasKids ? (open ? "▼" : "▶") : ""}</span>
          {label}
        </td>
        {values.map((v, i) => {
          const n = noteFor?.(i);
          return (
            <td key={i} title={n} style={{ ...cell, color: color || (v < 0 ? C.red : C.textMuted), cursor: n ? "help" : undefined }}>
              {money(v)}
              {n && <span style={{ color: C.accent, fontSize: 9, verticalAlign: "super", marginLeft: 2 }}>●</span>}
            </td>
          );
        })}
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
      <td colSpan={span} style={{ padding: "14px 10px 5px", fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${mix(C.accent, 30)}` }}>
        <span style={{ position: "sticky", left: 10, display: "inline-block" }}>{label}</span>
      </td>
    </tr>
  );
}

function TotalRow({ label, values, color, big = false, showAvg = true, onClick, open }: {
  label: string; values: Vals; color: string; big?: boolean; showAvg?: boolean; onClick?: () => void; open?: boolean;
}) {
  const cell = { textAlign: "right" as const, padding: big ? "10px" : "8px 10px", fontWeight: 700, fontSize: big ? 14 : 13, color, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };
  return (
    <tr onClick={onClick} style={{ background: big ? mix(C.accent, 12) : "transparent", borderTop: `2px solid ${mix(C.accent, 45)}`, cursor: onClick ? "pointer" : "default" }}>
      <td style={{ padding: big ? "10px" : "8px 10px", fontWeight: 700, fontSize: big ? 14 : 13, color: C.text, whiteSpace: "nowrap", ...sticky(big ? mix(C.accent, 12) : undefined) }}>
        {onClick && <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{open ? "▼" : "▶"}</span>}
        {label}
      </td>
      {values.map((v, i) => <td key={i} style={cell}>{money(v)}</td>)}
      <td style={{ ...cell, borderLeft: `1px solid ${C.border}` }}>{money(vSum(values))}</td>
      {showAvg && <td style={cell}>{money(avg(values))}</td>}
    </tr>
  );
}

// 18 columns rarely fit, so a table opens at the newest month on the right and
// scrolls left into the history — the same rule the charts follow.
const ScrollX = ({ children, dep }: { children: ReactNode; dep?: unknown }) => {
  const ref = useScrollEnd<HTMLDivElement>(true, dep);
  return <div ref={ref} style={{ overflowX: "auto" }}>{children}</div>;
};
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

// ── Break-even & štruktúra nákladov ──────────────────────────────────────────
// Break-even uses NÁROK, not Poslané: what the firm must earn is what the
// founders are owed. Anything drawn above that is a loan, not a cost.
function HealthCard({ idx }: { idx: number[] }) {
  const p = pnlCalc();
  const j = salaryCalc("jerry");
  const t = salaryCalc("terezka");
  const breakEven = MONTHS.map((_, i) => p.bezVyplat[i] + j.narok[i] + t.narok[i] + p.matyas[i]);
  const beSel = pick(breakEven, idx);
  const prijmySel = pick(p.prijmy, idx);
  const beAvg = avg(beSel);
  const prijmyAvg = avg(prijmySel);
  const rezerva = beAvg > 0 ? ((prijmyAvg - beAvg) / beAvg) * 100 : 0;
  const podBE = idx.filter((i) => p.prijmy[i] < breakEven[i]).length;

  const mzdy = vSum(idx.map((i) => j.narok[i] + t.narok[i] + p.matyas[i]));
  const trzby = vSum(prijmySel);
  const mzdyPct = trzby > 0 ? (mzdy / trzby) * 100 : 0;

  // "How much could I stop paying?" beats fix/variable — several "fixed" rows
  // (ads, AI tools) are fully discretionary, and two aren't operating costs.
  const bk = byCommitment();
  const volitelne = vSum(pick(commitmentTotal(bk.volitelne), idx));
  const zavazne = vSum(pick(commitmentTotal(bk.zavazne), idx));
  const skrtPct = zavazne + volitelne > 0 ? (volitelne / (zavazne + volitelne)) * 100 : 0;

  return (
    <Card>
      <H3>
        <Info text="Tri čísla, ktoré hovoria, ako pevne firma stojí. Break-even ráta s NÁROKOM trénerov (Fix + variabil), nie s tým, čo si reálne vzali — to, čo si niekto vezme navyše, je pôžička, nie náklad." label="Break-even & zdravie firmy" />
      </H3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "12px 0 4px" }}>
        <StatCard value={fmtCZK(beAvg)} label={<Info text="Koľko musíte mesačne zarobiť, aby ste pokryli prevádzku aj nároky na výplaty. Pod týmto číslom je mesiac stratový." label="Break-even / mesiac" />} color={C.orange} />
        <StatCard value={`${rezerva > 0 ? "+" : ""}${rezerva.toFixed(1)} %`} label={<Info text="O koľko % sú priemerné tržby nad break-even. Malá rezerva = jeden slabý mesiac stačí na stratu." label="Rezerva nad break-even" />} color={rezerva >= 20 ? C.green : rezerva >= 0 ? C.orange : C.red} />
        <StatCard value={`${mzdyPct.toFixed(1)} %`} label={<Info text="Podiel mzdových nákladov (nárok oboch trénerov + zamestnanci) na tržbách. Pri službách je to hlavná nákladová položka — čím vyššie, tým menej zostáva na maržu." label="Mzdy z tržieb" />} color={mzdyPct <= 50 ? C.green : mzdyPct <= 60 ? C.orange : C.red} />
        <StatCard value={`${fmtCZK(volitelne / idx.length)} · ${skrtPct.toFixed(0)} %`} label={<Info text="Koľko z prevádzkových nákladov (bez výplat) je voliteľných — reklama, kreatívne nástroje, vybavenie, pohostenie. To sú peniaze, ktoré vieš v zlom mesiaci prestať míňať bez zastavenia štúdia. Zvyšok sú záväzné: nájom, štát, poistenie a systémy, na ktorých prevádzka stojí." label="Viem škrtnúť / mes." />} color={skrtPct >= 30 ? C.green : skrtPct >= 15 ? C.orange : C.red} />
      </div>
      <div style={{ fontSize: 11.5, color: C.textMuted, margin: "8px 0 14px", lineHeight: 1.5 }}>
        Prevádzka bez výplat {fmtCZK(avg(pick(p.bezVyplat, idx)))} + nároky na výplaty {fmtCZK(avg(idx.map((i) => j.narok[i] + t.narok[i] + p.matyas[i])))} = <b>{fmtCZK(beAvg)}</b> mesačne.
        {podBE > 0 && <> Za zvolené obdobie bolo <b style={{ color: C.red }}>{podBE} z {idx.length}</b> mesiacov pod break-even.</>}
      </div>
      <LineChart
        data={idx.map((i) => ({ label: MONTHS[i], values: [p.prijmy[i], breakEven[i]] }))}
        series={[{ name: "Tržby", color: C.green }, { name: "Break-even", color: C.orange }]}
        height={200}
        fmt={(n) => `${Math.round(n / 1000)}k`}
        autoY
        alignEnd
      />
      <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>Kde je zelená pod oranžovou, mesiac nezarobil ani na vlastnú prevádzku a výplaty.</div>
    </Card>
  );
}

// P&L regrouped by commitment. Same rows, same totals — different question:
// not "is it fixed?" but "in a bad month, can I stop paying it?".
function CommitmentTable({ idx }: { idx: number[] }) {
  const p = pnlCalc();
  const b = byCommitment();
  const zav = commitmentTotal(b.zavazne);
  const vol = commitmentTotal(b.volitelne);
  const nep = commitmentTotal(b.neprevadzkove);
  const prevadzkoveNaklady = MONTHS.map((_, i) => zav[i] + vol[i] + p.vyplatySpolu[i]);
  const prevadzkovyZisk = MONTHS.map((_, i) => p.prijmy[i] - prevadzkoveNaklady[i]);
  const span = idx.length + 3;
  // Zero rows only add noise in this view.
  const rows = (key: "zavazne" | "volitelne" | "neprevadzkove") =>
    b[key].items.filter((it) => vSum(it.values) !== 0).map((it) => (
      <Row key={it.path} depth={1} values={pick(it.values, idx)}
        noteFor={(col) => itemNote(it.path, idx[col])}
        label={<>{it.label} <span style={{ color: C.textDim, fontSize: 11 }}>· {it.group}</span></>} />
    ));

  return (
    <>
      <ScrollX dep={idx.length}>
        <table style={tableStyle}>
          <thead><MonthHead idx={idx} /></thead>
          <tbody>
            <Divider label="Náklady — podľa toho, či sa dajú zastaviť" span={span} />
            <Row label="Záväzné — musíš platiť" values={pick(zav, idx)} bold color={C.red}>
              {rows("zavazne")}
            </Row>
            <Row label="Voliteľné — vieš zastaviť" values={pick(vol, idx)} bold color={C.orange}>
              {rows("volitelne")}
            </Row>
            <Row label="Výplaty" values={pick(p.vyplatySpolu, idx)} bold color={C.red}>
              <Row label="Jerry (Poslané)" values={pick(p.poslaneJerry, idx)} depth={1} />
              <Row label="Terezka (Poslané)" values={pick(p.poslaneTerezka, idx)} depth={1} />
              <Row label="Matyáš" values={pick(p.matyas, idx)} depth={1} />
            </Row>

            <TotalRow label="Prevádzkové náklady" values={pick(prevadzkoveNaklady, idx)} color={C.red} />

            <Divider label="Tržby" span={span} />
            <Row label="Celkové príjmy" values={pick(p.prijmy, idx)} bold color={C.green} />

            <TotalRow label="Prevádzkový zisk" values={pick(prevadzkovyZisk, idx)} color={signColor(vSum(pick(prevadzkovyZisk, idx)))} big />

            <Divider label="Neprevádzkové — nie je to náklad prevádzky" span={span} />
            <Row label="Neprevádzkové spolu" values={pick(nep, idx)} bold color={C.blue}>
              {rows("neprevadzkove")}
            </Row>

            <TotalRow label="Výsledok po neprevádzkových" values={pick(p.hrubyZisk, idx)} color={signColor(vSum(pick(p.hrubyZisk, idx)))} big />
          </tbody>
        </table>
      </ScrollX>
      <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: mix(C.blue, 10), border: `1px solid ${mix(C.blue, 30)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
        <b>Rozdiel oproti pôvodnému pohľadu:</b> „Splátka Jarek“ a „Fond na náradie“ sú vyňaté z prevádzky —
        splátka je umorovanie istiny (financovanie) a fond je presun do/z rezervy, nie výdavok. Preto vidíš dva
        výsledky: <b>prevádzkový zisk</b> (ako si na tom samotné štúdio) a <b>výsledok po neprevádzkových</b>,
        ktorý sedí na hrubý zisk v pôvodnom pohľade.
      </div>
    </>
  );
}

// ── VZAS 2026 (P&L) ──────────────────────────────────────────────────────────
function PnlTab() {
  const p = pnlCalc();
  const r = useRange();
  const [mode, setMode] = useState<"avg" | "sum">("avg"); // default: priemer
  const [lens, setLens] = useState<"fixvar" | "zavaznost">("fixvar");
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <H3><Info text="Mesačný výkaz ziskov a strát za 18 mesiacov (jan 2025 – jún 2026). Klikni na kategóriu pre rozklad na položky. Hrubý zisk = Celkové príjmy − Celkové náklady (vrátane výplat). Riadky, ktoré existovali len v jednom roku (MultiBox, Freelo, Bonus na Finančák… v 2025; Štát, Telefón… v 2026), sú samostatné — zlúčením by sa stratilo, že sa zmenila samotná nákladová základňa." label="VZAS — mesačný P&L" /></H3>
          <div style={{ display: "flex", gap: 4 }}>
            {([["fixvar", "Fix / Variabilné"], ["zavaznost", "Záväzné / Voliteľné"]] as const).map(([id, lbl]) => (
              <button key={id} onClick={() => setLens(id)}
                style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${lens === id ? C.accent : C.border}`, background: lens === id ? C.accentBg : "transparent", color: lens === id ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        {lens === "zavaznost" ? <CommitmentTable idx={i} /> : (
        <ScrollX dep={i.length}>
          <table style={tableStyle}>
            <thead><MonthHead idx={i} /></thead>
            <tbody>
              <Divider label="Fixné náklady" span={i.length + 3} />
              {Object.entries(PNL.fixne.subcategories).map(([k, g]) => (
                <Row key={k} label={g.label} values={pick(sumItems(g.items), i)}>
                  {Object.entries(g.items).map(([ik, it]) => (
                    <Row key={ik} label={it.label} values={pick(it.values, i)} depth={1}
                      noteFor={(col) => itemNote(`fixne.${k}.${ik}`, i[col])} />
                  ))}
                </Row>
              ))}
              <Row label="Fixné náklady spolu" values={pick(sumSection(PNL.fixne), i)} bold color={C.red} />

              <Divider label="Variabilné náklady" span={i.length + 3} />
              {Object.entries(PNL.variabilne.subcategories).map(([k, g]) => (
                <Row key={k} label={g.label} values={pick(sumItems(g.items), i)}>
                  {Object.entries(g.items).map(([ik, it]) => (
                    <Row key={ik} label={it.label} values={pick(it.values, i)} depth={1}
                      noteFor={(col) => itemNote(`variabilne.${k}.${ik}`, i[col])} />
                  ))}
                </Row>
              ))}
              <Row label="Variabilné náklady spolu" values={pick(sumSection(PNL.variabilne), i)} bold color={C.red} />

              <Divider label="Bez výplat" span={i.length + 3} />
              <Row label="Fix + Var bez výplat" values={pick(p.bezVyplat, i)} bold />

              <Divider label="Výplaty" span={i.length + 3} />
              <Row label="Jerry (Poslané)" values={pick(p.poslaneJerry, i)} />
              <Row label="Terezka (Poslané)" values={pick(p.poslaneTerezka, i)} />
              <Row label={<Info text="Matyáš bol zamestnanec celý rok 2025 a jan–mar 2026 — nemá nárokovo-dlhovú logiku zakladateľov, len mzdový náklad." label="Matyáš" />} values={pick(p.matyas, i)} />
              <Row label="Výplaty spolu" values={pick(p.vyplatySpolu, i)} bold color={C.red} />

              <TotalRow label="Celkové náklady" values={pick(p.celkoveNaklady, i)} color={C.red} />

              <Divider label="Tržby & Príjmy" span={i.length + 3} />
              <Row label="Celkové príjmy" values={pick(p.prijmy, i)} bold color={C.green}>
                <Row label="Tržby (PTminder)" values={pick(PRIJMY_PTMINDER, i)} depth={1} />
                <Row label={<Info text="Príjmy mimo tréningov — v jan/feb 2025 Jarkov preplatok za kurz a bitcoin. Excel ich v hárku „Mesačné výsledky“ nezobrazoval pri tržbách, ale zisk z nich počítal — preto tam tie dva mesiace nesedeli." label="Iné príjmy" />} values={pick(PRIJMY_INE, i)} depth={1} />
              </Row>

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
        )}
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
          Zdroj: VZAS 2025 + VZAS 2026 (Excel), jan 2025 – jún 2026. Každý mesiac sedí na Excel do koruny.
          Júl 2026 pribudne až s prvým importom z Fia — tržby zaň síce v Trackeri sú, ale náklady zatiaľ nikde, takže by mesiac klamal.
        </div>
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
  const lbl = { ...S.td, fontSize: 12, color: C.textMuted, ...sticky() } as const;
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
        <ScrollX dep={idx.length}>
          <table style={{ ...tableStyle, marginTop: 12, minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 170, ...sticky(), zIndex: 2 }} />
                {idx.map((i) => <th key={i} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{MONTHS[i]}</th>)}
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Ø</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...lbl, fontSize: 11 }}>
                  <Info text="Mzdový model sa v 2025 dvakrát menil. Do júla platilo 70/30 (70 % z klientovej platby trénerovi), august bol prechodný mesiac konsolidácie a od septembra 2025 platí Fix + variabil." label="Model" />
                </td>
                {idx.map((i) => {
                  const e = eraAt(i);
                  return <td key={i} style={{ ...cell, fontSize: 10, color: e.kind === "fixvar" ? C.accentLight : C.orange }}>{e.kind === "fixvar" ? "fix+var" : e.kind === "prechod" ? "prechod" : "70/30"}</td>;
                })}
                <td style={{ ...cell, borderLeft: `1px solid ${C.border}` }} />
              </tr>
              <tr>
                <td style={lbl}>Hodiny{detailBtn(narokOpen, () => setNarokOpen(!narokOpen))}</td>
                {idx.map((i) => <td key={i} style={{ ...cell, color: C.text }}>{s.hours[i]}</td>)}
                <td style={{ ...cell, color: C.textMuted, borderLeft: `1px solid ${C.border}` }}>{avg(money2(s.hours)).toFixed(0)}</td>
              </tr>
              {narokOpen && (
                <>
                  <tr>
                    <td style={{ ...lbl, paddingLeft: 24, fontSize: 11 }}>Fix</td>
                    {idx.map((i) => <td key={i} style={{ ...cell, fontSize: 11, color: C.textDim }}>{c.hasModel[i] ? money(eraAt(i).fix) : "—"}</td>)}
                    <td style={{ ...cell, fontSize: 11, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(s.fix)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...lbl, paddingLeft: 24, fontSize: 11 }}>Variabil (nad {s.hoursThreshold}h)</td>
                    {idx.map((i) => <td key={i} style={{ ...cell, fontSize: 11, color: C.textDim }}>{c.hasModel[i] ? money(c.variabil[i]) : "—"}</td>)}
                    <td style={{ ...cell, fontSize: 11, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(avg(idx.filter((i) => c.hasModel[i]).map((i) => c.variabil[i])))}</td>
                  </tr>
                </>
              )}
              <tr style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...lbl, fontWeight: 600, color: C.text }}>
                  <Info text="Od sep 2025: Fix + (hodiny − 60) × 850. Pred tým nárok neexistoval — pri modeli 70/30 bolo nárokom presne to, čo klient zaplatil, preto sú tie mesiace zobrazené šedo a rovnajú sa Poslanému." label="Nárok" />
                </td>
                {idx.map((i) => <td key={i} style={{ ...cell, color: c.hasModel[i] ? C.green : C.textDim, fontWeight: c.hasModel[i] ? 600 : 400, fontStyle: c.hasModel[i] ? "normal" : "italic" }}>{money(c.narok[i])}</td>)}
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
                <td style={{ ...lbl, fontWeight: 700, color: C.text, ...sticky(mix(C.accent, 10)) }}>
                  <Info text="Od sep 2025: Rozdiel = Nárok − Poslané. Kladný = firma dlží trénerovi (dlh klesá), záporný = tréner si vzal viac než nárok (dlh rastie). V ére 70/30 nárok neexistoval, takže rozdielom je priamo zapísaná pôžička alebo splátka voči firme." label="Rozdiel" />
                </td>
                {idx.map((i) => <td key={i} style={{ ...cell, color: signColor(c.rozdiel[i]), fontWeight: 700 }}>{money(c.rozdiel[i])}</td>)}
                <td style={{ ...cell, color: signColor(avg(money2(c.rozdiel))), fontWeight: 700, borderLeft: `1px solid ${C.border}` }}>{money(avg(money2(c.rozdiel)))}</td>
              </tr>
              <tr>
                <td style={{ ...lbl, fontWeight: 600, color: C.text }}>
                  <Info text={`Kumulovaný dlh(N) = dlh(N−1) + Rozdiel(N), od nuly k 1.1.2025. Kontrolný bod z briefu k 1.1.2026: ${fmtCZK(DEBT_CHECKPOINT_2026[pk])} — vypočítaná reťaz naň sadá (rozdiel do 1 Kč je zaokrúhľovanie v Exceli).`} label="Kumulovaný dlh" />
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

type DebtPerson = { k: PersonKey; label: string; slope: number; dlh: number; narokAvg: number; poslaneAvg: number; months: number | null; over: number };

// Collapsed to the headline (name + balance + direction); the "what it would
// take" sentence is one click away.
function DebtBox({ p }: { p: DebtPerson }) {
  const [open, setOpen] = useState(false);
  const rastie = p.slope < 0;
  return (
    <div style={{ background: C.card, border: `1px solid ${rastie ? mix(C.red, 45) : mix(C.green, 40)}`, borderRadius: 12, padding: "12px 14px" }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            <span style={{ display: "inline-block", width: 14, color: C.textDim, fontSize: 9 }}>{open ? "▼" : "▶"}</span>
            {p.label}
          </span>
          <span style={{ fontSize: 17, fontWeight: 700, color: signColor(p.dlh), fontVariantNumeric: "tabular-nums" }}>{fmtCZK(p.dlh)}</span>
        </div>
        <div style={{ fontSize: 12.5, color: rastie ? C.red : C.green, marginTop: 5, fontWeight: 600, marginLeft: 14 }}>
          {rastie ? "▼ dlh rastie" : "▲ dlh klesá"} o {fmtCZK(Math.abs(p.slope))} / mes.
        </div>
      </div>
      {open && (
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8, marginLeft: 14, lineHeight: 1.5 }}>
          {rastie ? (
            <>Pri tomto tempe sa <b style={{ color: C.red }}>nesplatí nikdy</b>. Aby prestal rásť, mesačný výber musí klesnúť
              na <b>{fmtCZK(p.narokAvg)}</b> — teraz je o <b style={{ color: C.red }}>{fmtCZK(p.over)}</b> vyšší.</>
          ) : (
            <>Pri tomto tempe splatené o <b style={{ color: C.green }}>~{p.months} mesiacov</b>. Výber sa drží
              pod nárokom ({fmtCZK(p.poslaneAvg)} vs {fmtCZK(p.narokAvg)}).</>
          )}
        </div>
      )}
    </div>
  );
}

// The debt screens showed a balance but never its direction. A balance alone
// can't tell you whether things are getting better — the slope can.
function DebtTrendCard({ idx }: { idx: number[] }) {
  // Only months under the current model can say anything about the direction:
  // a 2025 loan was a decision, not the output of a formula.
  const modelIdx = idx.filter((i) => i >= CURRENT_ERA.from);
  const people = (["jerry", "terezka"] as const).map((k) => {
    const c = salaryCalc(k);
    const use = modelIdx.length ? modelIdx : idx;
    const sel = pick(c.rozdiel, use);
    const slope = avg(sel); // + = debt shrinking, − = growing
    const dlh = c.cumDebt[c.cumDebt.length - 1];
    const narokAvg = avg(pick(c.narok, use));
    const poslaneAvg = avg(pick(c.poslane, use));
    const months = slope > 0 ? Math.ceil(Math.abs(dlh) / slope) : null;
    return { k, label: SALARY[k].label, c, slope, dlh, narokAvg, poslaneAvg, months, over: poslaneAvg - narokAvg };
  });
  return (
    <Card>
      <H3>
        <Info text="Zostatok dlhu sám o sebe nestačí — dôležitý je smer. Ø rozdiel za mesiac je sklon: kladný = dlh sa spláca, záporný = rastie. Strop je suma, pod ktorou musí mesačný výber zostať, aby dlh prestal rásť (= priemerný nárok). Smer aj scenáre sa rátajú len z mesiacov pod dnešným modelom (od sep 2025) — pôžička z éry 70/30 bola rozhodnutie, nie výstup vzorca." label="Kam smeruje dlh" />
      </H3>
      <LineChart
        data={idx.map((i) => ({ label: MONTHS[i], values: [salaryCalc("jerry").cumDebt[i], salaryCalc("terezka").cumDebt[i]] }))}
        series={[{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.blue }]}
        height={200}
        fmt={(n) => `${Math.round(n / 1000)}k`}
        refLine={{ value: 0, label: "bez dlhu", color: C.textDim }}
        autoY
        alignEnd
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
        {people.map((p) => <DebtBox key={p.k} p={p} />)}
      </div>

      <div style={{ marginTop: 18 }}>
        <H3><Info text="Dlh sa dá otočiť dvoma pákami: odrobiť viac hodín (rastie nárok) alebo si posielať menej (klesá výber). Tabuľka ukazuje prvú páku — koľko hodín mesačne by bolo treba pri nezmenenom výbere. V zátvorke je druhá páka: o koľko si menej poslať, ak hodiny ostanú rovnaké." label="Čo by to chcelo" /></H3>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600, minWidth: 200 }}>Cieľ</th>
                {people.map((p) => <th key={p.k} style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...S.td, fontSize: 12.5, color: C.textMuted }}>Teraz odrobí</td>
                {people.map((p) => (
                  <td key={p.k} style={{ ...S.td, textAlign: "right", fontSize: 12.5, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                    {avg(pick(SALARY[p.k].hours, modelIdx.length ? modelIdx : idx)).toFixed(1)} h
                  </td>
                ))}
              </tr>
              {[
                { label: "Zastaviť rast dlhu", extra: 0 },
                { label: "Splatiť celý dlh do 24 mes.", extra: 24 },
                { label: "Splatiť celý dlh do 12 mes.", extra: 12 },
              ].map((sc) => (
                <tr key={sc.label}>
                  <td style={{ ...S.td, fontSize: 12.5, color: C.text }}>{sc.label}</td>
                  {people.map((p) => {
                    const s = SALARY[p.k];
                    const nowH = avg(pick(s.hours, modelIdx.length ? modelIdx : idx));
                    // Required entitlement = current draw + monthly repayment.
                    const repay = sc.extra > 0 ? Math.abs(Math.min(0, p.dlh)) / sc.extra : 0;
                    const needNarok = p.poslaneAvg + repay;
                    const needH = s.hoursThreshold + Math.max(0, needNarok - s.fix) / s.hourlyRate;
                    const dH = needH - nowH;
                    const done = dH <= 0;
                    return (
                      <td key={p.k} style={{ ...S.td, textAlign: "right", fontSize: 12.5, fontVariantNumeric: "tabular-nums", color: done ? C.green : dH <= 10 ? C.orange : C.red }}>
                        {done ? "✓ už spĺňa" : (
                          <>
                            {needH.toFixed(0)} h <span style={{ color: C.textDim, fontSize: 11 }}>(+{dH.toFixed(0)} h / alebo −{fmtCZK(dH * s.hourlyRate)})</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          Hodina nad prahom {SALARY.jerry.hoursThreshold} h pridá k nároku {fmtCZK(SALARY.jerry.hourlyRate)}, takže „+9 h“ a „posielať si o 7 650 Kč menej“
          majú na dlh rovnaký účinok — dá sa to aj kombinovať.
        </div>
      </div>
    </Card>
  );
}

// The single most consequential thing in these 18 months: the model that pays
// the founders changed. Showing the eras as data (with what each one did to the
// margin) is the difference between "výplaty kolíšu" and "vymenili sme model,
// ktorý firmu nemohol uživiť".
function EraCard() {
  const [open, setOpen] = useState(false);
  const p = pnlCalc();
  const span = (from: number, to: number) => {
    const ix = Array.from({ length: to - from + 1 }, (_, k) => from + k);
    const trzby = vSum(pick(p.prijmy, ix));
    const zisk = vSum(pick(p.hrubyZisk, ix));
    const vypl = vSum(pick(p.vyplatySpolu, ix));
    return { ix, trzby, zisk, marza: trzby > 0 ? (zisk / trzby) * 100 : 0, vyplPct: trzby > 0 ? (vypl / trzby) * 100 : 0 };
  };
  const pred = span(0, 6);   // jan–júl 2025, 70/30
  const po = span(8, 17);    // sep 2025 – jún 2026, fix + variabil
  const cell = { textAlign: "right" as const, padding: "7px 10px", fontSize: 13, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };

  return (
    <Card>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{open ? "▼" : "▶"}</span>
            Mzdový model sa v 2025 zmenil
          </div>
          <div style={{ fontSize: 11.5, color: C.textMuted, marginLeft: 15 }}>70/30 → konsolidácia (aug 25) → Fix + variabil (od sep 25)</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: C.textMuted }}>Marža pred → po</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.green, fontVariantNumeric: "tabular-nums" }}>
            {pred.marza.toFixed(1)} % → {po.marza.toFixed(1)} %
          </div>
        </div>
      </div>
      {open && (
        <>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {SALARY_ERAS.map((e, k) => {
              const to = k + 1 < SALARY_ERAS.length ? SALARY_ERAS[k + 1].from - 1 : MONTHS.length - 1;
              const now = k === SALARY_ERAS.length - 1;
              return (
                <div key={e.label} style={{ background: mix(now ? C.accent : C.orange, 8), border: `1px solid ${mix(now ? C.accent : C.orange, 30)}`, borderRadius: 10, padding: "10px 13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13, color: C.text }}>{e.label}</b>
                    <span style={{ fontSize: 12, color: C.textMuted }}>{MONTHS[e.from]} – {now ? "dnes" : MONTHS[to]}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 5, lineHeight: 1.5 }}>{e.note}</div>
                </div>
              );
            })}
          </div>
          <ScrollX>
            <table style={{ ...tableStyle, minWidth: 460, marginTop: 14 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Ø / mesiac</th>
                  <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>70/30 (jan–júl 25)</th>
                  <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Fix + variabil (sep 25 – jún 26)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { l: "Tržby", a: pred.trzby / pred.ix.length, b: po.trzby / po.ix.length, money: true },
                  { l: "Zisk", a: pred.zisk / pred.ix.length, b: po.zisk / po.ix.length, money: true },
                  { l: "Marža", a: pred.marza, b: po.marza, money: false },
                  { l: "Výplaty z tržieb", a: pred.vyplPct, b: po.vyplPct, money: false },
                ].map((row) => (
                  <tr key={row.l}>
                    <td style={{ ...S.td, fontSize: 12.5, color: C.text }}>{row.l}</td>
                    <td style={{ ...cell, color: C.textMuted }}>{row.money ? money(row.a) : `${row.a.toFixed(1)} %`}</td>
                    <td style={{ ...cell, color: row.b >= row.a ? C.green : C.orange, fontWeight: 600 }}>{row.money ? money(row.b) : `${row.b.toFixed(1)} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: mix(C.blue, 10), border: `1px solid ${mix(C.blue, 30)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
            Pri 70/30 zostávalo firme z tržieb ~49 000 Kč mesačne, ale samotná réžia stála ~66 000 Kč — <b>model matematicky nemohol vyjsť</b>, nech sa odrobilo koľkokoľvek.
            Preto bolo 5 z 12 mesiacov roku 2025 stratových. Zmena v auguste nebola kozmetika, ale oprava štrukturálnej chyby.
            Dnešný model je teda nastavený tesne — pri úvahách o jeho zmene (sploštenie sadzby, podiel na zisku) to treba mať na pamäti.
          </div>
        </>
      )}
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

      <EraCard />

      <PersonCard pk="jerry" idx={idx} />
      <PersonCard pk="terezka" idx={idx} />

      <Card>
        <div onClick={() => setSpolOpen(!spolOpen)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{spolOpen ? "▼" : "▶"}</span>
              Spoločné výdavky
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginLeft: 15 }}>Sčítajú sa a delia /2 — polovica Jerrymu, polovica Terezke. Evidujú sa až od 2026; v 2025 táto kategória neexistovala, preto sú tie mesiace nulové.</div>
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
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 150, ...sticky(), zIndex: 2 }} />
                  {idx.map((i) => <th key={i} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{MONTHS[i]}</th>)}
                  <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Ø</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(SPOLOCNE).map(([k, vals]) => (
                  <tr key={k}>
                    <td style={{ ...S.td, fontSize: 12, color: C.textMuted, ...sticky() }}>{k}</td>
                    {idx.map((i) => <td key={i} style={{ ...cell, color: vals[i] > 0 ? C.text : C.textDim }}>{money(vals[i])}</td>)}
                    <td style={{ ...cell, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(avg(idx.map((i) => vals[i])))}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.orange, ...sticky() }}>Spolu</td>
                  {idx.map((i) => <td key={i} style={{ ...cell, color: C.orange, fontWeight: 600 }}>{money(total[i])}</td>)}
                  <td style={{ ...cell, color: C.orange, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>{money(avg(idx.map((i) => total[i])))}</td>
                </tr>
                <tr>
                  <td style={{ ...S.td, fontSize: 12, color: C.orange, fontStyle: "italic", ...sticky() }}>→ na osobu (/2)</td>
                  {idx.map((i) => <td key={i} style={{ ...cell, color: C.orange, fontStyle: "italic" }}>{money(half[i])}</td>)}
                  <td style={{ ...cell, color: C.orange, fontStyle: "italic", borderLeft: `1px solid ${C.border}` }}>{money(avg(idx.map((i) => half[i])))}</td>
                </tr>
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>

      <DebtTrendCard idx={idx} />
    </>
  );
}

// ── Cashflow ─────────────────────────────────────────────────────────────────
// The Tracker's old "Cashflow" compared vyfakturované vs prijaté — two views of
// the SAME side. Real cashflow needs the outgoing side too, which only VZAS has.
// Non-cash lines are excluded: "Fond na náradie" is a transfer to/from a
// reserve, not money leaving the business.
function CashflowTab() {
  const p = pnlCalc();
  const r = useRange();
  const idx = r.idx;
  const fond = PNL.fixne.subcategories.prevadzka.items.fondNaradie.values;
  const out = MONTHS.map((_, i) => p.celkoveNaklady[i] - fond[i]); // fond isn't cash out
  const net = MONTHS.map((_, i) => p.prijmy[i] - out[i]);
  const cum: number[] = [];
  net.forEach((v, i) => cum.push((i === 0 ? 0 : cum[i - 1]) + v));

  const inSel = pick(p.prijmy, idx);
  const outSel = pick(out, idx);
  const netSel = pick(net, idx);
  const cell = { textAlign: "right" as const, padding: "7px 10px", fontSize: 12.5, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const, borderBottom: `1px solid ${mix(C.border, 55)}` };

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <H3><Info text="Peniaze dnu vs peniaze von. Zatiaľ z Excelu (cash pohľad — PSB nie je platca DPH, takže náklad = výdavok). „Fond na náradie“ je vyňatý, lebo je to presun do rezervy, nie odliv. Po importe z banky sa to nahradí reálnymi bankovými pohybmi." label="Cashflow" /></H3>
          <RangeBar r={r} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <StatCard value={fmtCZK(vSum(inSel))} label={`Prišlo · ${idx.length} mes.`} color={C.green} />
          <StatCard value={fmtCZK(vSum(outSel))} label="Odišlo" color={C.red} />
          <StatCard value={fmtCZK(vSum(netSel))} label="Čistý tok" color={signColor(vSum(netSel))} />
          <StatCard value={fmtCZK(avg(netSel))} label="Ø čistý tok / mes." color={signColor(avg(netSel))} />
        </div>
      </Card>

      <Card>
        <H3>Kumulatívna hotovosť</H3>
        <LineChart
          data={idx.map((i) => ({ label: MONTHS[i], values: [cum[i]] }))}
          series={[{ name: "Kumulatívne", color: C.accent }]}
          height={200}
          fmt={(n) => `${Math.round(n / 1000)}k`}
          refLine={{ value: 0, label: "nula", color: C.textDim }}
          autoY
          alignEnd
        />
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 8 }}>
          Koľko hotovosti firma za sledované obdobie pridala alebo ubrala. Rastúca krivka = tvorí sa rezerva.
        </div>
      </Card>

      <Card>
        <H3>Mesačný tok</H3>
        <SignedBars data={idx.map((i) => ({ label: MONTHS[i], value: net[i] }))} fmt={(n) => `${Math.round(n / 1000)}k`} height={200} />
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 560, marginTop: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Mesiac</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Prišlo</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Odišlo</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Čistý tok</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none", borderLeft: `1px solid ${C.border}` }}>Kumulatívne</th>
              </tr>
            </thead>
            <tbody>
              {idx.map((i) => (
                <tr key={i}>
                  <td style={{ padding: "7px 10px", fontSize: 12.5, color: C.text, borderBottom: `1px solid ${mix(C.border, 55)}` }}>{MONTHS[i]}</td>
                  <td style={{ ...cell, color: C.green }}>{money(p.prijmy[i])}</td>
                  <td style={{ ...cell, color: C.red }}>{money(out[i])}</td>
                  <td style={{ ...cell, color: signColor(net[i]), fontWeight: 600 }}>{money(net[i])}</td>
                  <td style={{ ...cell, color: signColor(cum[i]), borderLeft: `1px solid ${C.border}` }}>{money(cum[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
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
  // Three honest paces: the whole period, the last 3 months, and cash only —
  // almost half of "repayment" is Sofia's forgone revenue, which is never money.
  const cashVals = (JAREK_SPLATKY as Record<string, Vals>)["Fix splátka (P&L náklad)"] ?? [];
  const nonCash = vSum(jk.splatkySpolu) - vSum(cashVals);
  const paceRecent = avg(jk.splatkySpolu.slice(-3));
  const paceCash = avg(cashVals);
  const vkladySpolu = vSum(jk.vklady);
  const MN = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
  const monthName = (add: number) => {
    const d = new Date(2026, 5, 1);
    d.setMonth(d.getMonth() + add);
    return `${MN[d.getMonth()]} ${d.getFullYear()}`;
  };
  const payoff = monthsLeft != null ? monthName(monthsLeft) : null;
  const scenarios = [
    { label: "Priemer celé obdobie", p: pace },
    { label: "Tempo posledné 3 mes.", p: paceRecent },
    { label: "Len z hotovosti (bez Sofie)", p: paceCash },
  ].map((s) => ({ ...s, m: s.p > 0 ? Math.ceil(Math.abs(last) / s.p) : null }));
  const cell = { textAlign: "right" as const, padding: "5px 8px", fontSize: 12, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };

  return (
    <>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <StatCard value={fmtCZK(last)} label="Stav dlhu k jún 26" color={C.red} />
          <StatCard value={fmtCZK(vkladySpolu)} label={<Info text="Koľko do firmy vložil. Prvá suma (jan 2025) je zostatok prenesený z roku 2024, druhá (300 000 Kč, feb 2025) je reálny druhý vklad." label="Vklady spolu" />} color={C.orange} />
          <StatCard value={fmtCZK(pace)} label={<Info text={`Z toho reálna hotovosť je len ${fmtCZK(paceCash)}/mes — zvyšok (${fmtCZK(nonCash)} za obdobie, ${((nonCash / vSum(jk.splatkySpolu)) * 100).toFixed(0)} %) je Sofia, teda vzdaná tržba, nie prijaté peniaze.`} label="Ø splátka / mes." />} color={C.green} />
          <StatCard
            value={monthsLeft != null ? `${payoff} · ${monthsLeft} mes.` : "—"}
            label={<Info text="Odhadované splatenie pri aktuálnom tempe (priemer za sledované obdobie vrátane mesiacov bez splátky). Nezohľadňuje nové vklady ani zmenu splátky." label="Predpokladané splatenie" />}
            color={C.blue}
          />
        </div>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
          {scenarios.map((s) => (
            <div key={s.label} style={{ background: mix(C.blue, 8), border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 13px" }}>
              <div style={{ fontSize: 11, color: C.textMuted }}>{s.label}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                {s.m != null ? `${monthName(s.m)} · ${s.m} mes.` : "nespláca sa"}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{fmtCZK(s.p)} / mes.</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 10, lineHeight: 1.5 }}>
          V júni splátka nebola vôbec a takmer polovica doterajšieho „splácania“ je <b>Sofia</b> — vzdaná tržba, nie prijaté peniaze.
          Preto ber „priemer celé obdobie“ ako optimistický a tempo z hotovosti ako realistické dno.
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
          Od nuly k 1.1.2025: vklady {fmtCZK(vkladySpolu)} (z toho {fmtCZK(jk.vklady[0])} je zostatok z 2024) · splatené {fmtCZK(vSum(jk.splatkySpolu))} · k 1.1.2026 kontrolný bod {fmtCZK(DEBT_CHECKPOINT_2026.jarek)}, sedí.
        </div>
      </Card>

      <Card>
        <H3><Info text="Fix splátka je zároveň náklad v P&L aj zníženie dlhu. „Sofia“ a 20 % zľava z ročného nie sú bankové platby — sú to len dlhové operácie (vzdaná tržba). Vklad dlh naopak zvyšuje." label="Kanály splácania" /></H3>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 660 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 180, ...sticky(), zIndex: 2 }} />
                {MONTHS.map((m) => <th key={m} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{m}</th>)}
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Spolu</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.text, ...sticky() }}>
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
                  <td style={{ ...S.td, fontSize: 11, color: C.textMuted, paddingLeft: 26, ...sticky() }}>{k}</td>
                  {vals.map((v, i) => <td key={i} style={{ ...cell, fontSize: 11, color: v > 0 ? C.textMuted : C.textDim }}>{money(v)}</td>)}
                  <td style={{ ...cell, fontSize: 11, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(vSum(vals))}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...S.td, fontSize: 12, color: C.orange, ...sticky() }}>Vklad (zvyšuje dlh)</td>
                {jk.vklady.map((v, i) => <td key={i} style={{ ...cell, color: v > 0 ? C.orange : C.textDim }}>{money(v)}</td>)}
                <td style={{ ...cell, color: C.orange, borderLeft: `1px solid ${C.border}` }}>{money(vkladySpolu)}</td>
              </tr>
              <tr style={{ background: mix(C.accent, 10) }}>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 700, color: C.text, ...sticky(mix(C.accent, 10)) }}>Stav dlhu</td>
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
  const quarters = QUARTERS;
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
  const cur = a[a.length - 1];
  const prev = a[a.length - 2];
  const d = { prijmy: pct(cur.prijmy, prev.prijmy), naklady: pct(cur.naklady, prev.naklady), zisk: pct(cur.zisk, prev.zisk), marza: cur.marza - prev.marza };
  // Like for like: the same six months a year apart, plus the full 2025 for context.
  const h1_25 = agg([0, 1, 2, 3, 4, 5]);
  const h1_26 = agg(YEAR_IDX["2026"]);
  const rok25 = agg(YEAR_IDX["2025"]);
  const cell = { textAlign: "right" as const, padding: "8px 10px", fontSize: 13, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };
  const sub = { ...cell, fontSize: 11, color: C.textDim, padding: "4px 10px" };

  return (
    <>
      <Card>
        <H3><Info text="Rovnakých šesť mesiacov o rok neskôr — jediné poctivé porovnanie, keď z 2026 zatiaľ existuje len polrok. Celý rok 2025 je vedľa pre kontext." label="H1 2025 vs H1 2026" /></H3>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 520 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600, minWidth: 150 }}>Položka</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>H1 2025</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>H1 2026</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Zmena</th>
                <th style={{ ...cell, fontSize: 11, color: C.textDim, fontWeight: 600, borderLeft: `1px solid ${C.border}` }}>Celý 2025</th>
              </tr>
            </thead>
            <tbody>
              {([
                { l: "Tržby", k: "prijmy" as const, col: C.green },
                { l: "Náklady", k: "naklady" as const, col: C.red },
                { l: "Zisk", k: "zisk" as const, col: undefined },
              ]).map((row) => {
                const ch = pct(h1_26[row.k], h1_25[row.k]);
                return (
                  <tr key={row.l}>
                    <td style={{ ...S.td, fontSize: 13, color: C.text, fontWeight: row.k === "zisk" ? 700 : 400 }}>{row.l}</td>
                    <td style={{ ...cell, color: row.col ?? signColor(h1_25[row.k]) }}>{money(h1_25[row.k])}</td>
                    <td style={{ ...cell, color: row.col ?? signColor(h1_26[row.k]), fontWeight: row.k === "zisk" ? 700 : 400 }}>{money(h1_26[row.k])}</td>
                    <td style={{ ...cell, color: signColor((ch ?? 0) * (row.k === "naklady" ? -1 : 1)), borderLeft: `1px solid ${C.border}` }}>{pctStr(ch)}</td>
                    <td style={{ ...cell, fontSize: 12, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{money(rok25[row.k])}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>Marža</td>
                <td style={{ ...cell, fontSize: 12, color: h1_25.marza >= 0 ? C.orange : C.red }}>{h1_25.marza.toFixed(1)} %</td>
                <td style={{ ...cell, fontSize: 12, color: h1_26.marza >= VZAS_TARGETS.marzaPct ? C.green : h1_26.marza >= 0 ? C.orange : C.red }}>{h1_26.marza.toFixed(1)} %</td>
                <td style={{ ...cell, fontSize: 12, color: signColor(h1_26.marza - h1_25.marza), borderLeft: `1px solid ${C.border}` }}>
                  {h1_26.marza > h1_25.marza ? "▲" : "▼"} {Math.abs(h1_26.marza - h1_25.marza).toFixed(1)} b.p.
                </td>
                <td style={{ ...cell, fontSize: 12, color: C.textDim, borderLeft: `1px solid ${C.border}` }}>{rok25.marza.toFixed(1)} %</td>
              </tr>
            </tbody>
          </table>
        </ScrollX>
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 10, lineHeight: 1.55 }}>
          Za celý rok 2025 firma zarobila {money(rok25.zisk)}. Za prvý polrok 2026 je to {money(h1_26.zisk)} —
          <b> za polovicu času viac než za celý predchádzajúci rok</b>. Zdroj rozdielu nie sú tržby (tie rástli o {pctStr(pct(h1_26.prijmy, h1_25.prijmy))}), ale mzdový model.
        </div>
      </Card>

      <Card>
        <H3><Info text="Klikni na riadok Náklady — rozbalí sa na fixné, variabilné a výplaty. Stĺpec Zmena porovnáva posledný kvartál s predchádzajúcim." label="Kvartálne porovnanie" /></H3>
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
                  <td style={{ ...sub, borderLeft: `1px solid ${C.border}` }}>{pctStr(pct(cur[k], prev[k]))}</td>
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

// Two bars per month plus the gap between them as a percentage — the number
// that actually matters is not either bar, but how far apart they are.
function GroupedBars({ data, height = 250 }: { data: { label: string; prijmy: number; naklady: number }[]; height?: number }) {
  const plotH = height - 72;
  const max = Math.max(1, ...data.flatMap((d) => [d.prijmy, d.naklady]));
  const scrollRef = useScrollEnd<HTMLDivElement>(true, data.length);
  return (
    <>
      <div ref={scrollRef} style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {data.map((d, i) => {
          // How much revenue exceeded cost (or fell short of it), relative to cost.
          const diff = d.naklady !== 0 ? ((d.prijmy - d.naklady) / d.naklady) * 100 : 0;
          const good = diff >= 0;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 78px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: good ? C.green : C.red, marginBottom: 4, whiteSpace: "nowrap" }}>
                {good ? "+" : ""}{diff.toFixed(0)} %
              </div>
              <div style={{ height: plotH, display: "flex", alignItems: "flex-end", gap: 4, width: "100%", justifyContent: "center" }}>
                {([["prijmy", C.green], ["naklady", C.red]] as const).map(([k, col]) => (
                  <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 30px" }}>
                    <div style={{ fontSize: 9.5, color: C.textDim, marginBottom: 2, whiteSpace: "nowrap" }}>{Math.round(d[k] / 1000)}k</div>
                    <div title={`${d.label} · ${k === "prijmy" ? "príjmy" : "náklady"}: ${money(d[k])}`}
                      style={{ width: "100%", height: Math.max(2, (d[k] / max) * (plotH - 18)), background: col, borderRadius: "4px 4px 0 0" }} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 5, whiteSpace: "nowrap" }}>{d.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11.5, color: C.textMuted }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: C.green }} /> Príjmy</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: C.red }} /> Náklady</span>
        <span style={{ color: C.textDim }}>% = o koľko boli príjmy vyššie (zelené) alebo nižšie (červené) než náklady</span>
      </div>
    </>
  );
}

// ── Výhľad ───────────────────────────────────────────────────────────────────
// Costs split by how predictable they are: záväzné barely move (contracts, the
// state), voliteľné and revenue swing — so each gets the averaging it deserves,
// and the range comes from the spread of recent months rather than a guess.
function ForecastCard() {
  const p = pnlCalc();
  const b = byCommitment();
  const zav = commitmentTotal(b.zavazne);
  const vol = commitmentTotal(b.volitelne);
  const nep = commitmentTotal(b.neprevadzkove);
  const last = <T,>(a: T[], n: number) => a.slice(-n);
  const m3 = (v: Vals) => avg(last(v, 3));

  // Záväzné + výplaty are the stable core; voliteľné and tržby are the movers.
  const zavF = m3(zav);
  const volF = m3(vol);
  const vyplF = m3(p.vyplatySpolu);
  const nepF = m3(nep);
  const nakladyF = zavF + volF + vyplF + nepF;

  const trzby3 = m3(p.prijmy);
  const trzby6 = avg(p.prijmy);
  const trzbyLo = Math.min(trzby3, trzby6);
  const trzbyHi = Math.max(trzby3, trzby6);
  const ziskStred = trzby3 - nakladyF;
  const ziskLo = trzbyLo - nakladyF;
  const ziskHi = trzbyHi - nakladyF;

  const MN = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
  const nextMonths = [1, 2, 3].map((k) => {
    const d = new Date(2026, 5 + k, 1);
    return `${MN[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  });

  return (
    <Card>
      <H3>
        <Info text="Výhľad z histórie, nie z prianí. Náklady sa rátajú po zložkách: záväzné a výplaty sú stabilné (priemer 3 mes.), voliteľné kolíšu. Rozpätie zisku vychádza z rozdielu medzi 3- a 6-mesačným priemerom tržieb — čím sú tržby nevyrovnanejšie, tým je pásmo širšie. Nezohľadňuje sezónnosť ani jednorazové platby (napr. ročný hosting)." label="Výhľad na ďalšie 3 mesiace" />
      </H3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
        <StatCard value={fmtCZK(trzby3)} label="Očak. tržby / mes." color={C.green} />
        <StatCard value={fmtCZK(nakladyF)} label="Očak. náklady / mes." color={C.red} />
        <StatCard value={fmtCZK(ziskStred)} label="Očak. zisk / mes." color={signColor(ziskStred)} />
        <StatCard value={`${fmtCZK(ziskLo)} – ${fmtCZK(ziskHi)}`} label="Pásmo zisku" color={C.blue} />
      </div>
      <div style={{ fontSize: 11.5, color: C.textMuted, margin: "6px 0 14px", lineHeight: 1.55 }}>
        Náklady sa skladajú zo: záväzné {fmtCZK(zavF)} + voliteľné {fmtCZK(volF)} + výplaty {fmtCZK(vyplF)}
        {nepF !== 0 && <> + neprevádzkové {fmtCZK(nepF)}</>}. Za {nextMonths.join(", ")} to spolu vychádza
        na zisk <b style={{ color: signColor(ziskStred * 3) }}>{fmtCZK(ziskStred * 3)}</b>.
      </div>
      <LineChart
        data={[
          ...MONTHS.map((m, i) => ({ label: m, values: [p.prijmy[i], p.celkoveNaklady[i]] })),
          ...nextMonths.map((m) => ({ label: `${m} ⌁`, values: [trzby3, nakladyF] })),
        ]}
        series={[{ name: "Tržby", color: C.green }, { name: "Náklady", color: C.red }]}
        height={210}
        fmt={(n) => `${Math.round(n / 1000)}k`}
        autoY
        alignEnd
      />
      <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>Posledné tri body (⌁) sú odhad, nie skutočnosť.</div>
    </Card>
  );
}

const PEOPLE: PersonKey[] = ["jerry", "terezka"];

// Numbers say what happened; the note says why. Opens with an auto-computed
// "what was different" list so the answer usually doesn't have to be recalled.
function MonthNoteRow({ mi, colSpan, notes, onSaved }: {
  mi: number; colSpan: number; notes: Record<string, MonthNote>; onSaved: (n: MonthNote) => void;
}) {
  const key = monthKeyOf(mi);
  const existing = notes[key];
  // Until a month is saved in the app, fall back to what Jerry already wrote in
  // the Excel so nothing has to be retyped.
  const [note, setNote] = useState(existing?.note ?? SEED_NOTES[key] ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(
    existing?.answers && Object.keys(existing.answers).length ? existing.answers : (SEED_ANSWERS[key] ?? {}),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const devs = useMemo(() => monthDeviations(mi), [mi]);

  const save = async () => {
    setSaving(true);
    const ok = await saveMonthNote(key, note, answers);
    setSaving(false);
    if (ok) {
      setSaved(true);
      onSaved({ month: key, note, answers });
      setTimeout(() => setSaved(false), 2200);
    }
  };
  const field: React.CSSProperties = {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 12.5, padding: "8px 10px", fontFamily: "inherit", resize: "vertical",
  };

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "14px 16px", background: mix(C.accent, 5), borderBottom: `1px solid ${mix(C.border, 55)}` }}>
        {devs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>
              Čo bolo v tomto mesiaci iné
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {devs.map((d) => (
                <div key={d.label} style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.5 }}>
                  <b style={{ color: C.text }}>{d.label}</b> <span style={{ color: C.textDim }}>· {d.group}</span> —{" "}
                  <b style={{ color: d.diff > 0 ? (d.group === "Príjmy" ? C.green : C.red) : d.group === "Príjmy" ? C.red : C.green }}>
                    {money(d.value)}
                  </b>{" "}
                  namiesto obvyklých {money(Math.round(d.typical))}{" "}
                  <span style={{ color: d.diff > 0 ? C.red : C.green }}>({d.diff > 0 ? "+" : ""}{money(Math.round(d.diff))})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 9 }}>Otázky na tento mesiac</div>

        <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
          {MONTH_QUESTIONS.map((q) => (
            <div key={q.id}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 5 }}>
                {q.q}
              </div>
                              // One box per founder, stacked; the placeholder says whose it is.
                <div style={{ display: "grid", gap: 6 }}>
                  {PEOPLE.map((pk) => (
                    <textarea
                      key={pk}
                      value={answers[answerKey(q.id, pk)] ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [answerKey(q.id, pk)]: e.target.value })}
                      rows={(answers[answerKey(q.id, pk)] ?? "").length > 90 ? 3 : 1}
                      placeholder={SALARY[pk].label}
                      style={{ ...field, padding: "6px 10px" }} />
                  ))}
                </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Voľná poznámka</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={field}
          placeholder="Čokoľvek, čo by si o tomto mesiaci chcel vedieť o rok…" />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <button onClick={save} disabled={saving}
            style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 12.5, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Ukladám…" : "Uložiť"}
          </button>
          {saved && <span style={{ fontSize: 12, color: C.green }}>✓ Uložené</span>}
          {existing?.updatedAt && !saved && (
            <span style={{ fontSize: 11, color: C.textDim }}>Naposledy {new Date(existing.updatedAt).toLocaleDateString("sk-SK")}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// Energy is logged weekly (Tréningy → Prehľad); here it is only averaged per
// month, so nobody is asked the same question twice. "Iné hodiny" is summed —
// it is the work the salary model never sees.
function EnergyTrendCard({ idx }: { idx: number[] }) {
  const [weeks, setWeeks] = useState<Record<string, WeekEntry>>({});
  useEffect(() => { fetchWeekEntries().then(setWeeks); }, []);
  const perMonth = useMemo(() => {
    const acc: Record<string, { scores: Record<string, number[]>; hours: Record<string, number> }> = {};
    for (const [wk, e] of Object.entries(weeks)) {
      const m = wk.slice(0, 7);
      const a = (acc[m] ||= { scores: { jerry: [], terezka: [] }, hours: { jerry: 0, terezka: 0 } });
      for (const p of ["jerry", "terezka"] as const) {
        const sc = Number(e[`${p}_score`]);
        if (sc > 0) a.scores[p].push(sc);
        const h = Number(e[`${p}_hours`]);
        if (h > 0) a.hours[p] += h;
      }
    }
    return acc;
  }, [weeks]);

  // Weekly logging only started in 2026, so showing 18 months here would be a
  // year of flat zeros — only months that carry data are charted.
  const rows = idx.map((i) => {
    const a = perMonth[monthKeyOf(i)];
    const avg1 = (arr?: number[]) => (arr && arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null);
    return { label: MONTHS[i], i, jerry: avg1(a?.scores.jerry), terezka: avg1(a?.scores.terezka), hJ: a?.hours.jerry ?? 0, hT: a?.hours.terezka ?? 0 };
  }).filter((r) => r.jerry != null || r.terezka != null || r.hJ > 0 || r.hT > 0);
  const any = rows.some((r) => r.jerry != null || r.terezka != null);

  return (
    <Card>
      <H3>
        <Info text="Priemer týždenných hodnotení energie za mesiac (1 = na dne, 10 = plná sila). Zadáva sa raz týždenne v Tréningy → Prehľad, kde sedí vedľa odtrénovaných hodín. Klesajúca krivka pri rastúcej záťaži je varovanie skôr, než sa to prejaví na výkone." label="Energia a vyhorenie" />
      </H3>
      {any ? (
        <>
          <LineChart
            data={rows.map((r) => ({ label: r.label, values: [r.jerry ?? 0, r.terezka ?? 0] }))}
            series={[{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.blue }]}
            height={200}
            fmt={(n) => n.toFixed(1)}
            zone={{ lo: 6, hi: 10 }}
            alignEnd
          />
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 8 }}>
            Zelené pásmo 6–10 je zdravé. Iné hodiny mimo tréningov za obdobie: Jerry{" "}
            <b>{rows.reduce((a, r) => a + r.hJ, 0)} h</b>, Terezka <b>{rows.reduce((a, r) => a + r.hT, 0)} h</b>.
          </div>
        </>
      ) : (
        <Empty>Zatiaľ žiadne týždenné hodnotenia — vyplň ich v Tracker → Tréningy → Prehľad (klik na týždeň).</Empty>
      )}
    </Card>
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
  const [openNote, setOpenNote] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<string, MonthNote>>({});
  useEffect(() => { fetchMonthNotes().then(setNotes); }, []);
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
      <HealthCard idx={idx} />
      <ForecastCard />
      <EnergyTrendCard idx={idx} />

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Vyber ukazovateľ a obdobie — graf, priemer aj najlepší/najhorší mesiac sa prepočítajú." label="Mesačné výsledky" /></H3>
          <RangeBar r={r} extra={<Select value={metric} onChange={setMetric} options={METRICS} />} />
        </div>
      </Card>

      {/* Príjmy/náklady are two sides of one comparison — show them together with
          the gap in %. Zisk/marža stand alone, so they keep the signed bars. */}
      <Card>
        {metric === "prijmy" || metric === "naklady" ? (
          <>
            <H3><Info text="Príjmy a náklady vedľa seba po mesiacoch. Percento nad dvojicou je rozdiel medzi nimi — o koľko boli príjmy vyššie než náklady. Záporné číslo znamená stratový mesiac." label="Príjmy vs. náklady po mesiacoch" /></H3>
            <GroupedBars data={sel.map((s) => ({ label: s.label, prijmy: p.prijmy[s.i], naklady: p.celkoveNaklady[s.i] }))} />
          </>
        ) : (
          <>
            <H3>{METRICS.find((m) => m.value === metric)?.label} po mesiacoch</H3>
            <SignedBars
              data={sel.map((s) => ({ label: s.label, value: s.v }))}
              posColor={metric === "zisk" ? C.accent : C.green}
              fmt={(n) => (isPct ? `${n.toFixed(1)}%` : `${Math.round(n / 1000)}k`)}
              height={220}
            />
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>Červené stĺpce pod nulou = záporná hodnota.</div>
          </>
        )}
      </Card>

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
                const nKey = monthKeyOf(i);
                const hasNote = !!(
                  notes[nKey]?.note ||
                  Object.values(notes[nKey]?.answers ?? {}).some(Boolean) ||
                  SEED_NOTES[nKey] ||
                  SEED_ANSWERS[nKey]
                );
                return (
                  <Fragment key={i}>
                  <tr>
                    <td onClick={() => setOpenNote(openNote === i ? null : i)}
                      style={{ padding: "7px 10px", fontSize: 12.5, color: C.text, borderBottom: `1px solid ${mix(C.border, 55)}`, cursor: "pointer", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-block", width: 14, color: C.textDim, fontSize: 9 }}>{openNote === i ? "▼" : "▶"}</span>
                      {MONTHS[i]}
                      {hasNote && <span title="má poznámku" style={{ marginLeft: 6, color: C.accent, fontSize: 11 }}>●</span>}
                    </td>
                    <td style={{ ...cell, color: C.green }}>{money(p.prijmy[i])}</td>
                    <td style={{ ...cell, color: C.red }}>{money(p.celkoveNaklady[i])}</td>
                    <td style={{ ...cell, color: signColor(p.hrubyZisk[i]), fontWeight: 600 }}>{money(p.hrubyZisk[i])}</td>
                    <td style={{ ...cell, color: p.marza[i] >= VZAS_TARGETS.marzaPct ? C.green : p.marza[i] >= 0 ? C.orange : C.red }}>{p.marza[i].toFixed(1)}%</td>
                    <td style={{ ...cell, color: prev == null ? C.textDim : signColor(p.hrubyZisk[i] - prev), borderLeft: `1px solid ${C.border}` }}>{prev == null ? "—" : pctStr(pct(p.hrubyZisk[i], prev))}</td>
                  </tr>
                  {openNote === i && (
                    <MonthNoteRow mi={i} colSpan={6} notes={notes}
                      onSaved={(nn) => setNotes((prevN) => ({ ...prevN, [nn.month]: nn }))} />
                  )}
                  </Fragment>
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
  const [year, setYear] = useState("2026");
  const idx = YEAR_IDX[year];
  const t = VZAS_TARGETS_BY_YEAR[year];
  const trzby = vSum(pick(p.prijmy, idx));
  const zisk = vSum(pick(p.hrubyZisk, idx));
  const marza = trzby > 0 ? (zisk / trzby) * 100 : 0;
  const plan = (t.rocneTrzby / 12) * idx.length;
  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <H3><Info text="Kľúčové ukazovatele voči cieľom daného roka. Ročný cieľ tržieb sa prepočítava na uplynulé mesiace — porovnávať polrok s celoročným cieľom by ukazovalo ~50 % a vyzeralo by to ako zaostávanie, hoci ste na pláne." label={`KPI voči cieľom ${year}`} /></H3>
          <div style={{ display: "flex", gap: 4 }}>
            {Object.keys(VZAS_TARGETS_BY_YEAR).map((y) => (
              <button key={y} onClick={() => setYear(y)}
                style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${year === y ? C.accent : C.border}`, background: year === y ? C.accentBg : "transparent", color: year === y ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer" }}>
                {y}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <KpiCard
            label={<Info text={`Ročný cieľ ${fmtCZK(t.rocneTrzby)} prepočítaný na ${idx.length} z 12 mesiacov = ${fmtCZK(plan)}.`} label={`Tržby / plán za ${idx.length} mes.`} />}
            value={trzby}
            target={plan}
            unit=" Kč"
          />
          <KpiCard label={<Info text={`Cieľ roka ${year} bol ${t.marzaPct} %. Pre 2026 je to medzikrok 12–15 %, dlhodobo 20 %.`} label={`Marža ${year}`} />} value={marza} target={t.marzaPct} unit=" %" />
          <KpiCard label="Ø hodín/mes · Jerry" value={avg(pick(SALARY.jerry.hours, idx))} target={t.hodinyJerry} unit="h" />
          <KpiCard label="Ø hodín/mes · Terezka" value={avg(pick(SALARY.terezka.hours, idx))} target={t.hodinyTerezka} unit="h" />
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
          { id: "pnl", label: "VZAS P&L" },
          { id: "vyplaty", label: "J&T Výplaty" },
          { id: "cashflow", label: "Cashflow" },
          { id: "jarek", label: "Jarek dlh" },
          { id: "vysledky", label: "Výsledky" },
        ]}
        value={isVysledky ? "vysledky" : sub}
        onChange={onSub}
      />
      {sub === "pnl" && <PnlTab />}
      {sub === "vyplaty" && <SalaryTab />}
      {sub === "cashflow" && <CashflowTab />}
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
