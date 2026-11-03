import type { D1Database } from "@cloudflare/workers-types";

import { dnesPraha } from "./cas";
import { KLUC_KONKURENTOV, prispevkyKonkurentov, uctyKonkurentov, type Konkurenti } from "./konkurenti";
import {
  API_UZIVATEL, API_ZAKLAD, BRAND_PSB, hodnotaSerie, hodnotySerie, obdobieMesiacaApi, POCET_V_MESIACI, prispevkyZApi, riadokPrehladu, SERIE_API, sondyApi,
  suhrnInstagramuZApi, verdiktKluca, type PrispevokMc, type RiadokPrehladu, type VerdiktKluca,
} from "./metricool";

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

const zoznamZ = (telo: unknown): Record<string, unknown>[] => {
  const d = (telo as { data?: unknown } | null)?.data;
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
};

export type MesiacZApi = { reels: PrispevokMc[]; posty: PrispevokMc[]; stories: PrispevokMc[]; kanaly: { kanal: string; metrika: string; hodnota: number }[]; preskocene: string[] };

/**
 * Mesiac cez API: to isté, čo sťah cez MCP, v tom istom tvare. `null` = kľúč nie je.
 * Kanál, ktorého séria zlyhá, sa preskočí a povie sa to; odmietnutý kľúč alebo
 * príspevky vyhodia chybu, aby sa nezapísal polovičný mesiac ako úplný.
 */
export async function stiahniMesiacApi(DB: D1Database, mesiac: string): Promise<MesiacZApi | null> {
  const k = await citajKluc(DB);
  if (!k) return null;
  const ob = obdobieMesiacaApi(mesiac);
  const nutne = async (cesta: string) => {
    const r = await volaj(k.token, cesta, ob);
    if (r.status < 200 || r.status >= 300) throw new Error(`API Metricoolu: ${cesta} odpovedalo ${r.status || "bez odpovede"}: ${r.text.slice(0, 160)}`);
    return zoznamZ(r.telo);
  };
  const vMesiaci = (xs: PrispevokMc[]) => xs.filter((p) => p.mesiac === mesiac);
  const reels = vMesiaci(prispevkyZApi("reel", await nutne("/v2/analytics/reels/instagram")));
  const posty = vMesiaci(prispevkyZApi("post", await nutne("/v2/analytics/posts/instagram")));
  const stories = vMesiaci(prispevkyZApi("story", await nutne("/v2/analytics/stories/instagram")));
  const kanaly: MesiacZApi["kanaly"] = suhrnInstagramuZApi([...reels, ...posty, ...stories], mesiac).map((x) => ({ ...x, kanal: "Instagram" }));
  const zlyhalo = new Set<string>();
  const seriaZ = async (network: string, metric: string, subject?: string) => {
    const r = await volaj(k.token, "/v2/analytics/timelines", { network, metric, ...ob, ...(subject ? { subject } : {}) });
    return r.status >= 200 && r.status < 300 ? hodnotySerie(r.telo) : null;
  };
  for (const s of SERIE_API) {
    const body = await seriaZ(s.network, s.metric, s.subject);
    const minus = s.minus ? await seriaZ(s.network, s.minus, s.subject) : [];
    if (!body || !minus) { zlyhalo.add(s.kanal); continue; }
    const h = hodnotaSerie(s, body, minus);
    if (h !== null) kanaly.push({ kanal: s.kanal, metrika: s.metrika, hodnota: h });
  }
  const yt = await volaj(k.token, "/v2/analytics/posts/youtube", ob);
  if (yt.status >= 200 && yt.status < 300) kanaly.push({ kanal: "YouTube", metrika: "Videos", hodnota: POCET_V_MESIACI(zoznamZ(yt.telo), mesiac) });
  else zlyhalo.add("YouTube");
  const rec = await volaj(k.token, "/v2/analytics/reviews/gbp", ob);
  if (rec.status >= 200 && rec.status < 300) kanaly.push({ kanal: "Google Business", metrika: "Reviews", hodnota: zoznamZ(rec.telo).length });
  else zlyhalo.add("Google Business");
  return { reels, posty, stories, kanaly, preskocene: [...zlyhalo] };
}

/** Konkurenti cez API, bez zhrnutia. Chyba hovorí, čo sa stalo; nikdy sa netvári ako prázdny zoznam. */
export async function nacitajKonkurentovApi(DB: D1Database, dni: number): Promise<Omit<Konkurenti, "vzory">> {
  const k = await citajKluc(DB);
  if (!k) throw new Error("API kľúč Metricoolu nie je uložený. Vlož ho v Upload → Napojenia.");
  const doDna = dnesPraha();
  const od = new Date(Date.parse(`${doDna}T12:00:00Z`) - dni * 86400000).toISOString().slice(0, 10);
  const ob = { from: `${od}T00:00:00+01:00`, to: `${doDna}T23:59:59+01:00`, timezone: "Europe/Prague", limit: "200" };
  const u = await volaj(k.token, "/v2/analytics/competitors/instagram", ob);
  if (u.status < 200 || u.status >= 300) throw new Error(`Metricool: zoznam konkurentov odpovedal ${u.status || "bez odpovede"}: ${u.text.slice(0, 160)}`);
  const p = await volaj(k.token, "/v2/analytics/competitors/instagram/publications", ob);
  if (p.status < 200 || p.status >= 300) throw new Error(`Metricool: príspevky konkurentov odpovedali ${p.status || "bez odpovede"}: ${p.text.slice(0, 160)}`);
  const ucty = zoznamZ(u.telo);
  return { nacitane: new Date().toISOString(), od, do: doDna, ucty: uctyKonkurentov(ucty), prispevky: prispevkyKonkurentov(zoznamZ(p.telo), ucty) };
}

export async function citajKonkurentov(DB: D1Database): Promise<Konkurenti | null> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(KLUC_KONKURENTOV).first<{ value: string }>();
  if (!r?.value) return null;
  try { return JSON.parse(r.value) as Konkurenti; } catch { return null; }
}

export async function ulozKonkurentov(DB: D1Database, k: Konkurenti) {
  await DB.prepare("INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(KLUC_KONKURENTOV, JSON.stringify(k), new Date().toISOString()).run();
}
