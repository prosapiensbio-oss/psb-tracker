// Client-side API helpers (browser only — called from effects/handlers).
import type { ClientOverride, PSBData } from "./types";
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

export async function checkSession(): Promise<boolean> {
  try {
    const r = await fetch("/api/session");
    const j = (await r.json()) as { authed?: boolean };
    return !!j.authed;
  } catch {
    return false;
  }
}

export async function login(password: string): Promise<boolean> {
  const r = await post("/api/login", { password });
  return r.ok;
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

export async function saveMonthNote(month: string, note: string, answers: Record<string, string>): Promise<boolean> {
  const r = await post("/api/vzas-notes", { month, note, answers });
  return r.ok;
}

export type ChatResult =
  | { ok: true; reply: string }
  | { ok: false; error: string; status?: number; detail?: string };

export async function sendChat(
  messages: { role: "user" | "assistant"; content: string; images?: string[] }[],
  context: unknown,
  onDelta?: (fullText: string) => void,
): Promise<ChatResult> {
  try {
    const r = await post("/api/chat", { messages, context });
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
            const j = JSON.parse(payload) as { t?: string };
            if (typeof j.t === "string") {
              full += j.t;
              onDelta?.(full);
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
