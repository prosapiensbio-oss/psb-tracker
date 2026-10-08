import type { D1Database } from "@cloudflare/workers-types";

import { BRAND_PSB, MCP_URL, POUZIVATEL_MC, rozoberOdpovedMcp, riadkyZVysledku } from "./metricool";

/**
 * Kokpit ako MCP klient Metricoolu (viď metricool.ts, prečo nie API).
 *
 * OAuth podľa metadát servera (overené 8. 10. 2026):
 *   autorizácia  https://app.metricool.com/oauth/authorize
 *   token        https://app.metricool.com/oauth/token
 *   registrácia  https://app.metricool.com/oauth/register (dynamická, bez tajomstva)
 *   PKCE S256, refresh_token, rozsah mcp:read (Kokpit nič nepublikuje).
 *
 * Tokeny ležia vo `vzas_settings` ako ostatné prístupy (mailer, Meta) a von
 * sa nevracajú. Kokpit si pýta len čítanie.
 */
const AUTH = "https://app.metricool.com/oauth/authorize";
const TOKEN = "https://app.metricool.com/oauth/token";
const REGISTRACIA = "https://app.metricool.com/oauth/register";
const ROZSAH = "mcp:read";

const K_KLIENT = "metricool_klient";
const K_TOKEN = "metricool_token";
const K_PKCE = "metricool_pkce";

type Klient = { client_id: string; client_secret?: string; redirect_uri: string };
type Token = { access_token: string; refresh_token?: string; expires_at: number; pripojene_at: string };

async function citaj<T>(DB: D1Database, kluc: string): Promise<T | null> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(kluc).first<{ value: string }>().catch(() => null);
  if (!r?.value) return null;
  try { return JSON.parse(r.value) as T; } catch { return null; }
}
async function zapis(DB: D1Database, kluc: string, hodnota: unknown | null) {
  if (hodnota == null) { await DB.prepare("DELETE FROM vzas_settings WHERE key = ?1").bind(kluc).run(); return; }
  await DB.prepare("INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(kluc, JSON.stringify(hodnota), new Date().toISOString()).run();
}

const b64url = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const nahodne = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/** Chyba odpovede so začiatkom tela — holý stavový kód nič nepovie (CLAUDE.md). */
async function chybaOdpovede(r: Response, co: string): Promise<string> {
  const t = await r.text().catch(() => "");
  return `${co}: HTTP ${r.status}${t ? ` — ${t.slice(0, 300)}` : ""}`;
}

async function klientPre(DB: D1Database, redirectUri: string): Promise<Klient> {
  const k = await citaj<Klient>(DB, K_KLIENT);
  if (k && k.redirect_uri === redirectUri) return k;
  const r = await fetch(REGISTRACIA, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Kokpit ProSapiens", redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      token_endpoint_auth_method: "none", scope: ROZSAH,
    }),
  });
  if (!r.ok) throw new Error(await chybaOdpovede(r, "Registrácia v Metricoole zlyhala"));
  const j = (await r.json()) as { client_id?: string; client_secret?: string };
  if (!j.client_id) throw new Error("Metricool pri registrácii nevrátil client_id.");
  const novy: Klient = { client_id: j.client_id, client_secret: j.client_secret, redirect_uri: redirectUri };
  await zapis(DB, K_KLIENT, novy);
  return novy;
}

/** Adresa, na ktorú Kokpit pošle človeka povoliť prístup. */
export async function adresaPripojenia(DB: D1Database, redirectUri: string): Promise<string> {
  const k = await klientPre(DB, redirectUri);
  const state = nahodne(16);
  const verifier = nahodne(48);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  await zapis(DB, K_PKCE, { state, verifier, kedy: Date.now() });
  const q = new URLSearchParams({
    response_type: "code", client_id: k.client_id, redirect_uri: redirectUri, scope: ROZSAH,
    state, code_challenge: challenge, code_challenge_method: "S256", resource: MCP_URL,
    // Metricool viaže povolenie na ZNAČKU — bez tohto ju doplní podľa toho,
    // ktorá je v jeho okne práve otvorená (8. 10. 2026 to bola Ahsoka a sťah
    // ProSapiens padol na 403 „Access denied to blog").
    blogId: BRAND_PSB, userId: POUZIVATEL_MC,
  });
  return `${AUTH}?${q}`;
}

async function tokenovyDopyt(k: Klient, telo: Record<string, string>): Promise<Token> {
  const params = new URLSearchParams({ ...telo, client_id: k.client_id, resource: MCP_URL });
  if (k.client_secret) params.set("client_secret", k.client_secret);
  const r = await fetch(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: params });
  if (!r.ok) throw new Error(await chybaOdpovede(r, "Metricool odmietol token"));
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Metricool nevrátil prístupový token.");
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000, pripojene_at: new Date().toISOString() };
}

/** Návrat z Metricoolu: overí stav a vymení kód za tokeny. */
export async function dokonciPripojenie(DB: D1Database, code: string, state: string): Promise<void> {
  const p = await citaj<{ state: string; verifier: string; kedy: number }>(DB, K_PKCE);
  if (!p || p.state !== state) throw new Error("Prihlásenie nesedí s tým, ktoré Kokpit začal — skús Pripojiť znova.");
  if (Date.now() - p.kedy > 15 * 60_000) throw new Error("Prihlásenie vypršalo — skús Pripojiť znova.");
  const k = await citaj<Klient>(DB, K_KLIENT);
  if (!k) throw new Error("Chýba registrácia klienta — skús Pripojiť znova.");
  const t = await tokenovyDopyt(k, { grant_type: "authorization_code", code, redirect_uri: k.redirect_uri, code_verifier: p.verifier });
  await zapis(DB, K_TOKEN, t);
  await zapis(DB, K_PKCE, null);
}

export async function stavPripojenia(DB: D1Database): Promise<{ pripojene: boolean; od?: string }> {
  const t = await citaj<Token>(DB, K_TOKEN);
  return t ? { pripojene: true, od: t.pripojene_at } : { pripojene: false };
}

export async function odpoj(DB: D1Database) {
  await zapis(DB, K_TOKEN, null);
}

async function platnyToken(DB: D1Database, vynut = false): Promise<string> {
  const t = await citaj<Token>(DB, K_TOKEN);
  if (!t) throw new Error("Metricool nie je pripojený.");
  if (!vynut && t.expires_at - Date.now() > 60_000) return t.access_token;
  const k = await citaj<Klient>(DB, K_KLIENT);
  if (!t.refresh_token || !k) throw new Error("Prístup do Metricoolu vypršal — pripoj ho znova.");
  const novy = await tokenovyDopyt(k, { grant_type: "refresh_token", refresh_token: t.refresh_token });
  // Niektoré servery refresh token nevymieňajú — starý vtedy platí ďalej.
  await zapis(DB, K_TOKEN, { ...novy, refresh_token: novy.refresh_token || t.refresh_token, pripojene_at: t.pripojene_at });
  return novy.access_token;
}

/** Jedno sedenie s MCP serverom: initialize → initialized → volania nástrojov. */
export async function sedenieMcp(DB: D1Database) {
  let token = await platnyToken(DB);
  let relacia = "";
  let id = 0;
  const posli = async (telo: Record<string, unknown>, opakuj = true): Promise<Response> => {
    const r = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`, "content-type": "application/json",
        accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18",
        ...(relacia ? { "mcp-session-id": relacia } : {}),
      },
      body: JSON.stringify(telo),
    });
    if (r.status === 401 && opakuj) { token = await platnyToken(DB, true); return posli(telo, false); }
    return r;
  };
  const volaj = async (method: string, params: Record<string, unknown>) => {
    const mojeId = ++id;
    const r = await posli({ jsonrpc: "2.0", id: mojeId, method, params });
    if (!r.ok) throw new Error(await chybaOdpovede(r, `Metricool (${method})`));
    const s = r.headers.get("mcp-session-id");
    if (s) relacia = s;
    const m = rozoberOdpovedMcp(await r.text(), r.headers.get("content-type") || "", mojeId);
    if (!m) throw new Error(`Metricool (${method}): odpoveď sa nedala prečítať.`);
    if (m.error) throw new Error(`Metricool (${method}): ${m.error.message || "chyba"}`);
    return m.result;
  };
  await volaj("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Kokpit ProSapiens", version: "1" } });
  await posli({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => null);
  return {
    /** Riadky z `getAnalyticsDataByMetrics` v poradí `metrics`. */
    async riadky(brandId: string, from: string, to: string, metrics: string[]): Promise<unknown[][]> {
      const v = riadkyZVysledku(await volaj("tools/call", { name: "getAnalyticsDataByMetrics", arguments: { brandId, from, to, metrics } }));
      if ("chyba" in v) throw new Error(`Metricool: ${v.chyba}`);
      return v.rows;
    },
  };
}
