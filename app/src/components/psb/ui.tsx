import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { C, mix, S, badge } from "../../lib/psb/theme";

// Scrolls a horizontally-overflowing container to its right edge on mount/update
// so charts open showing the most recent data (user scrolls left into the past).
function useScrollEnd<T extends HTMLElement>(enabled: boolean, dep: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled && ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [enabled, dep]);
  return ref;
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...S.card, ...style }}>{children}</div>;
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
export function H3({ children }: { children: ReactNode }) {
  return <div style={S.h3}>{children}</div>;
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
  data: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  zone?: { lo: number; hi: number };
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
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 40, flex: 1, zIndex: 1 }}>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: plotH, flexDirection: stacked ? "column-reverse" : "row" }}>
                {d.values.map((v, j) => (
                  <div
                    key={j}
                    title={`${series[j]?.name}: ${Math.round(v)}`}
                    style={{
                      width: stacked ? 20 : 9,
                      height: `${(v / max) * plotH}px`,
                      minHeight: v > 0 ? 2 : 0,
                      background: series[j]?.color,
                      borderRadius: stacked ? 0 : "3px 3px 0 0",
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 4, whiteSpace: "nowrap" }}>{d.label}</div>
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
        {zone && <span style={{ fontSize: 11, color: C.green }}>▬ Zdravá zóna {zone.lo}–{zone.hi}h</span>}
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
}: {
  data: { label: string; value: number; forecast?: boolean }[];
  color: string;
  forecastColor?: string;
  fmt: (n: number) => string;
  height?: number;
  alignEnd?: boolean;
}) {
  const plotH = height - 40;
  const max = Math.max(1, ...data.map((d) => d.value));
  const scrollRef = useScrollEnd<HTMLDivElement>(alignEnd, data.length);
  return (
    <div ref={scrollRef} style={{ display: "flex", gap: 8, alignItems: "flex-end", height, overflowX: "auto", paddingBottom: 4 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", minWidth: 48, flex: 1 }}>
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
  height = 200,
  fmt = (n: number) => String(Math.round(n)),
  pointWidth,
  alignEnd = false,
  onPoint,
}: {
  data: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  zone?: { lo: number; hi: number };
  height?: number;
  fmt?: (n: number) => string;
  pointWidth?: number; // if set, chart is a fixed-width scroller (points don't squeeze)
  alignEnd?: boolean;
  onPoint?: (index: number) => void;
}) {
  const n = data.length;
  const padL = 40, padR = 14, padT = 10, padB = 22;
  // Fixed inner width when pointWidth given (scrollable); else a responsive viewBox.
  const innerW = pointWidth ? Math.max(1, n) * pointWidth : 760;
  const W = innerW + padL + padR;
  const plotW = innerW;
  const plotH = height - padT - padB;
  const max = Math.max(1, ...data.flatMap((d) => d.values), zone ? zone.hi : 0) * 1.08;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const labelStep = Math.max(1, Math.ceil(n / (pointWidth ? 24 : 12)));
  const scrollRef = useScrollEnd<HTMLDivElement>(!!alignEnd && !!pointWidth, n);

  const svg = (
    <svg viewBox={`0 0 ${W} ${height}`} width={pointWidth ? W : "100%"} height={height} preserveAspectRatio={pointWidth ? "xMinYMid meet" : "none"} style={{ overflow: "visible", display: "block" }}>
      {zone && <rect x={padL} y={y(zone.hi)} width={plotW} height={y(zone.lo) - y(zone.hi)} fill={C.greenBg} stroke={`${mix(C.green, 33)}`} strokeDasharray="4 4" />}
      {[0, 0.5, 1].map((f) => (
        <text key={f} x={padL - 6} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill={C.textDim}>{fmt(max * f)}</text>
      ))}
      {series.map((s, si) => (
        <g key={s.name}>
          <polyline points={data.map((d, i) => `${x(i)},${y(d.values[si] ?? 0)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(d.values[si] ?? 0)}
              r={onPoint ? 4 : 2.5}
              fill={s.color}
              style={{ cursor: onPoint ? "pointer" : "default" }}
              onClick={onPoint ? () => onPoint(i) : undefined}
            >
              <title>{`${d.label} · ${s.name}: ${fmt(d.values[si] ?? 0)}`}</title>
            </circle>
          ))}
        </g>
      ))}
      {data.map((d, i) => (i % labelStep === 0 || i === n - 1) && (
        <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={9} fill={C.textDim}>{d.label}</text>
      ))}
    </svg>
  );

  return (
    <div>
      {pointWidth ? <div ref={scrollRef} style={{ overflowX: "auto" }}>{svg}</div> : svg}
      <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
        {series.map((s) => (
          <span key={s.name} style={{ fontSize: 11, color: C.textMuted }}>
            <span style={{ display: "inline-block", width: 14, height: 3, background: s.color, borderRadius: 2, marginRight: 5, verticalAlign: "middle" }} />
            {s.name}
          </span>
        ))}
        {zone && <span style={{ fontSize: 11, color: C.green }}>▬ Zdravá zóna {zone.lo}–{zone.hi}h</span>}
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
  activity: (<path d="M22 12h-4l-3 8.5L9 3.5l-3 8.5H2" />),
};

export function Icon({ name, size = 17 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}
