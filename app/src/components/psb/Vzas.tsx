import { useState, type ReactNode } from "react";

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
  vAdd,
  vSum,
  type PersonKey,
  type Vals,
} from "../../lib/psb/vzas";
import { Card, Empty, H3, Info, StatCard, SubTabs } from "./ui";

const MONTHS = VZAS_MONTH_LABELS;
const money = (n: number) => (n === 0 ? "—" : fmtCZK(n).replace(" CZK", ""));
const signColor = (n: number) => (n > 0 ? C.green : n < 0 ? C.red : C.textMuted);

// ── shared table pieces ──────────────────────────────────────────────────────
function MonthHead({ first = "Položka" }: { first?: string }) {
  const th = (extra?: object) => ({
    textAlign: "right" as const,
    padding: "8px 10px",
    fontSize: 11,
    color: C.textMuted,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
    ...extra,
  });
  return (
    <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
      <th style={{ ...th(), textAlign: "left", minWidth: 190 }}>{first}</th>
      {MONTHS.map((m) => (
        <th key={m} style={th()}>{m}</th>
      ))}
      <th style={th({ borderLeft: `1px solid ${C.border}` })}>Celkom</th>
    </tr>
  );
}

function Row({
  label,
  values,
  depth = 0,
  bold = false,
  color,
  children,
  showTotal = true,
}: {
  label: ReactNode;
  values: Vals;
  depth?: number;
  bold?: boolean;
  color?: string;
  children?: ReactNode;
  showTotal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasKids = !!children;
  const fs = depth === 0 ? 13 : 12;
  const cell = {
    textAlign: "right" as const,
    padding: "6px 10px",
    fontSize: fs,
    fontWeight: bold ? 600 : 400,
    fontVariantNumeric: "tabular-nums" as const,
    borderBottom: `1px solid ${mix(C.border, 55)}`,
    whiteSpace: "nowrap" as const,
  };
  return (
    <>
      <tr
        onClick={() => hasKids && setOpen(!open)}
        style={{
          background: depth === 0 ? mix(C.accent, 7) : "transparent",
          cursor: hasKids ? "pointer" : "default",
        }}
      >
        <td
          style={{
            padding: "6px 10px",
            paddingLeft: depth * 16 + 10,
            fontSize: fs,
            fontWeight: bold ? 600 : 400,
            color: C.text,
            whiteSpace: "nowrap",
            borderBottom: `1px solid ${mix(C.border, 55)}`,
          }}
        >
          <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>
            {hasKids ? (open ? "▼" : "▶") : ""}
          </span>
          {label}
        </td>
        {values.map((v, i) => (
          <td key={i} style={{ ...cell, color: color || (v < 0 ? C.red : C.textMuted) }}>
            {money(v)}
          </td>
        ))}
        <td style={{ ...cell, color: color || (vSum(values) < 0 ? C.red : C.text), borderLeft: `1px solid ${C.border}`, fontWeight: 600 }}>
          {showTotal ? money(vSum(values)) : ""}
        </td>
      </tr>
      {open && children}
    </>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={MONTHS.length + 2}
        style={{
          padding: "14px 10px 5px",
          fontSize: 11,
          fontWeight: 700,
          color: C.accent,
          textTransform: "uppercase",
          letterSpacing: 1,
          borderBottom: `1px solid ${mix(C.accent, 30)}`,
        }}
      >
        {label}
      </td>
    </tr>
  );
}

// Emphasised total line (Celkové náklady / Hrubý zisk).
function TotalRow({ label, values, color, big = false }: { label: string; values: Vals; color: string; big?: boolean }) {
  const cell = {
    textAlign: "right" as const,
    padding: big ? "10px" : "8px 10px",
    fontWeight: 700,
    fontSize: big ? 14 : 13,
    color,
    fontVariantNumeric: "tabular-nums" as const,
    whiteSpace: "nowrap" as const,
  };
  return (
    <tr style={{ background: big ? mix(C.accent, 12) : "transparent", borderTop: `2px solid ${mix(C.accent, 45)}` }}>
      <td style={{ padding: big ? "10px" : "8px 10px", fontWeight: 700, fontSize: big ? 14 : 13, color: C.text, whiteSpace: "nowrap" }}>{label}</td>
      {values.map((v, i) => (
        <td key={i} style={cell}>{money(v)}</td>
      ))}
      <td style={{ ...cell, borderLeft: `1px solid ${C.border}` }}>{money(vSum(values))}</td>
    </tr>
  );
}

function ScrollX({ children }: { children: ReactNode }) {
  return <div style={{ overflowX: "auto" }}>{children}</div>;
}

const tableStyle = { width: "100%", borderCollapse: "collapse" as const, minWidth: 720 };

// ── P&L ──────────────────────────────────────────────────────────────────────
function PnlTab() {
  const p = pnlCalc();
  const totalMarza = vSum(p.prijmy) > 0 ? (vSum(p.hrubyZisk) / vSum(p.prijmy)) * 100 : 0;

  return (
    <>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 4 }}>
          <StatCard value={fmtCZK(vSum(p.prijmy))} label="Príjmy · H1 2026" color={C.green} />
          <StatCard value={fmtCZK(vSum(p.celkoveNaklady))} label="Náklady · H1 2026" color={C.red} />
          <StatCard value={fmtCZK(vSum(p.hrubyZisk))} label="Hrubý zisk · H1" color={signColor(vSum(p.hrubyZisk))} />
          <StatCard
            value={`${totalMarza.toFixed(1)} %`}
            label={<Info text={`Cieľ marže je 12–15 % (medzikrok), dlhodobo 20 %. Aktuálne ${totalMarza.toFixed(1)} %.`} label="Marža · H1" />}
            color={totalMarza >= VZAS_TARGETS.marzaPct ? C.green : totalMarza >= 0 ? C.orange : C.red}
          />
        </div>
      </Card>

      <Card>
        <H3>
          <Info
            text="Mesačný výkaz ziskov a strát. Klikni na kategóriu pre rozklad na jednotlivé položky. Hrubý zisk = Celkové príjmy − Celkové náklady (vrátane výplat)."
            label="VZAS 2026 — mesačný P&L"
          />
        </H3>
        <ScrollX>
          <table style={tableStyle}>
            <thead><MonthHead /></thead>
            <tbody>
              <Divider label="Fixné náklady" />
              {Object.entries(PNL.fixne.subcategories).map(([k, g]) => (
                <Row key={k} label={g.label} values={sumItems(g.items)} depth={0}>
                  {Object.entries(g.items).map(([ik, it]) => (
                    <Row key={ik} label={it.label} values={it.values} depth={1} />
                  ))}
                </Row>
              ))}
              <Row label="Fixné náklady spolu" values={sumSection(PNL.fixne)} bold color={C.red} />

              <Divider label="Variabilné náklady" />
              {Object.entries(PNL.variabilne.subcategories).map(([k, g]) => (
                <Row key={k} label={g.label} values={sumItems(g.items)} depth={0}>
                  {Object.entries(g.items).map(([ik, it]) => (
                    <Row key={ik} label={it.label} values={it.values} depth={1} />
                  ))}
                </Row>
              ))}
              <Row label="Variabilné náklady spolu" values={sumSection(PNL.variabilne)} bold color={C.red} />

              <Divider label="Bez výplat" />
              <Row label="Fix + Var bez výplat" values={p.bezVyplat} bold />

              <Divider label="Výplaty" />
              <Row label="Jerry (Poslané)" values={p.poslaneJerry} />
              <Row label="Terezka (Poslané)" values={p.poslaneTerezka} />
              <Row label={<Info text="Matyáš bol zamestnanec jan–mar 2026 — nemá nárokovo-dlhovú logiku zakladateľov, len mzdový náklad." label="Matyáš (zamestnanec, jan–mar)" />} values={p.matyas} />
              <Row label="Výplaty spolu" values={p.vyplatySpolu} bold color={C.red} />

              <TotalRow label="Celkové náklady" values={p.celkoveNaklady} color={C.red} />

              <Divider label="Tržby & Príjmy" />
              <Row label="Celkové príjmy" values={p.prijmy} bold color={C.green} />

              <TotalRow label="Hrubý zisk" values={p.hrubyZisk} color={signColor(vSum(p.hrubyZisk))} big />
              <tr>
                <td style={{ padding: "5px 10px", fontSize: 11, color: C.textMuted }}>Marža %</td>
                {p.marza.map((v, i) => (
                  <td key={i} style={{ textAlign: "right", padding: "5px 10px", fontSize: 11, fontVariantNumeric: "tabular-nums", color: v >= VZAS_TARGETS.marzaPct ? C.green : v >= 0 ? C.orange : C.red }}>
                    {v.toFixed(1)}%
                  </td>
                ))}
                <td style={{ textAlign: "right", padding: "5px 10px", fontSize: 11, color: C.textMuted, borderLeft: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" }}>
                  {totalMarza.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </ScrollX>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
          Zdroj: VZAS 2026 (Excel), jan–jún 2026. Bankový import a automatická klasifikácia pribudnú v ďalšom kroku.
        </div>
      </Card>
    </>
  );
}

// ── J&T Výplaty ──────────────────────────────────────────────────────────────
function PersonCard({ pk }: { pk: PersonKey }) {
  const [open, setOpen] = useState(false);
  const s = SALARY[pk];
  const c = salaryCalc(pk);
  const konecny = c.cumDebt[c.cumDebt.length - 1];
  const cell = { textAlign: "right" as const, padding: "5px 8px", fontSize: 12, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };

  return (
    <Card>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            <span style={{ display: "inline-block", width: 15, color: C.textDim, fontSize: 9 }}>{open ? "▼" : "▶"}</span>
            {s.label}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginLeft: 15 }}>
            Fix {fmtCZK(s.fix)} + variabil nad {s.hoursThreshold}h × {s.hourlyRate} Kč/h
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: C.textMuted }}>Kumulovaný dlh k jún 26</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: signColor(konecny), fontVariantNumeric: "tabular-nums" }}>{fmtCZK(konecny)}</div>
        </div>
      </div>

      {open && (
        <ScrollX>
          <table style={{ ...tableStyle, marginTop: 12, minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 150 }} />
                {MONTHS.map((m) => (
                  <th key={m} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>Hodiny</td>
                {s.hours.map((v, i) => <td key={i} style={{ ...cell, color: C.text }}>{v}</td>)}
              </tr>
              <tr>
                <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>Fix</td>
                {MONTHS.map((_, i) => <td key={i} style={{ ...cell, color: C.text }}>{money(s.fix)}</td>)}
              </tr>
              <tr>
                <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>Variabil</td>
                {c.variabil.map((v, i) => <td key={i} style={{ ...cell, color: C.text }}>{money(v)}</td>)}
              </tr>
              <tr style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.text }}>Nárok</td>
                {c.narok.map((v, i) => <td key={i} style={{ ...cell, color: C.green, fontWeight: 600 }}>{money(v)}</td>)}
              </tr>

              <tr>
                <td colSpan={MONTHS.length + 1} style={{ padding: "10px 8px 3px", fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                  Poslané — kanály
                </td>
              </tr>
              {Object.entries(s.personal).map(([k, vals]) => (
                <tr key={k}>
                  <td style={{ padding: "3px 8px 3px 20px", fontSize: 11, color: C.textMuted }}>{k}</td>
                  {vals.map((v, i) => <td key={i} style={{ ...cell, fontSize: 11, color: v > 0 ? C.text : C.textDim }}>{money(v)}</td>)}
                </tr>
              ))}
              <tr>
                <td style={{ padding: "3px 8px 3px 20px", fontSize: 11, color: C.orange, fontStyle: "italic" }}>+ Spoločné / 2</td>
                {c.spolocneHalf.map((v, i) => <td key={i} style={{ ...cell, fontSize: 11, color: C.orange }}>{money(v)}</td>)}
              </tr>
              <tr style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.text }}>Poslané spolu</td>
                {c.poslane.map((v, i) => <td key={i} style={{ ...cell, color: C.red, fontWeight: 600 }}>{money(v)}</td>)}
              </tr>
              <tr style={{ background: mix(C.accent, 10), borderTop: `2px solid ${mix(C.accent, 40)}` }}>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 700, color: C.text }}>
                  <Info text="Rozdiel = Nárok − Poslané. Kladný = firma dlží trénerovi (spláca sa pôžička). Záporný = tréner si vzal viac než nárok (nová pôžička)." label="Rozdiel" />
                </td>
                {c.rozdiel.map((v, i) => <td key={i} style={{ ...cell, color: signColor(v), fontWeight: 700 }}>{money(v)}</td>)}
              </tr>
              <tr>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.text }}>
                  <Info text={`Kumulovaný dlh(N) = dlh(N−1) + Rozdiel(N). Počiatočný stav k 1.1.2026: ${fmtCZK(DEBT_OPENING[pk])}.`} label="Kumulovaný dlh" />
                </td>
                {c.cumDebt.map((v, i) => <td key={i} style={{ ...cell, color: signColor(v), fontWeight: 600 }}>{money(v)}</td>)}
              </tr>
            </tbody>
          </table>
        </ScrollX>
      )}
    </Card>
  );
}

function SalaryTab() {
  const total = spolocneTotal();
  const half = spolocneHalf();
  const jarek = jarekCalc();
  const cell = { textAlign: "right" as const, padding: "5px 8px", fontSize: 12, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };

  return (
    <>
      <PersonCard pk="jerry" />
      <PersonCard pk="terezka" />

      <Card>
        <H3>
          <Info text="Spoločné výdavky domácnosti sa sčítajú a rozdelia na polovicu — polovica vstupuje do „Poslané“ Jerrymu, polovica Terezke." label="Spoločné výdavky (delia sa /2)" />
        </H3>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 150 }} />
                {MONTHS.map((m) => <th key={m} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(SPOLOCNE).map(([k, vals]) => (
                <tr key={k}>
                  <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>{k}</td>
                  {vals.map((v, i) => <td key={i} style={{ ...cell, color: v > 0 ? C.text : C.textDim }}>{money(v)}</td>)}
                </tr>
              ))}
              <tr style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.orange }}>Spolu</td>
                {total.map((v, i) => <td key={i} style={{ ...cell, color: C.orange, fontWeight: 600 }}>{money(v)}</td>)}
              </tr>
              <tr>
                <td style={{ ...S.td, fontSize: 12, color: C.orange, fontStyle: "italic" }}>→ na osobu (/2)</td>
                {half.map((v, i) => <td key={i} style={{ ...cell, color: C.orange, fontStyle: "italic" }}>{money(v)}</td>)}
              </tr>
            </tbody>
          </table>
        </ScrollX>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <H3>
            <Info text="Externý investor. Fix splátka je zároveň náklad v P&L aj zníženie dlhu. „Sofia“ a 20 % zľava z ročného nie sú bankové platby — sú to len dlhové operácie (vzdaná tržba)." label="Jarek — externý investor" />
          </H3>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.textMuted }}>Stav dlhu k jún 26</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.red, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(jarek.stav[jarek.stav.length - 1])}</div>
          </div>
        </div>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.textMuted, minWidth: 170 }} />
                {MONTHS.map((m) => <th key={m} style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(JAREK_SPLATKY).map(([k, vals]) => (
                <tr key={k}>
                  <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>{k}</td>
                  {vals.map((v, i) => <td key={i} style={{ ...cell, color: v > 0 ? C.text : C.textDim }}>{money(v)}</td>)}
                </tr>
              ))}
              <tr style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 600, color: C.text }}>Splátka spolu</td>
                {jarek.splatkySpolu.map((v, i) => <td key={i} style={{ ...cell, color: C.green, fontWeight: 600 }}>{money(v)}</td>)}
              </tr>
              <tr style={{ background: mix(C.accent, 10) }}>
                <td style={{ ...S.td, fontSize: 12, fontWeight: 700, color: C.text }}>Stav dlhu</td>
                {jarek.stav.map((v, i) => <td key={i} style={{ ...cell, color: C.red, fontWeight: 700 }}>{money(v)}</td>)}
              </tr>
            </tbody>
          </table>
        </ScrollX>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>Počiatočný stav k 1.1.2026: {fmtCZK(DEBT_OPENING.jarek)}.</div>
      </Card>
    </>
  );
}

// ── Výsledky ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, target, unit = "", higherIsBetter = true }: { label: ReactNode; value: number; target?: number; unit?: string; higherIsBetter?: boolean }) {
  const pct = target ? (value / target) * 100 : 0;
  const good = higherIsBetter ? pct >= 100 : pct <= 100;
  const color = !target ? C.accentLight : good ? C.green : pct >= 75 ? C.orange : C.red;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
        {unit === " Kč" ? fmtCZK(value) : `${Math.round(value)}${unit}`}
      </div>
      {target != null && (
        <div style={{ fontSize: 11, color, marginTop: 4 }}>
          Cieľ: {unit === " Kč" ? fmtCZK(target) : `${target}${unit}`} ({pct.toFixed(0)} %)
        </div>
      )}
    </div>
  );
}

function QuarterCard({ label, prijmy, naklady }: { label: string; prijmy: number; naklady: number }) {
  const zisk = prijmy - naklady;
  const marza = prijmy > 0 ? (zisk / prijmy) * 100 : 0;
  const line = (l: string, v: string, color: string, bold = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 13 : 12, color: C.textMuted, marginBottom: 4, fontWeight: bold ? 600 : 400 }}>
      <span>{l}</span>
      <span style={{ color, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 10 }}>{label}</div>
      {line("Tržby", fmtCZK(prijmy), C.green)}
      {line("Náklady", fmtCZK(naklady), C.red)}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 2 }}>
        {line("Zisk", fmtCZK(zisk), signColor(zisk), true)}
      </div>
      <div style={{ fontSize: 11, color: marza >= VZAS_TARGETS.marzaPct ? C.green : marza >= 0 ? C.orange : C.red, marginTop: 2 }}>
        Marža: {marza.toFixed(1)} %
      </div>
    </div>
  );
}

function ResultsTab() {
  const p = pnlCalc();
  const q = (from: number, to: number) => ({
    prijmy: vSum(p.prijmy.slice(from, to)),
    naklady: vSum(p.celkoveNaklady.slice(from, to)),
  });
  const q1 = q(0, 3);
  const q2 = q(3, 6);
  const marzaH1 = vSum(p.prijmy) > 0 ? (vSum(p.hrubyZisk) / vSum(p.prijmy)) * 100 : 0;
  const cell = { textAlign: "right" as const, padding: "7px 10px", fontSize: 12.5, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const, borderBottom: `1px solid ${mix(C.border, 55)}` };

  return (
    <>
      <Card>
        <H3>Kvartálne výsledky</H3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <QuarterCard label="Q1 2026" {...q1} />
          <QuarterCard label="Q2 2026" {...q2} />
        </div>
      </Card>

      <Card>
        <H3>Mesačné výsledky</H3>
        <ScrollX>
          <table style={{ ...tableStyle, minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Mesiac</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Príjmy</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Náklady</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Zisk</th>
                <th style={{ ...cell, fontSize: 11, color: C.textMuted, fontWeight: 600, borderBottom: "none" }}>Marža</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m, i) => (
                <tr key={m}>
                  <td style={{ padding: "7px 10px", fontSize: 12.5, color: C.text, borderBottom: `1px solid ${mix(C.border, 55)}` }}>{m} 26</td>
                  <td style={{ ...cell, color: C.green }}>{money(p.prijmy[i])}</td>
                  <td style={{ ...cell, color: C.red }}>{money(p.celkoveNaklady[i])}</td>
                  <td style={{ ...cell, color: signColor(p.hrubyZisk[i]), fontWeight: 600 }}>{money(p.hrubyZisk[i])}</td>
                  <td style={{ ...cell, color: p.marza[i] >= VZAS_TARGETS.marzaPct ? C.green : p.marza[i] >= 0 ? C.orange : C.red }}>{p.marza[i].toFixed(1)}%</td>
                </tr>
              ))}
              <tr style={{ background: mix(C.accent, 10) }}>
                <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: C.text }}>Spolu H1</td>
                <td style={{ ...cell, color: C.green, fontWeight: 700, borderBottom: "none" }}>{money(vSum(p.prijmy))}</td>
                <td style={{ ...cell, color: C.red, fontWeight: 700, borderBottom: "none" }}>{money(vSum(p.celkoveNaklady))}</td>
                <td style={{ ...cell, color: signColor(vSum(p.hrubyZisk)), fontWeight: 700, borderBottom: "none" }}>{money(vSum(p.hrubyZisk))}</td>
                <td style={{ ...cell, color: marzaH1 >= VZAS_TARGETS.marzaPct ? C.green : C.orange, fontWeight: 700, borderBottom: "none" }}>{marzaH1.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </ScrollX>
      </Card>

      <Card>
        <H3>
          <Info text="Kľúčové ukazovatele voči cieľom roka 2026. Ročné tržby sa porovnávajú voči cieľu 2,3 mil. Kč — H1 je polovica roka, takže ~50 % je na pláne." label="KPI voči cieľom 2026" />
        </H3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <KpiCard label="Tržby H1 / ročný cieľ" value={vSum(PRIJMY)} target={VZAS_TARGETS.rocneTrzby} unit=" Kč" />
          <KpiCard label="Marža H1" value={marzaH1} target={VZAS_TARGETS.marzaPct} unit=" %" />
          <KpiCard label="Ø hodín/mes · Jerry" value={vSum(SALARY.jerry.hours) / MONTHS.length} target={VZAS_TARGETS.hodinyJerry} unit="h" />
          <KpiCard label="Ø hodín/mes · Terezka" value={vSum(SALARY.terezka.hours) / MONTHS.length} target={VZAS_TARGETS.hodinyTerezka} unit="h" />
        </div>
      </Card>

      <Card>
        <H3>Vybavenie a Ciele 2026</H3>
        <Empty>Editovateľné zoznamy pribudnú v ďalšej fáze.</Empty>
      </Card>
    </>
  );
}

// ── module shell ─────────────────────────────────────────────────────────────
export function Vzas({ sub, onSub }: { sub: string; onSub: (s: string) => void }) {
  return (
    <>
      <SubTabs
        tabs={[
          { id: "pnl", label: "VZAS 2026" },
          { id: "vyplaty", label: "J&T Výplaty" },
          { id: "vysledky", label: "Výsledky" },
        ]}
        value={sub}
        onChange={onSub}
      />
      {sub === "pnl" && <PnlTab />}
      {sub === "vyplaty" && <SalaryTab />}
      {sub === "vysledky" && <ResultsTab />}
    </>
  );
}
