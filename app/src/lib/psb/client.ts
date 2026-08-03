// Client-side API helpers (browser only — called from effects/handlers).
import type { ClientOverride, Lead, PSBData } from "./types";
import { EMPTY_DATA } from "./types";
import type { IngestResult } from "./db.server";

async function post(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r;
}

export type Session = { authed: boolean; user: string | null; pouzivatelia: { login: string; name: string }[] };

export async function checkSession(): Promise<Session> {
  try {
    const r = await fetch("/api/session");
    const j = (await r.json()) as Partial<Session>;
    return { authed: !!j.authed, user: j.user ?? null, pouzivatelia: j.pouzivatelia ?? [] };
  } catch {
    return { authed: false, user: null, pouzivatelia: [] };
  }
}

export async function login(password: string, meno = ""): Promise<boolean> {
  const r = await post("/api/login", { password, login: meno });
  return r.ok;
}

export type Konto = { login: string; name: string; active: boolean; lastLogin?: string };

export async function fetchKonta(): Promise<{ ja: string | null; users: Konto[] }> {
  try {
    const r = await fetch("/api/users", { credentials: "same-origin" });
    const j = (await r.json()) as { ja?: string; users?: Konto[] };
    return { ja: j.ja ?? null, users: j.users ?? [] };
  } catch {
    return { ja: null, users: [] };
  }
}

export async function ulozKonto(k: { login: string; name?: string; password?: string; active?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const r = await post("/api/users", k);
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return { ok: !!j.ok, error: j.error };
}

export async function logout(): Promise<void> {
  await post("/api/logout", {});
}

export async function fetchData(): Promise<PSBData> {
  const r = await fetch("/api/data");
  if (!r.ok) return EMPTY_DATA;
  return (await r.json()) as PSBData;
}

export async function ingestFiles(
  files: { filename: string; text: string }[],
): Promise<IngestResult[]> {
  const r = await post("/api/ingest", { files });
  const j = (await r.json()) as { results?: IngestResult[] };
  return j.results ?? [];
}

export async function saveOverride(
  name: string,
  key: keyof ClientOverride,
  value: unknown,
): Promise<void> {
  await post("/api/override", { name, key, value });
}

export async function saveAnomaly(key: string, note: string, ack = true): Promise<void> {
  await post("/api/anomaly", { key, note, ack });
}

export async function resetAll(): Promise<void> {
  await post("/api/reset", {});
}

export type MonthNote = { month: string; note: string; answers: Record<string, string>; updatedAt?: string };

export async function fetchMonthNotes(): Promise<Record<string, MonthNote>> {
  try {
    const r = await fetch("/api/vzas-notes");
    if (!r.ok) return {};
    const j = (await r.json()) as { notes?: Record<string, MonthNote> };
    return j.notes ?? {};
  } catch {
    return {};
  }
}

export async function saveMonthNote(
  month: string,
  note: string,
  answers: Record<string, string>,
  actor?: string,
): Promise<boolean> {
  const r = await post("/api/vzas-notes", { month, note, answers, actor });
  return r.ok;
}

export type KpiOverrides = Record<string, Record<string, { lo?: number; hi?: number }>>;

export async function fetchVzasSettings(): Promise<Record<string, unknown>> {
  try {
    const r = await fetch("/api/vzas-settings");
    if (!r.ok) return {};
    const j = (await r.json()) as { settings?: Record<string, unknown> };
    return j.settings ?? {};
  } catch {
    return {};
  }
}

export async function saveVzasSetting(key: string, value: unknown): Promise<boolean> {
  const r = await post("/api/vzas-settings", { key, value });
  return r.ok;
}

export type BtcPlatba = { klient: string | null; datum: string; sats: number; czk: number | null };

export type BtcReserve = {
  sats: number;
  czk: number | null;
  rateCzkPerBtc: number | null;
  rateUpdatedAt: string | null;
  goalSats: number | null;
  generatedAt: string;
  platby?: BtcPlatba[];
};

// Two hops on purpose: our server signs a short-lived URL (it holds the shared
// token), the browser then calls the Bitcoin app directly. Worker-to-worker
// calls inside the platform time out, so this is the path that works.
export async function fetchBtcReserve(sPlatbami = false): Promise<BtcReserve | null> {
  try {
    const r = await fetch(`/api/btc-reserve${sPlatbami ? "?platby=1" : ""}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean; url?: string };
    if (!j.ok || !j.url) return null;
    const s = await fetch(j.url);
    if (!s.ok) return null;
    const data = (await s.json()) as BtcReserve & { ok?: boolean };
    return data.ok === false ? null : data;
  } catch {
    return null;
  }
}

export async function saveLead(lead: Partial<Lead> & { id?: string; remove?: boolean }): Promise<string | null> {
  const r = await post("/api/leads", lead);
  if (!r.ok) return null;
  const j = (await r.json()) as { id?: string };
  return j.id ?? null;
}

export type WeekEntry = Record<string, string>;

export async function fetchWeekEntries(): Promise<Record<string, WeekEntry>> {
  try {
    const r = await fetch("/api/vzas-weeks");
    if (!r.ok) return {};
    const j = (await r.json()) as { weeks?: Record<string, WeekEntry> };
    return j.weeks ?? {};
  } catch {
    return {};
  }
}

export async function saveWeekEntry(week: string, data: WeekEntry): Promise<boolean> {
  const r = await post("/api/vzas-weeks", { week, data });
  return r.ok;
}

export type ChatResult =
  | { ok: true; reply: string }
  | { ok: false; error: string; status?: number; detail?: string };

export async function sendChat(
  messages: { role: "user" | "assistant"; content: string; images?: string[] }[],
  context: unknown,
  onDelta?: (fullText: string) => void,
  deep?: boolean,
  // Čo práve robí — "Pozerám do dát…", dôvod dopytu, "Otváram knihu…".
  // Prázdny reťazec = hotovo, skry.
  onStatus?: (stav: string) => void,
): Promise<ChatResult> {
  try {
    const r = await post("/api/chat", { messages, context, deep: !!deep });
    // Errors (no_key, api_error…) come back as JSON; a successful answer streams as
    // Server-Sent Events (text/event-stream) — `data: {"t":"…"}` frames, then `[DONE]`.
    if ((r.headers.get("content-type") || "").includes("application/json")) {
      return (await r.json()) as ChatResult;
    }
    if (!r.body) return { ok: false, error: "network" };
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of frame.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue; // skip ": open" comments
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload) as { t?: string; s?: string; e?: string; r?: number };
            if (typeof j.t === "string") {
              full += j.t;
              onStatus?.("");
              onDelta?.(full);
            } else if (j.r) {
              // Predbežná úvaha pred nástrojom — finálne kolo ju napíše znova.
              full = "";
              onDelta?.("");
            } else if (typeof j.s === "string") {
              onStatus?.(j.s);
            } else if (typeof j.e === "string" && !full) {
              return { ok: false, error: "api_error", detail: j.e };
            }
          } catch {
            /* ignore partial/malformed frame */
          }
        }
      }
    }
    return { ok: true, reply: full };
  } catch (e) {
    return { ok: false, error: "network", detail: String(e) };
  }
}


// ── Jarvisova pamäť (D1) ─────────────────────────────────────────────────────
// Chaty žili v localStorage jedného prehliadača; na telefóne boli prázdne.
// Teraz sú v databáze — localStorage zostáva len ako okamžitá vyrovnávacia
// pamäť, aby sa panel otvoril bez čakania na sieť.
export type ZaverRec = {
  id: string; datum: string; tema: string; zaver: string;
  preco?: string; overit?: string; overitDo?: string; vysledok?: string; stav: string;
};

export async function fetchJarvisMemory(): Promise<{ chats: unknown[]; zavery: ZaverRec[] }> {
  try {
    const r = await fetch("/api/jarvis-memory", { credentials: "same-origin" });
    const j = (await r.json()) as { chats?: unknown[]; zavery?: ZaverRec[] };
    return { chats: j.chats || [], zavery: j.zavery || [] };
  } catch {
    return { chats: [], zavery: [] };
  }
}

export async function saveJarvisChat(chat: { id: string; title: string; messages: unknown[]; archived?: boolean }) {
  try {
    await post("/api/jarvis-memory", { akcia: "chat", ...chat });
  } catch { /* offline — localStorage kópia ostáva */ }
}

export async function deleteJarvisChat(id: string) {
  try { await post("/api/jarvis-memory", { akcia: "zmaz-chat", id }); } catch { /* ignore */ }
}

export async function saveZaver(z: Record<string, unknown>) {
  try { await post("/api/jarvis-memory", { akcia: "zaver", ...z }); } catch { /* ignore */ }
}

export async function vyhodnotZaver(id: string, stav: string, vysledok: string) {
  try { await post("/api/jarvis-memory", { akcia: "vyhodnot", id, stav, vysledok }); } catch { /* ignore */ }
}


// ── Uzávierky a audit ────────────────────────────────────────────────────────
export type Obdobie = { month: string; locked: boolean; lockedAt?: string; note?: string };
export type AuditRiadok = { at: string; actor: string; action: string; predmet?: string; month?: string; old?: string; neu?: string; reason?: string };

export async function fetchPeriods(): Promise<{ periods: Obdobie[]; audit: AuditRiadok[] }> {
  try {
    const r = await fetch("/api/periods", { credentials: "same-origin" });
    const j = (await r.json()) as { periods?: Obdobie[]; audit?: AuditRiadok[] };
    return { periods: j.periods || [], audit: j.audit || [] };
  } catch {
    return { periods: [], audit: [] };
  }
}

export async function setPeriodLock(month: string, locked: boolean, note = ""): Promise<boolean> {
  const r = await post("/api/periods", { month, locked, note });
  return r.ok;
}


// ── Nákupný zoznam náradia ───────────────────────────────────────────────────
export type WishPolozka = { id: string; nazov: string; cena: number; link: string; kupene: boolean; kupeneAt?: string; poznamka?: string; kategoria: string };

export async function fetchWishlist(): Promise<WishPolozka[]> {
  try {
    const r = await fetch("/api/wishlist", { credentials: "same-origin" });
    const j = (await r.json()) as { polozky?: WishPolozka[] };
    return j.polozky || [];
  } catch {
    return [];
  }
}

export async function ulozWish(p: Partial<WishPolozka> & { zmazat?: boolean }): Promise<boolean> {
  const r = await post("/api/wishlist", p);
  return r.ok;
}
