// Prihlásenie s identitou.
//
// Pôvodne bolo jedno spoločné heslo a nikto nevedel, KTO čo zmenil — audit
// písal „app". Teraz má každý svoje konto v tabuľke `users` a session nesie
// jeho meno, takže audit vie odpovedať aj na tú otázku.
//
// Zdieľané heslo (PSB_PASSWORD) zámerne zostáva funkčné. Je to záchranná
// brzda: keby sa tabuľka používateľov pokazila alebo si niekto zabudol heslo,
// nikoho to nevyzamkne z vlastnej appky. Prihlásenie ním má vždy identitu „app"
// a neotvorí meno, ktoré má vlastné konto — inak by audit klamal.
//
// Staré cookies bez mena zostávajú platné (identita „app") — nasadenie nikoho
// neodhlási. Tvar tokenu a verzie: viď sessionToken.ts.
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../bindings.server";
import { hmacHex, hodnotaCookie, overPodpisCookie, sessionPlati, timingSafeEqual, tokenSession, type RiadokKonta } from "./sessionToken";

const COOKIE = "psb_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

type Secrets = { PSB_PASSWORD?: string; PSB_SESSION_SECRET?: string };

function secrets(): Secrets {
  return bindings() as unknown as Secrets;
}

const enc = new TextEncoder();

/**
 * Tajomstvo podpisov. Bez neho sa neoverí nikto: záložné „dev-secret" platí len
 * pri lokálnom vývoji, inak by chýbajúce nastavenie otvorilo appku každému, kto
 * si cookie podpíše verejne známym reťazcom z repa.
 */
function tajomstvo(): string | null {
  const s = secrets().PSB_SESSION_SECRET;
  if (s) return s;
  return import.meta.env?.DEV === true ? "dev-secret" : null;
}

export function maTajomstvo(): boolean {
  return tajomstvo() !== null;
}

/**
 * Podpis verejného odkazu, ktorý nemá vlastný riadok v databáze (faktúra
 * `/v/fa…`, 29. 10. 2026). Bez tajomstva sa nedá uhádnuť ani vyrobiť.
 */
export async function podpisOdkazu(sprava: string): Promise<string> {
  const s = tajomstvo();
  if (!s) throw new Error("Chýba PSB_SESSION_SECRET — odkaz sa nedá podpísať.");
  return hmacHex(s, `odkaz|${sprava}`);
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

export type Pouzivatel = { login: string; name: string; sessionVer: number };

/** Overí meno + heslo proti tabuľke users. Null = nesedí alebo tabuľka chýba. */
export async function overPouzivatela(DB: D1Database | undefined, login: string, password: string): Promise<Pouzivatel | null> {
  if (!DB || !login || !password) return null;
  try {
    // SELECT *: `session_ver` nemusí ešte existovať (migrácia 0129).
    const r = await DB.prepare("SELECT * FROM users WHERE login = ?1 AND active = 1")
      .bind(login.trim().toLowerCase())
      .first<{ login: string; name: string; pass_hash: string; pass_salt: string; session_ver?: number | null }>();
    if (!r) return null;
    const h = await hashPassword(password, r.pass_salt);
    if (!timingSafeEqual(h, r.pass_hash)) return null;
    return { login: r.login, name: r.name, sessionVer: Number(r.session_ver ?? 0) };
  } catch {
    return null;   // tabuľka ešte neexistuje — zdieľané heslo stále funguje
  }
}

/** Patrí meno kontu (aj neaktívnemu)? „neznamo" = databáza neodpovedala. */
export async function stavKonta(DB: D1Database | undefined, login: string): Promise<"existuje" | "nie" | "neznamo"> {
  if (!login) return "nie";
  if (!DB) return "neznamo";
  try {
    return (await DB.prepare("SELECT 1 FROM users WHERE login = ?1").bind(login).first()) ? "existuje" : "nie";
  } catch {
    return "neznamo";
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

/**
 * Stav konta na overenie session. Jeden dopyt na meno a krátka pamäť v izoláte:
 * `isAuthed` je na každom API a appka ich pri štarte zavolá desiatky. Pamäť drží
 * len úspešnú odpoveď, takže chyba databázy sa zopakuje a neostane v nej.
 * Odhlásenie všade ju v tomto izoláte maže hneď, v ostatných dobehne do 20 s.
 */
const PAMAT_KONT_MS = 20_000;
const pamatKont = new Map<string, { konto: RiadokKonta | null; do_: number }>();

export function zabudniKonta(): void {
  pamatKont.clear();
}

async function kontoPodlaMena(meno: string): Promise<RiadokKonta | null | undefined> {
  const zPamati = pamatKont.get(meno);
  if (zPamati && zPamati.do_ > Date.now()) return zPamati.konto;
  const { DB } = bindings();
  if (!DB) return undefined;
  try {
    // SELECT *: `session_ver` nemusí ešte existovať (migrácia 0129) a chýbajúci
    // stĺpec nesmie zhodiť overenie. Cookie nesie zobrazované meno; zdieľané heslo
    // ho kedysi skladalo z loginu, preto aj `login`.
    const r = await DB.prepare("SELECT * FROM users WHERE name = ?1 OR login = ?2 ORDER BY name = ?1 DESC LIMIT 1")
      .bind(meno, meno.toLowerCase())
      .first<RiadokKonta>();
    const konto = r ?? null;
    pamatKont.set(meno, { konto, do_: Date.now() + PAMAT_KONT_MS });
    return konto;
  } catch {
    return undefined;
  }
}

async function zistiUzivatela(request: Request): Promise<string | null> {
  // Strižňa (Mac appka na výrobu obsahu) sa hlási tokenom, nie cookie – beží mimo
  // prehliadača. Rovnaký princíp ako most BTC knihy: tajomstvo len v Cloudflare
  // a v ~/Strizna/kokpit.json na Jerryho Macu. Audit ju vidí ako „Strižňa“.
  const strizna = request.headers.get("x-strizna-token");
  const ocakavany = (bindings() as unknown as { STRIZNA_TOKEN?: string }).STRIZNA_TOKEN;
  if (strizna && ocakavany && ocakavany.length >= 32 && timingSafeEqual(strizna, ocakavany)) return "Strižňa";
  const raw = readCookie(request, COOKIE);
  if (!raw) return null;
  const s = tajomstvo();
  if (!s) return null;
  const podpis = await overPodpisCookie(s, raw);
  if (!podpis) return null;
  if (!podpis.meno) return "app";   // starý tvar bez mena
  return sessionPlati(podpis.verzia, await kontoPodlaMena(podpis.meno)) ? podpis.meno : null;
}

// `isAuthed` aj `currentUser` volá jedna trasa často oba — na jednu požiadavku jeden výpočet.
const naPoziadavku = new WeakMap<Request, Promise<string | null>>();

/** Meno prihláseného, alebo null. Cookie má tvar "meno|token"; starý tvar bez
 *  zvislej čiary je stále platný a hlási sa ako „app". */
export function currentUser(request: Request): Promise<string | null> {
  let v = naPoziadavku.get(request);
  if (!v) {
    v = zistiUzivatela(request);
    naPoziadavku.set(request, v);
  }
  return v;
}

export async function isAuthed(request: Request): Promise<boolean> {
  return (await currentUser(request)) !== null;
}

export async function sessionCookie(user = "", verzia = 0): Promise<string> {
  const s = tajomstvo();
  if (!s) throw new Error("Chýba PSB_SESSION_SECRET — session sa nedá založiť.");
  const hodnota = hodnotaCookie(user, await tokenSession(s, user, verzia));
  return `${COOKIE}=${encodeURIComponent(hodnota)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
