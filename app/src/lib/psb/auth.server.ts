// Server-only shared-password gate. One password for both trainers (per spec),
// verified server-side; a signed HMAC token is stored in an HttpOnly cookie.
import { bindings } from "../bindings.server";

const COOKIE = "psb_session";
const MESSAGE = "psb-authed-v1";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

type Secrets = { PSB_PASSWORD?: string; PSB_SESSION_SECRET?: string };

function secrets(): Secrets {
  return bindings() as unknown as Secrets;
}

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function expectedToken(): Promise<string> {
  const s = secrets().PSB_SESSION_SECRET || "dev-secret";
  return hmacHex(s, MESSAGE);
}

export async function verifyPassword(input: string): Promise<boolean> {
  const expected = secrets().PSB_PASSWORD || "";
  if (!expected) return false;
  return timingSafeEqual(input, expected);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function isAuthed(request: Request): Promise<boolean> {
  const token = readCookie(request, COOKIE);
  if (!token) return false;
  return timingSafeEqual(token, await expectedToken());
}

export async function sessionCookie(): Promise<string> {
  const token = await expectedToken();
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
