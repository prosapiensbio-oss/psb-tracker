import { type CSSProperties, Fragment, useEffect, useRef, useState } from "react";

import type { AiContext } from "../../lib/psb/aiContext";
import {
  deleteJarvisChat, fetchJarvisMemory, fetchVzasSettings, saveJarvisChat,
  saveVzasSetting, saveZaver, sendChat, vyhodnotZaver,
} from "../../lib/psb/client";
import { C, mix } from "../../lib/psb/theme";
import type { Actions } from "./App";

type ParsedAction = {
  type: "ack-anomaly" | "unack-anomaly" | "set-override" | "zapis-zaver" | "vyhodnot-zaver" | "novy-ciel";
  label: string;
  done?: boolean;
  key?: string;
  note?: string;
  name?: string;
  field?: string;
  value?: unknown;
  // zapis-zaver / vyhodnot-zaver / novy-ciel
  data?: Record<string, unknown>;
};
type Msg = { role: "user" | "assistant"; text: string; actions?: ParsedAction[]; images?: string[] };
type SavedChat = { id: string; title: string; messages: Msg[]; updatedAt: number; archived?: boolean };

const CHATS_KEY = "psb-ai-chats";
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 6));
const chatTitle = (msgs: Msg[]) => {
  const first = msgs.find((m) => m.role === "user")?.text?.trim();
  return first ? (first.length > 44 ? first.slice(0, 44) + "…" : first) : "Nový chat";
};
const relTime = (ts: number) => {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getDate()}.${d.getMonth() + 1}.`;
};

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

// Client fields the assistant is allowed to edit (must match /api/override ALLOWED).
const OVERRIDE_FIELDS = new Set(["status", "specialRate", "specialRateNote", "trainerNote", "contractSigned", "primaryTrainer", "bitcoin"]);

// Pull ```psb-action {json}``` blocks out of the reply; return clean text + actions.
function parseActions(raw: string): { text: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  const text = raw
    .replace(/```psb-action\s*([\s\S]*?)```/g, (_m, body) => {
      try {
        const o = JSON.parse(String(body).trim());
        const label = typeof o?.label === "string" ? o.label : "Vykonať akciu";
        if ((o?.type === "ack-anomaly" || o?.type === "unack-anomaly") && typeof o.key === "string") {
          actions.push({ type: o.type, key: o.key, note: typeof o.note === "string" ? o.note : "", label });
        } else if (o?.type === "set-override" && typeof o.name === "string" && OVERRIDE_FIELDS.has(o.field)) {
          actions.push({ type: "set-override", name: o.name, field: o.field, value: o.value, label });
        } else if (o?.type === "zapis-zaver" && typeof o.zaver === "string") {
          actions.push({ type: "zapis-zaver", label, data: o });
        } else if (o?.type === "vyhodnot-zaver" && typeof o.id === "string") {
          actions.push({ type: "vyhodnot-zaver", label, data: o });
        } else if (o?.type === "novy-ciel" && typeof o.nazov === "string") {
          actions.push({ type: "novy-ciel", label, data: o });
        }
      } catch {
        /* ignore malformed */
      }
      return "";
    })
    .trim();
  return { text, actions };
}

// Minimal formatter: **bold**, `code`, «clickable client name», and newlines.
function fmt(text: string, onClientClick?: (name: string) => void) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|«[^»]+»)/g).map((p, j) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={j}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`")) return <code key={j} style={{ background: mix(C.accent, 14), padding: "1px 4px", borderRadius: 4, fontSize: 12 }}>{p.slice(1, -1)}</code>;
      if (p.startsWith("«") && p.endsWith("»")) {
        const name = p.slice(1, -1);
        return onClientClick
          ? <button key={j} onClick={() => onClientClick(name)} style={{ background: "none", border: "none", padding: 0, margin: 0, color: C.accentLight, fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontSize: "inherit", fontFamily: "inherit" }}>{name}</button>
          : <strong key={j}>{name}</strong>;
      }
      return <Fragment key={j}>{p}</Fragment>;
    });
    return <div key={i} style={{ minHeight: line.trim() ? undefined : 6 }}>{parts}</div>;
  });
}

// ── Shared chat brain — instantiate ONCE (in App) so the floating panel and the
// inline dashboard widget share the same conversation. ─────────────────────────
export type AssistantChat = ReturnType<typeof useAssistantChat>;

export function useAssistantChat(context: AiContext, actions: Actions) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ filename: string; text: string }[] | null>(null);
  const [attach, setAttach] = useState<string[]>([]);
  // "Hlboká debata" — sends the turn to Opus instead of Sonnet. Off by default
  // (Opus is slower); on for strategy talks, where the thinking is the point.
  const [deep, setDeep] = useState(false);
  // Čo práve robí — "Pozerám do dát…", dôvod dopytu, "Otváram knihu…".
  // Bez toho vyzerá nástrojové kolo ako zamrznutá appka.
  const [stav, setStav] = useState("");
  useEffect(() => {
    try { if (localStorage.getItem("psb-ai-deep") === "1") setDeep(true); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("psb-ai-deep", deep ? "1" : "0"); } catch { /* ignore */ }
  }, [deep]);
  // Whether the floating bottom-right panel is open (shared so a client-name click
  // from the inline widget can pop it open on the next tab). Persisted.
  const [floatingOpen, setFloatingOpen] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("psb-ai-open") === "1") setFloatingOpen(true); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("psb-ai-open", floatingOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [floatingOpen]);

  // ── Chat history (saved in localStorage; archive/delete) ──
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [chatId, setChatId] = useState<string>(newId);
  // Najprv localStorage (panel sa otvorí okamžite), potom D1 (pravda naprieč
  // zariadeniami). Databáza vyhráva — je to jediná kópia, ktorú vidí aj mobil.
  useEffect(() => {
    let zivy = true;
    try {
      const raw = JSON.parse(localStorage.getItem(CHATS_KEY) || "null");
      if (Array.isArray(raw) && raw.length) {
        setChats(raw);
        const recent = raw.filter((c: SavedChat) => !c.archived).sort((a: SavedChat, b: SavedChat) => b.updatedAt - a.updatedAt)[0];
        if (recent) { setChatId(recent.id); setMsgs(recent.messages || []); }
      }
    } catch { /* ignore */ }
    void fetchJarvisMemory().then(({ chats: db }) => {
      if (!zivy || !Array.isArray(db) || !db.length) return;
      const zoz = db as SavedChat[];
      setChats(zoz);
      try { localStorage.setItem(CHATS_KEY, JSON.stringify(zoz.slice(0, 50))); } catch { /* ignore */ }
      const recent = zoz.filter((c) => !c.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      // Neprepisuj rozpísaný chat — len prázdny štart.
      setMsgs((m) => (m.length ? m : recent?.messages || []));
      setChatId((id) => (recent && !id.startsWith("c") ? recent.id : recent ? recent.id : id));
    });
    return () => { zivy = false; };
  }, []);
  // Auto-save the active conversation on every change.
  useEffect(() => {
    if (!msgs.length) return;
    setChats((prev) => {
      const existing = prev.find((c) => c.id === chatId);
      const zaznam = { id: chatId, title: chatTitle(msgs), messages: msgs, updatedAt: Date.now(), archived: existing?.archived };
      const next = [zaznam, ...prev.filter((c) => c.id !== chatId)];
      try { localStorage.setItem(CHATS_KEY, JSON.stringify(next.slice(0, 50))); } catch { /* ignore */ }
      void saveJarvisChat({ id: zaznam.id, title: zaznam.title, messages: msgs, archived: !!zaznam.archived });
      return next;
    });
  }, [msgs, chatId]);

  const persistChats = (next: SavedChat[]) => {
    setChats(next);
    try { localStorage.setItem(CHATS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const newChat = () => { setChatId(newId()); setMsgs([]); setInput(""); setAttach([]); };
  const openChat = (id: string) => { const c = chats.find((x) => x.id === id); if (c) { setChatId(id); setMsgs(c.messages || []); } };
  const deleteChat = (id: string) => { persistChats(chats.filter((c) => c.id !== id)); void deleteJarvisChat(id); if (id === chatId) newChat(); };
  const archiveChat = (id: string) => {
    const next = chats.map((c) => (c.id === id ? { ...c, archived: !c.archived } : c));
    persistChats(next);
    const c = next.find((x) => x.id === id);
    if (c) void saveJarvisChat({ id: c.id, title: c.title, messages: c.messages, archived: !!c.archived });
    if (id === chatId) newChat();
  };

  async function handleIncoming(list: FileList | File[] | null) {
    const arr = [...(list || [])];
    const csv = arr.filter((f) => f.name.toLowerCase().endsWith(".csv"));
    const imgs = arr.filter((f) => f.type.startsWith("image/"));
    if (csv.length) {
      const read = await Promise.all(csv.map(async (f) => ({ filename: f.name, text: await f.text() })));
      setPending(read);
    }
    if (imgs.length) {
      const urls = await Promise.all(imgs.slice(0, 4).map(fileToDataUrl));
      setAttach((a) => [...a, ...urls].slice(0, 4));
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if ((!q && !attach.length) || busy) return;
    const imgs = attach.length ? attach : undefined;
    const history: Msg[] = [...msgs, { role: "user", text: q || "Pozri tento obrázok.", images: imgs }];
    // Add the user message + an empty assistant placeholder that fills as the answer streams.
    setMsgs([...history, { role: "assistant", text: "" }]);
    setInput("");
    setAttach([]);
    setBusy(true);
    const setLast = (patch: Msg) => setMsgs((m) => { const n = m.slice(); n[n.length - 1] = patch; return n; });
    const res = await sendChat(
      history.map((m) => ({ role: m.role, content: m.text, images: m.images })),
      context,
      // Live update — strip any (possibly partial) action block from the visible text.
      (full) => setLast({ role: "assistant", text: full.replace(/```psb-action[\s\S]*$/, "").trimEnd() }),
      deep,
      setStav,
    );
    setBusy(false);
    setStav("");
    if (res.ok) {
      const { text, actions: acts } = parseActions(res.reply);
      setLast({ role: "assistant", text: text || "…", actions: acts.length ? acts : undefined });
    } else {
      setLast({ role: "assistant", text: errorText(res.error) });
    }
  }

  function runAction(mi: number, ai: number) {
    setMsgs((prev) => {
      const next = prev.map((m) => ({ ...m, actions: m.actions ? m.actions.map((a) => ({ ...a })) : undefined }));
      const a = next[mi]?.actions?.[ai];
      if (!a || a.done) return prev;
      if (a.type === "ack-anomaly") actions.ackAnomaly(a.key || "", a.note || "", true);
      else if (a.type === "unack-anomaly") actions.ackAnomaly(a.key || "", "", false);
      else if (a.type === "set-override" && a.name && a.field) actions.setOverride(a.name, a.field as never, a.value);
      else if (a.type === "zapis-zaver" && a.data) void saveZaver(a.data);
      else if (a.type === "vyhodnot-zaver" && a.data) {
        void vyhodnotZaver(String(a.data.id || ""), String(a.data.stav || "otvoreny"), String(a.data.vysledok || ""));
      } else if (a.type === "novy-ciel" && a.data) {
        // Ciele žijú v jednom JSON kľúči — načítaj, pridaj, ulož späť.
        const d = a.data;
        void fetchVzasSettings().then((st) => {
          const zoz = Array.isArray(st["ciele"]) ? (st["ciele"] as Record<string, unknown>[]) : [];
          zoz.unshift({
            id: `c${Date.now().toString(36)}`, nazov: String(d.nazov || "Nový cieľ"), preco: String(d.preco || ""),
            typ: "projekt", stav: "nezacate", priorita: String(d.priorita || "stredna"),
            dalsiKrok: String(d.dalsiKrok || ""), termin: d.termin ? String(d.termin) : undefined,
            poznamka: "Navrhol Jarvis",
          });
          void saveVzasSetting("ciele", zoz);
        });
      }
      a.done = true;
      return next;
    });
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

  return { msgs, setMsgs, input, setInput, busy, stav, deep, setDeep, pending, setPending, attach, setAttach, ask, runAction, confirmImport, handleIncoming, floatingOpen, setFloatingOpen, chats, chatId, newChat, openChat, deleteChat, archiveChat };
}

// ── The conversation UI (messages + input) — used by both the floating panel and
// the inline widget. Each instance has its own scroll/refs/drag state. ──────────
export function ChatConversation({ chat, autoFocus, onClientClick }: { chat: AssistantChat; autoFocus?: boolean; onClientClick?: (name: string) => void }) {
  const { msgs, input, setInput, busy, stav, deep, setDeep, pending, setPending, attach, setAttach, ask, runAction, confirmImport, handleIncoming } = chat;
  const [drag, setDrag] = useState(false);
  // Autoscroll drží odpoveď na očiach LEN vtedy, keď je človek dole. Keď si
  // odroluje hore a číta začiatok, streamovanie ho tam už nesmie ťahať späť —
  // dovtedy, kým sa sám nevráti dole (alebo neklikne na šípku).
  //
  // Posúva sa naschvál skokovo (behavior "auto"), nie plynulo: pri streamovaní
  // sa efekt spúšťa niekoľkokrát za sekundu a animovaný posun by generoval
  // scroll udalosti z medzipolôh ďaleko od konca — tie by vyzerali ako "človek
  // odrolo­val hore" a autoscroll by sa sám vypol.
  const [drzatDole, setDrzatDole] = useState(true);
  const drzatRef = useRef(true);
  const setDrzat = (v: boolean) => { drzatRef.current = v; setDrzatDole(v); };
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !drzatRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs, busy, pending]);
  const naKoniec = () => {
    const el = scrollRef.current;
    if (!el) return;
    setDrzat(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };
  const priScrollovani = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dole = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (dole !== drzatRef.current) setDrzat(dole);
  };
  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 60);
  }, [autoFocus]);

  return (
    <div
      style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void handleIncoming(e.dataTransfer.files); }}
    >
      <div ref={scrollRef} onScroll={priScrollovani} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((m, mi) => (
          // Skip the empty assistant placeholder before the first streamed token ("Rozmýšľam…" covers it).
          m.role === "assistant" && !m.text && !m.images && !m.actions?.length ? null : (
          <div key={mi} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div style={{ background: m.role === "user" ? C.accent : mix(C.text, 7), color: m.role === "user" ? C.onAccent : C.text, padding: "9px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {m.images?.length ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: m.text ? 8 : 0 }}>
                  {m.images.map((src, k) => <img key={k} src={src} alt="" style={{ maxWidth: 150, maxHeight: 150, borderRadius: 8, display: "block" }} />)}
                </div>
              ) : null}
              {fmt(m.text, m.role === "assistant" ? onClientClick : undefined)}
            </div>
            {m.actions?.map((a, ai) => (
              <button key={ai} disabled={a.done} onClick={() => runAction(mi, ai)} style={{ marginTop: 6, display: "block", width: "100%", textAlign: "left", padding: "8px 11px", borderRadius: 9, cursor: a.done ? "default" : "pointer", fontSize: 12.5, fontWeight: 600, border: `1px solid ${a.done ? C.border : C.accent}`, background: a.done ? "transparent" : mix(C.accent, 14), color: a.done ? C.textDim : C.accentLight }}>
                {a.done ? `✓ Hotovo — ${a.label}` : `⚡ ${a.label}`}
              </button>
            ))}
          </div>
          )
        ))}
        {busy && (!msgs.length || !msgs[msgs.length - 1].text) && (
          <div style={{ alignSelf: "flex-start", color: C.textDim, fontSize: 13, fontStyle: "italic" }}>
            {stav || (deep ? "Rozmýšľam poriadne… (chvíľu to potrvá)" : "Rozmýšľam…")}
          </div>
        )}
        {busy && stav && !!msgs.length && !!msgs[msgs.length - 1].text && (
          // Nástroj v polovici odpovede — nech je vidieť, že sa niečo deje.
          <div style={{ alignSelf: "flex-start", color: C.accentLight, fontSize: 12, fontStyle: "italic", opacity: 0.85 }}>⚙ {stav}</div>
        )}
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

      {!drzatDole && (
        <button
          onClick={naKoniec}
          title="Skočiť na koniec odpovede"
          style={{ position: "absolute", right: 14, bottom: 74, zIndex: 3, height: 30, padding: "0 12px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.card, color: C.textMuted, fontSize: 12, cursor: "pointer", boxShadow: "0 3px 10px rgba(0,0,0,.28)", display: "flex", alignItems: "center", gap: 6 }}
        >
          ↓ {busy ? "Píše sa" : "Na koniec"}
        </button>
      )}

      {drag && (
        <div style={{ position: "absolute", inset: 0, background: mix(C.accent, 22), border: `2px dashed ${C.accent}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: C.accentLight, fontWeight: 600, fontSize: 15, pointerEvents: "none" }}>
          Pusti CSV alebo obrázok sem
        </div>
      )}

      {attach.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 10px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {attach.map((src, k) => (
            <div key={k} style={{ position: "relative" }}>
              <img src={src} alt="" style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 6, display: "block", border: `1px solid ${C.border}` }} />
              <button onClick={() => setAttach((a) => a.filter((_, j) => j !== k))} title="Odobrať" style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: "none", background: C.red, color: "#fff", fontSize: 11, cursor: "pointer", lineHeight: "18px", padding: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: attach.length ? "none" : `1px solid ${C.border}`, padding: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv,image/*" multiple style={{ display: "none" }} onChange={(e) => { void handleIncoming(e.target.files); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} title="Nahrať CSV alebo obrázok" style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, cursor: "pointer", background: "transparent", color: C.textMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} aria-label="Nahrať CSV alebo obrázok">
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-8.49 8.49a1 1 0 0 1-1.41-1.41l7.78-7.78" /></svg>
        </button>
        <button
          onClick={() => setDeep(!deep)}
          title={deep ? "Hlboká debata je zapnutá — odpovedá silnejší model, trvá to dlhšie. Klikni pre vypnutie." : "Hlboká debata: zapni pre strategické otázky (marketing, positioning, rozhodnutia). Odpovedá silnejší model, ale pomalšie."}
          style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${deep ? C.accent : C.border}`, cursor: "pointer", background: deep ? mix(C.accent, 16) : "transparent", color: deep ? C.accentLight : C.textMuted, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}
          aria-pressed={deep}
          aria-label="Hlboká debata"
        >🧠</button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
          placeholder="Napíš otázku… (Enter odošle)"
          rows={1}
          style={{ flex: 1, resize: "none", maxHeight: 120, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit", lineHeight: 1.4 }}
        />
        <button onClick={() => ask(input)} disabled={busy || (!input.trim() && !attach.length)} style={{ width: 38, height: 38, borderRadius: 10, border: "none", cursor: busy || (!input.trim() && !attach.length) ? "default" : "pointer", background: input.trim() || attach.length ? C.accent : C.border, color: C.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} aria-label="Odoslať">
          <Send />
        </button>
      </div>
    </div>
  );
}

function ChatHeader({ chat, extra }: { chat: AssistantChat; extra?: React.ReactNode }) {
  const [showHistory, setShowHistory] = useState(false);
  const active = chat.chats.filter((c) => !c.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  const archived = chat.chats.filter((c) => c.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, padding: "12px 14px 12px 16px", borderBottom: `1px solid ${C.border}`, background: mix(C.accent, 8) }}>
      <span style={{ color: C.accent }}><Spark /></span>
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Jarvis</div>
        <div style={{ fontSize: 10.5, color: C.textDim }}>vidí tvoje reálne dáta · Claude Sonnet</div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
        <button onClick={() => { chat.newChat(); setShowHistory(false); }} title="Nový chat" style={iconBtn}>＋</button>
        <button onClick={() => setShowHistory((v) => !v)} title="História chatov" style={{ ...iconBtn, color: showHistory ? C.accentLight : C.textMuted }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
        </button>
        {extra}
      </div>
      {showHistory && (
        <>
          <div onClick={() => setShowHistory(false)} style={{ position: "fixed", inset: 0, zIndex: 3 }} />
          <div style={{ position: "absolute", top: "100%", right: 8, marginTop: 4, width: 280, maxHeight: 360, overflowY: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.4)", zIndex: 4, padding: 6 }}>
            <div style={{ fontSize: 11, color: C.textDim, padding: "4px 8px 6px", fontWeight: 600 }}>Nedávne chaty</div>
            {active.length === 0 && <div style={{ fontSize: 12, color: C.textDim, padding: "4px 8px 8px" }}>Zatiaľ žiadne uložené chaty.</div>}
            {active.map((c) => (
              <ChatHistoryRow key={c.id} c={c} current={c.id === chat.chatId} onOpen={() => { chat.openChat(c.id); setShowHistory(false); }} onArchive={() => chat.archiveChat(c.id)} onDelete={() => chat.deleteChat(c.id)} archiveTitle="Archivovať" />
            ))}
            {archived.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: C.textDim, padding: "8px 8px 6px", fontWeight: 600, borderTop: `1px solid ${C.border}`, marginTop: 4 }}>Archív ({archived.length})</div>
                {archived.map((c) => (
                  <ChatHistoryRow key={c.id} c={c} current={c.id === chat.chatId} onOpen={() => { chat.openChat(c.id); setShowHistory(false); }} onArchive={() => chat.archiveChat(c.id)} onDelete={() => chat.deleteChat(c.id)} archiveTitle="Vrátiť z archívu" dim />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ChatHistoryRow({ c, current, onOpen, onArchive, onDelete, archiveTitle, dim }: { c: SavedChat; current: boolean; onOpen: () => void; onArchive: () => void; onDelete: () => void; archiveTitle: string; dim?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: "flex", alignItems: "center", gap: 4, borderRadius: 8, background: current ? mix(C.accent, 12) : "transparent", opacity: dim ? 0.6 : 1 }}>
      <button onClick={onOpen} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "7px 8px" }}>
        <div style={{ fontSize: 12.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
        <div style={{ fontSize: 10.5, color: C.textDim }}>{relTime(c.updatedAt)}</div>
      </button>
      <div style={{ display: "flex", gap: 2, paddingRight: 4, visibility: hover ? "visible" : "hidden" }}>
        <button onClick={onArchive} title={archiveTitle} style={{ ...iconBtn, width: 24, height: 24, fontSize: 13 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>
        </button>
        <button onClick={onDelete} title="Vymazať" style={{ ...iconBtn, width: 24, height: 24, fontSize: 13, color: C.red }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14" /></svg>
        </button>
      </div>
    </div>
  );
}

// Inline version for a Dashboard widget — same conversation as the floating panel.
export function AssistantInline({ chat, onClientClick }: { chat: AssistantChat; onClientClick?: (name: string) => void }) {
  // Collapsible: expanded = fixed 460 (conversation scrolls inside, doesn't grow);
  // collapsed = just the header (one line). Persisted.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("psb-ai-inline-collapsed") === "1"); } catch { /* ignore */ } }, []);
  const toggle = () => setCollapsed((v) => { const n = !v; try { localStorage.setItem("psb-ai-inline-collapsed", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  const triangle = <button onClick={toggle} title={collapsed ? "Zväčšiť chat" : "Zmenšiť chat"} style={iconBtn}>{collapsed ? "▸" : "▾"}</button>;
  return (
    <div style={{ marginBottom: 0, ...(collapsed ? {} : { height: 460 }), display: "flex", flexDirection: "column", overflow: "hidden", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <ChatHeader chat={chat} extra={triangle} />
      {!collapsed && <ChatConversation chat={chat} onClientClick={onClientClick} />}
    </div>
  );
}

// Floating bottom-right panel (resizable). Open state lives in the shared chat.
export function Assistant({ chat, onClientClick }: { chat: AssistantChat; onClientClick?: (name: string) => void }) {
  const open = chat.floatingOpen;
  const setOpen = chat.setFloatingOpen;
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 400, h: 620 });

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("psb-ai-size") || "null");
      if (s && typeof s.w === "number" && typeof s.h === "number") setSize({ w: s.w, h: s.h });
    } catch { /* ignore */ }
  }, []);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY, startW = size.w, startH = size.h;
    const maxW = window.innerWidth - 32, maxH = window.innerHeight - 40;
    const move = (ev: PointerEvent) => {
      setSize({ w: Math.max(320, Math.min(startW + (startX - ev.clientX), maxW)), h: Math.max(360, Math.min(startH + (startY - ev.clientY), maxH)) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSize((s) => { try { localStorage.setItem("psb-ai-size", JSON.stringify(s)); } catch { /* ignore */ } return s; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 30, border: "none", cursor: "pointer", background: C.accent, color: C.onAccent, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }} aria-label="Otvoriť Jarvisa">
        <Spark /> Jarvis
      </button>
    );
  }

  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, width: `min(${size.w}px, calc(100vw - 32px))`, height: `min(${size.h}px, calc(100dvh - 40px))`, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,.45)" }}>
      <div onPointerDown={startResize} title="Potiahni pre zmenu veľkosti" style={{ position: "absolute", top: 0, left: 0, width: 22, height: 22, cursor: "nwse-resize", zIndex: 2, padding: 4 }}>
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke={C.textDim} strokeWidth={1.5} strokeLinecap="round" aria-hidden="true"><path d="M11 1 1 11M6.5 1 1 6.5M11 5.5 5.5 11" /></svg>
      </div>
      <ChatHeader chat={chat} extra={<button onClick={() => setOpen(false)} title="Zavrieť" style={iconBtn}>✕</button>} />
      <ChatConversation chat={chat} autoFocus={open} onClientClick={onClientClick} />
    </div>
  );
}

function errorText(err: string): string {
  if (err === "no_key") return "⚠️ AI zatiaľ nie je aktivovaná — chýba API kľúč. Keď ho vložíš do nastavení appky, začnem odpovedať.";
  if (err === "api_error") return "⚠️ Model vrátil chybu (skontroluj kredit/kľúč na Anthropic konzole). Skús to prosím znova.";
  return "⚠️ Nepodarilo sa spojiť s AI. Skús to prosím o chvíľu znova.";
}

const iconBtn: CSSProperties = { width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" };
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
