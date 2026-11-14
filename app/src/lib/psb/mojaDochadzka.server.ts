import type { D1Database } from "@cloudflare/workers-types";

import { citajDochadzku, KLUC_DOCHADZKY, type Aktivita, type DataDochadzky, type UdalostDochadzky } from "./mojaDochadzka";

export async function nacitajDochadzku(DB: D1Database): Promise<DataDochadzky> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(KLUC_DOCHADZKY).first<{ value: string }>().catch(() => null);
  return citajDochadzku(r?.value);
}

export async function ulozDochadzku(DB: D1Database, d: DataDochadzky): Promise<void> {
  await DB.prepare("INSERT INTO vzas_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(KLUC_DOCHADZKY, JSON.stringify(d)).run();
}

/** Všetky udalosti, ktoré niektorá aktivita ráta — celá história, nie okno kalendára. */
export async function udalostiDochadzky(DB: D1Database, aktivity: Aktivita[]): Promise<UdalostDochadzky[]> {
  if (!aktivity.length) return [];
  const nazvy = [...new Set(aktivity.flatMap((a) => a.nazvy.map((n) => n.trim().toLowerCase())).filter(Boolean))].slice(0, 40);
  const guillermo = aktivity.some((a) => a.guillermo);
  const podmienky = [
    ...(nazvy.length ? [`lower(nazov) IN (${nazvy.map((_, i) => `?${i + 1}`).join(",")})`] : []),
    ...(guillermo ? ["typ = 'guillermo'"] : []),
  ];
  if (!podmienky.length) return [];
  const r = await DB.prepare(
    `SELECT uid, trener, zaciatok, koniec, nazov, typ FROM kal_udalosti WHERE zmizla_at IS NULL AND (${podmienky.join(" OR ")}) ORDER BY zaciatok`,
  ).bind(...nazvy).all<UdalostDochadzky>();
  return r.results || [];
}

/**
 * Čo sa dá sledovať: súkromné udalosti v kalendári toho človeka, ktoré sa
 * opakujú (aspoň 3× za 4 mesiace), a Guillermo, keď ho v kalendári má.
 */
export async function kandidatiDochadzky(DB: D1Database, kto: string): Promise<{ nazov: string; pocet: number; guillermo: boolean }[]> {
  const r = await DB.prepare(
    `SELECT CASE WHEN typ = 'guillermo' THEN 'Guillermo' ELSE nazov END n, typ = 'guillermo' g, COUNT(*) pocet
       FROM kal_udalosti
      WHERE trener = ?1 AND zmizla_at IS NULL AND typ IN ('sukromne', 'guillermo') AND zaciatok >= date('now', '-120 days') AND nazov IS NOT NULL
      GROUP BY n, g HAVING COUNT(*) >= 3 ORDER BY pocet DESC LIMIT 8`,
  ).bind(kto).all<{ n: string; g: number; pocet: number }>().catch(() => ({ results: [] as { n: string; g: number; pocet: number }[] }));
  return (r.results || []).map((x) => ({ nazov: x.n, pocet: x.pocet, guillermo: !!x.g }));
}
