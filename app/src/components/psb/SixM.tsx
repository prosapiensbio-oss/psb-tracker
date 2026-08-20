import { useMemo, useState } from "react";

import type { SixMRow } from "../../lib/psb/compute";
import { fmtDate } from "../../lib/psb/format";
import { C, S } from "../../lib/psb/theme";
import type { Actions } from "./App";
import { Badge, Card, Donut, Empty, H2, H3, Info, Modal, StatCard, StatGrid, TableWrap } from "./ui";

const phaseTone = (p: string) => (p === "Obnova" ? "green" : p === "Integrácia" ? "orange" : "bark");

export function SixMTracker({ sixM, actions, trainer, onTrainer }: { sixM: SixMRow[]; actions: Actions; trainer: string; onTrainer: (t: string) => void }) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const setTrainer = onTrainer;
  /**
   * Klik na kartu fázy filtruje tabuľku nižšie na TÝCH ľudí. Do 19. 8. 2026
   * boli štyri karty len čísla nad tabuľkou všetkých — kto chcel vidieť, kto
   * presne je v Integrácii, musel si ich vyhľadať stĺpcom. Druhý klik filter
   * zruší. Počty na kartách sa NEMENIA podľa filtra fázy (zostávajú za celý
   * výber trénera), inak by karta po kliku ukazovala samu seba.
   */
  const [faza, setFaza] = useState<string | null>(null);

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
        {([["Obnova", "Obnova (1–6 mes.)", C.green], ["Integrácia", "Integrácia (7–18)", C.orange], ["Udržateľnosť", "Udržateľnosť (19+)", C.bark]] as const).map(([id, label, farba]) => (
          <div key={id} onClick={() => setFaza(faza === id ? null : id)}
            title={faza === id ? "Zrušiť filter fázy" : `Ukázať v tabuľke len ${label}`}
            style={{ cursor: "pointer", borderRadius: 10, outline: faza === id ? `2px solid ${farba}` : "none" }}>
            <StatCard value={byPhase[id]} label={`${label}${faza === id ? " ▾" : ""}`} color={farba} />
          </div>
        ))}
        <div onClick={() => setFaza(null)} style={{ cursor: faza ? "pointer" : "default" }} title={faza ? "Zrušiť filter fázy" : undefined}>
          <StatCard value={shown.length} label="Celkom 6M klientov" />
        </div>
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
            {shown.filter((c) => !faza || c.phase === faza).map((c) => (
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

// Vlastný modál tu bol kópiou zdieľaného Modalu — a kópia sa neopraví, keď sa
// opraví originál. Pri skle to bolo presne vidieť: zdieľaný Modal dostal
// nepriehľadnú plochu a silnejšie stmavenie, tento zostal priesvitný.
function NoteModal({ client, value, onSave, onClose }: { client: string; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  return (
    <Modal title={`${client} — poznámka trénera`} onClose={onClose}>
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
        <button onClick={() => { onSave(text); onClose(); }} style={{ background: C.accent, color: C.onAccent, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
          Uložiť
        </button>
      </div>
    </Modal>
  );
}
