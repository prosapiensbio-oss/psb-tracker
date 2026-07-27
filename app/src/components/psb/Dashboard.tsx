import { useMemo, useRef, useState } from "react";

import {
  monthlyFinance,
  predictEarnings,
  ZONE_HI,
  ZONE_LO,
  type CapacityRow,
  type ClientAgg,
  type RegisterItem,
  type SixMRow,
} from "../../lib/psb/compute";
import { fmtCZK, monthLabel, weekKey, weekLabel } from "../../lib/psb/format";
import { C, S, badge, btn } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { IngestResult } from "../../lib/psb/db.server";
import type { Actions } from "./App";
import { Card, Donut, Empty, H3, Info, StatCard, StatGrid, ValueBars, ZoneBars } from "./ui";

const REPORTS: { key: keyof PSBData; label: string; path: string }[] = [
  { key: "sessions", label: "Payroll by Session", path: "Payroll Reports › By Session" },
  { key: "services", label: "Payroll by Service", path: "Payroll Reports › By Service" },
  { key: "payments", label: "Payments Recorded", path: "Financial Reports › Payments Recorded" },
  { key: "packages", label: "Packages & Memberships", path: "General Reports › Packages & Memberships" },
];

const catTone = (c: RegisterItem["category"]) => (c === "6M" ? "accent" : c === "Kapacita" ? "blue" : "orange");

const TRAINER_OPTS = [
  { value: "all", label: "Obaja" },
  { value: "Jerry", label: "Jerry" },
  { value: "Terezka", label: "Terezka" },
];

function TrainerPills({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.textMuted }}>Tréner:</span>
      {TRAINER_OPTS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: "5px 14px",
            borderRadius: 20,
            border: `1px solid ${value === o.value ? C.accent : C.border}`,
            background: value === o.value ? C.accentBg : "transparent",
            color: value === o.value ? C.accentLight : C.textMuted,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dashboard({
  data,
  clients,
  register,
  sixM,
  actions,
  onNavigate,
}: {
  data: PSBData;
  clients: Record<string, ClientAgg>;
  register: RegisterItem[];
  sixM: SixMRow[];
  capacity: CapacityRow[];
  actions: Actions;
  onNavigate: (tab: string) => void;
}) {
  const [trainer, setTrainer] = useState("all");
  const [showAcked, setShowAcked] = useState(false);
  const matchT = (t: string) => trainer === "all" || t === trainer;

  const stats = useMemo(() => {
    const list = Object.values(clients);
    const isActive = (c: ClientAgg) => c.status === "Aktívny" || c.status === "Sporadický";
    const active = list.filter((c) => isActive(c) && matchT(c.primaryTrainer)).length;
    const weeks = data.sessions.map((s) => weekKey(s.date)).sort();
    const lastWeek = weeks[weeks.length - 1];
    const weekHours = data.sessions
      .filter((s) => weekKey(s.date) === lastWeek && matchT(s.sessionTrainer))
      .reduce((a, s) => a + s.duration / 60, 0);
    const months = monthlyFinance(data);
    const lastMonth = months[months.length - 1];
    const monthRevenue = lastMonth
      ? trainer === "all"
        ? lastMonth.revenue
        : lastMonth.byTrainer[trainer]?.revenue || 0
      : 0;
    const sixMCount = sixM.filter((c) => matchT(c.primaryTrainer)).length;
    return { active, weekHours, lastWeek, monthRevenue, lastMonth: lastMonth?.month, sixMCount };
  }, [clients, data, sixM, trainer]);

  const weeklyHours = useMemo(() => {
    const map: Record<string, { ts: number; Jerry: number; Terezka: number }> = {};
    for (const s of data.sessions) {
      const k = weekKey(s.date);
      const e = (map[k] ||= { ts: new Date(s.date).getTime(), Jerry: 0, Terezka: 0 });
      if (s.sessionTrainer === "Jerry") e.Jerry += s.duration / 60;
      else if (s.sessionTrainer === "Terezka") e.Terezka += s.duration / 60;
    }
    const rows = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
    const series = trainer === "all"
      ? [{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]
      : [{ name: trainer, color: C.accent }];
    return {
      series,
      data: rows.map(([k, v]) => ({
        label: weekLabel(k),
        values: trainer === "all" ? [v.Jerry, v.Terezka] : [trainer === "Jerry" ? v.Jerry : v.Terezka],
      })),
    };
  }, [data.sessions, trainer]);

  const earnings = useMemo(() => {
    const months = monthlyFinance(data).slice(-6);
    const bars = months.map((m) => ({
      label: monthLabel(m.month),
      value: trainer === "all" ? m.revenue : m.byTrainer[trainer]?.revenue || 0,
    }));
    if (trainer === "all") {
      const pred = predictEarnings(data, clients, { excludeSpecial: false });
      // pred.months[0] is the current month; [1],[2] are the next two.
      for (const pm of pred.months.slice(1, 3)) {
        bars.push({ label: monthLabel(pm.month), value: Math.round(pm.guaranteed + pm.expected), forecast: true } as never);
      }
    }
    return bars as { label: string; value: number; forecast?: boolean }[];
  }, [data, clients, trainer]);

  const segmentDonut = useMemo(() => {
    const list = Object.values(clients).filter((c) => c.status !== "Neaktívny" && matchT(c.primaryTrainer));
    const seg = (s: string) => list.filter((c) => c.segment === s).length;
    return [
      { label: "Anchor", value: seg("Anchor"), color: C.green },
      { label: "Stabilný", value: seg("Stabilný"), color: C.orange },
      { label: "Sporadický", value: seg("Sporadický"), color: C.red },
    ];
  }, [clients, trainer]);

  const missing = REPORTS.filter((r) => (data[r.key] as unknown[]).length === 0);
  const open = register.filter((r) => !r.acked);
  const acked = register.filter((r) => r.acked);
  const visible = showAcked ? register : open;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <TrainerPills value={trainer} onChange={setTrainer} />
      </div>

      <StatGrid>
        <StatCard value={stats.active} label="Aktívnych klientov" />
        <StatCard value={`${stats.weekHours.toFixed(0)}h`} label={stats.lastWeek ? `Odrobené (týž. ${weekLabel(stats.lastWeek)})` : "Týždenné hodiny"} />
        <StatCard value={fmtCZK(stats.monthRevenue)} label={stats.lastMonth ? `Zárobky ${monthLabel(stats.lastMonth)}` : "Mesačné zárobky"} />
        <StatCard value={stats.sixMCount} label="6M klientov" />
      </StatGrid>

      {/* Nosný graf — hore */}
      <Card>
        <H3>
          <Info text="Odtrénované hodiny za týždeň. Zelené pásmo 24–34h je zdravá zóna na jedného trénera — vidíš, ako ďaleko ste od nej." label="Odrobené hodiny / týždeň (posledných 8)" />
        </H3>
        {weeklyHours.data.length ? (
          <ZoneBars data={weeklyHours.data} series={weeklyHours.series} zone={{ lo: ZONE_LO, hi: ZONE_HI }} height={180} />
        ) : (
          <Empty>Nahraj Payroll by Session.</Empty>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 12 }}>
        <Card style={{ marginBottom: 0 }}>
          <H3>
            <Info text="Prijaté/vyfakturované zárobky za mesiac. Posledné 2 svetlé stĺpce (⌁) sú odhad na ďalšie mesiace z predikcie." label={trainer === "all" ? "Mesačné zárobky + odhad" : `Mesačné zárobky — ${trainer}`} />
          </H3>
          {earnings.length ? <ValueBars data={earnings} color={C.accent} forecastColor={C.blue} fmt={(n) => `${Math.round(n / 1000)}k`} height={170} /> : <Empty>Nahraj Payroll.</Empty>}
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <H3>{trainer === "all" ? "Aktívni klienti podľa segmentu" : `Segmenty — ${trainer}`}</H3>
          {segmentDonut.some((d) => d.value > 0) ? <Donut data={segmentDonut} size={140} centerLabel={String(stats.active)} /> : <Empty>Žiadni klienti.</Empty>}
        </Card>
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <H3>
            <Info
              text="Zoznam vecí na akciu: 6M upozornenia, kapacita, klienti čo prestali chodiť, dochádzajúce balíčky. Akceptovať (s poznámkou) alebo Skryť ich odstráni z tohto zoznamu. (AI asistent, ktorý sa ťa doptá, pribudne keď dodáš API kľúč.)"
              label={`Na čo sa pozrieť (${open.length})`}
            />
          </H3>
          {acked.length > 0 && (
            <button onClick={() => setShowAcked((v) => !v)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
              {showAcked ? "Skryť vybavené" : `Zobraziť vybavené (${acked.length})`}
            </button>
          )}
        </div>
        {visible.length ? (
          visible.map((r) => <RegisterRow key={r.key} item={r} actions={actions} onNavigate={onNavigate} />)
        ) : (
          <Empty>Nič nevyžaduje pozornosť 🌿</Empty>
        )}
      </Card>

      <UploadCard data={data} missing={missing} actions={actions} />

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {data.uploadLog[0] ? `Posledný upload: ${new Date(data.uploadLog[0].date).toLocaleString("cs-CZ")}` : "Zatiaľ žiadny upload"}
        </div>
        <ResetButton onReset={actions.reset} />
      </div>
    </>
  );
}

const linkBtn = { background: "none", border: "none", color: C.accentLight, cursor: "pointer", fontSize: 12, padding: 0 } as const;

function RegisterRow({ item, actions, onNavigate }: { item: RegisterItem; actions: Actions; onNavigate: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(item.note && item.note !== "skryté" ? item.note : "");
  const jump = item.category === "6M" ? "6m" : item.category === "Kapacita" ? "treningy" : "klienti";
  return (
    <div style={{ padding: "9px 11px", marginBottom: 5, borderRadius: 8, background: item.acked ? "#ffffff06" : item.tone === "red" ? C.redBg : item.tone === "blue" ? C.blueBg : C.orangeBg, opacity: item.acked ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <span style={badge(catTone(item.category))}>{item.category}</span>
        <span style={{ color: C.text }}>{item.detail}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {!item.acked && <button onClick={() => onNavigate(jump)} style={linkBtn}>Otvoriť →</button>}
          {item.acked ? (
            <button onClick={() => actions.ackAnomaly(item.key, "", false)} style={linkBtn}>Vrátiť</button>
          ) : (
            <>
              <button onClick={() => setOpen((v) => !v)} style={linkBtn}>Akceptovať</button>
              <button onClick={() => actions.ackAnomaly(item.key, "skryté")} style={{ ...linkBtn, color: C.textDim }}>Skryť</button>
            </>
          )}
        </div>
      </div>
      {item.acked && item.note && item.note !== "skryté" && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Pozn.: {item.note}</div>}
      {open && !item.acked && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vysvetlenie (napr. klient prestal odpisovať)" style={{ ...S.input, fontSize: 12 }} autoFocus />
          <button onClick={() => { actions.ackAnomaly(item.key, note || "akceptované"); setOpen(false); }} style={{ ...btn("accent"), fontSize: 12, padding: "6px 12px", whiteSpace: "nowrap" }}>
            Uložiť
          </button>
        </div>
      )}
    </div>
  );
}

function UploadCard({ data, missing, actions }: { data: PSBData; missing: typeof REPORTS; actions: Actions }) {
  const [uploadResult, setUploadResult] = useState<IngestResult[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setBusy(true);
    const files: { filename: string; text: string }[] = [];
    for (const f of Array.from(fileList)) files.push({ filename: f.name, text: await f.text() });
    const res = await actions.ingest(files);
    setUploadResult(res);
    setBusy(false);
    setTimeout(() => setUploadResult(null), 9000);
  };

  return (
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
        <div style={{ fontSize: 24, marginBottom: 6 }}>⬆</div>
        <div style={{ color: C.text }}>{busy ? "Spracúvam…" : "Pretiahni CSV súbory sem alebo klikni"}</div>
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>Automaticky rozpozná typ. Duplicity preskočí, históriu zachová.</div>
      </div>
      <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }} />
      {uploadResult && (
        <div style={{ marginTop: 12 }}>
          {uploadResult.map((r, i) => (
            <div key={i} style={{ padding: 9, marginBottom: 4, fontSize: 12, borderRadius: 8, background: r.error ? C.redBg : C.greenBg, color: r.error ? C.red : C.green }}>
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
      <button onClick={() => { void onReset(); setConfirm(false); }} style={{ ...btn("danger"), fontSize: 12, padding: "6px 12px" }}>Áno</button>
      <button onClick={() => setConfirm(false)} style={{ ...btn("ghost"), fontSize: 12, padding: "6px 12px" }}>Zrušiť</button>
    </div>
  );
}
