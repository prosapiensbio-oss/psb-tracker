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
  { id: "sklo", label: "Tmavý", rodina: "Živé sklo" },
  { id: "sklo-stredny", label: "Stredný", rodina: "Živé sklo" },
  { id: "sklo-svetly", label: "Svetlý", rodina: "Živé sklo" },
];
const RODINY = ["Klasika", "Živé sklo"];

/**
 * Východzia téma. Sklo, nie Klasika (Jerry, 11. 8.).
 *
 * Do 11. 8. bola východzia „dark" a sklo sa zapínalo len tým, že si ho niekto
 * raz vybral — čiže žilo v localStorage jedného prehliadača. Nový prehliadač,
 * mobil, iný počítač alebo vymazané dáta stránky = starý vzhľad, hoci Jerry
 * 10. 8. povedal „nový vzhľad má byť na všetkých obrazovkách". Bitcoinová
 * appka pritom mala sklo natvrdo pre každého, takže si tie dve appky
 * odporovali. Rovnaká rodina chýb ako rozloženie grafov, čo žilo iba
 * v prehliadači: čo má byť východzie, patrí do kódu.
 */
export const VYCHODZIA_TEMA = "sklo";

// Swaps the CSS-variable palette on <html data-psb-theme>. Persists the choice.
export function ThemeSwitch() {
  const [theme, setTheme] = useState(VYCHODZIA_TEMA);

  useEffect(() => {
    let saved = VYCHODZIA_TEMA;
    try {
      saved = localStorage.getItem("psb-theme") || VYCHODZIA_TEMA;
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
