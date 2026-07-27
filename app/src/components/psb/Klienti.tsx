import { useMemo, useState } from "react";

import { TRAINERS, type CapacityRow, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, fmtDate } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { Actions } from "./App";
import { Badge, Card, Donut, Empty, H3, Info, Modal, Select, SortTh, StatCard, StatGrid, TableWrap, useSort } from "./ui";

const segTone = (s: string) => (s === "Anchor" ? "green" : s === "Stabilný" ? "orange" : "red");
const statusTone = (s: string) =>
  s === "Aktívny" ? "green" : s === "Sporadický" ? "blue" : s === "Pauza" ? "orange" : "muted";
const modalityOf = (c: ClientAgg) => {
  let off = 0;
  let on = 0;
  for (const s of c.sessions) s.sessionType === "OFFLINE" || s.sessionType === "UVODNE" ? off++ : on++;
  return on > off ? "Online" : "Offline";
};

const SEGMENTS = ["Anchor", "Stabilný", "Sporadický"] as const;

export function Klienti({ clients, capacity, actions }: { clients: Record<string, ClientAgg>; capacity: CapacityRow[]; actions: Actions }) {
  const [fTrainer, setFTrainer] = useState("all");
  const [fSegment, setFSegment] = useState("all");
  const [typeF, setTypeF] = useState("all");
  const [modalityF, setModalityF] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const { sort, toggle, sorted } = useSort({ key: "name", dir: "asc" });

  const all = useMemo(() => Object.values(clients), [clients]);

  // Matrix counts (active clients only) per trainer × segment.
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const t of TRAINERS) m[t] = { Anchor: 0, Stabilný: 0, Sporadický: 0 };
    for (const c of all) {
      if (c.status === "Neaktívny") continue;
      if (m[c.primaryTrainer]) m[c.primaryTrainer][c.segment]++;
    }
    return m;
  }, [all]);

  const list = useMemo(() => {
    let arr = all.filter((c) => (showInactive ? true : c.status !== "Neaktívny"));
    if (fTrainer !== "all") arr = arr.filter((c) => c.primaryTrainer === fTrainer);
    if (fSegment !== "all") arr = arr.filter((c) => c.segment === fSegment);
    if (typeF !== "all") arr = arr.filter((c) => c.clientType === typeF);
    if (modalityF !== "all") arr = arr.filter((c) => modalityOf(c) === modalityF);
    return sorted(arr, {
      name: (c) => c.name,
      trainer: (c) => c.primaryTrainer,
      status: (c) => c.status,
      segment: (c) => c.attendance,
      type: (c) => c.clientType,
      pkg: (c) => c.packageRemaining,
      hours: (c) => c.totalHours,
      sessions: (c) => c.sessionCount,
      attendance: (c) => c.attendance,
      avg: (c) => c.paidAvg,
      last: (c) => new Date(c.lastSession).getTime(),
    });
  }, [all, fTrainer, fSegment, typeF, modalityF, showInactive, sorted]);

  const donut = useMemo(
    () =>
      SEGMENTS.map((s) => ({
        label: s,
        value: list.filter((c) => c.segment === s).length,
        color: s === "Anchor" ? C.green : s === "Stabilný" ? C.orange : C.red,
      })),
    [list],
  );
  const kpis = useMemo(() => {
    const n = list.length || 1;
    return {
      count: list.length,
      att: (list.reduce((a, c) => a + c.attendance, 0) / n) * 100,
      hpc: list.reduce((a, c) => a + c.totalHours, 0) / n,
      avg: list.reduce((a, c) => a + c.paidAvg, 0) / n,
    };
  }, [list]);

  const cell = (t: string, seg: string) => {
    const active = fTrainer === t && fSegment === seg;
    return (
      <td
        key={seg}
        onClick={() => { setFTrainer(active ? "all" : t); setFSegment(active ? "all" : seg); }}
        style={{ ...S.td, cursor: "pointer", textAlign: "center", fontWeight: 600, background: active ? C.accent : (fTrainer === t || fSegment === seg) && (fTrainer !== "all" || fSegment !== "all") ? C.accentBg : undefined, color: active ? "#fff" : C.text, borderRadius: 6 }}
      >
        {matrix[t]?.[seg] ?? 0}
      </td>
    );
  };

  const editC = edit ? clients[edit] : null;
  const filterLabel = fTrainer === "all" && fSegment === "all" ? "Všetci klienti" : `${fTrainer === "all" ? "" : fTrainer} ${fSegment === "all" ? "" : fSegment}`.trim();

  return (
    <>
      {/* Interactive capacity / segment matrix */}
      <Card>
        <H3>
          <Info text="Klikni na bunku (napr. Jerry × Anchor) a zoznam dole sa vyfiltruje na tých klientov. Klik na meno trénera = celý tréner, klik na segment = oba tréneri. Efekt. h/týž = odhad zaťaženia; zdravá zóna 24–34h." label="Kapacita & segmenty" />
        </H3>
        <TableWrap>
          <thead>
            <tr>
              <th style={S.th}></th>
              {SEGMENTS.map((s) => (
                <th key={s} onClick={() => { setFSegment(fSegment === s ? "all" : s); setFTrainer("all"); }} style={{ ...S.th, cursor: "pointer", textAlign: "center", color: fSegment === s ? C.accentLight : C.textMuted }}>
                  {s}
                </th>
              ))}
              <th style={S.th}>Efekt. h/týž</th>
              <th style={S.th}>Odporúčanie</th>
            </tr>
          </thead>
          <tbody>
            {TRAINERS.map((t) => {
              const cap = capacity.find((c) => c.trainer === t);
              return (
                <tr key={t}>
                  <td onClick={() => { setFTrainer(fTrainer === t ? "all" : t); setFSegment("all"); }} style={{ ...S.td, cursor: "pointer", fontWeight: 600, color: fTrainer === t ? C.accentLight : C.text }}>
                    {t}
                  </td>
                  {SEGMENTS.map((s) => cell(t, s))}
                  <td style={{ ...S.td, textAlign: "center", color: cap && cap.effHours >= 24 && cap.effHours <= 34 ? C.green : C.orange }}>{cap?.effHours.toFixed(1)}</td>
                  <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>{cap?.advice}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      {/* Filter-reactive KPIs + donut */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 2fr", gap: 12, marginBottom: 12 }}>
        <Card style={{ marginBottom: 0 }}>
          <H3>Segmenty — {filterLabel}</H3>
          {donut.some((d) => d.value > 0) ? <Donut data={donut} size={130} centerLabel={String(kpis.count)} /> : <Empty>Žiadni klienti.</Empty>}
        </Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          <StatCard value={kpis.count} label="Klientov (filter)" />
          <StatCard value={`${kpis.att.toFixed(0)}%`} label="Ø dochádzka" />
          <StatCard value={kpis.hpc.toFixed(1)} label="Ø hodín/klient" />
          <StatCard value={fmtCZK(kpis.avg)} label="Ø CZK/sedenie" />
        </div>
      </div>

      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: C.accentLight, fontWeight: 600, marginRight: 4 }}>{filterLabel} · {list.length}</span>
          {(fTrainer !== "all" || fSegment !== "all") && (
            <button onClick={() => { setFTrainer("all"); setFSegment("all"); }} style={{ background: C.cardHover, border: "none", borderRadius: 6, padding: "5px 10px", color: C.textMuted, fontSize: 12, cursor: "pointer" }}>
              ✕ zrušiť filter matice
            </button>
          )}
          <Select value={typeF} onChange={setTypeF} options={[
            { value: "all", label: "Všetky typy" },
            { value: "6M Predplatné", label: "6M Predplatné" },
            { value: "Balíček", label: "Balíček" },
          ]} />
          <Select value={modalityF} onChange={setModalityF} options={[
            { value: "all", label: "Offline + Online" },
            { value: "Offline", label: "Prevažne Offline" },
            { value: "Online", label: "Prevažne Online" },
          ]} />
          <label style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ accentColor: C.accent }} />
            Zobraziť aj neaktívnych
          </label>
        </div>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Klient" sortKey="name" sort={sort} onSort={toggle} />
              <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
              <SortTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
              <SortTh label="Segment" sortKey="segment" sort={sort} onSort={toggle} info="Anchor ≥84 % týždňov, Stabilný ≥50 %, Sporadický <50 % — z posledných 18 týždňov dochádzky." />
              <SortTh label="Typ" sortKey="type" sort={sort} onSort={toggle} />
              <SortTh label="Balíček" sortKey="pkg" sort={sort} onSort={toggle} info="Zostatok sedení z reportu Packages & Memberships." />
              <SortTh label="Hodiny" sortKey="hours" sort={sort} onSort={toggle} />
              <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} />
              <SortTh label="Dochádzka" sortKey="attendance" sort={sort} onSort={toggle} />
              <SortTh label="Ø CZK" sortKey="avg" sort={sort} onSort={toggle} />
              <SortTh label="Posledný" sortKey="last" sort={sort} onSort={toggle} />
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.name} style={{ background: c.specialRate ? C.orangeBg : undefined, opacity: c.status === "Neaktívny" ? 0.6 : 1 }}>
                <td style={{ ...S.td, fontWeight: 500 }}>
                  {c.name}
                  {c.specialRate && <span title={c.specialRateNote} style={{ marginLeft: 6, fontSize: 10, color: C.orange }}>★</span>}
                  {c.substituteCount > 0 && <span title={`${c.substituteCount}× zástup`} style={{ marginLeft: 6, fontSize: 9, color: C.blue }}>⇄</span>}
                </td>
                <td style={S.td}>{c.primaryTrainer}{c.primaryTrainerOverride && <span title="Manuálne" style={{ fontSize: 9, color: C.textDim, marginLeft: 3 }}>✎</span>}</td>
                <td style={S.td}><Badge tone={statusTone(c.status)}>{c.status}</Badge>{c.statusOverride && <span title={`Auto: ${c.statusAuto}`} style={{ fontSize: 9, color: C.textDim, marginLeft: 4 }}>✎</span>}</td>
                <td style={S.td}><Badge tone={segTone(c.segment)}>{c.segment}</Badge></td>
                <td style={S.td}><span style={{ fontSize: 11, color: c.clientType === "6M Predplatné" ? C.accentLight : C.textMuted }}>{c.clientType}</span></td>
                <td style={S.td}>{c.packageTotal ? `${c.packageRemaining}/${c.packageTotal}` : "—"}</td>
                <td style={S.td}>{c.totalHours.toFixed(0)}</td>
                <td style={S.td}>{c.sessionCount}</td>
                <td style={S.td}>{(c.attendance * 100).toFixed(0)}%</td>
                <td style={S.td}>{fmtCZK(c.paidAvg)}</td>
                <td style={S.td}>{fmtDate(c.lastSession)}</td>
                <td style={S.td}><button onClick={() => setEdit(c.name)} style={{ background: C.cardHover, border: "none", borderRadius: 6, padding: "4px 9px", cursor: "pointer", color: C.text, fontSize: 11 }}>✎</button></td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!list.length && <Empty>Žiadni klienti pre tento filter.</Empty>}
      </Card>

      {editC && (
        <Modal title={editC.name} onClose={() => setEdit(null)}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Status (manuálny override vždy vyhráva)</div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Automatický návrh: {editC.statusAuto}</div>
          <Select style={{ width: "100%", marginBottom: 14 }} value={editC.statusOverride ? editC.status : ""} onChange={(v) => actions.setOverride(editC.name, "status", v)} options={[
            { value: "", label: "Automatický" },
            { value: "Aktívny", label: "Aktívny" },
            { value: "Sporadický", label: "Sporadický" },
            { value: "Pauza", label: "Pauza" },
            { value: "Neaktívny", label: "Neaktívny" },
          ]} />
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Primárny tréner (override)</div>
          <Select style={{ width: "100%", marginBottom: 14 }} value={editC.primaryTrainerOverride ? editC.primaryTrainer : ""} onChange={(v) => actions.setOverride(editC.name, "primaryTrainer", v)} options={[
            { value: "", label: `Automatický (${editC.primaryTrainer})` },
            { value: "Jerry", label: "Jerry" },
            { value: "Terezka", label: "Terezka" },
          ]} />
          <label style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={editC.specialRate} onChange={(e) => actions.setOverride(editC.name, "specialRate", e.target.checked)} style={{ accentColor: C.accent }} />
            Špeciálna sadzba (investor, rodina, zamestnanec…)
          </label>
          {editC.specialRate && (
            <input style={{ ...S.input, marginBottom: 14 }} placeholder="Dôvod špeciálnej sadzby" defaultValue={editC.specialRateNote} onBlur={(e) => actions.setOverride(editC.name, "specialRateNote", e.target.value)} />
          )}
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, marginTop: 4 }}>Poznámka trénera (nikdy sa neprepíše uploadom)</div>
          <textarea style={{ ...S.input, minHeight: 70, resize: "vertical", marginBottom: 14 }} defaultValue={editC.trainerNote} onBlur={(e) => actions.setOverride(editC.name, "trainerNote", e.target.value)} />
          <button onClick={() => setEdit(null)} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, width: "100%" }}>Hotovo</button>
        </Modal>
      )}
    </>
  );
}
