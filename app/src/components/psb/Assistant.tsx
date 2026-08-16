import { type CSSProperties, Fragment, useEffect, useRef, useState } from "react";
import { fmtDMY } from "../../lib/psb/format";

import type { AiContext } from "../../lib/psb/aiContext";
import {
  deleteJarvisChat, fetchJarvisMemory, fetchMonthNotes, fetchPeriods, fetchVzasSettings, saveJarvisChat, saveMonthNote,
  saveVzasSetting, saveZaver, sendChat, vyhodnotZaver,
} from "../../lib/psb/client";
import { C, mix } from "../../lib/psb/theme";
import type { Actions } from "./App";
import { nastavPnlBunku, pnlOverridesNaUlozenie } from "../../lib/psb/vzas";

type ParsedAction = {
  type: "ack-anomaly" | "unack-anomaly" | "set-override" | "zapis-zaver" | "vyhodnot-zaver" | "novy-ciel" | "kronika" | "odloz-anomaliu" | "uprav-pnl" | "zarad-pohyby" | "mkt-znacka";
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
type Msg = {
  role: "user" | "assistant"; text: string; actions?: ParsedAction[]; images?: string[]; systemova?: boolean;
  /**
   * Čo sa má v rozhovore UKÁZAŤ namiesto `text`.
   *
   * Tlačidlá typu „Vysvetli mi to" posielajú Jarvisovi celý výrez obrazovky —
   * tabuľku, filter, kontext — a Jerry potom v rozhovore videl tridsať riadkov
   * čísel, ktoré si sám neposlal a nechcel čítať. Model ich vidieť MUSÍ (aj pri
   * doplňujúcej otázke), používateľ nie. Preto sa posiela `text` a zobrazuje
   * `zobrazit`.
   */
  zobrazit?: string;
};
type SavedChat = { id: string; title: string; messages: Msg[]; updatedAt: number; archived?: boolean; kategoria?: string; vetva?: boolean };

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

/**
 * Nedokončená odpoveď sa prizná, nie zamlčí.
 *
 * ask() vloží prázdnu asistentovu správu a autosave ju o sekundu a pol uloží.
 * Keď sa stream nedokončí (prerušené spojenie, zavretie appky uprostred),
 * prázdna správa zostane v histórii navždy — a s ňou sa stratí aj akcia,
 * ktorú mal Jarvis vykonať. Presne takto sa 9. 8. stratila odpoveď na
 * položku registra o Danovi Kouřilovi: Jerry odpovedal, odpoveď zmizla,
 * ack sa nezapísal a položka ticho zostala otvorená. Chyba, ktorá nič
 * nepovie, je horšia než tá, čo spadne — tak nech niečo povie.
 */
const opravStratene = (msgs: Msg[]): Msg[] =>
  msgs.map((m, i) =>
    m.role === "assistant" && !m.text?.trim() && !m.actions?.length && i === msgs.length - 1
      ? { ...m, text: "⚠ Táto odpoveď sa nedokončila — spojenie sa prerušilo skôr, než dorazila. Ak z nej mal vzniknúť zápis (ack, záver…), nevznikol. Pošli otázku alebo odpoveď znova." }
      : m,
  );

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
        } else if (o?.type === "kronika" && typeof o.fakt === "string" && /^\d{4}-\d{2}$/.test(String(o.mesiac))) {
          actions.push({ type: "kronika", label, data: o });
        } else if (o?.type === "odloz-anomaliu" && typeof o.key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(o.do))) {
          actions.push({ type: "odloz-anomaliu", key: o.key, label, data: o });
        // `suma: null` je ZRUŠENIE opravy, nie chyba. Bez toho vedel Jarvis
        // opravu iba zapísať: na „vráť to späť" poslal pôvodné číslo ako nový
        // prekryv, takže bunka zostala navždy označená ako opravená a držala
        // by tú hodnotu aj po novom importe z banky. Nález z ostrého testu
        // akcie 12. 8.
        } else if (o?.type === "uprav-pnl" && typeof o.kategoria === "string" && /^\d{4}-\d{2}$/.test(String(o.mesiac)) && (o.suma === null || Number.isFinite(Number(o.suma)))) {
          actions.push({ type: "uprav-pnl", label, data: o });
        } else if (o?.type === "zarad-pohyby" && Array.isArray(o.zmeny) && o.zmeny.length) {
          actions.push({ type: "zarad-pohyby", label, data: o });
        } else if (o?.type === "mkt-znacka" && typeof o.text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(o.datum))) {
          actions.push({ type: "mkt-znacka", label, data: o });
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
function fmt(text: string, onClientClick?: (name: string) => void, onNavigate?: (tab: string, sub?: string) => void) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|«[^»]+»|⟦[^⟧]+⟧)/g).map((p, j) => {
      // ⟦text|tab|podzáložka⟧ — odkaz na miesto v appke. „Kde to nájdem"
      // je najčastejšia otázka a popis cesty slovami ju nerieši: človek si
      // aj tak musí naklikať štyri obrazovky.
      if (p.startsWith("⟦") && p.endsWith("⟧")) {
        const [txt, tab, sub, kotva] = p.slice(1, -1).split("|");
        // Štvrtá časť je kotva na konkrétnu kartu. Doviesť človeka na
        // obrazovku a nechať ho hľadať tabuľku medzi desiatimi kartami je
        // polovičná práca — presne to Jerry vytkol pri tempe klienta.
        const chod = () => {
          onNavigate!(tab, sub || undefined);
          if (!kotva) return;
          let pokus = 0;
          const trafit = () => {
            const el = document.getElementById(kotva);
            if (el) { el.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
            if (pokus++ < 20) requestAnimationFrame(trafit);
          };
          requestAnimationFrame(trafit);
        };
        return onNavigate && tab
          ? <button key={j} onClick={chod} style={{ background: mix(C.accent, 14), border: `1px solid ${mix(C.accent, 45)}`, borderRadius: 6, padding: "1px 7px", margin: "0 1px", color: C.accentLight, fontWeight: 600, cursor: "pointer", fontSize: "inherit", fontFamily: "inherit" }}>{txt} →</button>
          : <strong key={j}>{txt}</strong>;
      }
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
  /**
   * Zameranie rozhovoru — marketing | peniaze | klienti | "" (všetko).
   *
   * Drží sa tu a nie vo veľkom okne, lebo je to vlastnosť KONVERZÁCIE, nie
   * obrazovky: keď sa vrátiš k starej debate o peniazoch, má sa otvoriť ako
   * debata o peniazoch. Preto sa ukládá spolu so správami.
   */
  const [kategoria, setKategoria] = useState("");
  /**
   * Prerušenie rozpísanej odpovede.
   *
   * Drží sa v ref a nie v state, lebo `ask` ho musí prepísať a prečítať v tom
   * istom priebehu — cez state by čítal starú hodnotu a zastavovalo by sa
   * predošlé volanie.
   */
  const abortRef = useRef<AbortController | null>(null);
  // Vetva sa pozná až pri prvom uložení nového rozhovoru — preto ref, nie state:
  // state by sa do efektu dostal až o render neskôr a prvý zápis by ju minul.
  const vetvaRef = useRef(false);
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
        if (recent) { setChatId(recent.id); setMsgs(opravStratene(recent.messages || [])); }
      }
    } catch { /* ignore */ }
    void fetchJarvisMemory().then(({ chats: db }) => {
      if (!zivy || !Array.isArray(db) || !db.length) return;
      const zoz = db as SavedChat[];
      setChats(zoz);
      try { localStorage.setItem(CHATS_KEY, JSON.stringify(zoz.slice(0, 50))); } catch { /* ignore */ }
      const recent = zoz.filter((c) => !c.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      // Chat z databázy sa preberá LEN pri prázdnom štarte. Keby sa chatId
      // prepol vždy, rozpísaná konverzácia z localStorage by sa pri najbližšom
      // autosave zapísala pod cudzie id a zliala dve histórie do jednej.
      setMsgs((m) => {
        if (m.length) return m;
        if (recent) setChatId(recent.id);
        return opravStratene(recent?.messages || []);
      });
    });
    return () => { zivy = false; };
  }, []);
  // Auto-save: localStorage okamžite, databáza s odstupom. Počas streamovania
  // sa msgs mení niekoľkokrát za sekundu — ukladať do D1 pri každej delte by
  // znamenalo POST s celou históriou (vrátane base64 obrázkov) desiatky ráz na
  // jednu odpoveď. Sekunda a pol po poslednej zmene bohato stačí; localStorage
  // medzitým drží aktuálny stav pre prípad zavretia okna.
  useEffect(() => {
    if (!msgs.length) return;
    let zaznam: SavedChat | null = null;
    setChats((prev) => {
      const existing = prev.find((c) => c.id === chatId);
      zaznam = { id: chatId, title: chatTitle(msgs), messages: msgs, updatedAt: Date.now(), archived: existing?.archived, kategoria, vetva: existing?.vetva ?? vetvaRef.current };
      vetvaRef.current = false;
      const next = [zaznam, ...prev.filter((c) => c.id !== chatId)];
      try { localStorage.setItem(CHATS_KEY, JSON.stringify(next.slice(0, 50))); } catch { /* ignore */ }
      return next;
    });
    const t = setTimeout(() => {
      if (zaznam) void saveJarvisChat({ id: zaznam.id, title: zaznam.title, messages: msgs, archived: !!zaznam.archived, kategoria: zaznam.kategoria || "" });
    }, 1500);
    return () => clearTimeout(t);
  }, [msgs, chatId]);

  const persistChats = (next: SavedChat[]) => {
    setChats(next);
    try { localStorage.setItem(CHATS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
    /**
   * Nový rozhovor si zameranie PONECHÁ.
   *
   * Kto práve dokončil debatu o peniazoch a klikne „nový", chce takmer vždy
   * ďalšiu debatu o peniazoch. Vynulovanie na „všetko" by ho nútilo
   * prepínať pri každej otázke.
   */
  const newChat = (nova?: string) => {
    setChatId(newId()); setMsgs([]); setInput(""); setAttach([]);
    if (typeof nova === "string") setKategoria(nova);
  };
  /**
   * Oprava už odoslanej otázky.
   *
   * Všetko za ňou sa zahodí a otázka odíde znova. Nie je to cenzúra histórie —
   * je to jediný spôsob, ako sa dá preklep opraviť bez toho, aby Jarvis videl
   * pôvodnú aj opravenú verziu a odpovedal na zmes. Jerry o to požiadal spolu
   * s cmd+Z: keď sa pri zápise sekne, nemá ako cúvnuť.
   */
  /** Zastaví rozpísanú odpoveď. Text, ktorý už prišiel, zostáva. */
  const zastav = () => abortRef.current?.abort();

  /**
   * Vetva rozhovoru od konkrétnej otázky.
   *
   * PREČO TO NIE JE TO ISTÉ ČO „UPRAVIŤ"
   *
   * „Upraviť" prepíše otázku a všetko za ňou ZAHODÍ — to je správne pri
   * preklepe, ale zlé, keď sa chce Jerry vrátiť o desať správ a spýtať sa
   * inak, pričom pôvodná niť má zostať. Doteraz mal na výber len mazať.
   *
   * Vetva založí NOVÝ rozhovor s históriou po tú otázku (bez nej) a text
   * otázky vloží do políčka, aby sa dal prepísať. Pôvodný rozhovor sa
   * nedotkne — leží v zozname vedľa.
   */
  const vetvi = (index: number) => {
    if (busy) return;
    const zaklad = msgs.slice(0, index);
    const text = msgs[index]?.zobrazit ?? msgs[index]?.text ?? "";
    vetvaRef.current = true;
    setChatId(newId());
    setMsgs(zaklad);
    setAttach([]);
    setInput(text);
  };

  const upravSpravu = (index: number, text: string) => {
    if (busy) return;
    const t = text.trim();
    if (!t) return;
    void ask(t, undefined, msgs.slice(0, index));
  };

  /**
   * Presun konverzácie do iného zamerania.
   *
   * Mení sa ULOŽENÝ záznam, nie len otvorený rozhovor — inak by sa presun
   * pri zavretí okna stratil. Keď je presúvaná konverzácia práve otvorená,
   * prepne sa aj jej živé zameranie, aby obrazovka a záznam nehovorili
   * rôzne veci.
   */
  const presunChat = (id: string, nova: string) => {
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    persistChats(chats.map((x) => (x.id === id ? { ...x, kategoria: nova, updatedAt: Date.now() } : x)));
    void saveJarvisChat({ id: c.id, title: c.title, messages: c.messages, archived: !!c.archived, kategoria: nova });
    if (id === chatId) setKategoria(nova);
  };

  const openChat = (id: string) => { const c = chats.find((x) => x.id === id); if (c) { setChatId(id); setMsgs(opravStratene(c.messages || [])); setKategoria(c.kategoria || ""); } };
  const deleteChat = (id: string) => { persistChats(chats.filter((c) => c.id !== id)); void deleteJarvisChat(id); if (id === chatId) newChat(); };
  const archiveChat = (id: string) => {
    const next = chats.map((c) => (c.id === id ? { ...c, archived: !c.archived } : c));
    persistChats(next);
    const c = next.find((x) => x.id === id);
    if (c) void saveJarvisChat({ id: c.id, title: c.title, messages: c.messages, archived: !!c.archived, kategoria: c.kategoria || "" });
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

  /**
   * `zaklad` = z akej histórie sa má vychádzať. Bez neho z aktuálnej.
   *
   * Potrebné na opravu odoslanej správy: prepísaná otázka musí odísť
   * s históriou PRED ňou, nie za pôvodnou verziou. Inak by Jarvis videl obe
   * a odpovedal na zmes.
   */
  async function ask(question: string, zobrazit?: string, zaklad?: Msg[]) {
    const q = question.trim();
    if ((!q && !attach.length) || busy) return;
    const imgs = attach.length ? attach : undefined;
    const history: Msg[] = [...(zaklad ?? msgs), { role: "user", text: q || "Pozri tento obrázok.", images: imgs, zobrazit }];
    // Add the user message + an empty assistant placeholder that fills as the answer streams.
    setMsgs([...history, { role: "assistant", text: "" }]);
    setInput("");
    setAttach([]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const setLast = (patch: Msg) => setMsgs((m) => { const n = m.slice(); n[n.length - 1] = patch; return n; });
    const res = await sendChat(
      history.map((m) => ({ role: m.role, content: m.text, images: m.images })),
      context,
      // Live update — strip any (possibly partial) action block from the visible text.
      (full) => setLast({ role: "assistant", text: full.replace(/```psb-action[\s\S]*$/, "").trimEnd() }),
      deep,
      setStav,
      kategoria,
      ctrl.signal,
    );
    abortRef.current = null;
    setBusy(false);
    setStav("");
    if (res.ok) {
      const { text, actions: acts } = parseActions(res.reply);
      setLast({ role: "assistant", text: text || "…", actions: acts.length ? acts : undefined });
    } else if (res.error === "zastavene") {
      // Rozpísaný text NEPREPISUJEME — je to prerušenie, nie zahodenie.
      // Prázdnu odpoveď by ale bublina nechala visieť naprázdno.
      setMsgs((m) => {
        const n = m.slice();
        const p = n[n.length - 1];
        n[n.length - 1] = { role: "assistant", text: p?.text ? `${p.text}\n\n— zastavené —` : "— zastavené —" };
        return n;
      });
    } else {
      setLast({ role: "assistant", text: errorText(res.error) });
    }
  }

  // Čo sa po kliknutí naozaj stalo — späť do rozhovoru.
  //
  // Jarvis navrhol zápis, Jerry klikol, a Jarvis o tom nemal tušenie. Na
  // otázku „a je to zapísané?" nevedel odpovedať a v ďalšom kole ponúkal to
  // isté znova. Správa ide do histórie, takže ju v ďalšom kole vidí — a Jerry
  // vidí potvrdenie, že klik niečo urobil.
  const oznamVysledok = (text: string) =>
    setMsgs((m) => [...m, { role: "user", text: `[appka] ${text}`, systemova: true }]);

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
      } else if (a.type === "zarad-pohyby" && a.data) {
        // Zaradenie bankových pohybov do kategórií. Toto je najväčšia ručná
        // práca v celej appke — 174 nezaradených riadkov po prvom importe — a
        // zároveň jediná, ktorú Jarvis vie spraviť naraz: kľúče si vytiahne
        // dopytom, kategórie vie a rozhodnutie vidí Jerry pred kliknutím.
        const zmeny = (a.data.zmeny as { kluc: string; kategoria: string }[]) || [];
        void fetch("/api/fio", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ akcia: "kategoria", zmeny }),
        })
          .then((r) => r.json())
          .then((j: { ok?: boolean; zmenene?: number; zamknute?: number }) => {
            oznamVysledok(j.ok
              ? `Zaradených ${j.zmenene ?? 0} pohybov${j.zamknute ? `, ${j.zamknute} preskočených (zamknutý mesiac)` : ""}.`
              : "Zaradenie pohybov zlyhalo.");
            void actions.refresh();
          })
          .catch(() => oznamVysledok("Zaradenie pohybov zlyhalo — spojenie."));
      } else if (a.type === "mkt-znacka" && a.data) {
        // Značka do marketingových grafov — „tu bežala kampaň". Rovnaký sklad
        // ako pri cieľoch: jeden JSON kľúč, žiadna vlastná tabuľka.
        const d = a.data;
        void fetchVzasSettings().then((st) => {
          const zoz = Array.isArray(st["mkt_znacky"]) ? (st["mkt_znacky"] as Record<string, unknown>[]) : [];
          zoz.push({ id: `z${Date.now().toString(36)}`, datum: String(d.datum), text: String(d.text).slice(0, 160) });
          void saveVzasSetting("mkt_znacky", zoz).then(() => oznamVysledok(`Značka zapísaná: ${String(d.text).slice(0, 60)}`));
        });
      } else if (a.type === "uprav-pnl" && a.data) {
        // Rovnaká cesta, akou opravu zapíše človek klikom na číslo v tabuľke —
        // prekrytie, nie prepis pôvodného radu, takže sa dá vrátiť a prežije
        // import z banky.
        //
        // Zámok mesiaca sa kontroluje TU (nález z testu Jarvisa 11. 8.):
        // import z banky aj zaradenie pohybov zamknutý mesiac odmietnu na
        // serveri, ale P&L override išiel do `vzas_settings` — kľúč-hodnota,
        // ktorá o mesiacoch nič nevie. Jarvis tak vedel prepísať zisk už
        // uzavretého mesiaca a uzávierka o tom nevedela.
        const d = a.data;
        const mes = String(d.mesiac);
        void fetchPeriods().then(({ periods }) => {
          if (periods.some((p) => p.month === mes && p.locked)) {
            oznamVysledok(`${mes} je uzavretý mesiac — oprava P&L sa nezapísala. Najprv ho odomkni v Mesiac → Uzávierka.`);
            return;
          }
          const zrusenie = d.suma === null;
          if (nastavPnlBunku(String(d.kategoria), mes, zrusenie ? null : Number(d.suma))) {
            void saveVzasSetting("pnl_overrides", pnlOverridesNaUlozenie())
              .then((ok) => oznamVysledok(
                !ok ? "Oprava P&L sa neuložila."
                  : zrusenie ? `P&L ${mes}: oprava ${String(d.kategoria)} zrušená, platí pôvodná hodnota.`
                  : `P&L ${mes} opravené: ${String(d.kategoria)} → ${Number(d.suma)} Kč.`));
          }
        });
      } else if (a.type === "odloz-anomaliu" && a.data) {
        // Odloženie sa ukladá ako akceptácia s poznámkou „odlozene|DÁTUM|…".
        // Register ju do toho dátumu skrýva a potom vráti späť medzi živé.
        actions.ackAnomaly(a.key || "", `odlozene|${String(a.data.do)}|${String(a.data.note || "")}`, true);
      } else if (a.type === "kronika" && a.data) {
        // Fakt o vývoji PSB sa PRIPÍSAVA k poznámke mesiaca, neprepisuje ju.
        // Poznámka mesiaca je jediné miesto, ktoré appka drží v čase — o rok
        // sa dá odpovedať „kedy sa Radek stal majiteľom priestoru" len vtedy,
        // keď to niekde má dátum. Rozhovor s Jarvisom taký dátum nemá.
        const d = a.data;
        const mes = String(d.mesiac || "");
        const fakt = String(d.fakt || "").trim();
        if (mes && fakt) {
          void fetchMonthNotes().then((n) => {
            const stara = n[mes]?.note || "";
            const dnes = new Date().toISOString().slice(0, 10);
            const riadok = `• ${fakt} (zapísal Jarvis ${dnes})`;
            if (stara.includes(fakt)) return; // to isté dvakrát nie
            void saveMonthNote(mes, [stara, riadok].filter(Boolean).join("\n"), n[mes]?.answers || {}, "jarvis");
          });
        }
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
      // Oznam sa posiela mimo tejto aktualizácie stavu — vnorené setMsgs by
      // sa počas prebiehajúcej aktualizácie stratilo.
      setTimeout(() => oznamVysledok(`Vykonané: ${a.label}`), 0);
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

  /**
   * Zápis z denníka klienta spracuje Jarvis NA POZADÍ — bez otvárania chatu.
   *
   * Jerry (9. 8.): „keď do denníka napíšem, že niekto niekam ide a chcem
   * pripomienku, nemusím to ešte špecificky písať Jarvisovi." Denník je
   * miesto, kde sa taká veta píše prirodzene; nútiť človeka povedať ju
   * druhýkrát inde je presne tá práca, ktorú má appka robiť za neho.
   *
   * Automaticky sa vykoná LEN zapis-zaver (pripomienka s termínom overenia
   * do registra) — nič, čo by menilo dáta klienta. Čokoľvek iné model
   * navrhne, sa ticho ignoruje; kto chce viac, otvorí chat.
   */
  async function spracujDennik(meno: string, zapis: string): Promise<string | null> {
    const dnes = new Date().toISOString().slice(0, 10);
    const res = await sendChat(
      [{
        role: "user",
        content:
          `Zápis z denníka klienta «${meno}» (${dnes}):\n„${zapis}“\n\n` +
          `Ak zo zápisu vyplýva úloha alebo pripomienka do budúcnosti (napr. „o dva týždne sa mu ozvať", ` +
          `„v septembri rieši predĺženie"), pridaj psb-action blok zapis-zaver: tema = meno klienta a vec, ` +
          `zaver = čo sa deje, overit = čo treba spraviť, overitDo = konkrétny dátum odvodený zo zápisu.\n\n` +
          `A ak zo zápisu vyplýva, že klient nejaký čas NEPRÍDE — operácia, dovolenka, ` +
          `„príde až v septembri", zranenie, sťahovanie — pridaj NAVYŠE blok set-override ` +
          `s field "status" a value "Pauza|YYYY-MM-DD", kde dátum je koniec tej neprítomnosti. ` +
          `Pri rozsahu („vráti sa o 1 až 2 týždne") ber ten NESKORŠÍ koniec: predčasne ukončená ` +
          `pauza sa sama pripomenie, priskoro zrátaný klient ticho nafúkne odhad tržieb. ` +
          `Bez tohto zostane informácia len v texte a odhad počíta s peniazmi od človeka, ` +
          `o ktorom vieme, že nepríde.\n\n` +
          `Ak zo zápisu nevyplýva ani jedno, nepridávaj nič. ` +
          `Mimo action blokov odpovedz najviac jednou krátkou vetou.`,
      }],
      context,
      undefined,
      false,
    );
    if (!res.ok) return null;
    const { actions: acts } = parseActions(res.reply);
    const zavery = acts.filter((a) => a.type === "zapis-zaver" && a.data);
    for (const a of zavery) await saveZaver(a.data as never).catch(() => {});

    // Pauza sa zapisuje BEZ potvrdenia, na rozdiel od bežných návrhov Jarvisa.
    //
    // Je to jediná akcia z denníka, ktorú si Jerry práve vypýtal vetou v texte
    // („príde až v septembri") — pýtať sa naňho druhýkrát cez tlačidlo by
    // znamenalo to isté povedať dvakrát. A cena omylu je malá: pauza sa dá
    // zrušiť jedným klikom v karte klienta a po termíne sa sama pripomenie.
    const pauzy = acts.filter((a) => {
      const d = (a.data || {}) as Record<string, unknown>;
      return a.type === "set-override" && d.field === "status" && String(d.value || "").startsWith("Pauza");
    });
    for (const a of pauzy) {
      const d = a.data as Record<string, unknown>;
      try { actions.setOverride(String(d.name || meno), "status", String(d.value)); } catch { /* nech to nezhodí zápis */ }
    }

    if (!zavery.length && !pauzy.length) return null;
    return [
      ...pauzy.map((a) => {
        const d = a.data as Record<string, unknown>;
        const do_ = String(d.value || "").split("|")[1];
        return `Zapnutá pauza${do_ ? ` do ${fmtDMY(do_)}` : ""} — do odhadu tržieb sa dovtedy nepočíta.`;
      }),
      ...zavery.map((a) => {
        const d = a.data as Record<string, unknown>;
        return `Jarvis si zapísal pripomienku: ${String(d.overit || d.zaver || "").slice(0, 120)}${d.overitDo ? ` (${fmtDMY(String(d.overitDo))})` : ""}`;
      }),
    ].join(" · ");
  }

  return { msgs, setMsgs, input, setInput, busy, stav, deep, setDeep, pending, setPending, attach, setAttach, ask, runAction, confirmImport, handleIncoming, floatingOpen, setFloatingOpen, kategoria, setKategoria, chats, chatId, newChat, upravSpravu, vetvi, presunChat, zastav, openChat, deleteChat, archiveChat, spracujDennik };
}

// ── The conversation UI (messages + input) — used by both the floating panel and
// the inline widget. Each instance has its own scroll/refs/drag state. ──────────
export function ChatConversation({ chat, autoFocus, onClientClick, onNavigate }: { chat: AssistantChat; autoFocus?: boolean; onClientClick?: (name: string) => void; onNavigate?: (tab: string, sub?: string) => void }) {
  const { msgs, input, setInput, busy, stav, deep, setDeep, pending, setPending, attach, setAttach, ask, runAction, confirmImport, handleIncoming, upravSpravu, vetvi, zastav } = chat;
  // Ktorá odoslaná otázka sa práve prepisuje. Zámerne len jedna — dve
  // rozpísané opravy naraz by sa navzájom prepísali pri odoslaní.
  const [upravujem, setUpravujem] = useState<number | null>(null);
  const [skopirovane, setSkopirovane] = useState<number | null>(null);
  const [navrh, setNavrh] = useState("");
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
          <div key={mi} style={{ alignSelf: m.systemova ? "center" : m.role === "user" ? "flex-end" : "flex-start", maxWidth: m.systemova ? "100%" : "88%" }}>
            {/* Oznam appky nie je ničia replika — nesmie vyzerať ako Jerryho
                správa, ale musí byť v histórii, aby ho Jarvis videl. */}
            <div style={m.systemova
              ? { background: "transparent", color: C.textDim, padding: "2px 0", fontSize: 11.5, textAlign: "center" as const, fontStyle: "italic" as const }
              : { background: m.role === "user" ? C.accent : mix(C.text, 7), color: m.role === "user" ? C.onAccent : C.text, padding: "9px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" as const }}>
              {m.images?.length ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: m.text ? 8 : 0 }}>
                  {m.images.map((src, k) => <img key={k} src={src} alt="" style={{ maxWidth: 150, maxHeight: 150, borderRadius: 8, display: "block" }} />)}
                </div>
              ) : null}
              {upravujem === mi ? (
                /*
                  Prepisovanie odoslanej otázky. Enter odošle, Esc zruší —
                  rovnaké ovládanie ako v hlavnom políčku, aby sa to nemuselo
                  učiť druhýkrát.
                */
                <div>
                  <textarea
                    value={navrh}
                    onChange={(e) => setNavrh(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setUpravujem(null); return; }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        setUpravujem(null);
                        upravSpravu(mi, navrh);
                      }
                    }}
                    autoFocus
                    rows={2}
                    style={{ width: "100%", minWidth: 220, resize: "vertical", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 8px", color: C.text, fontSize: 13, fontFamily: "inherit", lineHeight: 1.45, outline: "none" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 5, justifyContent: "flex-end" }}>
                    <button onClick={() => setUpravujem(null)} style={{ background: "none", border: "none", padding: 0, color: C.onAccent, opacity: 0.75, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>zrušiť</button>
                    <button onClick={() => { setUpravujem(null); upravSpravu(mi, navrh); }} style={{ background: "none", border: "none", padding: 0, color: C.onAccent, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>odoslať znova</button>
                  </div>
                </div>
              ) : (
                fmt(m.zobrazit ?? m.text, m.role === "assistant" ? onClientClick : undefined, m.role === "assistant" ? onNavigate : undefined)
              )}
            </div>
            {/*
              Opraviť sa dá len vlastná otázka a len keď Jarvis nepíše.
              Všetko za opravenou otázkou sa zahodí — preto to musí byť
              vedomý klik a nie omylom trafené miesto v bubline.
            */}
            {m.role === "user" && !m.systemova && upravujem !== mi && !busy && (
              <button
                onClick={() => { setUpravujem(mi); setNavrh(m.zobrazit ?? m.text); }}
                title="Prepísať túto otázku a poslať znova. Odpovede za ňou sa zahodia."
                style={{ display: "block", marginLeft: "auto", marginTop: 3, background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}
              >
                upraviť
              </button>
            )}
            {/*
              Vetva NEMAŽE. „Upraviť" všetko za otázkou zahodí, vetva otvorí
              druhú niť a pôvodnú nechá ležať vedľa — na to, keď sa chce Jerry
              vrátiť o desať správ a spýtať sa inak, ale prvú odpoveď si chce
              nechať.
            */}
            {m.role === "user" && !m.systemova && upravujem !== mi && !busy && (
              <button
                onClick={() => vetvi(mi)}
                title="Odbočiť odtiaľto do nového rozhovoru. Pôvodný zostane nedotknutý."
                style={{ display: "block", marginLeft: "auto", marginTop: 2, background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}
              >
                ⑂ vetva
              </button>
            )}
            {/*
              Dve veci, ktoré Jerry robí s odpoveďou najčastejšie: presunie ju
              inam a chce k nej viac. Predtým musel prvé označovať myšou
              a druhé písať vetou.

              „Rozviň" zámerne NIE JE prepínač dlhá/krátka. Prepínač je
              rozhodnutie pred tým, než je odpoveď vidieť — a človek ho zabudne
              vrátiť. Takto sa rozhoduje až podľa toho, čo prišlo.
            */}
            {m.role === "assistant" && !m.systemova && m.text && !busy && (
              <div style={{ display: "flex", gap: 12, marginTop: 4, alignItems: "center" }}>
                <button
                  onClick={() => { void navigator.clipboard.writeText(m.zobrazit ?? m.text); setSkopirovane(mi); setTimeout(() => setSkopirovane((x) => (x === mi ? null : x)), 1600); }}
                  title="Skopírovať odpoveď do schránky"
                  style={{ background: "none", border: "none", padding: 0, color: skopirovane === mi ? C.accentLight : C.textDim, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {skopirovane === mi ? "✓ skopírované" : "kopírovať"}
                </button>
                <button
                  onClick={() => ask("Rozveď poslednú odpoveď: doplň kontext, čísla, z ktorých vychádza, a čo z toho plynie. Nezačínaj odznova, nadviaž.")}
                  title="Nechať Jarvisa rozviesť túto odpoveď — kontext, čísla, čo z toho plynie"
                  style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}
                >
                  rozviň
                </button>
              </div>
            )}
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
          style={{ position: "absolute", right: 14, bottom: 74, zIndex: 3, height: 30, padding: "0 12px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 12, cursor: "pointer", boxShadow: "0 3px 10px rgba(0,0,0,.28)", display: "flex", alignItems: "center", gap: 6 }}
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
        {/*
          Počas písania odpovede je z tlačidla STOP.
          Zvláštne tlačidlo vedľa by bolo dve veci na jednom mieste a jedna
          z nich by bola vždy vypnutá; takto je tam vždy tá, ktorá má zmysel.
        */}
        {busy ? (
          <button
            onClick={zastav}
            title="Zastaviť odpoveď. To, čo už napísal, zostane."
            style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, cursor: "pointer", background: mix(C.text, 8), color: C.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}
            aria-label="Zastaviť"
          >
            <span style={{ width: 11, height: 11, borderRadius: 2, background: C.text, display: "block" }} />
          </button>
        ) : (
          <button onClick={() => ask(input)} disabled={!input.trim() && !attach.length} style={{ width: 38, height: 38, borderRadius: 10, border: "none", cursor: !input.trim() && !attach.length ? "default" : "pointer", background: input.trim() || attach.length ? C.accent : C.border, color: C.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} aria-label="Odoslať">
            <Send />
          </button>
        )}
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
          <div style={{ position: "absolute", top: "100%", right: 8, marginTop: 4, width: 280, maxHeight: 360, overflowY: "auto", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.4)", zIndex: 4, padding: 6 }}>
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
export function AssistantInline({ chat, onClientClick, onNavigate }: { chat: AssistantChat; onClientClick?: (name: string) => void; onNavigate?: (tab: string, sub?: string) => void }) {
  // Collapsible: expanded = fixed 460 (conversation scrolls inside, doesn't grow);
  // collapsed = just the header (one line). Persisted.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("psb-ai-inline-collapsed") === "1"); } catch { /* ignore */ } }, []);
  const toggle = () => setCollapsed((v) => { const n = !v; try { localStorage.setItem("psb-ai-inline-collapsed", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  const triangle = <button onClick={toggle} title={collapsed ? "Zväčšiť chat" : "Zmenšiť chat"} style={iconBtn}>{collapsed ? "▸" : "▾"}</button>;
  return (
    <div className="psb-card" style={{ marginBottom: 0, ...(collapsed ? {} : { height: 460 }), display: "flex", flexDirection: "column", overflow: "hidden", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <ChatHeader chat={chat} extra={triangle} />
      {!collapsed && <ChatConversation chat={chat} onClientClick={onClientClick} onNavigate={onNavigate} />}
    </div>
  );
}

// Floating bottom-right panel (resizable). Open state lives in the shared chat.
export function Assistant({ chat, onClientClick, onNavigate }: { chat: AssistantChat; onClientClick?: (name: string) => void; onNavigate?: (tab: string, sub?: string) => void }) {
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
    // Odsadenie zdola kvôli odznaku platformy: sedí napevno vpravo dole a má
    // najvyšší možný z-index, takže sa prekryť nedá — Jarvis sa mu teda uhne.
    // Nie je to naša značka a potláčať ju nebudeme.
    return (
      <button onClick={() => setOpen(true)} style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 30, border: "none", cursor: "pointer", background: C.accent, color: C.onAccent, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }} aria-label="Otvoriť Jarvisa">
        <Spark /> Jarvis
      </button>
    );
  }

  return (
    <div className="psb-card" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, width: `min(${size.w}px, calc(100vw - 32px))`, height: `min(${size.h}px, calc(100dvh - 40px))`, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,.45)" }}>
      <div onPointerDown={startResize} title="Potiahni pre zmenu veľkosti" style={{ position: "absolute", top: 0, left: 0, width: 22, height: 22, cursor: "nwse-resize", zIndex: 2, padding: 4 }}>
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke={C.textDim} strokeWidth={1.5} strokeLinecap="round" aria-hidden="true"><path d="M11 1 1 11M6.5 1 1 6.5M11 5.5 5.5 11" /></svg>
      </div>
      <ChatHeader chat={chat} extra={<button onClick={() => setOpen(false)} title="Zavrieť" style={iconBtn}>✕</button>} />
      <ChatConversation chat={chat} autoFocus={open} onClientClick={onClientClick} onNavigate={onNavigate} />
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
