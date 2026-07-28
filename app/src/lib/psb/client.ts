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

export type ChatResult =
  | { ok: true; reply: string }
  | { ok: false; error: string; status?: number; detail?: string };

export async function sendChat(
  messages: { role: "user" | "assistant"; content: string }[],
  context: unknown,
): Promise<ChatResult> {
  try {
    const r = await post("/api/chat", { messages, context });
    return (await r.json()) as ChatResult;
  } catch (e) {
    return { ok: false, error: "network", detail: String(e) };
  }
}
