import type { D1Database } from "@cloudflare/workers-types";

import { narokyJwt, SCOPES } from "./google";

/**
 * Podpisovanie JWT pre servisný účet — jedno miesto pre všetky Google služby.
 *
 * PREČO TO NIE JE V `api/google.ts`
 *
 * Pôvodne to tam bolo, lebo Google boli len dve služby. Keď pribudol Google
 * Ads, stála pred nami voľba: skopírovať štyridsať riadkov kryptografie, alebo
 * ich vytiahnuť sem. Kópia by bola horšia než len škaredá — kľúč sa podpisuje
 * na sekundu presne (`iat` o minútu dozadu, lebo hodiny na Cloudflare a
 * v Google nie sú tie isté) a oprava tejto jednej vety na dvoch miestach je
 * presne ten druh rozdielu, ktorý sa objaví o pol roka a nikto ho nevysvetlí.
 *
 * KĽÚČ NEOPÚŠŤA SERVER
 *
 * Súbory `.server.ts` sa do prehliadača nedostanú. Kľúč leží v `vzas_settings`,
 * číta ho len tento modul a von ide najviac e-mail servisného účtu.
 */

export type Sluzba = { ok: true; token: string } | { ok: false; chyba: string };

export type ServisnyUcet = { client_email?: string; private_key?: string };

const base64url = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const textB64url = (s: string): string => base64url(new TextEncoder().encode(s));

/** PEM `-----BEGIN PRIVATE KEY-----` → kľúč na podpis RS256. */
async function nacitajKluc(pem: string): Promise<CryptoKey> {
  const telo = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const bin = atob(telo);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    "pkcs8", buf.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );
}

/**
 * Servisný účet → prístupový token. Platí hodinu, nikde sa neukladá.
 *
 * PREČO SA ROZSAH PÝTA ZVLÁŠŤ
 *
 * Google Ads má vlastný rozsah (`adwords`). Keby sa žiadal v jednom tokene
 * spolu s Analytics, jedno chýbajúce oprávnenie by zhodilo aj to druhé —
 * a hláška by ukázala na nesprávnu službu. Jeden token na jednu službu.
 */
export async function ziskajToken(sa: ServisnyUcet, scope: string = SCOPES): Promise<Sluzba> {
  if (!sa.client_email || !sa.private_key) {
    return { ok: false, chyba: "kľúč nemá client_email alebo private_key" };
  }
  try {
    const hlavicka = textB64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const telo = textB64url(JSON.stringify(narokyJwt(sa.client_email, Date.now(), scope)));
    const kluc = await nacitajKluc(sa.private_key);
    const podpis = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5", kluc, new TextEncoder().encode(`${hlavicka}.${telo}`),
    );
    const jwt = `${hlavicka}.${telo}.${base64url(podpis)}`;

    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || !j.access_token) {
      const d = String(j.error_description || j.error || `HTTP ${r.status}`);
      return { ok: false, chyba: `Google odmietol kľúč: ${d.slice(0, 250)}` };
    }
    return { ok: true, token: String(j.access_token) };
  } catch (e) {
    return { ok: false, chyba: `kľúč sa nepodarilo použiť: ${String(e).slice(0, 200)}` };
  }
}

/** Uložený servisný účet, alebo hláška prečo nie. */
export async function servisnyUcet(DB: D1Database): Promise<
  { ok: true; sa: ServisnyUcet; email: string } | { ok: false; chyba: string }
> {
  const surovy = await nastavenie(DB, "google_sa");
  if (!surovy) return { ok: false, chyba: "chyba_kluc" };
  try {
    const sa = JSON.parse(surovy) as ServisnyUcet;
    return { ok: true, sa, email: String(sa.client_email || "") };
  } catch {
    return { ok: false, chyba: "uložený kľúč sa nedá prečítať" };
  }
}

export async function nastavenie(DB: D1Database, kluc: string): Promise<string> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1")
    .bind(kluc).first<{ value: string }>();
  if (!r?.value) return "";
  try { return String(JSON.parse(r.value)); } catch { return r.value; }
}

export async function ulozNastavenie(DB: D1Database, kluc: string, hodnota: string): Promise<void> {
  await DB.prepare(
    `INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(kluc, JSON.stringify(hodnota), new Date().toISOString()).run();
}
