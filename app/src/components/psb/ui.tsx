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
