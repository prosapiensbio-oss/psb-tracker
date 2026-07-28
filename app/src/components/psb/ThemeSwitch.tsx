import { useEffect, useState } from "react";

import { C } from "../../lib/psb/theme";

const THEMES = [
  { id: "dark", label: "Tmavý" },
  { id: "mid", label: "Stredný" },
  { id: "light", label: "Svetlý" },
];

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
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: C.textMuted }}>Vzhľad:</span>
      {THEMES.map((t) => {
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
  );
}
