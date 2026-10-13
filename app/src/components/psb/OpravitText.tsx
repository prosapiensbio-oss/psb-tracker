import { useState } from "react";

import { C } from "../../lib/psb/theme";

/**
 * TLAČIDLO „✓ OPRAVIŤ TEXT" (Jerry, 13. 10. 2026) — pravopis, diakritika,
 * čiarky a gramatika cez `/api/oprava-textu`. Jazyk a obsah ostávajú.
 * Po oprave sa dá vrátiť pôvodný text — oprava je návrh, nie rozsudok.
 */
export function OpravitText({ text, onOpravene, maly = false }: {
  text: string;
  /** Dostane opravený (alebo vrátený pôvodný) text. */
  onOpravene: (t: string) => void;
  maly?: boolean;
}) {
  const [pracujem, setPracujem] = useState(false);
  const [povodny, setPovodny] = useState<string | null>(null);
  const [hlaska, setHlaska] = useState("");

  const oprav = async () => {
    if (!text.trim() || pracujem) return;
    setPracujem(true);
    setHlaska("");
    const j = await fetch("/api/oprava-textu", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!j?.ok) { setHlaska(j?.error || "Oprava zlyhala."); return; }
    if (!j.zmenene) { setHlaska("Bez chýb ✓"); setPovodny(null); return; }
    setPovodny(text);
    onOpravene(String(j.text));
    setHlaska("Opravené.");
  };

  const odkaz = { background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: maly ? 11.5 : 12, cursor: "pointer" } as const;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" disabled={pracujem || !text.trim()} onClick={() => void oprav()}
        title="Oprava pravopisu, diakritiky, čiarok a gramatiky — jazyk aj obsah ostanú"
        style={{ ...odkaz, color: C.accentLight, opacity: pracujem || !text.trim() ? 0.5 : 1 }}
      >{pracujem ? "opravujem…" : "✓ opraviť text"}</button>
      {povodny !== null && !pracujem && (
        <button type="button" onClick={() => { onOpravene(povodny); setPovodny(null); setHlaska("Vrátené pôvodné."); }}
          style={{ ...odkaz, color: C.textMuted }}>↶ vrátiť pôvodné</button>
      )}
      {hlaska && <span style={{ fontSize: maly ? 11 : 11.5, color: hlaska.startsWith("Oprav") || hlaska.startsWith("Bez") || hlaska.startsWith("Vrát") ? C.textDim : C.red }}>{hlaska}</span>}
    </span>
  );
}
