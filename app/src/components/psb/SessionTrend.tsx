import { useMemo, useState } from "react";

import { sessionAnalysisPSB, type PsbAnalysisRow } from "../../lib/psb/compute";
import { monthLabel } from "../../lib/psb/format";
import { C } from "../../lib/psb/theme";
import type { SessionRow } from "../../lib/psb/types";
import { Card, Empty, H3, Info, LineChart } from "./ui";

const TYPES: { id: string; label: string; color: string; get: (r: PsbAnalysisRow) => number }[] = [
  { id: "total", label: "Celkovo", color: C.accentLight, get: (r) => r.total },
  { id: "offline", label: "Offline", color: C.accent, get: (r) => r.offline },
  { id: "online", label: "Online", color: C.blue, get: (r) => r.onlineTc },
  { id: "uvodne", label: "Úvodné", color: C.orange, get: (r) => r.uvodne },
];

// Monthly session-count trend for one switchable session type. Scrollable chart
// on the left (opens on the latest month), the average as a big number on the right.
export function SessionTrend({ sessions, onNavigate }: { sessions: SessionRow[]; onNavigate?: () => void }) {
  const [type, setType] = useState("total");
  const cfg = TYPES.find((t) => t.id === type)!;
  const monthly = useMemo(() => sessionAnalysisPSB(sessions), [sessions]);
  const vals = monthly.map((m) => cfg.get(m));
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const data = monthly.map((m, i) => ({ label: monthLabel(m.month), values: [vals[i]] }));

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <H3>
          <Info
            text="Počet sedení zvoleného typu po mesiacoch. Prerušovaná čiara = priemer, číslo vpravo = priemer za mesiac. Graf sa otvára na najnovšom mesiaci, posúvaj doľava. Online zahŕňa aj TrueCoach."
            label="Trend sedení podľa typu"
          />
        </H3>
        {onNavigate && (
          <button onClick={onNavigate} style={{ background: "none", border: "none", color: C.accentLight, cursor: "pointer", fontSize: 12 }}>
            Analýza sedení →
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 5, margin: "10px 0", flexWrap: "wrap" }}>
        {TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            style={{
              padding: "5px 12px",
              borderRadius: 16,
              border: `1px solid ${type === t.id ? t.color : C.border}`,
              background: type === t.id ? C.accentBg : "transparent",
              color: type === t.id ? t.color : C.textMuted,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {monthly.length ? (
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "4 1 280px", minWidth: 0 }}>
            <LineChart
              data={data}
              series={[{ name: cfg.label, color: cfg.color }]}
              refLine={{ value: avg, label: `Ø ${avg.toFixed(1)}` }}
              height={180}
              fmt={(x) => String(Math.round(x))}
            />
          </div>
          <div style={{ flex: "1 1 130px", textAlign: "center", padding: "4px 8px" }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{avg.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>Ø {cfg.label}<br />sedení / mesiac</div>
          </div>
        </div>
      ) : (
        <Empty>Nahraj Payroll by Session.</Empty>
      )}
    </Card>
  );
}
