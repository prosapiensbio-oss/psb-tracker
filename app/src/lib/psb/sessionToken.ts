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
 *
 * Výnimka z „podpis platí vždy" sú identity zo zrušeného spoločného hesla: tie
 * neprejdú ani s platným podpisom (`sessionPlati`).
 */
const enc = new TextEncoder();
const MESSAGE = "psb-authed-v1";
// Iná predpona než verzia 0: meno „X|v1" by inak dalo ten istý podpis ako konto „X" vo verzii 1.
const MESSAGE_V = "psb-authed-v2";
/** Identita zrušeného spoločného hesla. V audite sa „app" ďalej píše pri serverových zápisoch, prihlásenie to nie je. */
const IDENTITA_SPOLOCNEHO = "app";
/** Prechod z bitcoinovej knihy (`/api/sso`). Jediné meno, ktoré nemá a nemusí mať konto. */
export const IDENTITA_BTC = "btc";

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
  return hmacHex(secret, `${MESSAGE}|${user}`);
}

export function hodnotaCookie(user: string, token: string): string {
  return `${user}|${token}`;
}

/** Overí podpis cookie. Null = neplatný. Najstarší tvar bez mena už neplatí, podpísať sa ním nedá nič. */
export async function overPodpisCookie(secret: string, raw: string): Promise<{ meno: string; verzia: number } | null> {
  const i = raw.lastIndexOf("|");
  if (i <= 0) return null;
  const meno = raw.slice(0, i);
  const token = raw.slice(i + 1);
  const m = /^v([1-9]\d{0,8})\./.exec(token);
  const verzia = m ? Number(m[1]) : 0;
  return timingSafeEqual(token, await tokenSession(secret, meno, verzia)) ? { meno, verzia } : null;
}

export type RiadokKonta = { active?: number | null; session_ver?: number | null };

/**
 * Platí session s platným podpisom podľa stavu konta?
 *   „app"     = zrušené spoločné heslo → nikdy, ani pri výpadku databázy
 *   undefined = databáza neodpovedala → podpis stačí
 *   null      = meno nemá konto → len prechod z bitcoinovej knihy. Spoločné heslo
 *               do 1. 11. 2026 podpísalo akékoľvek meno, ktoré človek napísal, a
 *               token nemá koniec platnosti; bez tohto by také cookie platili ďalej.
 */
export function sessionPlati(meno: string, verzia: number, konto: RiadokKonta | null | undefined): boolean {
  if (meno === IDENTITA_SPOLOCNEHO) return false;
  if (konto === undefined) return true;
  if (konto === null) return meno === IDENTITA_BTC && verzia === 0;
  if (konto.active === 0) return false;
  // Kým migrácia 0129 nebeží, stĺpec chýba a všetci sú na verzii 0.
  return verzia === Number(konto.session_ver ?? 0);
}
