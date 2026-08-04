// PSB brand theme. Colors are CSS variables so the whole app can switch between
// the Tmavý / Stredný / Svetlý palettes at runtime (see styles.css + ThemeSwitch).
import type { CSSProperties } from "react";

// color-mix keeps alpha working with CSS-var colors (can't append "55" to a var).
export const mix = (v: string, pct: number) => `color-mix(in srgb, ${v} ${pct}%, transparent)`;

export const C = {
  bg: "var(--c-bg)",
  card: "var(--c-card)",
  cardHover: "var(--c-cardHover)",
  border: "var(--c-border)",
  accent: "var(--c-accent)",
  accentLight: "var(--c-accentLight)",
  accentBg: "var(--c-accentBg)",
  text: "var(--c-text)",
  textMuted: "var(--c-textMuted)",
  textDim: "var(--c-textDim)",
  red: "var(--c-red)",
  redBg: "var(--c-redBg)",
  orange: "var(--c-orange)",
  orangeBg: "var(--c-orangeBg)",
  green: "var(--c-green)",
  greenBg: "var(--c-greenBg)",
  blue: "var(--c-blue)",
  blueBg: "var(--c-blueBg)",
  bark: "var(--c-bark)", // brown — Udržateľnosť fáza + progress
  track: "var(--c-track)", // subtle chart/bar background
  onAccent: "var(--c-onAccent)", // text on an accent-filled surface
} as const;

export const MEMBERSHIP_COLORS: Record<string, string> = {
  "6h S viazanostou (6M)": C.accent,
  "6h BEZ viazanosti": C.accentLight,
  "8 hodín": C.blue,
  "18 hodín": C.green,
  "1 hodina": C.orange,
  "Online balíček": "#8A7DDB",
  "Ročné (ONE YEAR)": "#D8A93B",
  "Členstvo (bez balíčka hodín)": "#5FA8A0",
  "Špeciál": "#B978C9",
  "Bez balíčka": C.textDim,
  "Iné": C.bark,
};

type Variant = "accent" | "danger" | "ghost" | "outline";
type Tone = "green" | "red" | "orange" | "blue" | "accent" | "muted" | "bark";

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
    border: `2px dashed ${mix(C.accent, 40)}`,
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
  color: active ? C.onAccent : C.textMuted,
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
  color: variant === "accent" || variant === "danger" ? C.onAccent : C.text,
  transition: "all .15s",
});

const toneColors: Record<Tone, { fg: string; bg: string }> = {
  green: { fg: C.green, bg: C.greenBg },
  red: { fg: C.red, bg: C.redBg },
  orange: { fg: C.orange, bg: C.orangeBg },
  blue: { fg: C.blue, bg: C.blueBg },
  accent: { fg: C.accentLight, bg: C.accentBg },
  muted: { fg: C.textMuted, bg: C.track },
  bark: { fg: C.bark, bg: mix(C.bark, 16) },
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
  borderColor: mix(toneColors[tone].fg, 27),
  padding: 12,
  marginBottom: 8,
});
