import { useEffect, useMemo, useState } from "react";

import { membershipBucket, MEMBERSHIP_ORDER, TRAINERS, type CapacityRow, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, fmtDate, normName } from "../../lib/psb/format";
import { C, MEMBERSHIP_COLORS, S } from "../../lib/psb/theme";
import { saveLead } from "../../lib/psb/client";
import type { Lead } from "../../lib/psb/types";
import type { Actions, NavFocus } from "./App";
import { Badge, Card, Donut, Empty, H3, Info, Modal, Select, SortTh, StatCard, SubTabs, TableWrap, useSort } from "./ui";

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

// Kanály presne tak, ako to Jerry popísal: „IG DM, hlavne maily z webového
// formulára, občas telefón, občas osobný Instagram". Telefón a osobný profil
// doteraz spadli do „Iné" — čiže najosobnejšie kanály, ktoré stoja najviac
// času, boli v štatistike neviditeľné.
const SOURCES = [
  { value: "referencia", label: "Referencia" },
  { value: "mail", label: "Mail (web formulár)" },
  { value: "instagram", label: "Instagram — firemný" },
  { value: "instagram_osobny", label: "Instagram — osobný" },
  { value: "telefon", label: "Telefón" },
  { value: "google", label: "Google" },
  { value: "web", label: "Web" },
  { value: "ine", label: "Iné" },
];
const STATUSES = [
  { value: "novy", label: "Ozval sa" },
  { value: "neodpisal", label: "Neodpísal" },
  { value: "dohodnuty", label: "Dohodnutý úvodný" },
  { value: "zruseny", label: "Zrušený úvodný" },
];
const statusColor = (s: string) =>
  s === "dohodnuty" ? C.green : s === "zruseny" ? C.orange : s === "neodpisal" ? C.red : C.textMuted;

// The top of the funnel PTminder can't see: people who write and then go quiet.
// Deliberately narrow — it only asks what lives in Jerry's inbox and DMs. Whether
// someone actually showed up or became a client is already in the PTminder CSV,
// so it is derived rather than typed twice.
function Dopyty({ leads, clients, refresh }: { leads: Lead[]; clients: Record<string, ClientAgg>; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<Lead>>({});

  const clientNames = useMemo(
    () => Object.values(clients).map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    [clients],
  );
  // A referred person who already shows up as a client = the referral worked.
  const clientByNorm = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of Object.keys(clients)) m[normName(n)] = n;
    return m;
  }, [clients]);
  const converted = (l: Lead) => !!(l.name && clientByNorm[normName(l.name)]);

  const save = async (l: Partial<Lead> & { id?: string; remove?: boolean }) => {
    setBusy(true);
    await saveLead(l);
    await refresh();
    setBusy(false);
  };
  const openAdd = () => {
    setDraft({ date: new Date().toISOString().slice(0, 10), source: "instagram", status: "novy", name: "", referrer: "", note: "" });
    setAdding(true);
  };
  const submitAdd = async () => {
    setAdding(false);
    await save(draft);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] || 0) + 1;
    const konv = leads.filter(converted).length;
    return { total: leads.length, dohodnuty: c.dohodnuty || 0, neodpisal: c.neodpisal || 0, konv };
  }, [leads, clientByNorm]);

  const bySource = useMemo(() => {
    const m: Record<string, { n: number; klient: number }> = {};
    for (const l of leads) {
      const e = (m[l.source] ||= { n: 0, klient: 0 });
      e.n++;
      if (converted(l)) e.klient++;
    }
    return m;
  }, [leads, clientByNorm]);

  const inputStyle = { ...S.select, width: "100%", minWidth: 0 } as const;
  const REFERRER_LIST = "psb-referrers";

  return (
    <>
      <datalist id={REFERRER_LIST}>
        {clientNames.map((n) => <option key={n} value={n} />)}
      </datalist>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <H3><Info text="Každý, kto sa ozve — mail, Instagram, referencia. Aj ten, kto potom neodpíše. Zapisuje sa len to, čo appka inak nezistí; či klient reálne prišiel a či začal chodiť, vyčíta z PTminder CSV." label="Dopyty" /></H3>
          <button onClick={openAdd} disabled={busy}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
            + Nový dopyt
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <StatCard value={String(counts.total)} label="Dopytov spolu" color={C.blue} />
          <StatCard value={String(counts.dohodnuty)} label="Dohodnutý úvodný" color={C.accentLight} />
          <StatCard value={String(counts.neodpisal)} label="Neodpísali" color={C.red} />
          <StatCard value={counts.total ? `${((counts.konv / counts.total) * 100).toFixed(0)} %` : "—"}
            label={<Info text="Podiel dopytov, ktorých meno sa už objavuje medzi klientmi v PTminderi — teda naozaj začali chodiť. Počíta sa automaticky, nezapisuje sa." label="Konverzia na klienta" />} color={C.green} />
        </div>
      </Card>

      {Object.keys(bySource).length > 0 && (
        <Card>
          <H3><Info text="Ktorý kanál naozaj prináša klientov, nie len správy." label="Podľa zdroja" /></H3>
          <TableWrap>
            <thead>
              <tr>
                <th style={S.th}>Zdroj</th>
                <th style={{ ...S.th, textAlign: "right" }}>Dopytov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Klientov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Konverzia</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.filter((s) => bySource[s.value]).map((s) => {
                const e = bySource[s.value];
                return (
                  <tr key={s.value}>
                    <td style={S.td}>{s.label}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{e.n}</td>
                    <td style={{ ...S.td, textAlign: "right", color: C.green }}>{e.klient}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{e.n ? `${((e.klient / e.n) * 100).toFixed(0)} %` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <Card>
        <H3>Zoznam</H3>
        {!leads.length ? (
          <Empty>Zatiaľ žiadne dopyty — pridaj prvý tlačidlom vyššie.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, minWidth: 118 }}>Dátum</th>
                <th style={{ ...S.th, minWidth: 130 }}>Meno</th>
                <th style={{ ...S.th, minWidth: 128 }}>Odkiaľ prišiel</th>
                <th style={{ ...S.th, minWidth: 150 }}>Od koho</th>
                <th style={{ ...S.th, minWidth: 150 }}>Stav</th>
                <th style={{ ...S.th, minWidth: 140 }}>Poznámka</th>
                <th style={S.th} />
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td style={S.td}>
                    <input type="date" defaultValue={l.date} onBlur={(e) => e.target.value !== l.date && save({ ...l, date: e.target.value })}
                      style={{ ...inputStyle, colorScheme: "dark" }} />
                  </td>
                  <td style={S.td}>
                    <input defaultValue={l.name} placeholder="meno (ak vieme)" onBlur={(e) => e.target.value !== l.name && save({ ...l, name: e.target.value })}
                      style={inputStyle} />
                    {converted(l) && <span title="už je medzi klientmi v PTminderi" style={{ color: C.green, fontSize: 11, marginLeft: 6 }}>✓ klient</span>}
                  </td>
                  <td style={S.td}>
                    <Select value={l.source} onChange={(v) => save({ ...l, source: v as Lead["source"], referrer: v === "referencia" ? l.referrer : "" })}
                      options={SOURCES} style={inputStyle} />
                  </td>
                  <td style={S.td}>
                    {l.source === "referencia" ? (
                      <input list={REFERRER_LIST} defaultValue={l.referrer} placeholder="píš meno…"
                        onBlur={(e) => e.target.value !== l.referrer && save({ ...l, referrer: e.target.value })} style={inputStyle} />
                    ) : <span style={{ color: C.textDim, fontSize: 12 }}>—</span>}
                  </td>
                  <td style={S.td}>
                    <Select value={l.status} onChange={(v) => save({ ...l, status: v as Lead["status"] })} options={STATUSES}
                      style={{ ...inputStyle, color: statusColor(l.status) }} />
                  </td>
                  <td style={S.td}>
                    <input defaultValue={l.note} placeholder="poznámka" onBlur={(e) => e.target.value !== l.note && save({ ...l, note: e.target.value })} style={inputStyle} />
                  </td>
                  <td style={{ ...S.td, textAlign: "right" }}>
                    <button onClick={() => save({ id: l.id, remove: true })} title="Zmazať"
                      style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
          Keď sa meno odporúčaného objaví medzi klientmi, v „Na čo sa pozrieť“ vyskočí pripomienka na 10 % zľavu pre toho, kto ho poslal.
        </div>
      </Card>

      {adding && (
        <Modal title="Nový dopyt" onClose={() => setAdding(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ fontSize: 12, color: C.textMuted }}>
              Dátum
              <input type="date" value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                style={{ ...inputStyle, colorScheme: "dark", marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.textMuted }}>
              Meno <span style={{ color: C.textDim }}>(ak ho vieme)</span>
              <input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="napr. Peter Novák" style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: C.textMuted }}>
              Odkiaľ prišiel
              <div style={{ marginTop: 4 }}>
                <Select value={draft.source ?? "instagram"} onChange={(v) => setDraft({ ...draft, source: v as Lead["source"] })}
                  options={SOURCES} style={inputStyle} />
              </div>
            </label>
            {draft.source === "referencia" && (
              <label style={{ fontSize: 12, color: C.textMuted }}>
                Od koho <span style={{ color: C.textDim }}>(píš meno — nemusí to byť náš klient)</span>
                <input list={REFERRER_LIST} value={draft.referrer ?? ""} onChange={(e) => setDraft({ ...draft, referrer: e.target.value })}
                  placeholder="začni písať…" style={{ ...inputStyle, marginTop: 4 }} />
              </label>
            )}
            <label style={{ fontSize: 12, color: C.textMuted }}>
              Poznámka
              <input value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="napr. bolesti chrbta, píše z Brna…" style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={submitAdd}
                style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Pridať
              </button>
              <button onClick={() => setAdding(false)}
                style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer" }}>
                Zrušiť
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// Odkiaľ klienti reálne chodia — kategórie sú tie, ktoré vyšli zo 47 anamnéz
// (jún 2025 – júl 2026), nie vymyslené. Poradie podľa početnosti.
export const ZDROJE = [
  { value: "", label: "—" },
  { value: "referencia", label: "Referencia" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "fp", label: "FP adresár" },
  { value: "offline", label: "Tabuľa / billboard / leták" },
  { value: "ai", label: "AI (ChatGPT a pod.)" },
  { value: "ine", label: "Iné" },
];

export function Klienti({ clients, capacity, actions, focus, leads, trainer, onTrainer }: { clients: Record<string, ClientAgg>; capacity: CapacityRow[]; actions: Actions; focus?: NavFocus | null; leads: Lead[]; trainer: string; onTrainer: (t: string) => void }) {
  const [focusClient, setFocusClient] = useState<string | null>(null);
  useEffect(() => {
    if (focus?.client) setFocusClient(focus.client);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const fTrainer = trainer;
  const setFTrainer = onTrainer;
  const [fSegment, setFSegment] = useState("all");
  const [typeF, setTypeF] = useState("all");
  const [modalityF, setModalityF] = useState("all");
  const [membershipF, setMembershipF] = useState(""); // package bucket from the donut
  const [nameSearch, setNameSearch] = useState("");
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
    return arr;
  }, [all, fTrainer, fSegment, showInactive]);

  const membershipDonut = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of baseList) {
      const b = membershipBucket(c.membership);
      counts[b] = (counts[b] || 0) + 1;
    }
    return MEMBERSHIP_ORDER.filter((k) => counts[k]).map((k) => ({ label: k, value: counts[k], color: MEMBERSHIP_COLORS[k] }));
  }, [baseList]);

  const list = useMemo(() => {
    // A click-through from the Dashboard focuses one client — show only them (even if inactive).
    if (focusClient) {
      const t = normName(focusClient);
      return all.filter((c) => normName(c.name) === t);
    }
    // Table-only filters (name search + package type + modality + package bucket from the donut).
    let arr = baseList;
    if (membershipF) arr = arr.filter((c) => membershipBucket(c.membership) === membershipF);
    if (typeF.startsWith("grp:")) arr = arr.filter((c) => c.clientType === typeF.slice(4));
    else if (typeF.startsWith("m:")) arr = arr.filter((c) => c.membership === typeF.slice(2));
    if (modalityF !== "all") arr = arr.filter((c) => c.modality === modalityF);
    if (nameSearch.trim()) {
      const q = normName(nameSearch);
      arr = arr.filter((c) => normName(c.name).includes(q));
    }
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
      bitcoin: (c) => (c.bitcoin ? 1 : 0),
      zdroj: (c) => c.zdroj || "zzz",
    });
  }, [baseList, membershipF, typeF, modalityF, nameSearch, sorted, focusClient, all]);

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

  const [sub, setSub] = useState("klienti");

  const editC = edit ? clients[edit] : null;
  const filterLabel = fTrainer === "all" && fSegment === "all" ? "Všetci klienti" : `${fTrainer === "all" ? "" : fTrainer} ${fSegment === "all" ? "" : fSegment}`.trim();

  return (
    <>
      <SubTabs
        tabs={[{ id: "klienti", label: "Klienti" }, { id: "dopyty", label: "Dopyty" }]}
        value={sub}
        onChange={setSub}
      />
      {sub === "dopyty" ? <Dopyty leads={leads} clients={clients} refresh={actions.refresh} /> : (
      <>
      {/* Filtre + KPI úplne hore */}
      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <Select value={fTrainer} onChange={(v) => { setFTrainer(v); if (v === "all") setFSegment("all"); }} options={[
            { value: "all", label: "Obaja tréneri" },
            { value: "Jerry", label: "Jerry" },
            { value: "Terezka", label: "Terezka" },
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
        {fSegment !== "all" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={() => setFSegment("all")} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "4px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>Segment: {fSegment} ✕</button>
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
        <H3><Info text="Všetci klienti podľa filtrov. Hľadaj podľa mena, filtruj typ balíčka a modalitu, alebo klikni na výsek v koláči „Klienti podľa balíčka“ hore." label="Všetci klienti" /></H3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {focusClient ? (
            <button onClick={() => setFocusClient(null)} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "5px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              Vybraný klient: {focusClient} ✕ (zobraziť všetkých)
            </button>
          ) : (
            <>
              <input value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder="🔍 Hľadať meno…" style={{ ...S.input, width: "auto", minWidth: 160, flex: "0 1 200px" }} />
              <Select value={typeF} onChange={setTypeF} options={typeOptions} />
              <Select value={modalityF} onChange={setModalityF} options={[
                { value: "all", label: "Offline + Online" },
                { value: "Offline", label: "Prevažne Offline" },
                { value: "Online", label: "Prevažne Online" },
              ]} />
              {membershipF && (
                <button onClick={() => setMembershipF("")} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "6px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>Balíček: {membershipF} ✕</button>
              )}
              {(typeF !== "all" || modalityF !== "all" || nameSearch) && (
                <button onClick={() => { setTypeF("all"); setModalityF("all"); setNameSearch(""); setMembershipF(""); }} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>Zrušiť filtre</button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 13, color: C.accentLight, fontWeight: 600 }}>{list.length} klientov</span>
            </>
          )}
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
              <SortTh label="Zdroj" sortKey="zdroj" sort={sort} onSort={toggle} info="Odkiaľ sa o nás klient dozvedel. Toto je jediné miesto, kde sa marketing spája s peniazmi — bez neho je každé číslo o návratnosti kanála odhad. Pri referencii dopíš aj meno toho, kto ho poslal (klik na ✎)." />
              <SortTh label="₿" sortKey="bitcoin" sort={sort} onSort={toggle} align="center" info="Platí v Bitcoine. Zaškrtni klientov platiacich BTC — potom ich vieš filtrovať a AI asistent vie porovnať BTC vs. klasické platby." />
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
                <td style={S.td}>
                  <select
                    value={c.zdroj}
                    onChange={(e) => actions.setOverride(c.name, "zdroj", e.target.value)}
                    title={c.zdrojKto ? `Poslal: ${c.zdrojKto}` : "Odkiaľ sa o nás dozvedel"}
                    style={{ background: c.zdroj ? C.cardHover : "transparent", color: c.zdroj ? C.text : C.textDim, border: `1px solid ${c.zdroj ? C.border : "transparent"}`, borderRadius: 6, fontSize: 11.5, padding: "2px 4px", cursor: "pointer", maxWidth: 130 }}
                  >
                    {ZDROJE.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                  </select>
                  {c.zdroj === "referencia" && (
                    <span title={c.zdrojKto || "Kto ho poslal? Dopíš cez ✎ — bez mena sa nedá odovzdať odmena."} style={{ marginLeft: 4, fontSize: 10, color: c.zdrojKto ? C.green : C.orange }}>
                      {c.zdrojKto ? "✓" : "?"}
                    </span>
                  )}
                </td>
                <td style={{ ...S.td, textAlign: "center" }}>
                  <input type="checkbox" checked={c.bitcoin} onChange={(e) => actions.setOverride(c.name, "bitcoin", e.target.checked)} title="Platí v Bitcoine" style={{ accentColor: "#f7931a", cursor: "pointer" }} />
                </td>
                <td style={S.td}><button onClick={() => setEdit(c.name)} style={{ background: C.cardHover, border: "none", borderRadius: 6, padding: "4px 9px", cursor: "pointer", color: C.text, fontSize: 11 }}>✎</button></td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!list.length && (
          <Empty>
            {focusClient
              ? `„${focusClient}“ nemá žiadne odtrénované sedenia — je len v platbách. Pravdepodobne preklep v mene platby alebo klient zaplatil vopred a ešte netrénoval. Skontroluj Financie → Cashflow alebo podobné mená v tabuľke (zruš filter ✕ vyššie).`
              : "Žiadni klienti pre tento filter."}
          </Empty>
        )}
      </Card>

      {editC && (
        <Modal title={editC.name} onClose={() => setEdit(null)}>
          {editC.membership && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Predplatné: <strong style={{ color: C.text }}>{editC.membership}</strong>{editC.packageTotal ? ` · zostatok ${editC.packageRemaining}/${editC.packageTotal}` : ""}</div>}
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Status (manuálny override vždy vyhráva)</div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Automatický návrh: {editC.statusAuto}</div>
          <Select style={{ width: "100%", marginBottom: 14 }} value={editC.statusOverride ? editC.status : ""} onChange={(v) => actions.setOverride(editC.name, "status", v === "Pauza" && editC.pauseUntil ? `Pauza|${editC.pauseUntil}` : v)} options={[
            { value: "", label: "Automatický" },
            { value: "Aktívny", label: "Aktívny" },
            { value: "Sporadický", label: "Sporadický" },
            { value: "Pauza", label: "Pauza" },
            { value: "Neaktívny", label: "Neaktívny" },
          ]} />
          {editC.status === "Pauza" && (
            <div style={{ marginTop: -6, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Pauza do (nepovinné — po dátume príde pripomienka „ozvi sa")</div>
              <input
                type="date"
                value={editC.pauseUntil || ""}
                onChange={(e) => actions.setOverride(editC.name, "status", e.target.value ? `Pauza|${e.target.value}` : "Pauza")}
                style={{ ...S.input, colorScheme: "dark" }}
              />
              {editC.pauseUntil && <button onClick={() => actions.setOverride(editC.name, "status", "Pauza")} style={{ marginLeft: 8, background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zrušiť dátum</button>}
            </div>
          )}
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
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, marginTop: 4 }}>Odkiaľ sa o nás dozvedel</div>
          <Select
            value={editC.zdroj}
            onChange={(v) => actions.setOverride(editC.name, "zdroj", v)}
            options={ZDROJE}
          />
          {editC.zdroj === "referencia" && (
            <input
              style={{ ...S.input, marginTop: 8 }}
              placeholder="Kto ho poslal? (meno)"
              defaultValue={editC.zdrojKto}
              onBlur={(e) => actions.setOverride(editC.name, "zdrojKto", e.target.value)}
            />
          )}
          <div style={{ fontSize: 11.5, color: C.textDim, margin: "6px 0 14px", lineHeight: 1.5 }}>
            Bez mena odporúčateľa sa nedá odovzdať odmena za doporučenie (10 % z ďalšieho balíčka alebo tréning zadarmo).
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, marginTop: 4 }}>Poznámka trénera (nikdy sa neprepíše uploadom)</div>
          <textarea style={{ ...S.input, minHeight: 70, resize: "vertical", marginBottom: 14 }} defaultValue={editC.trainerNote} onBlur={(e) => actions.setOverride(editC.name, "trainerNote", e.target.value)} />
          <button onClick={() => setEdit(null)} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, width: "100%" }}>Hotovo</button>
        </Modal>
      )}
      </>
      )}
    </>
  );
}
