import { useMemo, useRef, useState } from "react";

import {
  membershipBucket,
  MEMBERSHIP_ORDER,
  monthlyFinance,
  predictEarnings,
  TARGET_H,
  ZONE_HI,
  ZONE_LO,
  type CapacityRow,
  type ClientAgg,
  type RegisterItem,
  type SixMRow,
} from "../../lib/psb/compute";
import { fmtCZK, monthLabel, weekKey, weekLabel } from "../../lib/psb/format";
import { C, MEMBERSHIP_COLORS, S, badge, btn } from "../../lib/psb/theme";
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
  capacity,
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
    // "Aktívny" = everyone except Neaktívny (matches the Klienti tab count).
    const active = list.filter((c) => c.status !== "Neaktívny" && matchT(c.primaryTrainer)).length;
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

  // All weeks (chronological) — the chart scrolls horizontally.
  const weekRows = useMemo(() => {
    const map: Record<string, { Jerry: number; Terezka: number }> = {};
    for (const s of data.sessions) {
      const k = weekKey(s.date);
      const e = (map[k] ||= { Jerry: 0, Terezka: 0 });
      if (s.sessionTrainer === "Jerry") e.Jerry += s.duration / 60;
      else if (s.sessionTrainer === "Terezka") e.Terezka += s.duration / 60;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.sessions]);

  const weeklyHours = useMemo(() => {
    const series = trainer === "all"
      ? [{ name: "Jerry", color: C.accent }, { name: "Terezka", color: C.accentLight }]
      : [{ name: trainer, color: C.accent }];
    return {
      series,
      data: weekRows.map(([k, v]) => ({
        label: weekLabel(k),
        values: trainer === "all" ? [v.Jerry, v.Terezka] : [trainer === "Jerry" ? v.Jerry : v.Terezka],
      })),
    };
  }, [weekRows, trainer]);

  // How many trainer-weeks landed in / below / above the healthy zone.
  const zones = useMemo(() => {
    let zdrava = 0, pod = 0, nad = 0;
    const trainers = trainer === "all" ? (["Jerry", "Terezka"] as const) : [trainer];
    for (const [, v] of weekRows) {
      for (const t of trainers) {
        const h = (v as Record<string, number>)[t];
        if (!h) continue;
        if (h >= ZONE_LO && h <= ZONE_HI) zdrava++;
        else if (h < ZONE_LO) pod++;
        else nad++;
      }
    }
    return { zdrava, pod, nad, total: zdrava + pod + nad };
  }, [weekRows, trainer]);

  const earnings = useMemo(() => {
    const months = monthlyFinance(data); // all months, from Sep 2025 — chart scrolls
    const bars: { label: string; value: number; forecast?: boolean }[] = months.map((m) => ({
      label: monthLabel(m.month),
      value: trainer === "all" ? m.revenue : m.byTrainer[trainer]?.revenue || 0,
    }));
    if (trainer === "all") {
      const pred = predictEarnings(data, clients, { excludeSpecial: false });
      for (const pm of pred.months.slice(0, 2)) {
        bars.push({ label: monthLabel(pm.month), value: Math.round(pm.guaranteed + pm.expected), forecast: true });
      }
    }
    return bars;
  }, [data, clients, trainer]);

  const membershipDonut = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of Object.values(clients)) {
      if (c.status === "Neaktívny" || !matchT(c.primaryTrainer)) continue;
      const b = membershipBucket(c.membership);
      counts[b] = (counts[b] || 0) + 1;
    }
    return MEMBERSHIP_ORDER.filter((k) => counts[k]).map((k) => ({ label: k, value: counts[k], color: MEMBERSHIP_COLORS[k] }));
  }, [clients, trainer]);

  const sixMPhases = useMemo(() => {
    const f = sixM.filter((c) => matchT(c.primaryTrainer));
    const n = (p: string) => f.filter((c) => c.phase === p).length;
    return { total: f.length, data: [
      { label: "Obnova (1–6)", value: n("Obnova"), color: C.green },
      { label: "Integrácia (7–18)", value: n("Integrácia"), color: C.orange },
      { label: "Udržateľnosť (19+)", value: n("Udržateľnosť"), color: C.red },
    ] };
  }, [sixM, trainer]);

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
        <StatCard value={stats.active} label="Aktívnych klientov" onClick={() => onNavigate("klienti")} />
        <StatCard value={`${stats.weekHours.toFixed(0)}h`} label={stats.lastWeek ? `Odrobené (týž. ${weekLabel(stats.lastWeek)})` : "Týždenné hodiny"} onClick={() => onNavigate("treningy")} />
        <StatCard value={fmtCZK(stats.monthRevenue)} label={stats.lastMonth ? `Zárobky ${monthLabel(stats.lastMonth)}` : "Mesačné zárobky"} onClick={() => onNavigate("financie")} />
        <StatCard value={stats.sixMCount} label="6M klientov" onClick={() => onNavigate("6m")} />
      </StatGrid>

      {/* Nosný riadok: hodiny/týždeň (ľavá polovica) + týždne v zóne (pravá) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 12, alignItems: "stretch" }}>
        <Card style={{ marginBottom: 0 }}>
          <H3>
            <Info text="Odtrénované hodiny za týždeň. Otvára sa na najnovšom týždni — posúvaj doľava do minulosti. Zelené pásmo 24–34h je zdravá zóna na jedného trénera." label="Odrobené hodiny / týždeň" />
          </H3>
          {weeklyHours.data.length ? (
            <ZoneBars data={weeklyHours.data} series={weeklyHours.series} zone={{ lo: ZONE_LO, hi: ZONE_HI }} height={180} alignEnd />
          ) : (
            <Empty>Nahraj Payroll by Session.</Empty>
          )}
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <H3>
            <Info text="Koľko trénerských týždňov padlo do zdravej zóny (24–34h), pod ňu alebo nad ňu — za celé obdobie." label="Týždne v zdravej zóne" />
          </H3>
          {zones.total ? (
            <Donut
              size={140}
              centerLabel={`${Math.round((zones.zdrava / zones.total) * 100)}%`}
              data={[
                { label: "Zdravá zóna", value: zones.zdrava, color: C.green },
                { label: "Pod zónou", value: zones.pod, color: C.red },
                { label: "Nad zónou", value: zones.nad, color: C.orange },
              ]}
            />
          ) : (
            <Empty>Nahraj Payroll by Session.</Empty>
          )}
        </Card>
      </div>

      {/* Kapacita (ľavá) + 6M fázy (pravá) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 12, alignItems: "stretch" }}>
        <CapacityCard capacity={capacity} trainer={trainer} onNavigate={onNavigate} />
        <Card style={{ marginBottom: 0 }}>
          <H3>
            <Info text="Rozdelenie 6M klientov podľa fázy procesu: Obnova (1.–6. mesiac), Integrácia (7.–18.), Udržateľnosť (19+). Mení sa podľa prepínača trénera hore." label="6M klienti podľa fázy" />
          </H3>
          {sixMPhases.total ? (
            <Donut size={140} centerLabel={String(sixMPhases.total)} data={sixMPhases.data} />
          ) : (
            <Empty>{trainer === "all" ? "Žiadni 6M klienti." : `${trainer} nemá 6M klientov.`}</Empty>
          )}
        </Card>
      </div>

      {/* Mesačné zárobky (ľavá, širšia) + balíčky klientov (pravá) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 2fr) minmax(240px, 1fr)", gap: 12, marginBottom: 12, alignItems: "stretch" }}>
        <Card style={{ marginBottom: 0 }}>
          <H3>
            <Info text="Vyfakturované zárobky za mesiac. Otvára sa na najnovšom mesiaci — posúvaj doľava do minulosti. Posledné 2 svetlé stĺpce (⌁) sú odhad na ďalšie mesiace." label={trainer === "all" ? "Mesačné zárobky + odhad" : `Mesačné zárobky — ${trainer}`} />
          </H3>
          {earnings.length ? <ValueBars data={earnings} color={C.accent} forecastColor={C.blue} fmt={(n) => `${Math.round(n / 1000)}k`} height={180} alignEnd /> : <Empty>Nahraj Payroll.</Empty>}
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <H3>
            <Info text="Koľko klientov má aký typ balíčka/predplatného (z reportu Packages & Memberships). Mení sa podľa prepínača trénera hore." label="Klienti podľa balíčka" />
          </H3>
          {membershipDonut.length ? <Donut size={130} centerLabel={String(membershipDonut.reduce((a, d) => a + d.value, 0))} data={membershipDonut} onSlice={() => onNavigate("klienti")} /> : <Empty>Nahraj Packages & Memberships.</Empty>}
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

function CapacityCard({ capacity, trainer, onNavigate }: { capacity: CapacityRow[]; trainer: string; onNavigate: (t: string) => void }) {
  const jerry = capacity.find((c) => c.trainer === "Jerry");
  const terezka = capacity.find((c) => c.trainer === "Terezka");

  // Follows the trainer pill: Obaja = Spolu PSB, else the selected trainer.
  let name: string, clients: number, weekly: number, canTake: number, target: number;
  if (trainer === "all") {
    name = "Spolu (PSB)";
    clients = (jerry?.clients || 0) + (terezka?.clients || 0);
    weekly = (jerry?.recentWeekly || 0) + (terezka?.recentWeekly || 0);
    canTake = (jerry?.canTake || 0) + (terezka?.canTake || 0);
    target = TARGET_H * 2;
  } else {
    const c = trainer === "Jerry" ? jerry : terezka;
    name = trainer;
    clients = c?.clients || 0;
    weekly = c?.recentWeekly || 0;
    canTake = c?.canTake || 0;
    target = TARGET_H;
  }
  const perTrainerWeekly = trainer === "all" ? weekly / 2 : weekly;
  const util = target ? (weekly / target) * 100 : 0;
  const inZone = perTrainerWeekly >= ZONE_LO && perTrainerWeekly <= ZONE_HI;
  const over = perTrainerWeekly > ZONE_HI;
  const color = inZone ? C.green : over ? C.red : C.orange;

  return (
    <Card style={{ marginBottom: 0, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <H3>
          <Info
            text="Vyťaženie z REÁLNE odtrénovaných hodín za týždeň (priemer posledných 8 týždňov) oproti cieľu 29h na trénera. „Zvládne ešte N klientov“ = koľko klientov ako tvoj súčasný priemer sa ešte zmestí do hornej hranice zdravej zóny (34h). Nevieš dopredu, či bude Anchor/Stabilný — počíta sa preto z priemeru tvojich terajších klientov. Mení sa podľa prepínača trénera hore."
            label={`Kapacita & vyťaženie — ${name}`}
          />
        </H3>
        <button onClick={() => onNavigate("klienti")} style={{ ...linkBtn, fontSize: 12 }}>Detail →</button>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1 }}>{util.toFixed(0)}%</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>vyťaženie (cieľ {target}h)</div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMuted, marginBottom: 5 }}>
            <span>Klienti</span>
            <strong style={{ color: C.text }}>{clients}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMuted, marginBottom: 8 }}>
            <span>Odtrénované h/týž (Ø 8 týž.)</span>
            <strong style={{ color: C.text }}>{weekly.toFixed(0)}</strong>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: over ? C.red : C.accentLight }}>
            {over ? "Nad zónou — preťaženie" : `Zvládne ešte ~${canTake} klientov`}
          </div>
        </div>
      </div>
    </Card>
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
