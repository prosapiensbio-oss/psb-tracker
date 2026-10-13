import { useState } from "react";

import { C } from "../../lib/psb/theme";

/**
 * TLAČIDLÁ „✓ OPRAVIŤ TEXT" a „⇄ DO ČEŠTINY" (Jerry, 13. 10. 2026) —
 * pravopis, diakritika, čiarky a gramatika cez `/api/oprava-textu`; druhé
 * tlačidlo text navyše preloží do češtiny (stránka pre klienta je česky).
 * Po oprave sa dá vrátiť pôvodný text — oprava je návrh, nie rozsudok.
 */
export function OpravitText({ text, onOpravene, maly = false }: {
  text: string;
  /** Dostane opravený (alebo vrátený pôvodný) text. */
  onOpravene: (t: string) => void;
  maly?: boolean;
}) {
  const [pracujem, setPracujem] = useState<null | "oprava" | "cestina">(null);
  const [povodny, setPovodny] = useState<string | null>(null);
  const [hlaska, setHlaska] = useState("");

  /** rezim „oprava" = len chyby; „cestina" = preklad do češtiny (stránka pre klienta je česky). */
  const oprav = async (rezim: "oprava" | "cestina") => {
    if (!text.trim() || pracujem) return;
    setPracujem(rezim);
    setHlaska("");
    const j = await fetch("/api/oprava-textu", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, rezim }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(null);
    if (!j?.ok) { setHlaska(j?.error || "Oprava zlyhala."); return; }
    if (!j.zmenene) { setHlaska(rezim === "cestina" ? "Už je to po česky ✓" : "Bez chýb ✓"); setPovodny(null); return; }
    setPovodny((p) => p ?? text); // „pôvodné" je text pred PRVOU zmenou, nie pred poslednou
    onOpravene(String(j.text));
    setHlaska(rezim === "cestina" ? "Preložené do češtiny." : "Opravené.");
  };

  const odkaz = { background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: maly ? 11.5 : 12, cursor: "pointer" } as const;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" disabled={!!pracujem || !text.trim()} onClick={() => void oprav("oprava")}
        title="Oprava pravopisu, diakritiky, čiarok a gramatiky — jazyk aj obsah ostanú"
        style={{ ...odkaz, color: C.accentLight, opacity: pracujem || !text.trim() ? 0.5 : 1 }}
      >{pracujem === "oprava" ? "opravujem…" : "✓ opraviť text"}</button>
      <button type="button" disabled={!!pracujem || !text.trim()} onClick={() => void oprav("cestina")}
        title="Preklad do češtiny (stránka pre klienta je po česky) a zároveň oprava chýb"
        style={{ ...odkaz, color: C.accentLight, opacity: pracujem || !text.trim() ? 0.5 : 1 }}
      >{pracujem === "cestina" ? "prekladám…" : "⇄ do češtiny"}</button>
      {povodny !== null && !pracujem && (
        <button type="button" onClick={() => { onOpravene(povodny); setPovodny(null); setHlaska("Vrátené pôvodné."); }}
          style={{ ...odkaz, color: C.textMuted }}>↶ vrátiť pôvodné</button>
      )}
      {hlaska && <span style={{ fontSize: maly ? 11 : 11.5, color: /^(Oprav|Bez|Vrát|Prelož|Už)/.test(hlaska) ? C.textDim : C.red }}>{hlaska}</span>}
    </span>
  );
}
