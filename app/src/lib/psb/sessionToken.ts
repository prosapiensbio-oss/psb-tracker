/**
 * Token prihlásenia — čistá logika bez väzieb na Cloudflare, aby sa dala testovať.
 *
 * Doteraz bol token len HMAC mena: nedal sa odvolať a odhlásenie ani
 * deaktivácia konta ho nezneplatnili. Pribudla VERZIA na konte (`users.session_ver`).
 *
 *   verzia 0: cookie `meno|<hex>`      — presne pôvodný tvar, preto po nasadení
 *                                        ostáva každá cookie platná
 *   verzia N: cookie `meno|vN.<hex>`   — podpisuje aj verziu; zvýšenie verzie
 *                                        na konte odhlási všetky zariadenia
 *
 * Verzia je v cookie, aby sa podpis dal overiť aj bez databázy. PODPIS PLATÍ
 * VŽDY. Databáza len dopĺňa, či konto ešte žije; keď neodpovedá, nikoho
 * nevyhadzuje — no bez platného podpisu sa nedostane nikto.
 */
const enc = new TextEncoder();
const MESSAGE = "psb-authed-v1";
// Iná predpona než verzia 0: meno „X|v1" by inak dalo ten istý podpis ako konto „X" vo verzii 1.
const MESSAGE_V = "psb-authed-v2";

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Token do cookie. Verzia 0 je zámerne pôvodný výpočet. */
export async function tokenSession(secret: string, user: string, verzia = 0): Promise<string> {
  if (verzia > 0) return `v${verzia}.${await hmacHex(secret, `${MESSAGE_V}|${verzia}|${user}`)}`;
  return hmacHex(secret, user ? `${MESSAGE}|${user}` : MESSAGE);
}

export function hodnotaCookie(user: string, token: string): string {
  return user ? `${user}|${token}` : token;
}

/** Overí podpis cookie. Null = neplatný. Prázdne meno = starý tvar bez mena (identita „app"). */
export async function overPodpisCookie(secret: string, raw: string): Promise<{ meno: string; verzia: number } | null> {
  const i = raw.lastIndexOf("|");
  const meno = i < 0 ? "" : raw.slice(0, i);
  const token = i < 0 ? raw : raw.slice(i + 1);
  const m = /^v([1-9]\d{0,8})\./.exec(token);
  const verzia = m ? Number(m[1]) : 0;
  if (m && !meno) return null;
  return timingSafeEqual(token, await tokenSession(secret, meno, verzia)) ? { meno, verzia } : null;
}

export type RiadokKonta = { active?: number | null; session_ver?: number | null };

/**
 * Platí session s platným podpisom podľa stavu konta?
 *   undefined = databáza neodpovedala → podpis stačí
 *   null      = meno nemá konto („btc", staré cookies zo zdieľaného hesla) → len verzia 0
 */
export function sessionPlati(verzia: number, konto: RiadokKonta | null | undefined): boolean {
  if (konto === undefined) return true;
  if (konto === null) return verzia === 0;
  if (konto.active === 0) return false;
  // Kým migrácia 0129 nebeží, stĺpec chýba a všetci sú na verzii 0.
  return verzia === Number(konto.session_ver ?? 0);
}

/** Identita po zadaní zdieľaného hesla. Null = meno patrí kontu, zdieľané heslo ho neotvorí. */
export function identitaZdielaneho(konto: "existuje" | "nie" | "neznamo"): string | null {
  return konto === "existuje" ? null : "app";
}
