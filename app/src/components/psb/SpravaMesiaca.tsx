import { useEffect, useState } from "react";

import { fetchMonthNotes, saveMonthNote } from "../../lib/psb/client";
import { monthLabel } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";
import { Modal } from "./ui";

/**
 * Mesačná správa do kroniky po zamknutí mesiaca.
 *
 * Čísla appka drží. Čo nedrží, sú DÔVODY — a tie žijú v registri, ktorý sa
 * odklikne a zmizne. O rok sa Jerry pozrie na júl, uvidí 312 000 Kč a nebude
 * vedieť, či to bola nová úroveň, alebo sa niekomu zrazilo päť predplatieb do
 * jedného týždňa.
 *
 * Návrh, NIE automatický zápis. Jarvis sa v tomto projekte už viackrát mýlil
 * a nesprávny fakt zamrznutý v zamknutom mesiaci je horší než žiadny — preto
 * sa text ukáže, dá sa prepísať a až potom uloží. Kto ho písal, je v zápise
 * uvedené.
 */
export function SpravaMesiaca({
  mesiac,
  podklady,
  onZavri,
}: {
  mesiac: string;
  /** Všetko, čo appka o mesiaci vie — čísla aj vysvetlenia z registra. */
  podklady: string;
  onZavri: () => void;
}) {
  const [stav, setStav] = useState<"pise" | "hotovo" | "chyba" | "ulozene">("pise");
  const [text, setText] = useState("");
  const [chyba, setChyba] = useState("");
  const [uklada, setUklada] = useState(false);

  useEffect(() => {
    let zrusene = false;
    void fetch("/api/sprava", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ mesiac, podklady }),
    })
      .then((r) => r.json() as Promise<{ ok: boolean; text?: string; error?: string }>)
      .then((j) => {
        if (zrusene) return;
        if (j.ok && j.text) {
          setText(j.text);
          setStav("hotovo");
        } else {
          setChyba(j.error || "Správu sa nepodarilo napísať.");
          setStav("chyba");
        }
      })
      .catch(() => {
        if (!zrusene) {
          setChyba("Nepodarilo sa spojiť so serverom.");
          setStav("chyba");
        }
      });
    return () => {
      zrusene = true;
    };
  }, [mesiac, podklady]);

  // Správa sa PRIPÍSAVA k poznámke mesiaca, neprepisuje ju. Poznámka je jediné
  // miesto, ktoré appka drží v čase — čo tam už je, tam má zostať.
  const uloz = async () => {
    const t = text.trim();
    if (!t) return;
    setUklada(true);
    const n = await fetchMonthNotes();
    const stara = n[mesiac]?.note || "";
    const dnes = new Date().toISOString().slice(0, 10);
    const blok = `── Mesačná správa (${dnes}) ──\n${t}`;
    await saveMonthNote(mesiac, [stara, blok].filter(Boolean).join("\n\n"), n[mesiac]?.answers || {}, "jarvis+jerry");
    setUklada(false);
    setStav("ulozene");
  };

  return (
    <Modal title={`Mesačná správa — ${monthLabel(mesiac)}`} onClose={onZavri}>
      {stav === "pise" && (
        <div style={{ fontSize: 13, color: C.textMuted, padding: "18px 2px" }}>
          Jarvis číta mesiac a píše správu…
        </div>
      )}

      {stav === "chyba" && (
        <div style={{ fontSize: 12.5, color: C.orange, lineHeight: 1.55, padding: "6px 2px" }}>
          {chyba}
          <div style={{ color: C.textDim, marginTop: 8 }}>
            Mesiac je zamknutý, len správa sa nenapísala. Napísať sa dá aj ručne v poznámke mesiaca.
          </div>
        </div>
      )}

      {stav === "ulozene" && (
        <div style={{ fontSize: 13, color: C.green, padding: "14px 2px", lineHeight: 1.6 }}>
          Zapísané do kroniky {monthLabel(mesiac)}.
          <div style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>
            Nájdeš ju v poznámke mesiaca a Jarvis ju odteraz vidí v kontexte.
          </div>
        </div>
      )}

      {stav === "hotovo" && (
        <>
          <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.55, marginBottom: 10 }}>
            Prečítaj a oprav, čo nesedí. Toto je trvalý záznam — nesprávny fakt v zamknutom
            mesiaci je horší než žiadny, tak radšej vyhoď vetu, ktorou si si nie istý.
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            style={{
              width: "100%", padding: "11px 13px", borderRadius: 9,
              border: `1px solid ${C.border}`, background: C.bg, color: C.text,
              fontSize: 12.5, lineHeight: 1.65, fontFamily: "inherit", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => void uloz()}
              disabled={uklada || !text.trim()}
              style={{
                padding: "8px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                cursor: uklada ? "wait" : "pointer",
                border: `1px solid ${mix(C.green, 55)}`, background: mix(C.green, 14), color: C.green,
              }}
            >
              {uklada ? "Ukladám…" : "Zapísať do kroniky"}
            </button>
            <button
              onClick={onZavri}
              style={{ background: "none", border: "none", color: C.textDim, fontSize: 12.5, cursor: "pointer" }}
            >
              Teraz nie
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
