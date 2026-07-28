import { useMemo, useState } from "react";

import { membershipBucket, MEMBERSHIP_ORDER, TRAINERS, type CapacityRow, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, fmtDate } from "../../lib/psb/format";
import { C, MEMBERSHIP_COLORS, S } from "../../lib/psb/theme";
import type { Actions } from "./App";
import { Badge, Card, Donut, Empty, H3, Info, Modal, Select, SortTh, StatCard, TableWrap, useSort } from "./ui";

const segTone = (s: string) => (s === "Anchor" ? "green" : s === "Stabilný" ? "orange" : "red");
const segColor = (s: string) => (s === "Anchor" ? C.green : s === "Stabilný" ? C.orange : C.red);
// Logical status order for sorting (not alphabetical, so Pauza/Neaktívny land last).
const STATUS_RANK: Record<string, number> = { "Aktívny": 0, "Sporadický": 1, "Pauza": 2, "Neaktívny": 3 };
const statusTone = (s: string) =>
  s === "Aktívny" ? "green" : s === "Sporadický" ? "blue" : s === "Pauza" ? "orange" : "muted";
const SEGMENTS = ["Anchor", "Stabilný", "Sporadický"] as const;
const shortPkg = (m: string) => m.replace(/^OFF - /, "").replace(/^ON - /, "ON ").replace(" hodín offline", "h").replace("hodina offline", "h");

const KPI_WINDOWS = [
  { value: "all", label: "Celá história", days: 0 },
  { value: "30", label: "Posledný mesiac", days: 30 },
  { value: "90", label: "Posledný kvartál", days: 90 },
  { value: "custom", label: "Vlastné obdobie", days: -1 },
];

export function Klienti({ clients, capacity, actions }: { clients: Record<string, ClientAgg>; capacity: CapacityRow[]; actions: Actions }) {
  const [fTrainer, setFTrainer] = useState("all");
  const [fSegment, setFSegment] = useState("all");
  const [typeF, setTypeF] = useState("all");
  const [modalityF, setModalityF] = useState("all");
  const [membershipF, setMembershipF] = useState(""); // package bucket from the donut
  const [showInactive, setShowInactive] = useState(false);
  const [kpiWin, setKpiWin] = useState("all");
  const [kpiFrom, setKpiFrom] = useState("");
  const [kpiTo, setKpiTo] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const { sort, toggle, sorted } = useSort({ key: "name", dir: "asc" });

  const all = useMemo(() => Object.values(clients), [clients]);

  // Package-type filter options built from the real memberships in the data.
  const typeOptions = useMemo(() => {
    const memberships = [...new Set(all.map((c) => c.membership).filter(Boolean))].sort();
    return [
      { value: "all", label: "Všetky typy" },
      { value: "grp:6M Predplatné", label: "6M Predplatné (všetky)" },
      { value: "grp:Balíček", label: "Balíček (všetky)" },
      ...memberships.map((m) => ({ value: `m:${m}`, label: m })),
    ];
  }, [all]);

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const t of TRAINERS) m[t] = { Anchor: 0, Stabilný: 0, Sporadický: 0 };
    for (const c of all) {
      if (c.status === "Neaktívny") continue;
      if (m[c.primaryTrainer]) m[c.primaryTrainer][c.segment]++;
    }
    return m;
  }, [all]);

  // Everything except the package-donut filter — the donut is built from this,
  // so its slices stay visible/clickable even after you pick one.
  const baseList = useMemo(() => {
    let arr = all.filter((c) => (showInactive ? true : c.status !== "Neaktívny"));
    if (fTrainer !== "all") arr = arr.filter((c) => c.primaryTrainer === fTrainer);
    if (fSegment !== "all") arr = arr.filter((c) => c.segment === fSegment);
    if (typeF.startsWith("grp:")) arr = arr.filter((c) => c.clientType === typeF.slice(4));
    else if (typeF.startsWith("m:")) arr = arr.filter((c) => c.membership === typeF.slice(2));
    if (modalityF !== "all") arr = arr.filter((c) => c.modality === modalityF);
    return arr;
  }, [all, fTrainer, fSegment, typeF, modalityF, showInactive]);

  const membershipDonut = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of baseList) {
      const b = membershipBucket(c.membership);
      counts[b] = (counts[b] || 0) + 1;
    }
    return MEMBERSHIP_ORDER.filter((k) => counts[k]).map((k) => ({ label: k, value: counts[k], color: MEMBERSHIP_COLORS[k] }));
  }, [baseList]);

  const list = useMemo(() => {
    const arr = membershipF ? baseList.filter((c) => membershipBucket(c.membership) === membershipF) : baseList;
    return sorted(arr, {
      name: (c) => c.name,
      trainer: (c) => c.primaryTrainer,
      status: (c) => STATUS_RANK[c.status] ?? 9,
      segment: (c) => c.attendance,
      type: (c) => c.membership || c.clientType,
      pkg: (c) => c.packageRemaining,
      hours: (c) => c.totalHours,
      sessions: (c) => c.sessionCount,
      attendance: (c) => c.attendance,
      avg: (c) => c.paidAvg,
      last: (c) => new Date(c.lastSession).getTime(),
    });
  }, [baseList, membershipF, sorted]);

  const donut = useMemo(
    () => SEGMENTS.map((s) => ({ label: s, value: list.filter((c) => c.segment === s).length, color: segColor(s) })),
    [list],
  );

  // KPI tiles scoped to the chosen time window.
  const kpis = useMemo(() => {
    const preset = KPI_WINDOWS.find((w) => w.value === kpiWin);
    let lo = 0;
    let hi = Infinity;
    let scoped = kpiWin !== "all";
    if (kpiWin === "custom") {
      lo = kpiFrom ? new Date(kpiFrom).getTime() : 0;
      hi = kpiTo ? new Date(kpiTo).getTime() + 86400000 : Infinity;
      scoped = !!(kpiFrom || kpiTo);
    } else if (preset && preset.days > 0) {
      lo = Date.now() - preset.days * 86400000;
    }
    let hours = 0, paid = 0, paidN = 0, clientsWithSess = 0;
    for (const c of list) {
      const sess = scoped ? c.sessions.filter((s) => { const t = new Date(s.date).getTime(); return t >= lo && t <= hi; }) : c.sessions;
      if (sess.length) clientsWithSess++;
      for (const s of sess) {
        hours += s.duration / 60;
        if (s.price > 0) { paid += s.price; paidN++; }
      }
    }
    const denom = (scoped ? clientsWithSess : list.length) || 1;
    const att = list.length ? (list.reduce((a, c) => a + c.attendance, 0) / list.length) * 100 : 0;
    return { count: list.length, activeInWin: clientsWithSess, att, hpc: hours / denom, avg: paidN ? paid / paidN : 0, scoped };
  }, [list, kpiWin, kpiFrom, kpiTo]);

  const cell = (t: string, seg: string) => {
    const active = fTrainer === t && fSegment === seg;
    const n = matrix[t]?.[seg] ?? 0;
    return (
      <td
        key={seg}
        onClick={() => { setFTrainer(active ? "all" : t); setFSegment(active ? "all" : seg); }}
        style={{ ...S.td, cursor: "pointer", textAlign: "center", fontWeight: 700, background: active ? segColor(seg) : n ? segColor(seg) + "22" : undefined, color: active ? "#14180F" : segColor(seg), borderRadius: 6 }}
      >
        {n}
      </td>
    );
  };

  const editC = edit ? clients[edit] : null;
  const filterLabel = fTrainer === "all" && fSegment === "all" ? "Všetci klienti" : `${fTrainer === "all" ? "" : fTrainer} ${fSegment === "all" ? "" : fSegment}`.trim();

  return (
    <>
      {/* Filtre + KPI úplne hore */}
      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <Select value={fTrainer} onChange={(v) => { setFTrainer(v); if (v === "all") setFSegment("all"); }} options={[
            { value: "all", label: "Obaja tréneri" },
            { value: "Jerry", label: "Jerry" },
            { value: "Terezka", label: "Terezka" },
          ]} />
          <Select value={typeF} onChange={setTypeF} options={typeOptions} />
          <Select value={modalityF} onChange={setModalityF} options={[
            { value: "all", label: "Offline + Online" },
            { value: "Offline", label: "Prevažne Offline" },
            { value: "Online", label: "Prevažne Online" },
          ]} />
          <label style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ accentColor: C.accent }} />
            Aj neaktívnych
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.textDim }}>Obdobie štatistík:</span>
            <Select value={kpiWin} onChange={setKpiWin} options={KPI_WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
            {kpiWin === "custom" && (
              <>
                <input type="date" value={kpiFrom} onChange={(e) => setKpiFrom(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
                <span style={{ color: C.textDim, alignSelf: "center" }}>–</span>
                <input type="date" value={kpiTo} onChange={(e) => setKpiTo(e.target.value)} style={{ ...S.select, colorScheme: "dark" }} />
              </>
            )}
          </div>
        </div>
        {(fSegment !== "all" || membershipF) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {fSegment !== "all" && (
              <button onClick={() => setFSegment("all")} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "4px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>Segment: {fSegment} ✕</button>
            )}
            {membershipF && (
              <button onClick={() => setMembershipF("")} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "4px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>Balíček: {membershipF} ✕</button>
            )}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          <StatCard value={kpis.scoped ? kpis.activeInWin : kpis.count} label={<Info text="Počet klientov, ktorí prešli aktuálnymi filtrami. V časovom okne = koľko z nich reálne chodilo v danom období." label={kpis.scoped ? "Chodilo v období" : "Klientov vo výbere"} />} />
          <StatCard value={`${kpis.att.toFixed(0)}%`} label={<Info text="Priemerný podiel týždňov, v ktorých mal klient aspoň jeden tréning, za posledných 18 týždňov. Vždy 18 týž., nezávisí od filtra času." label="Ø dochádzka" />} />
          <StatCard value={kpis.hpc.toFixed(1)} label={<Info text="Priemerný počet odtrénovaných hodín na klienta za zvolené obdobie (alebo celú históriu)." label={`Ø hodín/klient${kpis.scoped ? " (obd.)" : ""}`} />} />
          <StatCard value={fmtCZK(kpis.avg)} label={<Info text="Priemerná cena zaplateného sedenia za zvolené obdobie (bezplatné sedenia sa nepočítajú)." label="Ø CZK/sedenie" />} />
        </div>
      </Card>

      <Card>
        <H3>
          <Info text="Klikni na bunku (Jerry × Anchor) a zoznam dole sa vyfiltruje na tých klientov. Klik na meno trénera = celý tréner, klik na segment = oba tréneri. „Odrob. h/týž“ = reálne odtrénované hodiny za týždeň (priemer posledných 8 týž.); zdravá zóna 24–34h." label="Kapacita & segmenty" />
        </H3>
        <TableWrap>
          <thead>
            <tr>
              <th style={S.th}></th>
              {SEGMENTS.map((s) => (
                <th key={s} onClick={() => { setFSegment(fSegment === s ? "all" : s); setFTrainer("all"); }} style={{ ...S.th, cursor: "pointer", textAlign: "center", color: fSegment === s ? C.accentLight : segColor(s) }}>
                  {s}
                </th>
              ))}
              <th style={{ ...S.th, textAlign: "right" }}>Odrob. h/týž</th>
              <th style={{ ...S.th, textAlign: "right" }}>Zvládne ešte</th>
              <th style={S.th}>Odporúčanie</th>
            </tr>
          </thead>
          <tbody>
            {TRAINERS.map((t) => {
              const cap = capacity.find((c) => c.trainer === t);
              const inZone = cap && cap.recentWeekly >= 24 && cap.recentWeekly <= 34;
              return (
                <tr key={t}>
                  <td onClick={() => { setFTrainer(fTrainer === t ? "all" : t); setFSegment("all"); }} style={{ ...S.td, cursor: "pointer", fontWeight: 600, color: fTrainer === t ? C.accentLight : C.text }}>{t}</td>
                  {SEGMENTS.map((s) => cell(t, s))}
                  <td style={{ ...S.td, textAlign: "right", color: inZone ? C.green : (cap?.recentWeekly ?? 0) > 34 ? C.red : C.orange }}>{cap?.recentWeekly.toFixed(0)}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.accentLight }}>{cap ? `+${cap.canTake}` : "—"}</td>
                  <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>{cap?.advice}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 12 }}>
        <Card style={{ marginBottom: 0 }}>
          <H3>Segmenty — {filterLabel}</H3>
          {donut.some((d) => d.value > 0) ? <Donut data={donut} size={130} centerLabel={String(kpis.count)} /> : <Empty>Žiadni klienti.</Empty>}
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <H3>
            <Info text="Koľko klientov má aký balíček. Klikni na položku a zoznam dole sa vyfiltruje na daný balíček (rešpektuje aj výber trénera)." label="Klienti podľa balíčka" />
          </H3>
          {membershipDonut.length ? (
            <Donut data={membershipDonut} size={130} centerLabel={String(membershipDonut.reduce((a, d) => a + d.value, 0))} onSlice={(l) => setMembershipF((v) => (v === l ? "" : l))} />
          ) : (
            <Empty>Nahraj Packages & Memberships.</Empty>
          )}
        </Card>
      </div>

      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: C.accentLight, fontWeight: 600, marginRight: 4 }}>{filterLabel} · {list.length} klientov</span>
        </div>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Klient" sortKey="name" sort={sort} onSort={toggle} />
              <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
              <SortTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
              <SortTh label="Segment" sortKey="segment" sort={sort} onSort={toggle} info="Anchor ≥84 % týždňov, Stabilný ≥50 %, Sporadický <50 % — z posledných 18 týždňov." />
              <SortTh label="Predplatné" sortKey="type" sort={sort} onSort={toggle} info="Aktuálny produkt z reportu Packages & Memberships." />
              <SortTh label="Zostatok" sortKey="pkg" sort={sort} onSort={toggle} align="right" info="Zostatok sedení v aktuálnom balíčku." />
              <SortTh label="Hodiny" sortKey="hours" sort={sort} onSort={toggle} align="right" info="Celková odtrénovaná história." />
              <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Dochádzka" sortKey="attendance" sort={sort} onSort={toggle} align="right" info="Podiel týždňov s tréningom za posledných 18 týždňov." />
              <SortTh label="Ø CZK" sortKey="avg" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Posledný" sortKey="last" sort={sort} onSort={toggle} align="right" />
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
                <td style={{ ...S.td, fontSize: 12, color: c.is6m ? C.accentLight : C.textMuted }} title={c.membership}>{c.membership ? shortPkg(c.membership) : c.clientType}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{c.packageTotal ? `${c.packageRemaining}/${c.packageTotal}` : "—"}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{c.totalHours.toFixed(0)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{c.sessionCount}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{(c.attendance * 100).toFixed(0)}%</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(c.paidAvg)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtDate(c.lastSession)}</td>
                <td style={S.td}><button onClick={() => setEdit(c.name)} style={{ background: C.cardHover, border: "none", borderRadius: 6, padding: "4px 9px", cursor: "pointer", color: C.text, fontSize: 11 }}>✎</button></td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!list.length && <Empty>Žiadni klienti pre tento filter.</Empty>}
      </Card>

      {editC && (
        <Modal title={editC.name} onClose={() => setEdit(null)}>
          {editC.membership && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Predplatné: <strong style={{ color: C.text }}>{editC.membership}</strong>{editC.packageTotal ? ` · zostatok ${editC.packageRemaining}/${editC.packageTotal}` : ""}</div>}
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
