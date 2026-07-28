import { useEffect, useMemo, useState } from "react";

import { sessionAnalysisPSB, type PsbAnalysisRow } from "../../lib/psb/compute";
import { monthLabel } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { SessionRow } from "../../lib/psb/types";
import { Card, Empty, H3, Info, LineChart } from "./ui";

const TYPES: { id: string; label: string; color: string; get: (r: PsbAnalysisRow) => number }[] = [
  { id: "total", label: "Celkovo", color: C.accentLight, get: (r) => r.total },
  { id: "offline", label: "Offline", color: C.accent, get: (r) => r.offline },
  { id: "online", label: "Online", color: C.blue, get: (r) => r.onlineTc },
  { id: "uvodne", label: "Úvodné", color: C.orange, get: (r) => r.uvodne },
];

type Band = { min: string; max: string };
const emptyBands = (): Record<string, Band> =>
  Object.fromEntries(TYPES.map((t) => [t.id, { min: "", max: "" }]));

// Monthly session-count trend for one session type, switchable. On the dashboard
// it also shows a settable min/max band; in Analýza it shows the average line.
export function SessionTrend({
  sessions,
  showBand = false,
  onNavigate,
}: {
  sessions: SessionRow[];
  showBand?: boolean;
  onNavigate?: () => void;
}) {
  const [type, setType] = useState("total");
  const [bands, setBands] = useState<Record<string, Band>>(emptyBands);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("psb-sessband");
      if (raw) setBands({ ...emptyBands(), ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const setBand = (patch: Partial<Band>) =>
    setBands((prev) => {
      const next = { ...prev, [type]: { ...prev[type], ...patch } };
      try {
        localStorage.setItem("psb-sessband", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const cfg = TYPES.find((t) => t.id === type)!;
  const monthly = useMemo(() => sessionAnalysisPSB(sessions), [sessions]);
  const vals = monthly.map((m) => cfg.get(m));
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const data = monthly.map((m, i) => ({ label: monthLabel(m.month), values: [vals[i]] }));
  const band = bands[type];
  const zone =
    showBand && band.min !== "" && band.max !== "" ? { lo: Number(band.min), hi: Number(band.max) } : undefined;

  return (
    <Card style={{ marginBottom: showBand ? 0 : undefined, height: showBand ? "100%" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <H3>
          <Info
            text="Počet sedení zvoleného typu po mesiacoch. Prerušovaná čiara = priemer. Prepínaj typ dole (Online zahŕňa aj TrueCoach)."
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
              background: type === t.id ? `${C.accentBg}` : "transparent",
              color: type === t.id ? t.color : C.textMuted,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showBand && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>Cieľové pásmo (min–max/mes.):</span>
          <input type="number" value={band.min} onChange={(e) => setBand({ min: e.target.value })} placeholder="min" style={{ ...S.select, width: 72 }} />
          <span style={{ color: C.textDim }}>–</span>
          <input type="number" value={band.max} onChange={(e) => setBand({ max: e.target.value })} placeholder="max" style={{ ...S.select, width: 72 }} />
        </div>
      )}

      {monthly.length ? (
        <>
          <LineChart
            data={data}
            series={[{ name: cfg.label, color: cfg.color }]}
            zone={zone}
            refLine={{ value: avg, label: `Ø ${avg.toFixed(1)}` }}
            height={showBand ? 180 : 210}
            fmt={(x) => String(Math.round(x))}
          />
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
            Priemer <strong style={{ color: C.text }}>{cfg.label}</strong>: {avg.toFixed(1)} sedení/mesiac
            {zone && ` · cieľ ${zone.lo}–${zone.hi}`}
          </div>
        </>
      ) : (
        <Empty>Nahraj Payroll by Session.</Empty>
      )}
    </Card>
  );
}
