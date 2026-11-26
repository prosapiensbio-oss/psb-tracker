import type { D1Database } from "@cloudflare/workers-types";
import { citajPlanovanePonuky, type PlanovanaPonuka } from "./planovanaPonuka";

export const KLUC_PLANOVANYCH = "planovane_ponuky";

/**
 * Naplánované ponuky s príznakom hotovo: od naplánovania vznikla ponuka
 * (pri úvodnej typ `uvodny`) na to meno alebo telefón. Jedno miesto pre
 * loadData (notifikácia) aj /api/ponuky (obrazovka).
 */
export async function nacitajPlanovane(DB: D1Database): Promise<PlanovanaPonuka[]> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(KLUC_PLANOVANYCH).first<{ value: string }>();
  const plan = citajPlanovanePonuky(r?.value);
  for (const p of plan) {
    const tel = String(p.telefon || "").replace(/\s+/g, "");
    const x = await DB.prepare(
      `SELECT 1 AS x FROM ponuky_terminov WHERE zrusene_at IS NULL AND created_at >= ?1 AND (?4 = 0 OR typ = 'uvodny')
         AND (klient = ?2 OR (?3 <> '' AND replace(telefon, ' ', '') = ?3)) LIMIT 1`,
    ).bind(p.vytvorene, p.kontakt, tel, p.uvodny === false ? 0 : 1).first().catch(() => null);
    p.hotovo = !!x;
  }
  return plan;
}

export async function ulozPlanovane(DB: D1Database, plan: PlanovanaPonuka[]): Promise<void> {
  await DB.prepare("INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(KLUC_PLANOVANYCH, JSON.stringify(plan.map(({ hotovo: _h, ...p }) => p)), new Date().toISOString()).run();
}
