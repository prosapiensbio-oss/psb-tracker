import type { D1Database } from "@cloudflare/workers-types";

import { dnesPraha } from "./cas";
import { API_UZIVATEL, API_ZAKLAD, BRAND_PSB, riadokPrehladu, sondyApi, verdiktKluca, type RiadokPrehladu, type VerdiktKluca } from "./metricool";

/**
 * Kľúč k API Metricoolu vo `vzas_settings`. Von sa nevracia, ani začiatok; do
 * prehliadača ide len „uložený od". Viď `metricool.ts`, načo je vedľa MCP.
 */
const K_API = "metricool_api_token";
type Ulozeny = { token: string; od: string; kto?: string };

async function citajKluc(DB: D1Database): Promise<Ulozeny | null> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(K_API).first<{ value: string }>();
  if (!r?.value) return null;
  try { return JSON.parse(r.value) as Ulozeny; } catch { return null; }
}

async function volaj(token: string, cesta: string, parametre: Record<string, string> = {}): Promise<{ status: number; telo: unknown; text: string }> {
  const q = new URLSearchParams({ ...parametre, blogId: BRAND_PSB, userId: API_UZIVATEL });
  try {
    const r = await fetch(`${API_ZAKLAD}${cesta}?${q}`, { headers: { "X-Mc-Auth": token, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    let telo: unknown = null;
    try { telo = JSON.parse(text); } catch { /* CSV alebo chybová stránka; text ostáva */ }
    return { status: r.status, telo, text: r.ok ? "" : text };
  } catch {
    return { status: 0, telo: null, text: "" };
  }
}

export async function stavKluca(DB: D1Database): Promise<{ ulozeny: boolean; od?: string; kto?: string }> {
  const k = await citajKluc(DB);
  return k ? { ulozeny: true, od: k.od, kto: k.kto } : { ulozeny: false };
}

export async function ulozKluc(DB: D1Database, token: string, kto?: string): Promise<VerdiktKluca> {
  const { status } = await volaj(token, "/admin/simpleProfiles");
  if (status === 0) return { ok: false, chyba: "Metricool neodpovedá, kľúč sa neuložil. Skús to o chvíľu." };
  const v = verdiktKluca(status);
  if (!v.ok) return v;
  await DB.prepare("INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(K_API, JSON.stringify({ token, od: new Date().toISOString(), kto } satisfies Ulozeny), new Date().toISOString()).run();
  return v;
}

export async function zmazKluc(DB: D1Database) {
  await DB.prepare("DELETE FROM vzas_settings WHERE key = ?1").bind(K_API).run();
}

/** Čo z API tento účet naozaj dáva. Len počty; postupne, nech to Metricool neberie ako nápor. */
export async function prehladApi(DB: D1Database): Promise<RiadokPrehladu[] | null> {
  const k = await citajKluc(DB);
  if (!k) return null;
  const von: RiadokPrehladu[] = [];
  for (const s of sondyApi(dnesPraha())) {
    let chybajuce: string[] = [];
    if (s.opravnenie) {
      const a = await volaj(k.token, s.opravnenie, { provider: s.parametre.provider });
      const t = a.telo as { data?: { missingScopes?: unknown }; missingScopes?: unknown } | null;
      const m = t?.data?.missingScopes ?? t?.missingScopes;
      if (Array.isArray(m)) chybajuce = m.map(String);
    }
    const r = await volaj(k.token, s.cesta, s.parametre);
    von.push(riadokPrehladu(s, r.status, r.telo, r.text, chybajuce));
  }
  return von;
}
