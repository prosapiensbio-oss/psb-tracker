// Prihlásenie s identitou.
//
// Pôvodne bolo jedno spoločné heslo a nikto nevedel, KTO čo zmenil — audit
// písal „app". Teraz má každý svoje konto v tabuľke `users` a session nesie
// jeho meno, takže audit vie odpovedať aj na tú otázku.
//
// Zdieľané heslo (PSB_PASSWORD) zámerne zostáva funkčné. Je to záchranná
// brzda: keby sa tabuľka používateľov pokazila alebo si niekto zabudol heslo,
// nikoho to nevyzamkne z vlastnej appky. Prihlásenie ním má identitu podľa
// zadaného mena, inak „app".
//
// Staré cookies bez mena zostávajú platné (identita „app") — nasadenie nikoho
// neodhlási.
import type { D1Database } from "@cloudflare/workers-types";

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

export async function expectedToken(user = ""): Promise<string> {
  const s = secrets().PSB_SESSION_SECRET || "dev-secret";
  return hmacHex(s, user ? `${MESSAGE}|${user}` : MESSAGE);
}

// ── Heslá: PBKDF2 so soľou, nikdy v čitateľnej podobe ────────────────────────
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return hex(bits);
}

export const novaSol = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer);

export type Pouzivatel = { login: string; name: string };

/** Overí meno + heslo proti tabuľke users. Null = nesedí alebo tabuľka chýba. */
export async function overPouzivatela(DB: D1Database | undefined, login: string, password: string): Promise<Pouzivatel | null> {
  if (!DB || !login || !password) return null;
  try {
    const r = await DB.prepare("SELECT login, name, pass_hash, pass_salt FROM users WHERE login = ?1 AND active = 1")
      .bind(login.trim().toLowerCase())
      .first<{ login: string; name: string; pass_hash: string; pass_salt: string }>();
    if (!r) return null;
    const h = await hashPassword(password, r.pass_salt);
    if (!timingSafeEqual(h, r.pass_hash)) return null;
    return { login: r.login, name: r.name };
  } catch {
    return null;   // tabuľka ešte neexistuje — zdieľané heslo stále funguje
  }
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

/** Meno prihláseného, alebo null. Cookie má tvar "meno|token"; starý tvar bez
 *  zvislej čiary je stále platný a hlási sa ako „app". */
export async function currentUser(request: Request): Promise<string | null> {
  const raw = readCookie(request, COOKIE);
  if (!raw) return null;
  const i = raw.lastIndexOf("|");
  if (i < 0) return timingSafeEqual(raw, await expectedToken()) ? "app" : null;
  const meno = raw.slice(0, i);
  const token = raw.slice(i + 1);
  return timingSafeEqual(token, await expectedToken(meno)) ? meno : null;
}

export async function isAuthed(request: Request): Promise<boolean> {
  return (await currentUser(request)) !== null;
}

export async function sessionCookie(user = ""): Promise<string> {
  const token = await expectedToken(user);
  const hodnota = user ? `${user}|${token}` : token;
  return `${COOKIE}=${encodeURIComponent(hodnota)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
