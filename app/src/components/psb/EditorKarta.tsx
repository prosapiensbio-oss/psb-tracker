import { useState } from "react";

import { C, mix } from "../../lib/psb/theme";

/**
 * KARTA EDITOR vo Workspace (Jerry, 6. 10. 2026): „pridaj ešte jednu kartu
 * editor, tam budú dve možnosti, foto a video; keď kliknem na jedno z nich,
 * otvorí sa editor."
 *
 * Editory sú samostatné stránky (`public/editor/foto.html`, `video.html`,
 * zostavené cez `editor/zostav.py`) — tie isté náčrty, ktoré si Jerry
 * vyskúšal. Tu sa otvoria v rámiku. Editor videa musí byť od fotiek
 * oddelený (jeho slová), spája ich len zásobník snímok: 📷 vo videu →
 * „Snímky z videa" vo fotkách.
 *
 * Raz otvorený editor ostane načítaný aj po prepnutí na druhý (aj na inú
 * kartu Workspace) — inak by prepnutie zahodilo rozrobenú prácu
 * (pravidlo „Workspace drží prácu").
 */
type Druh = "foto" | "video";

const EDITORY: { druh: Druh; ikona: string; nazov: string; popis: string }[] = [
  { druh: "foto", ikona: "◧", nazov: "Foto", popis: "predtým / potom vedľa seba, výrez, mriežka, prekrytie, čiary a uhly" },
  { druh: "video", ikona: "▶", nazov: "Video", popis: "chôdza a beh — spomalenie, krok po snímke, strih, uhly a 📷 snímky do fotiek" },
];

export function EditorKarta() {
  const [otvoreny, setOtvoreny] = useState<Druh | null>(null);
  const [nacitane, setNacitane] = useState<Druh[]>([]);
  const otvor = (d: Druh) => {
    setOtvoreny(d);
    setNacitane((n) => (n.includes(d) ? n : [...n, d]));
  };

  if (!otvoreny) {
    return (
      <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 320px))", gap: 18, justifyContent: "center", width: "100%" }}>
          {EDITORY.map((e) => (
            <button
              key={e.druh}
              type="button"
              onClick={() => otvor(e.druh)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "26px 24px",
                borderRadius: 16, border: `1px solid ${mix(C.border, 140)}`, background: C.surface, color: C.text,
                fontFamily: "inherit", textAlign: "left", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 34, lineHeight: 1, color: C.accentLight }}>{e.ikona}</span>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{e.nazov}</span>
              <span style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.55 }}>{e.popis}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div role="tablist" aria-label="Editor" style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 10, border: `1px solid ${mix(C.border, 120)}`, background: C.surface }}>
          {EDITORY.map((e) => (
            <button
              key={e.druh}
              type="button"
              role="tab"
              aria-selected={otvoreny === e.druh}
              onClick={() => otvor(e.druh)}
              style={{
                padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                background: otvoreny === e.druh ? mix(C.accent, 22) : "transparent",
                color: otvoreny === e.druh ? C.accentLight : C.textMuted, fontWeight: otvoreny === e.druh ? 700 : 500,
              }}
            >{e.ikona} {e.nazov}</button>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: C.textDim }}>
          rozrobené ostáva, aj keď prepneš · snímky z videa nájdeš vo Foto v „Snímky z videa"
        </span>
      </div>
      <div style={{ position: "relative", flexGrow: 1, minHeight: 420, borderRadius: 12, overflow: "hidden", border: `1px solid ${mix(C.border, 100)}` }}>
        {nacitane.map((d) => (
          <iframe
            key={d}
            src={`/editor/${d}.html`}
            title={d === "foto" ? "Editor fotiek" : "Editor videa"}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", border: 0,
              visibility: d === otvoreny ? "visible" : "hidden",
            }}
          />
        ))}
      </div>
    </div>
  );
}
