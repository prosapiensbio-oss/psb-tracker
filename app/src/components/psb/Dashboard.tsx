import { useMemo, useRef, useState } from "react";

import type { Anomaly, ClientAgg, SixMRow } from "../../lib/psb/compute";
import { fmtCZK, monthKey, monthLabel, weekKey } from "../../lib/psb/format";
import { C, S, badge, btn } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { IngestResult } from "../../lib/psb/db.server";
import type { Actions, Alert } from "./App";
import { Card, Empty, H3, StatCard, StatGrid } from "./ui";

const REPORTS: { key: keyof PSBData; label: string; path: string }[] = [
  { key: "sessions", label: "Payroll by Session", path: "Payroll Reports › By Session" },
  { key: "services", label: "Payroll by Service", path: "Payroll Reports › By Service" },
  { key: "payments", label: "Payments Recorded", path: "Financial Reports › Payments Recorded" },
  { key: "packages", label: "Packages & Memberships", path: "General Reports › Packages & Memberships" },
];

export function Dashboard({
  data,
  clients,
  alerts,
  anomalies,
  sixM,
  actions,
}: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  alerts: Alert[];
  anomalies: Anomaly[];
  sixM: SixMRow[];
  actions: Actions;
}) {
  const [uploadResult, setUploadResult] = useState<IngestResult[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const list = Object.values(clients);
    const active = list.filter((c) => c.status === "Aktívny" || c.status === "Sporadický");
    const jerry = active.filter((c) => c.primaryTrainer === "Jerry").length;
    const terezka = active.filter((c) => c.primaryTrainer === "Terezka").length;

    // Current-week hours (latest week present in data).
    const weeks = data.sessions.map((s) => weekKey(s.date)).sort();
    const lastWeek = weeks[weeks.length - 1];
    const weekHours = data.sessions.filter((s) => weekKey(s.date) === lastWeek).reduce((a, s) => a + s.duration / 60, 0);

    const months = data.sessions.map((s) => monthKey(s.date)).sort();
    const lastMonth = months[months.length - 1];
    const monthRevenue = data.sessions.filter((s) => monthKey(s.date) === lastMonth).reduce((a, s) => a + s.price, 0);

    return { jerry, terezka, total: active.length, weekHours, lastWeek, monthRevenue, lastMonth };
  }, [clients, data.sessions]);

  const missing = REPORTS.filter((r) => (data[r.key] as unknown[]).length === 0);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setBusy(true);
    const files: { filename: string; text: string }[] = [];
    for (const f of Array.from(fileList)) files.push({ filename: f.name, text: await f.text() });
    const res = await actions.ingest(files);
    setUploadResult(res);
    setBusy(false);
    setTimeout(() => setUploadResult(null), 8000);
  };

  return (
    <>
      <StatGrid>
        <StatCard value={stats.total} label={`Aktívnych klientov (J ${stats.jerry} / T ${stats.terezka})`} />
        <StatCard value={`${stats.weekHours.toFixed(0)}h`} label={stats.lastWeek ? `Hodiny (${stats.lastWeek})` : "Týždenné hodiny"} />
        <StatCard value={fmtCZK(stats.monthRevenue)} label={stats.lastMonth ? `Zárobky (${monthLabel(stats.lastMonth)})` : "Mesačné zárobky"} />
        <StatCard value={sixM.length} label="6M klientov" />
      </StatGrid>

      <Card>
        <H3>Upload CSV z PTmindera</H3>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
          style={{ ...S.upload, borderColor: dragOver ? C.accent : `${C.accent}55`, background: dragOver ? C.accentBg : "transparent" }}
        >
          <div style={{ fontSize: 26, marginBottom: 8 }}>⬆</div>
          <div style={{ color: C.text }}>{busy ? "Spracúvam…" : "Pretiahni CSV súbory sem alebo klikni"}</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>Appka automaticky rozpozná typ reportu. Duplicity preskočí, históriu zachová.</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
        />

        {uploadResult && (
          <div style={{ marginTop: 12 }}>
            {uploadResult.map((r, i) => (
              <div
                key={i}
                style={{ padding: 9, marginBottom: 4, fontSize: 12, borderRadius: 8, background: r.error ? C.redBg : C.greenBg, color: r.error ? C.red : C.green }}
              >
                {r.filename}: {r.error ? r.error : `${r.type} — pridané ${r.added}${r.skipped ? `, preskočené ${r.skipped} (duplicity)` : ""}`}
              </div>
            ))}
          </div>
        )}

        {missing.length > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: C.orangeBg, borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: C.orange, fontWeight: 600, marginBottom: 6 }}>Chýbajúce reporty:</div>
            {missing.map((m) => (
              <div key={m.label} style={{ fontSize: 12, color: C.textMuted, marginBottom: 2 }}>
                <strong style={{ color: C.text }}>{m.label}</strong> — {m.path}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <H3>Na čo sa pozrieť tento týždeň</H3>
        {alerts.length ? (
          alerts.map((a, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", marginBottom: 5, borderRadius: 8, background: a.tone === "red" ? C.redBg : a.tone === "orange" ? C.orangeBg : C.greenBg, fontSize: 13 }}
            >
              <span style={badge(a.tone === "red" ? "red" : a.tone === "orange" ? "orange" : "green")}>{a.module}</span>
              <span style={{ color: C.text }}>{a.text}</span>
            </div>
          ))
        ) : (
          <Empty>Žiadne upozornenia. Všetko v poriadku 🌿</Empty>
        )}
      </Card>

      <Card>
        <H3>Register anomálií</H3>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10 }}>
          Trvalý zoznam. Potvrdenie (vysvetlenie) anomáliu presunie dole, ale nezmaže — kým sa dáta neopravia.
        </div>
        {anomalies.length ? (
          anomalies.map((a) => <AnomalyRow key={a.key} a={a} actions={actions} />)
        ) : (
          <Empty>Žiadne anomálie zistené.</Empty>
        )}
      </Card>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {data.uploadLog[0] ? `Posledný upload: ${new Date(data.uploadLog[0].date).toLocaleString("cs-CZ")}` : "Zatiaľ žiadny upload"}
        </div>
        <ResetButton onReset={actions.reset} />
      </div>
    </>
  );
}

function AnomalyRow({ a, actions }: { a: Anomaly; actions: Actions }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(a.note || "");
  return (
    <div style={{ padding: "8px 10px", marginBottom: 5, borderRadius: 8, background: a.acked ? "#ffffff06" : a.tone === "red" ? C.redBg : C.orangeBg, opacity: a.acked ? 0.65 : 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <span style={badge(a.tone)}>{a.label}</span>
        <span style={{ color: C.text }}>{a.detail}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {a.acked ? (
            <button onClick={() => actions.ackAnomaly(a.key, "", false)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12 }}>
              Zrušiť potvrdenie
            </button>
          ) : (
            <button onClick={() => setOpen((v) => !v)} style={{ background: "none", border: "none", color: C.accentLight, cursor: "pointer", fontSize: 12 }}>
              Potvrdiť / vysvetliť
            </button>
          )}
        </div>
      </div>
      {a.acked && a.note && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Pozn.: {a.note}</div>}
      {open && !a.acked && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vysvetlenie (voliteľné)" style={{ ...S.input, fontSize: 12 }} />
          <button onClick={() => { actions.ackAnomaly(a.key, note); setOpen(false); }} style={{ ...btn("accent"), fontSize: 12, padding: "6px 12px" }}>
            Potvrdiť
          </button>
        </div>
      )}
    </div>
  );
}

function ResetButton({ onReset }: { onReset: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button onClick={() => setConfirm(true)} style={{ ...btn("outline"), color: C.red, borderColor: C.red + "55" }}>
        Vymazať všetky dáta
      </button>
    );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.red }}>Naozaj vymazať všetky dáta?</span>
      <button onClick={() => { void onReset(); setConfirm(false); }} style={{ ...btn("danger"), fontSize: 12, padding: "6px 12px" }}>Áno, vymazať</button>
      <button onClick={() => setConfirm(false)} style={{ ...btn("ghost"), fontSize: 12, padding: "6px 12px" }}>Zrušiť</button>
    </div>
  );
}
