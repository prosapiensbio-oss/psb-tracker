import { useMemo, useState } from "react";

import type { SixMRow } from "../../lib/psb/compute";
import { fmtDate } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { Actions } from "./App";
import { Badge, Card, Donut, Empty, H2, H3, Info, StatCard, StatGrid, TableWrap } from "./ui";

const phaseTone = (p: string) => (p === "Obnova" ? "green" : p === "Integrácia" ? "orange" : "bark");

export function SixMTracker({ sixM, actions }: { sixM: SixMRow[]; actions: Actions }) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [trainer, setTrainer] = useState("all");

  const shown = useMemo(() => (trainer === "all" ? sixM : sixM.filter((c) => c.primaryTrainer === trainer)), [sixM, trainer]);

  const byPhase = useMemo(() => {
    const acc = { Obnova: 0, Integrácia: 0, Udržateľnosť: 0 } as Record<string, number>;
    for (const c of shown) acc[c.phase]++;
    return acc;
  }, [shown]);

  const byTrainer = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of sixM) acc[c.primaryTrainer] = (acc[c.primaryTrainer] || 0) + 1;
    return acc;
  }, [sixM]);

  return (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>Tréner:</span>
        {[
          { value: "all", label: "Obaja" },
          { value: "Jerry", label: "Jerry" },
          { value: "Terezka", label: "Terezka" },
        ].map((o) => (
          <button
            key={o.value}
            onClick={() => setTrainer(o.value)}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              border: `1px solid ${trainer === o.value ? C.accent : C.border}`,
              background: trainer === o.value ? C.accentBg : "transparent",
              color: trainer === o.value ? C.accentLight : C.textMuted,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {o.label}
            {o.value !== "all" && <span style={{ opacity: 0.6 }}> ({byTrainer[o.value] || 0})</span>}
          </button>
        ))}
      </div>
      <StatGrid>
        <StatCard value={byPhase.Obnova} label="Obnova (1–6 mes.)" color={C.green} />
        <StatCard value={byPhase.Integrácia} label="Integrácia (7–18)" color={C.orange} />
        <StatCard value={byPhase.Udržateľnosť} label="Udržateľnosť (19+)" color={C.bark} />
        <StatCard value={shown.length} label="Celkom 6M klientov" />
      </StatGrid>

      <Card>
        <H3>
          <Info text="Rozdelenie 6M klientov podľa fázy: Obnova (1.–6. mesiac), Integrácia (7.–18.), Udržateľnosť (19+). Mení sa podľa výberu trénera hore." label="Rozdelenie podľa fázy" />
        </H3>
        {shown.length ? (
          <Donut
            size={150}
            centerLabel={String(shown.length)}
            data={[
              { label: "Obnova (1–6)", value: byPhase.Obnova, color: C.green },
              { label: "Integrácia (7–18)", value: byPhase.Integrácia, color: C.orange },
              { label: "Udržateľnosť (19+)", value: byPhase.Udržateľnosť, color: C.bark },
            ]}
          />
        ) : (
          <Empty>Žiadni 6M klienti pre tento výber.</Empty>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: C.textMuted }}>
          <span>Rozdelenie podľa trénera:</span>
          {Object.entries(byTrainer).map(([t, n]) => (
            <span key={t}>
              <strong style={{ color: C.text }}>{t}</strong>: {n}
            </span>
          ))}
          <span style={{ marginLeft: "auto", color: C.textDim }}>
            Aktívnych upozornení: {shown.filter((c) => c.alert).length}
          </span>
        </div>
      </Card>

      <Card>
        <H2>Klienti v 6M procese</H2>
        <TableWrap>
          <thead>
            <tr>
              {["Klient", "Tréner", "Začiatok 6M", "Mesiac", "Fáza", "Mes. vo fáze", "Upozornenie", "Zmluva", "História pred 6M", "Posledný", "Pozn."].map((h) => (
                <th key={h} style={S.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.client} style={{ background: c.alertTone === "red" ? C.redBg : c.alertTone === "orange" ? C.orangeBg : undefined }}>
                <td style={{ ...S.td, fontWeight: 500 }}>{c.client}</td>
                <td style={S.td}>{c.primaryTrainer}</td>
                <td style={S.td}>{fmtDate(c.startDate)}</td>
                <td style={S.td}>{c.months}</td>
                <td style={S.td}>
                  <Badge tone={phaseTone(c.phase)}>{c.phase}</Badge>
                </td>
                <td style={S.td}>{c.monthInPhase}</td>
                <td style={{ ...S.td, fontSize: 12 }}>{c.alert || "—"}</td>
                <td style={S.td}>
                  <input
                    type="checkbox"
                    checked={c.contractSigned}
                    onChange={(e) => actions.setOverride(c.client, "contractSigned", e.target.checked)}
                    style={{ accentColor: C.accent, cursor: "pointer" }}
                  />
                </td>
                <td style={{ ...S.td, fontSize: 12, color: C.textMuted }}>{c.historyBefore || "—"}</td>
                <td style={S.td}>{fmtDate(c.lastSession)}</td>
                <td style={S.td}>
                  <button
                    onClick={() => setNoteFor(c.client)}
                    title={c.trainerNote || "Pridať poznámku"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: c.trainerNote ? C.accentLight : C.textDim }}
                  >
                    {c.trainerNote ? "✎●" : "✎"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!shown.length && (
          <Empty>
            {sixM.length
              ? `${trainer} zatiaľ nemá žiadnych 6M klientov (službu „S viazanostou“).`
              : `Nahraj Payroll by Service CSV pre 6M tracker (klienti so službou „S viazanostou“).`}
          </Empty>
        )}
      </Card>

      {noteFor && (
        <NoteModal
          client={noteFor}
          value={sixM.find((c) => c.client === noteFor)?.trainerNote || ""}
          onSave={(v) => actions.setOverride(noteFor, "trainerNote", v)}
          onClose={() => setNoteFor(null)}
        />
      )}
    </>
  );
}

function NoteModal({ client, value, onSave, onClose }: { client: string; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...S.card, maxWidth: 420, width: "100%", marginBottom: 0 }}>
        <div style={{ ...S.h3, marginBottom: 12 }}>{client} — poznámka trénera</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>Poznámka sa nikdy neprepíše uploadom CSV.</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ ...S.input, minHeight: 90, resize: "vertical", marginBottom: 12 }}
          placeholder="Napr. výsledok hodnotiaceho rozhovoru v 5. mesiaci…"
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13 }}>
            Zrušiť
          </button>
          <button onClick={() => { onSave(text); onClose(); }} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
            Uložiť
          </button>
        </div>
      </div>
    </div>
  );
}
