import { useEffect, useState } from "react";

import { C } from "../../lib/psb/theme";

// NOTE: the CSS palette ids are legacy — "light" is the medium-green palette and
// "mid" is the light cream one. Labels below match the ACTUAL brightness so the
// buttons aren't swapped (dark → medium → light).
const THEMES = [
  { id: "dark", label: "Tmavý", rodina: "Klasika" },
  { id: "light", label: "Stredný", rodina: "Klasika" },
  { id: "mid", label: "Svetlý", rodina: "Klasika" },
  // „Živé sklo" — mesh pozadie + sklenené karty, jantárový akcent.
  // Zatiaľ dobrovoľné: kým nie sú prekreslené všetky obrazovky, musí sa dať
  // vrátiť jedným klikom.
  { id: "sklo", label: "Tmavý", rodina: "Živé sklo" },
  { id: "sklo-stredny", label: "Stredný", rodina: "Živé sklo" },
  { id: "sklo-svetly", label: "Svetlý", rodina: "Živé sklo" },
];
const RODINY = ["Klasika", "Živé sklo"];

// Swaps the CSS-variable palette on <html data-psb-theme>. Persists the choice.
export function ThemeSwitch() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    let saved = "dark";
    try {
      saved = localStorage.getItem("psb-theme") || "dark";
    } catch {
      /* ignore */
    }
    setTheme(saved);
    document.documentElement.setAttribute("data-psb-theme", saved);
  }, []);

  const pick = (t: string) => {
    setTheme(t);
    document.documentElement.setAttribute("data-psb-theme", t);
    try {
      localStorage.setItem("psb-theme", t);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {RODINY.map((rodina) => (
        <div key={rodina} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: C.textMuted, minWidth: 78 }}>{rodina}:</span>
          {THEMES.filter((t) => t.rodina === rodina).map((t) => {
            const on = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 20,
                  border: `1px solid ${on ? C.accent : C.border}`,
                  background: on ? C.accentBg : "transparent",
                  color: on ? C.accentLight : C.textMuted,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      ))}
      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
        Živé sklo je nový vzhľad — mesh pozadie a sklenené karty. Nasadzuje sa
        po obrazovkách, takže niektoré ešte vyzerajú po starom. Prepnúť späť sa
        dá kedykoľvek, nič sa tým nestratí.
      </div>
    </div>
  );
}
