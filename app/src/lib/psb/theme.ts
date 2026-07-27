// PSB brand theme. Inline-style tokens — SSR-safe, framework-agnostic, and
// isolated from the scaffold's Quanta layer.
import type { CSSProperties } from "react";

export const C = {
  bg: "#0F1712",
  card: "#16211A",
  cardHover: "#1C2B22",
  border: "#2D7D5A33",
  borderSolid: "#24473636",
  accent: "#2D7D5A",
  accentLight: "#A8C4B0",
  accentBg: "#2D7D5A18",
  text: "#E8E6E0",
  textMuted: "#9CA89E",
  textDim: "#6B7A6E",
  red: "#E24B4A",
  redBg: "#E24B4A18",
  orange: "#EF9F27",
  orangeBg: "#EF9F2718",
  green: "#5DCA75",
  greenBg: "#5DCA7518",
  blue: "#378ADD",
  blueBg: "#378ADD18",
} as const;

export const MEMBERSHIP_COLORS: Record<string, string> = {
  "6h S viazanostou (6M)": C.accent,
  "6h BEZ viazanosti": C.accentLight,
  "8 hodín": C.blue,
  "18 hodín": C.green,
  "1 hodina": C.orange,
  "Online balíček": "#8A7DDB",
  "Bez balíčka": C.textDim,
  "Iné": C.red,
};

type Variant = "accent" | "danger" | "ghost" | "outline";
type Tone = "green" | "red" | "orange" | "blue" | "accent" | "muted";

export const S = {
  h1: { fontSize: 20, fontWeight: 700, color: C.accentLight } as CSSProperties,
  h2: { fontSize: 18, fontWeight: 600, marginBottom: 12, color: C.accentLight } as CSSProperties,
  h3: { fontSize: 15, fontWeight: 600, marginBottom: 8, color: C.text } as CSSProperties,
  card: {
    background: C.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    border: `1px solid ${C.border}`,
  } as CSSProperties,
  input: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 12px",
    color: C.text,
    fontSize: 13,
    outline: "none",
    width: "100%",
  } as CSSProperties,
  select: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 12px",
    color: C.text,
    fontSize: 13,
    outline: "none",
  } as CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } as CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: `1px solid ${C.border}`,
    color: C.textMuted,
    fontWeight: 500,
    fontSize: 12,
    whiteSpace: "nowrap",
  } as CSSProperties,
  td: { padding: "8px 10px", borderBottom: `1px solid ${C.border}` } as CSSProperties,
  statNum: { fontSize: 26, fontWeight: 700, color: C.accentLight } as CSSProperties,
  statLabel: { fontSize: 11, color: C.textMuted, marginTop: 4 } as CSSProperties,
  upload: {
    border: `2px dashed ${C.accent}55`,
    borderRadius: 12,
    padding: 28,
    textAlign: "center",
    cursor: "pointer",
    color: C.textMuted,
    transition: "all .2s",
  } as CSSProperties,
};

export const tab = (active: boolean): CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  background: active ? C.accent : "transparent",
  color: active ? "#fff" : C.textMuted,
  transition: "all .15s",
  whiteSpace: "nowrap",
});

export const btn = (variant: Variant = "ghost"): CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 8,
  border: variant === "outline" ? `1px solid ${C.border}` : "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  background:
    variant === "accent"
      ? C.accent
      : variant === "danger"
        ? C.red
        : variant === "outline"
          ? "transparent"
          : C.cardHover,
  color: variant === "outline" ? C.textMuted : "#fff",
  transition: "all .15s",
});

const toneColors: Record<Tone, { fg: string; bg: string }> = {
  green: { fg: C.green, bg: C.greenBg },
  red: { fg: C.red, bg: C.redBg },
  orange: { fg: C.orange, bg: C.orangeBg },
  blue: { fg: C.blue, bg: C.blueBg },
  accent: { fg: C.accentLight, bg: C.accentBg },
  muted: { fg: C.textMuted, bg: "#ffffff08" },
};

export const badge = (tone: Tone): CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  background: toneColors[tone].bg,
  color: toneColors[tone].fg,
});

export const alertBox = (tone: Tone): CSSProperties => ({
  ...S.card,
  background: toneColors[tone].bg,
  borderColor: toneColors[tone].fg + "44",
  padding: 12,
  marginBottom: 8,
});
