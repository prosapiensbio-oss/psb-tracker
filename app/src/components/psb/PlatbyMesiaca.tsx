/**
 * PLATBY MESIACA — zoznam na odklikanie vo Workspace → Kontrola peňazí.
 *
 * Jerry, 30. 10. 2026: „chcel by som to nielen v notifikáciách, ale ešte
 * niekde to aj vidieť." Notifikácia hovorí, čo treba urobiť TERAZ; tu je celý
 * mesiac naraz — aj to, čo už odišlo, aj to, čo príde o týždeň.
 *
 * Pravidlá sú v `lib/psb/platbyMesiaca.ts`; odklik ide cez `ackAnomaly` na
 * ten istý kľúč ako notifikácia, takže sa nemôžu rozísť.
 */
import { useMemo } from "react";

import { dnesPraha } from "../../lib/psb/cas";
import { fmtDMY, monthLabel } from "../../lib/psb/format";
import { klucPlatbyMesiaca, PLATBY_MESIACA_OD, stavPlatieb, type PohybPlatby, type StavPlatby } from "../../lib/psb/platbyMesiaca";
import { C } from "../../lib/psb/theme";
import { NadpisSekcie } from "./WorkspaceKroky";

type Ack = Record<string, { note?: string; ackedAt?: string } | undefined>;

export function PlatbyMesiaca({ pohyby, ack, onAck }: {
  pohyby: PohybPlatby[];
  ack: Ack;
  onAck: (key: string, note: string, ack: boolean) => void;
}) {
  const dnes = dnesPraha();
  const teraz = dnes.slice(0, 7);
  const minuly = (() => {
    const [r, m] = teraz.split("-").map(Number);
    return m === 1 ? `${r - 1}-12` : `${r}-${String(m - 1).padStart(2, "0")}`;
  })();
  const stav = useMemo(() => stavPlatieb(teraz, pohyby, ack, dnes), [teraz, pohyby, ack, dnes]);
  // Minulý mesiac len keď v ňom niečo visí — zaplatený mesiac netreba čítať znova.
  const dlhMinuly = useMemo(
    () => (minuly >= PLATBY_MESIACA_OD ? stavPlatieb(minuly, pohyby, ack, dnes).filter((s) => !s.zaplatene) : []),
    [minuly, pohyby, ack, dnes],
  );
  const hotovo = stav.filter((s) => s.zaplatene).length;

  return (
    <div style={{ marginBottom: 18 }}>
      <NadpisSekcie pocet={stav.length - hotovo + dlhMinuly.length}>Platby mesiaca — {monthLabel(teraz)}</NadpisSekcie>
      {dlhMinuly.map((s) => <Riadok key={s.mesiac + s.platba.id} s={s} onAck={onAck} minuly />)}
      {stav.map((s) => <Riadok key={s.mesiac + s.platba.id} s={s} onAck={onAck} />)}
      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>
        Zaplatené sa odškrtne samo, keď Kokpit v noci uvidí prevod vo výpise z Fio. Hotovosť alebo platbu z iného účtu odklikni.
      </div>
    </div>
  );
}

function Riadok({ s, onAck, minuly }: { s: StavPlatby; onAck: (key: string, note: string, ack: boolean) => void; minuly?: boolean }) {
  const kluc = klucPlatbyMesiaca(s.platba.id, s.mesiac);
  const farba = s.zaplatene ? C.green : minuly ? C.red : s.pripomenut ? C.orange : C.textDim;
  const stavText = s.zaplatene === "banka"
    ? `zaplatené ${s.pohyby.map((p) => fmtDMY(p.datum)).filter((d, i, a) => a.indexOf(d) === i).join(", ")}`
    : s.zaplatene === "rucne" ? "odkliknuté"
    : minuly ? `nezaplatené za ${monthLabel(s.mesiac)}`
    : s.pripomenut ? "treba zaplatiť"
    : `pripomeniem ${s.platba.den}.`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
      <span style={{ width: 18, textAlign: "center", color: farba, fontWeight: 800 }}>{s.zaplatene ? "✓" : "○"}</span>
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: C.text, textDecoration: s.zaplatene ? "line-through" : undefined, opacity: s.zaplatene ? 0.7 : 1 }}>
          {s.platba.nazov} <span style={{ fontWeight: 500, color: C.textMuted }}>{s.platba.suma}</span>
        </div>
        <div style={{ fontSize: 12, color: farba }}>
          {stavText}
          {!s.zaplatene && s.platba.termin ? ` · zaplatiť ${s.platba.termin}` : ""}
          {!s.zaplatene && s.pohyby.length > 0 ? ` · vo výpise ${s.pohyby.length} z ${s.platba.pocet || 1}` : ""}
        </div>
      </div>
      {s.zaplatene !== "banka" && (
        <button
          onClick={() => onAck(kluc, s.zaplatene ? "" : "zaplatené (odkliknuté v Platbách mesiaca)", !s.zaplatene)}
          style={{
            border: `1px solid ${s.zaplatene ? C.border : C.accent}`, background: s.zaplatene ? "transparent" : C.accentBg,
            color: s.zaplatene ? C.textMuted : C.text, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          }}
        >
          {s.zaplatene ? "Vrátiť" : "Zaplatené"}
        </button>
      )}
    </div>
  );
}
