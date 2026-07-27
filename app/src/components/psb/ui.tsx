import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { C, S, badge } from "../../lib/psb/theme";

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...S.card, ...style }}>{children}</div>;
}

export function StatCard({ value, label, color }: { value: ReactNode; label: string; color?: string }) {
  return (
    <div style={{ ...S.card, marginBottom: 0, textAlign: "center", padding: 14 }}>
      <div style={{ ...S.statNum, color: color ?? C.accentLight }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
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
      <div style={{ height: 14, background: "#ffffff08", borderRadius: 4 }}>
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
export function Info({ text, label }: { text: string; label?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 3, cursor: "help" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
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
        }}
      >
        i
      </span>
      {open && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            width: 240,
            background: "#0A110C",
            border: `1px solid ${C.accent}55`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11.5,
            fontWeight: 400,
            lineHeight: 1.45,
            color: C.text,
            boxShadow: "0 6px 24px #000a",
            whiteSpace: "normal",
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
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: ReactNode;
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
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#ffffff10" strokeWidth={thickness} />
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
          <div key={d.label} style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: "inline-block" }} />
            {d.label}
            <span style={{ color: C.text, fontWeight: 600, marginLeft: 4 }}>{d.value}</span>
            {total > 0 && <span style={{ color: C.textDim }}>({((d.value / total) * 100).toFixed(0)}%)</span>}
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
}: {
  data: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  zone?: { lo: number; hi: number };
  height?: number;
  stacked?: boolean;
}) {
  const plotH = height - 22;
  const max = useMemo(() => {
    const totals = data.map((d) => (stacked ? d.values.reduce((a, b) => a + b, 0) : Math.max(...d.values, 0)));
    return Math.max(1, ...totals, zone ? zone.hi * 1.1 : 0);
  }, [data, stacked, zone]);
  return (
    <div>
      <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "flex-end", height, overflowX: "auto", paddingBottom: 4 }}>
        {zone && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 22 + (zone.lo / max) * plotH,
              height: ((zone.hi - zone.lo) / max) * plotH,
              background: C.greenBg,
              borderTop: `1px dashed ${C.green}66`,
              borderBottom: `1px dashed ${C.green}66`,
              pointerEvents: "none",
            }}
          />
        )}
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 40, zIndex: 1 }}>
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
}: {
  data: { label: string; value: number; forecast?: boolean }[];
  color: string;
  forecastColor?: string;
  fmt: (n: number) => string;
  height?: number;
}) {
  const plotH = height - 40;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height, overflowX: "auto", paddingBottom: 4 }}>
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
