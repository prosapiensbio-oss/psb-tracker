import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { C } from "../../lib/psb/theme";

/**
 * KARTA NA CELÚ OBRAZOVKU (Jerry, 27. 10. 2026: „daj mi možnosť robiť dozor
 * reklám na celú obrazovku").
 *
 * Obsah ide VŽDY portálom do jedného uzla a ten sa len PRESÚVA — v karte
 * stojí na svojom mieste, na celú obrazovku sa prevesí do `document.body`.
 * Dve veci, ktoré by inak nefungovali:
 *  - `position: fixed` vnútri Workspace znamená „voči karte" (obal kariet má
 *    `transform`), preto portál (pravidlo z 12. 10. 2026);
 *  - keby sa obsah pri prepnutí nakreslil inde, React by ho postavil nanovo
 *    a rozpísaná otázka Jarvisovi by zmizla („Workspace drží prácu").
 *    Presun hotového uzla komponenty nechá žiť.
 */
export function NaCeluObrazovku({ nazov, children }: { nazov: string; children: ReactNode }) {
  const [cela, setCela] = useState(false);
  const [uzol, setUzol] = useState<HTMLDivElement | null>(null);
  const miesto = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = document.createElement("div");
    setUzol(u);
    return () => u.remove();
  }, []);

  useLayoutEffect(() => {
    if (!uzol) return;
    if (cela) {
      Object.assign(uzol.style, {
        position: "fixed", inset: "0", zIndex: "1000", overflowY: "auto",
        background: C.surface, padding: "14px clamp(12px, 3vw, 28px) 28px", boxSizing: "border-box",
      });
      document.body.appendChild(uzol);
    } else {
      uzol.removeAttribute("style");
      miesto.current?.appendChild(uzol);
    }
  }, [cela, uzol]);

  // Esc zavrie. Závislosť je len `cela` — poslucháč sa neprepisuje počas
  // udalosti (pasca z 16. 10. 2026, „Esc a preregistrácia").
  useEffect(() => {
    if (!cela) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setCela(false); };
    window.addEventListener("keydown", f);
    const predtym = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", f); document.body.style.overflow = predtym; };
  }, [cela]);

  const tlacidlo = (
    <button
      type="button" onClick={() => setCela((v) => !v)}
      title={cela ? "Späť do karty (Esc)" : "Otvoriť na celú obrazovku"}
      style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}
    >{cela ? "✕ Zavrieť celú obrazovku" : "⤢ Celá obrazovka"}</button>
  );

  return (
    <>
      <div ref={miesto} />
      {uzol && createPortal(
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: cela ? "space-between" : "flex-end", gap: 10, marginBottom: 10 }}>
            {cela && <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{nazov}</div>}
            {tlacidlo}
          </div>
          {children}
        </>,
        uzol,
      )}
    </>
  );
}
