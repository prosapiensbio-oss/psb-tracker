import { type CSSProperties, Fragment, useEffect, useRef, useState } from "react";

import type { AiContext } from "../../lib/psb/aiContext";
import { sendChat } from "../../lib/psb/client";
import { C, mix } from "../../lib/psb/theme";
import type { Actions } from "./App";

type ParsedAction = { type: "ack-anomaly" | "unack-anomaly"; key: string; note: string; label: string; done?: boolean };
type Msg = { role: "user" | "assistant"; text: string; actions?: ParsedAction[] };

const SUGGESTIONS = [
  "Čo mám tento týždeň riešiť ako prvé?",
  "Prečo mám len 24 % týždňov v zdravej zóne?",
  "Kde môžem zlepšiť kvalitu dát?",
  "Zhrň mi najdôležitejšie z „Na čo sa pozrieť“.",
];

// Pull ```psb-action {json}``` blocks out of the reply; return clean text + actions.
function parseActions(raw: string): { text: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  const text = raw
    .replace(/```psb-action\s*([\s\S]*?)```/g, (_m, body) => {
      try {
        const o = JSON.parse(String(body).trim());
        if (o && (o.type === "ack-anomaly" || o.type === "unack-anomaly") && typeof o.key === "string") {
          actions.push({ type: o.type, key: o.key, note: typeof o.note === "string" ? o.note : "", label: typeof o.label === "string" ? o.label : "Vykonať akciu" });
        }
      } catch {
        /* ignore malformed */
      }
      return "";
    })
    .trim();
  return { text, actions };
}

// Minimal formatter: **bold**, `code`, and newlines/• bullets.
function fmt(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, j) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={j}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`")) return <code key={j} style={{ background: mix(C.accent, 14), padding: "1px 4px", borderRadius: 4, fontSize: 12 }}>{p.slice(1, -1)}</code>;
      return <Fragment key={j}>{p}</Fragment>;
    });
    return (
      <div key={i} style={{ minHeight: line.trim() ? undefined : 6 }}>
        {parts}
      </div>
    );
  });
}

const bubbleBase: CSSProperties = { position: "fixed", right: 20, bottom: 20, zIndex: 60 };

export function Assistant({ context, actions }: { context: AiContext; actions: Actions }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [pending, setPending] = useState<{ filename: string; text: string }[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("psb-ai-open") === "1") setOpen(true);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("psb-ai-open", open ? "1" : "0"); } catch { /* ignore */ }
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, pending]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...msgs, { role: "user" as const, text: q }];
    setMsgs(history);
    setInput("");
    setBusy(true);
    const res = await sendChat(history.map((m) => ({ role: m.role, content: m.text })), context);
    setBusy(false);
    if (res.ok) {
      const { text, actions: acts } = parseActions(res.reply);
      setMsgs((m) => [...m, { role: "assistant", text: text || "…", actions: acts.length ? acts : undefined }]);
    } else {
      setMsgs((m) => [...m, { role: "assistant", text: errorText(res.error) }]);
    }
  }

  function runAction(mi: number, ai: number) {
    setMsgs((prev) => {
      const next = prev.map((m) => ({ ...m, actions: m.actions ? m.actions.map((a) => ({ ...a })) : undefined }));
      const a = next[mi]?.actions?.[ai];
      if (!a || a.done) return prev;
      if (a.type === "ack-anomaly") actions.ackAnomaly(a.key, a.note, true);
      else actions.ackAnomaly(a.key, "", false);
      a.done = true;
      return next;
    });
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const files = [...e.dataTransfer.files].filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (!files.length) return;
    const read = await Promise.all(files.map(async (f) => ({ filename: f.name, text: await f.text() })));
    setPending(read);
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    const results = await actions.ingest(pending);
    setBusy(false);
    setPending(null);
    const summary = results.map((r) => (r.error ? `• ${r.filename}: ${r.error}` : `• ${r.filename}: +${r.added} riadkov${r.skipped ? `, ${r.skipped} preskočených` : ""}`)).join("\n");
    setMsgs((m) => [...m, { role: "assistant", text: `**Import hotový.**\n${summary}\n\nDáta som obnovil — spýtaj sa ma na čokoľvek z nových čísel.` }]);
  }

  const panelW = 400;
  const panel: CSSProperties = {
    position: "fixed", right: 20, bottom: 20, zIndex: 60,
    width: `min(${panelW}px, calc(100vw - 32px))`, height: "min(620px, calc(100dvh - 40px))",
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 12px 40px rgba(0,0,0,.45)",
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...bubbleBase, display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 30, border: "none", cursor: "pointer", background: C.accent, color: C.onAccent, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }} aria-label="Otvoriť PSB Asistenta">
        <Spark /> Asistent
      </button>
    );
  }

  return (
    <div style={panel} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderBottom: `1px solid ${C.border}`, background: mix(C.accent, 8) }}>
        <span style={{ color: C.accent }}><Spark /></span>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>PSB Asistent</div>
          <div style={{ fontSize: 10.5, color: C.textDim }}>vidí tvoje reálne dáta · Claude Sonnet</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {msgs.length > 0 && (
            <button onClick={() => setMsgs([])} title="Vyčistiť konverzáciu" style={iconBtn}>⟲</button>
          )}
          <button onClick={() => setOpen(false)} title="Zavrieť" style={iconBtn}>✕</button>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.length === 0 && (
          <div style={{ color: C.textMuted, fontSize: 13 }}>
            <p style={{ margin: "2px 0 12px" }}>Ahoj Jerry 👋 Pýtaj sa ma na čokoľvek z tvojich dát — vysvetlím čísla na kartách, rozoberiem „Na čo sa pozrieť“, poradím so zlepšeniami. CSV môžeš pretiahnuť sem do okna.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} style={chip}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, mi) => (
          <div key={mi} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div style={{ background: m.role === "user" ? C.accent : mix(C.text, 7), color: m.role === "user" ? C.onAccent : C.text, padding: "9px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {fmt(m.text)}
            </div>
            {m.actions?.map((a, ai) => (
              <button key={ai} disabled={a.done} onClick={() => runAction(mi, ai)} style={{ marginTop: 6, display: "block", width: "100%", textAlign: "left", padding: "8px 11px", borderRadius: 9, cursor: a.done ? "default" : "pointer", fontSize: 12.5, fontWeight: 600, border: `1px solid ${a.done ? C.border : C.accent}`, background: a.done ? "transparent" : mix(C.accent, 14), color: a.done ? C.textDim : C.accentLight }}>
                {a.done ? `✓ Hotovo — ${a.label}` : `⚡ ${a.label}`}
              </button>
            ))}
          </div>
        ))}
        {busy && <div style={{ alignSelf: "flex-start", color: C.textDim, fontSize: 13, fontStyle: "italic" }}>Rozmýšľam…</div>}
        {pending && (
          <div style={{ alignSelf: "stretch", border: `1px solid ${C.accent}`, background: mix(C.accent, 10), borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>Naimportovať {pending.length} CSV do databázy?</div>
            <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 10 }}>{pending.map((f) => f.filename).join(", ")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={confirmImport} style={{ ...actBtn, background: C.accent, color: C.onAccent }}>Importovať</button>
              <button onClick={() => setPending(null)} style={{ ...actBtn, background: "transparent", color: C.textMuted, border: `1px solid ${C.border}` }}>Zrušiť</button>
            </div>
          </div>
        )}
      </div>

      {drag && (
        <div style={{ position: "absolute", inset: 0, background: mix(C.accent, 22), border: `2px dashed ${C.accent}`, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", color: C.accentLight, fontWeight: 600, fontSize: 15, pointerEvents: "none" }}>
          Pusti CSV sem
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, padding: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
          placeholder="Napíš otázku… (Enter odošle)"
          rows={1}
          style={{ flex: 1, resize: "none", maxHeight: 120, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit", lineHeight: 1.4 }}
        />
        <button onClick={() => ask(input)} disabled={busy || !input.trim()} style={{ width: 38, height: 38, borderRadius: 10, border: "none", cursor: busy || !input.trim() ? "default" : "pointer", background: input.trim() ? C.accent : C.border, color: C.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} aria-label="Odoslať">
          <Send />
        </button>
      </div>
    </div>
  );
}

function errorText(err: string): string {
  if (err === "no_key") return "⚠️ AI zatiaľ nie je aktivovaná — chýba API kľúč. Keď ho vložíš do nastavení appky, začnem odpovedať.";
  if (err === "api_error") return "⚠️ Model vrátil chybu (skontroluj kredit/kľúč na Anthropic konzole). Skús to prosím znova.";
  return "⚠️ Nepodarilo sa spojiť s AI. Skús to prosím o chvíľu znova.";
}

const iconBtn: CSSProperties = { width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" };
const chip: CSSProperties = { textAlign: "left", padding: "8px 11px", borderRadius: 9, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 12.5, cursor: "pointer" };
const actBtn: CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600 };

function Spark() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      <path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9zM19 15l.9 2.4 2.4.9-2.4.9L19 22l-.9-2.4-2.4-.9 2.4-.9z" />
    </svg>
  );
}
function Send() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}
