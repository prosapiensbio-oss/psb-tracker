import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { C, mix, S, badge } from "../../lib/psb/theme";

// Scrolls a horizontally-overflowing container to its right edge on mount/update
// so charts open showing the most recent data (user scrolls left into the past).
export function useScrollEnd<T extends HTMLElement>(enabled: boolean, dep: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const toEnd = () => { el.scrollLeft = el.scrollWidth; };
    // Run now, then again after layout + fonts settle — otherwise scrollWidth can
    // still equal clientWidth at first paint (no overflow yet) and the scroll no-ops.
    toEnd();
    const raf = requestAnimationFrame(() => { toEnd(); requestAnimationFrame(toEnd); });
    const timers = [setTimeout(toEnd, 120), setTimeout(toEnd, 450)];
    // Re-align once web fonts finish loading (they can widen the content).
    (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready?.then(toEnd).catch(() => {});
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [enabled, dep]);
  return ref;
}

export function Card({ children, style, id }: { children: ReactNode; style?: CSSProperties; id?: string }) {
  return <div style={{ ...S.card, ...style }} id={id}>{children}</div>;
}

export function StatCard({
  value,
  label,
  color,
  onClick,
}: {
  value: ReactNode;
  label: ReactNode;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        ...S.card,
        marginBottom: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 16,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color .15s",
        borderColor: onClick ? `${mix(C.accent, 27)}` : C.border,
      }}
    >
      <div style={{ ...S.statNum, color: color ?? C.accentLight }}>{value}</div>
      <div style={{ ...S.statLabel, display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {onClick && <span style={{ color: C.textDim, fontSize: 10 }}>→</span>}
      </div>
    </div>
  );
}

export function StatGrid({ children, min = 140 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 12,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: Parameters<typeof badge>[0]; children: ReactNode }) {
  return <span style={badge(tone)}>{children}</span>;
}

export function H2({ children }: { children: ReactNode }) {
  return <div style={S.h2}>{children}</div>;
}
export function H3({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <div style={{ ...S.h3, ...(onClick ? { cursor: "pointer" } : {}) }} onClick={onClick}>{children}</div>;
}

export function Select({
  value,
  onChange,
  options,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  style?: CSSProperties;
}) {
  return (
    <select style={{ ...S.select, ...style }} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: C.card }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
      {children}
    </div>
  );
}

export function SubTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: `1px solid ${value === t.id ? C.accent : C.border}`,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            background: value === t.id ? C.accentBg : "transparent",
            color: value === t.id ? C.accentLight : C.textMuted,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={S.table}>{children}</table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p style={{ color: C.textMuted, textAlign: "center", padding: 24, fontSize: 13 }}>{children}</p>;
}

// Horizontal proportional bar (used in cashflow / prediction).
export function BarRow({
  label,
  value,
  max,
  color,
  sub,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sub?: string;
}) {
  const w = max > 0 ? Math.max(1, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: C.textMuted }}>{label}</span>
        <span style={{ color: C.textMuted }}>{sub}</span>
      </div>
      <div style={{ height: 14, background: C.track, borderRadius: 4 }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4, minWidth: 2 }} />
      </div>
    </div>
  );
}

// Vertical grouped bar chart for monthly trends.
export function MiniBars({
  data,
  series,
  height = 120,
}: {
  data: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height, overflowX: "auto", paddingBottom: 4 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46 }}>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: height - 20 }}>
              {d.values.map((v, j) => (
                <div
                  key={j}
                  title={`${series[j]?.name}: ${v}`}
                  style={{
                    width: 10,
                    height: `${(v / max) * 100}%`,
                    minHeight: v > 0 ? 2 : 0,
                    background: series[j]?.color,
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 4, whiteSpace: "nowrap" }}>{d.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {series.map((s) => (
          <span key={s.name} style={{ fontSize: 11, color: C.textMuted }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: s.color, borderRadius: 2, marginRight: 5, verticalAlign: "middle" }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...S.card, maxWidth: 440, width: "100%", marginBottom: 0, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ ...S.h3, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ── Info tooltip (hover explanation) ─────────────────────────────────────────
// Uses viewport-fixed positioning measured on hover, so the bubble never gets
// clipped by a scrollable table/card (which overflow:auto would otherwise cut).
export function Info({ text, label }: { text: string; label?: ReactNode }) {
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const W = 250;
  const show = () => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const above = r.top > 150;
    setPos({
      left: Math.min(Math.max(8, r.left), window.innerWidth - W - 8),
      top: above ? r.top - 8 : r.bottom + 8,
      above,
    });
  };
  return (
    <span
      ref={ref}
      style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "help" }}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {label}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: `1px solid ${C.textDim}`,
          color: C.textDim,
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        i
      </span>
      {pos && (
        <span
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            transform: pos.above ? "translateY(-100%)" : "none",
            zIndex: 1000,
            width: W,
            background: "#0A110C",
            border: `1px solid ${mix(C.accent, 45)}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11.5,
            fontWeight: 400,
            lineHeight: 1.45,
            color: "#ECE9DC",
            boxShadow: "0 6px 24px #000c",
            whiteSpace: "normal",
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// ── Sortable table header + hook ─────────────────────────────────────────────
export type SortState = { key: string; dir: "asc" | "desc" };

export function useSort(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  function sorted<T>(rows: T[], accessors: Record<string, (r: T) => number | string>): T[] {
    const acc = accessors[sort.key];
    if (!acc) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }
  return { sort, toggle, sorted };
}

export function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  info,
  align = "left",
}: {
  label: ReactNode;
  sortKey?: string;
  sort?: SortState;
  onSort?: (k: string) => void;
  info?: string;
  align?: "left" | "right" | "center";
}) {
  const active = sort && sortKey && sort.key === sortKey;
  const clickable = !!sortKey && !!onSort;
  return (
    <th
      onClick={clickable ? () => onSort!(sortKey!) : undefined}
      style={{
        ...S.th,
        textAlign: align,
        cursor: clickable ? "pointer" : "default",
        userSelect: "none",
        color: active ? C.accentLight : C.textMuted,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {info ? <Info text={info} label={label} /> : label}
        {clickable && <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>{active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>}
      </span>
    </th>
  );
}

// ── Donut chart (proportions) ────────────────────────────────────────────────
export function Donut({
  data,
  size = 150,
  thickness = 26,
  centerLabel,
  onSlice,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: ReactNode;
  onSlice?: (label: string) => void;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const segs = total
    ? data.filter((d) => d.value > 0).map((d) => {
        const frac = d.value / total;
        const seg = { ...d, dash: frac * circ, off: offset, frac };
        offset += frac * circ;
        return seg;
      })
    : [];
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={C.track} strokeWidth={thickness} />
        {segs.map((s, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.off}
          />
        ))}
        {centerLabel && (
          <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central" transform={`rotate(90 ${cx} ${cx})`} fill={C.text} fontSize={18} fontWeight={700}>
            {centerLabel as string}
          </text>
        )}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((d) => (
          <div
            key={d.label}
            onClick={onSlice ? () => onSlice(d.label) : undefined}
            style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: onSlice ? "pointer" : "default" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: "inline-block" }} />
            {d.label}
            <span style={{ color: C.text, fontWeight: 600, marginLeft: 4 }}>{d.value}</span>
            {total > 0 && <span style={{ color: C.textDim }}>({((d.value / total) * 100).toFixed(0)}%)</span>}
            {onSlice && <span style={{ color: C.textDim, fontSize: 10 }}>→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Grouped/stacked vertical bars with an optional healthy-zone band ──────────
export function ZoneBars({
  data,
  series,
  zone,
  height = 150,
  stacked = false,
  alignEnd = false,
}: {
  /** `forecast` = odhad, nie odtrénované — kreslí sa priehľadne a prerušovane,
   *  aby sa nedal prečítať ako fakt. */
  data: { label: string; values: number[]; forecast?: boolean }[];
  series: { name: string; color: string }[];
  zone?: { lo: number; hi: number; unit?: string };
  height?: number;
  stacked?: boolean;
  alignEnd?: boolean;
}) {
  const plotH = height - 22;
  const max = useMemo(() => {
    const totals = data.map((d) => (stacked ? d.values.reduce((a, b) => a + b, 0) : Math.max(...d.values, 0)));
    return Math.max(1, ...totals, zone ? zone.hi * 1.1 : 0);
  }, [data, stacked, zone]);
  const scrollRef = useScrollEnd<HTMLDivElement>(alignEnd, data.length);
  return (
    <div>
      <div ref={scrollRef} style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "flex-end", height, width: "max-content", minWidth: "100%" }}>
          {zone && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 22 + (zone.lo / max) * plotH,
                height: ((zone.hi - zone.lo) / max) * plotH,
                background: C.greenBg,
                borderTop: `1px dashed ${mix(C.green, 40)}`,
                borderBottom: `1px dashed ${mix(C.green, 40)}`,
                pointerEvents: "none",
              }}
            />
          )}
          {data.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 46px", zIndex: 1 }}>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: plotH, flexDirection: stacked ? "column-reverse" : "row" }}>
                {d.values.map((v, j) => (
                  <div
                    key={j}
                    title={`${series[j]?.name}: ${Math.round(v)}`}
                    style={{
                      width: stacked ? 20 : 9,
                      height: `${(v / max) * plotH}px`,
                      minHeight: v > 0 ? 2 : 0,
                      background: d.forecast ? mix(series[j]?.color ?? C.accent, 30) : series[j]?.color,
                      border: d.forecast ? `1px dashed ${mix(series[j]?.color ?? C.accent, 70)}` : undefined,
                      borderRadius: stacked ? 0 : "3px 3px 0 0",
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 10, color: d.forecast ? C.blue : C.textDim, marginTop: 4, whiteSpace: "nowrap" }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {series.map((s) => (
          <span key={s.name} style={{ fontSize: 11, color: C.textMuted }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: s.color, borderRadius: 2, marginRight: 5, verticalAlign: "middle" }} />
            {s.name}
          </span>
        ))}
        {zone && <span style={{ fontSize: 11, color: C.green }}>▬ Zdravá zóna {zone.lo}–{zone.hi}{zone.unit ?? "h"}</span>}
      </div>
    </div>
  );
}

// ── Single-series bars with value labels + optional forecast tail ────────────
export function ValueBars({
  data,
  color,
  forecastColor,
  fmt,
  height = 170,
  alignEnd = false,
  znacka,
}: {
  data: { label: string; value: number; forecast?: boolean }[];
  color: string;
  forecastColor?: string;
  fmt: (n: number) => string;
  height?: number;
  alignEnd?: boolean;
  /** Text značky (udalosti) pre daný stĺpec — vlajka nad ním s tooltipom.
   *  Graf hovorí ČO sa stalo s číslami; značka PREČO — „tu bežala kampaň". */
  znacka?: (label: string) => string | undefined;
}) {
  const plotH = height - 40;
  const max = Math.max(1, ...data.map((d) => d.value));
  const scrollRef = useScrollEnd<HTMLDivElement>(alignEnd, data.length);
  return (
    // Fixed-width bars so the chart overflows and useScrollEnd opens it scrolled to
    // the newest (right) — scroll LEFT for history. (No justify-end: it breaks left-scroll.)
    <div ref={scrollRef} style={{ display: "flex", gap: 8, alignItems: "flex-end", height, overflowX: "auto", paddingBottom: 4 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: "0 0 54px" }}>
          {znacka?.(d.label) ? (
            <div title={znacka(d.label)} style={{ fontSize: 11, lineHeight: 1, marginBottom: 2, cursor: "help", color: C.orange }}>⚑</div>
          ) : null}
          <div style={{ fontSize: 10.5, color: d.forecast ? C.textDim : C.textMuted, marginBottom: 3, whiteSpace: "nowrap" }}>{fmt(d.value)}</div>
          <div
            title={`${d.label}: ${fmt(d.value)}`}
            style={{
              width: "78%",
              maxWidth: 46,
              height: `${(d.value / max) * plotH}px`,
              minHeight: d.value > 0 ? 2 : 0,
              background: d.forecast ? (forecastColor ?? color) : color,
              opacity: d.forecast ? 0.5 : 1,
              border: d.forecast ? `1px dashed ${forecastColor ?? color}` : "none",
              borderRadius: "4px 4px 0 0",
            }}
          />
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 5, whiteSpace: "nowrap" }}>
            {d.label}
            {d.forecast && <span style={{ color: C.blue }}> ⌁</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Responsive multi-series line chart (trend) with optional zone band ───────
export function LineChart({
  data,
  series,
  zone,
  refLine,
  height = 200,
  fmt = (n: number) => String(Math.round(n)),
  pointWidth,
  alignEnd = false,
  onPoint,
  autoY = false,
}: {
  /** `forecast` = odhad, nie odtrénované — kreslí sa priehľadne a prerušovane,
   *  aby sa nedal prečítať ako fakt. */
  data: { label: string; values: number[]; forecast?: boolean }[];
  series: { name: string; color: string }[];
  zone?: { lo: number; hi: number; unit?: string };
  refLine?: { value: number; label?: string; color?: string };
  height?: number;
  fmt?: (n: number) => string;
  pointWidth?: number; // if set, chart is a fixed-width scroller (points don't squeeze)
  alignEnd?: boolean;
  onPoint?: (index: number) => void;
  autoY?: boolean; // fit the Y axis to the data range (zoom in) instead of starting at 0
}) {
  const [hover, setHover] = useState<{ si: number; i: number } | null>(null);
  const n = data.length;
  const padL = 40, padR = 14, padT = 10, padB = 22;
  // Fixed inner width when pointWidth given (scrollable); else a responsive viewBox.
  const innerW = pointWidth ? Math.max(1, n) * pointWidth : 760;
  const W = innerW + padL + padR;
  const plotW = innerW;
  const plotH = height - padT - padB;
  // Y domain: zero-based by default; with autoY, fit to the data's min–max (+padding).
  const allVals = data.flatMap((d) => d.values).concat(zone ? [zone.lo, zone.hi] : [], refLine ? [refLine.value] : []);
  const rawMax = Math.max(1, ...allVals);
  const rawMin = allVals.length ? Math.min(...allVals) : 0;
  let lo = 0, hi = rawMax * 1.08;
  const padY = Math.max(1, (rawMax - rawMin) * 0.14);
  if (autoY && rawMax > rawMin) {
    // Only clamp the floor at zero when the data is non-negative — clamping a
    // negative series (e.g. a debt balance) pushes it below the plot area and
    // it gets drawn outside the card.
    lo = rawMin >= 0 ? Math.max(0, rawMin - padY) : rawMin - padY;
    hi = rawMax + padY;
  } else if (rawMin < 0) {
    // Zero-based scale can't show negatives either — extend downward.
    lo = rawMin - padY;
    hi = Math.max(0, rawMax) + padY;
  }
  const span = hi - lo || 1;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - lo) / span) * plotH;
  const labelStep = Math.max(1, Math.ceil(n / (pointWidth ? 24 : 12)));
  const scrollRef = useScrollEnd<HTMLDivElement>(!!alignEnd && !!pointWidth, n);

  const svg = (
    <svg viewBox={`0 0 ${W} ${height}`} width={pointWidth ? W : "100%"} height={height} preserveAspectRatio={pointWidth ? "xMinYMid meet" : "none"} style={{ overflow: "visible", display: "block" }}>
      {zone && <rect x={padL} y={y(zone.hi)} width={plotW} height={y(zone.lo) - y(zone.hi)} fill={C.greenBg} stroke={`${mix(C.green, 33)}`} strokeDasharray="4 4" />}
      {refLine && (
        <g>
          <line x1={padL} y1={y(refLine.value)} x2={padL + plotW} y2={y(refLine.value)} stroke={refLine.color ?? C.accentLight} strokeWidth={1.4} strokeDasharray="6 4" opacity={0.85} />
          <text x={padL + plotW - 2} y={y(refLine.value) - 4} textAnchor="end" fontSize={9} fill={refLine.color ?? C.accentLight}>{refLine.label ?? `Ø ${fmt(refLine.value)}`}</text>
        </g>
      )}
      {[0, 0.5, 1].map((f) => (
        <text key={f} x={padL - 6} y={y(lo + span * f) + 3} textAnchor="end" fontSize={9} fill={C.textDim}>{fmt(lo + span * f)}</text>
      ))}
      {series.map((s, si) => (
        <g key={s.name}>
          <polyline points={data.map((d, i) => `${x(i)},${y(d.values[si] ?? 0)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle key={i} cx={x(i)} cy={y(d.values[si] ?? 0)} r={hover && hover.si === si && hover.i === i ? 5 : onPoint ? 4 : 2.5} fill={s.color} />
          ))}
        </g>
      ))}
      {/* Transparent hit targets — bigger than the dots so hover/click is easy. */}
      {series.map((s, si) =>
        data.map((d, i) => (
          <circle
            key={`${si}-${i}`}
            cx={x(i)}
            cy={y(d.values[si] ?? 0)}
            r={13}
            fill="transparent"
            style={{ cursor: onPoint ? "pointer" : "default" }}
            onMouseEnter={() => setHover({ si, i })}
            onMouseLeave={() => setHover((h) => (h && h.si === si && h.i === i ? null : h))}
            onClick={onPoint ? () => onPoint(i) : undefined}
          />
        )),
      )}
      {data.map((d, i) => (i % labelStep === 0 || i === n - 1) && (
        <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={9} fill={C.textDim}>{d.label}</text>
      ))}
      {/* Čísla priamo pri bodoch. Samotná krivka povie smer, ale nie veľkosť —
          a „malovravné" bolo presne to slovo. Pri riedkom grafe (do 8 bodov,
          typicky predikcia) sa popíšu všetky; inak len POSLEDNÝ bod, lebo
          osemnásť čísel cez seba je horšie než žiadne. Zvyšok povie súhrn pod
          grafom a bublina pri prejdení myšou. */}
      {!hover && series.map((s, si) => {
        const body = data
          .map((d, i) => ({ i, v: d.values[si] }))
          .filter((b) => Number.isFinite(b.v) && (n <= 8 || b.i === n - 1));
        return body.map(({ i, v }) => {
          // Keď sa dve krivky na konci stretnú, popisky by ležali na sebe —
          // ten nižší sa posunie pod bod.
          const kolizia = si > 0 && series.some((_, sj) => sj < si && Math.abs(y(data[i].values[sj] ?? 0) - y(v)) < 13);
          return (
            <text
              key={`${si}-${i}`}
              x={x(i)}
              y={kolizia ? y(v) + 16 : y(v) - 9}
              textAnchor={i === n - 1 && n > 1 ? "end" : "middle"}
              fontSize={12}
              fontWeight={800}
              fill={s.color}
              // Obrys vo farbe karty, vykreslený POD textom. Bez neho čísla
              // splývali s krivkou aj s mriežkou a boli „nevýrazné" — a číslo,
              // ktoré sa musí hľadať, je horšie než žiadne. Halo ho oddelí od
              // čohokoľvek pod ním bez toho, aby pribudol ďalší tvar.
              stroke={C.card}
              strokeWidth={3.5}
              strokeLinejoin="round"
              style={{ paintOrder: "stroke" }}
              pointerEvents="none"
            >
              {fmt(v)}
            </text>
          );
        });
      })}
      {hover && (() => {
        const d = data[hover.i];
        const s = series[hover.si];
        const v = d?.values[hover.si] ?? 0;
        const label = series.length > 1 ? `${d.label} · ${s.name}: ${fmt(v)}` : `${d.label}: ${fmt(v)}`;
        const bw = label.length * 5.6 + 14;
        const cx = x(hover.i);
        const cy = y(v);
        const bx = Math.max(padL, Math.min(cx - bw / 2, padL + plotW - bw));
        const by = cy - 26 < padT ? cy + 10 : cy - 26;
        return (
          <g pointerEvents="none">
            <rect x={bx} y={by} width={bw} height={18} rx={4} fill={C.card} stroke={mix(s.color, 55)} />
            <text x={bx + bw / 2} y={by + 12.5} textAnchor="middle" fontSize={10} fontWeight={600} fill={C.text}>{label}</text>
          </g>
        );
      })()}
    </svg>
  );

  return (
    <div>
      {pointWidth ? <div ref={scrollRef} style={{ overflowX: "auto" }}>{svg}</div> : svg}
      {/* Súhrn každej krivky v číslach: kde sme, aký je priemer a aké boli
          krajnosti. Legenda samotná hovorí len to, ktorá farba je ktorá. */}
      <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
        {series.map((s, si) => {
          const v = data.map((d) => d.values[si]).filter((x2) => Number.isFinite(x2));
          const posl = v.length ? v[v.length - 1] : null;
          const max = v.length ? Math.max(...v) : null;
          const min = v.length ? Math.min(...v) : null;
          const priem = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
          const mesiacMax = max !== null ? data[data.findIndex((d) => d.values[si] === max)]?.label : "";
          const mesiacMin = min !== null ? data[data.findIndex((d) => d.values[si] === min)]?.label : "";
          return (
            <span key={s.name} style={{ fontSize: 11, color: C.textMuted, display: "inline-flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
              <span style={{ display: "inline-block", width: 14, height: 3, background: s.color, borderRadius: 2, verticalAlign: "middle" }} />
              <span style={{ color: C.text }}>{s.name}</span>
              {posl !== null && (
                <>
                  <span style={{ color: s.color, fontWeight: 800, fontSize: 13 }}>{fmt(posl)}</span>
                  {v.length > 1 && (
                    <span style={{ color: C.textDim, fontSize: 10.5 }}>
                      · Ø {fmt(priem as number)} · max {fmt(max as number)}{mesiacMax ? ` (${mesiacMax})` : ""} · min {fmt(min as number)}{mesiacMin ? ` (${mesiacMin})` : ""}
                    </span>
                  )}
                </>
              )}
            </span>
          );
        })}
        {zone && <span style={{ fontSize: 11, color: C.green }}>▬ Zdravá zóna {zone.lo}–{zone.hi}{zone.unit ?? "h"}</span>}
        {onPoint && <span style={{ fontSize: 11, color: C.textDim }}>Klik na bod = detail obdobia dole</span>}
      </div>
    </div>
  );
}

// ── Line icons for the main nav (Lucide-style) ───────────────────────────────
const ICON_PATHS: Record<string, ReactNode> = {
  home: (<><path d="M3 9.5 12 2.5l9 7v10a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 19.5z" /><path d="M9.3 21.1V13h5.4v8.1" /></>),
  calendar: (<><rect x="3" y="4.2" width="18" height="16.8" rx="2" /><path d="M16 2.2v4M8 2.2v4M3 9.2h18" /></>),
  userCheck: (<><path d="M15 21v-1.8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V21" /><circle cx="8.5" cy="7.5" r="3.8" /><path d="m16.5 11.5 2 2 4-4" /></>),
  wallet: (<><rect x="3" y="6" width="18" height="13" rx="2.2" /><path d="M3 10.2h18" /><circle cx="16.6" cy="13.6" r="1.4" /></>),
  // Šípka do priehradky — nahrávanie a obsluha dát.
  upload: (<><path d="M21 15v4.4A1.6 1.6 0 0 1 19.4 21H4.6A1.6 1.6 0 0 1 3 19.4V15" /><path d="m7.5 9 4.5-4.5L16.5 9" /><path d="M12 4.5v10.8" /></>),
  activity: (<path d="M22 12h-4l-3 8.5L9 3.5l-3 8.5H2" />),
  // Bitcoinové „B" s dvoma nožičkami — kruh naokolo by v tejto veľkosti
  // splynul s ostatnými ikonami.
  bitcoin: (<><path d="M7 5.5h6.6a3.2 3.2 0 0 1 0 6.4H7z" /><path d="M7 11.9h7.4a3.3 3.3 0 0 1 0 6.6H7z" /><path d="M9.6 5.5V3M13.4 5.5V3M9.6 21v-2.5M13.4 21v-2.5M7 5.5v13" /></>),
};

export function Icon({ name, size = 17 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

// Tréner ako klikateľné pilulky — rovnaký vzhľad ako na dashboarde. Jeden
// klik namiesto rozbaľovačky: prepína sa často a tri možnosti sa zmestia.
export function TrenerPills({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const moznosti: [string, string][] = [["all", "Obaja"], ["Jerry", "Jerry"], ["Terezka", "Terezka"]];
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {moznosti.map(([v, lbl]) => (
        <button key={v} onClick={() => onChange(v)}
          style={{ padding: "5px 12px", borderRadius: 16, fontSize: 12, cursor: "pointer",
            border: `1px solid ${value === v ? C.accent : C.border}`,
            background: value === v ? C.accentBg : "transparent",
            color: value === v ? C.accentLight : C.textMuted }}>
          {lbl}
        </button>
      ))}
    </div>
  );
}

// ── Prístroje kokpitu ────────────────────────────────────────────────────────
// Tufteho sparkline: tvar krivky bez osí, mierky a mriežky. Nemá sa z neho dať
// odčítať hodnota — na to je číslo vedľa. Má sa z neho dať za pol sekundy
// prečítať smer.
export function Sparkline({ values, color, height = 22, width = 68 }: { values: number[]; color: string; height?: number; width?: number }) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return <div style={{ width, height }} />;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const rozpatie = hi - lo || 1;
  const x = (i: number) => (i / (v.length - 1)) * (width - 2) + 1;
  const y = (n: number) => height - 2 - ((n - lo) / rozpatie) * (height - 4);
  const d = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const posledny = v.length - 1;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
      <circle cx={x(posledny)} cy={y(v[posledny])} r={2.2} fill={color} />
    </svg>
  );
}

/**
 * Zmena oproti minulému obdobiu. `dobreHore` obracia farbu tam, kde je rast
 * zlý (náklady, odchody) — bez toho by červená znamenala raz „pozor" a raz
 * „výborne" a prestala by čokoľvek znamenať.
 */
export function Trend({ zmenaPct, dobreHore = true, tiche = false }: { zmenaPct: number | null; dobreHore?: boolean; tiche?: boolean }) {
  if (zmenaPct === null || !Number.isFinite(zmenaPct)) return null;
  const zaokruhlene = Math.round(zmenaPct);
  // Pod 3 % je to šum, nie trend — šípka by predstierala pohyb, ktorý sa
  // v ďalšom mesiaci otočí späť.
  if (Math.abs(zaokruhlene) < 3) {
    return <span style={{ fontSize: 11, color: C.textDim, whiteSpace: "nowrap" }}>≈ bez zmeny</span>;
  }
  const hore = zaokruhlene > 0;
  const dobre = hore === dobreHore;
  const farba = tiche ? C.textMuted : dobre ? C.green : C.orange;
  return (
    <span style={{ fontSize: 11, color: farba, whiteSpace: "nowrap", fontWeight: 600 }}>
      {hore ? "▲" : "▼"} {Math.abs(zaokruhlene)} %
    </span>
  );
}

/**
 * Bullet graph (Stephen Few) — náhrada za ručičkové budíky. Merací pruh,
 * zvislá značka cieľa a podklad v odtieňoch jednej farby. Zaberie riadok
 * namiesto štvorca a povie to isté: kde sme, kam sme mali dôjsť.
 */
export function BulletGraph({ hodnota, ciel, max, farba, label }: { hodnota: number; ciel: number; max?: number; farba: string; label?: string }) {
  const strop = max ?? (Math.max(hodnota, ciel) * 1.15 || 1);
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / strop) * 100))}%`;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative", height: 9, borderRadius: 3, background: mix(C.textDim, 14), overflow: "visible" }}>
        <div style={{ position: "absolute", inset: 0, width: pct(ciel), background: mix(C.textDim, 10), borderRadius: 3 }} />
        <div style={{ position: "absolute", top: 2, bottom: 2, left: 0, width: pct(Math.max(0, hodnota)), background: farba, borderRadius: 2 }} />
        {/* Značka cieľa: kolmá čiarka, nie ďalší pruh — nemá súťažiť s meraním. */}
        <div style={{ position: "absolute", top: -2, bottom: -2, left: pct(ciel), width: 2, background: C.text, opacity: 0.75, borderRadius: 1 }} />
      </div>
      {label && <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>{label}</div>}
    </div>
  );
}
