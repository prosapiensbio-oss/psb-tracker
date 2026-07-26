import { useMemo, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, fmtDate } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { Actions } from "./App";
import { Badge, Card, Empty, Modal, Select, TableWrap, Toolbar } from "./ui";

const segTone = (s: string) => (s === "Anchor" ? "green" : s === "Stabilný" ? "orange" : "red");
const statusTone = (s: string) =>
  s === "Aktívny" ? "green" : s === "Sporadický" ? "blue" : s === "Pauza" ? "orange" : "muted";

export function Klienti({ clients, actions }: { clients: Record<string, ClientAgg>; actions: Actions }) {
  const [trainerF, setTrainerF] = useState("all");
  const [segmentF, setSegmentF] = useState("all");
  const [statusF, setStatusF] = useState("active");
  const [typeF, setTypeF] = useState("all");
  const [sort, setSort] = useState("name");
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);

  const list = useMemo(() => {
    let arr = Object.values(clients);
    if (trainerF !== "all") arr = arr.filter((c) => c.primaryTrainer === trainerF);
    if (segmentF !== "all") arr = arr.filter((c) => c.segment === segmentF);
    if (typeF !== "all") arr = arr.filter((c) => c.clientType === typeF);
    if (statusF === "active") arr = arr.filter((c) => (showInactive ? true : c.status !== "Neaktívny"));
    else arr = arr.filter((c) => c.status === statusF);

    arr.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "hours") return b.totalHours - a.totalHours;
      if (sort === "attendance") return b.attendance - a.attendance;
      if (sort === "sessions") return b.sessionCount - a.sessionCount;
      if (sort === "last") return new Date(b.lastSession).getTime() - new Date(a.lastSession).getTime();
      return 0;
    });
    // Inactive clients sorted by return likelihood (attendance × history length).
    if (statusF !== "active" && statusF === "Neaktívny") {
      arr.sort((a, b) => b.attendance * b.sessionCount - a.attendance * a.sessionCount);
    }
    return arr;
  }, [clients, trainerF, segmentF, statusF, typeF, sort, showInactive]);

  const editC = edit ? clients[edit] : null;

  return (
    <>
      <Toolbar>
        <Select value={trainerF} onChange={setTrainerF} options={[
          { value: "all", label: "Všetci tréneri" },
          { value: "Jerry", label: "Jerry" },
          { value: "Terezka", label: "Terezka" },
        ]} />
        <Select value={segmentF} onChange={setSegmentF} options={[
          { value: "all", label: "Všetky segmenty" },
          { value: "Anchor", label: "Anchor" },
          { value: "Stabilný", label: "Stabilný" },
          { value: "Sporadický", label: "Sporadický" },
        ]} />
        <Select value={statusF} onChange={setStatusF} options={[
          { value: "active", label: "Aktívni (bez neaktívnych)" },
          { value: "Aktívny", label: "Len Aktívny" },
          { value: "Sporadický", label: "Len Sporadický" },
          { value: "Pauza", label: "Len Pauza" },
          { value: "Neaktívny", label: "Len Neaktívni" },
        ]} />
        <Select value={typeF} onChange={setTypeF} options={[
          { value: "all", label: "Všetky typy" },
          { value: "6M Predplatné", label: "6M Predplatné" },
          { value: "Balíček", label: "Balíček" },
        ]} />
        <Select value={sort} onChange={setSort} options={[
          { value: "name", label: "Zoradiť: meno" },
          { value: "hours", label: "Zoradiť: hodiny" },
          { value: "attendance", label: "Zoradiť: dochádzka" },
          { value: "sessions", label: "Zoradiť: sedení" },
          { value: "last", label: "Zoradiť: posledný tréning" },
        ]} />
        {statusF === "active" && (
          <label style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ accentColor: C.accent }} />
            Zobraziť aj neaktívnych
          </label>
        )}
      </Toolbar>

      <Card>
        <div style={{ ...S.h3, marginBottom: 10 }}>{list.length} klientov</div>
        <TableWrap>
          <thead>
            <tr>
              {["Klient", "Tréner", "Status", "Segment", "Typ", "Balíček", "Hodiny", "Sedení", "Dochádzka", "Ø CZK", "Posledný", ""].map((h) => (
                <th key={h} style={S.th}>{h}</th>
              ))}
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
                <td style={S.td}>
                  {c.primaryTrainer}
                  {c.primaryTrainerOverride && <span title="Manuálne nastavený" style={{ fontSize: 9, color: C.textDim, marginLeft: 3 }}>✎</span>}
                </td>
                <td style={S.td}>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  {c.statusOverride && <span title={`Auto: ${c.statusAuto}`} style={{ fontSize: 9, color: C.textDim, marginLeft: 4 }}>✎</span>}
                </td>
                <td style={S.td}><Badge tone={segTone(c.segment)}>{c.segment}</Badge></td>
                <td style={S.td}>
                  <span style={{ fontSize: 11, color: c.clientType === "6M Predplatné" ? C.accentLight : C.textMuted }}>{c.clientType}</span>
                </td>
                <td style={S.td}>{c.packageTotal ? `${c.packageRemaining}/${c.packageTotal}` : "—"}</td>
                <td style={S.td}>{c.totalHours.toFixed(0)}</td>
                <td style={S.td}>{c.sessionCount}</td>
                <td style={S.td}>{(c.attendance * 100).toFixed(0)}%</td>
                <td style={S.td}>{fmtCZK(c.paidAvg)}</td>
                <td style={S.td}>{fmtDate(c.lastSession)}</td>
                <td style={S.td}>
                  <button onClick={() => setEdit(c.name)} style={{ background: C.cardHover, border: "none", borderRadius: 6, padding: "4px 9px", cursor: "pointer", color: C.text, fontSize: 11 }}>✎</button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!list.length && <Empty>Žiadni klienti pre tento filter. Nahraj CSV na Dashboarde.</Empty>}
      </Card>

      {editC && (
        <Modal title={editC.name} onClose={() => setEdit(null)}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Status (manuálny override vždy vyhráva)</div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Automatický návrh: {editC.statusAuto}</div>
          <Select
            style={{ width: "100%", marginBottom: 14 }}
            value={editC.statusOverride ? editC.status : ""}
            onChange={(v) => actions.setOverride(editC.name, "status", v)}
            options={[
              { value: "", label: "Automatický" },
              { value: "Aktívny", label: "Aktívny" },
              { value: "Sporadický", label: "Sporadický" },
              { value: "Pauza", label: "Pauza" },
              { value: "Neaktívny", label: "Neaktívny" },
            ]}
          />

          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Primárny tréner (override)</div>
          <Select
            style={{ width: "100%", marginBottom: 14 }}
            value={editC.primaryTrainerOverride ? editC.primaryTrainer : ""}
            onChange={(v) => actions.setOverride(editC.name, "primaryTrainer", v)}
            options={[
              { value: "", label: `Automatický (${editC.primaryTrainer})` },
              { value: "Jerry", label: "Jerry" },
              { value: "Terezka", label: "Terezka" },
            ]}
          />

          <label style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={editC.specialRate} onChange={(e) => actions.setOverride(editC.name, "specialRate", e.target.checked)} style={{ accentColor: C.accent }} />
            Špeciálna sadzba (investor, rodina, zamestnanec…)
          </label>
          {editC.specialRate && (
            <input
              style={{ ...S.input, marginBottom: 14 }}
              placeholder="Dôvod špeciálnej sadzby"
              defaultValue={editC.specialRateNote}
              onBlur={(e) => actions.setOverride(editC.name, "specialRateNote", e.target.value)}
            />
          )}

          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, marginTop: 4 }}>Poznámka trénera (nikdy sa neprepíše uploadom)</div>
          <textarea
            style={{ ...S.input, minHeight: 70, resize: "vertical", marginBottom: 14 }}
            defaultValue={editC.trainerNote}
            onBlur={(e) => actions.setOverride(editC.name, "trainerNote", e.target.value)}
          />

          <button onClick={() => setEdit(null)} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, width: "100%" }}>
            Hotovo
          </button>
        </Modal>
      )}
    </>
  );
}
