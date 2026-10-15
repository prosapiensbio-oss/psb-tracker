import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

import { normName } from "./format";

/** Rozrobené návrhy editora fotiek (`editor_navrhy` + R2 `editor/navrhy/<id>/`). */
export const predponaNavrhu = (id: string) => `editor/navrhy/${id}/`;

export async function zmazNavrh(env: { DB: D1Database; STORAGE: R2Bucket }, id: string) {
  const zoznam = await env.STORAGE.list({ prefix: predponaNavrhu(id) }).catch(() => null);
  for (const o of zoznam?.objects || []) await env.STORAGE.delete(o.key).catch(() => {});
  await env.DB.prepare("DELETE FROM editor_navrhy WHERE id = ?1").bind(id).run();
}

/**
 * PO ODOSLANÍ FOTIEK KLIENTOVI ROZROBENÉ ZMIZNÚ (Jerry, 15. 10. 2026: „keď
 * klientovi odošlem SMS Predtým a potom, zo zoznamu rozrobené by sa mohli
 * vymazať tie návrhy a ostali by len hotové, tie, ktoré sa poslali, na jeho
 * profile"). Hotové porovnania sú v kartotéke klienta (`klient_fotky`) —
 * návrh je len pracovný stav editora, ktorý tým stratil zmysel.
 * Len návrhy toho, kto posiela, a len tohto klienta. Vracia počet zmazaných.
 */
export async function zmazNavrhyKlienta(env: { DB: D1Database; STORAGE: R2Bucket }, kto: string, klient: string): Promise<number> {
  const k = normName(klient);
  if (!k || !kto) return 0;
  const riadky = ((await env.DB.prepare("SELECT id, klient FROM editor_navrhy WHERE kto = ?1").bind(kto).all()).results || []) as { id: string; klient: string | null }[];
  const moje = riadky.filter((r) => r.klient && normName(r.klient) === k);
  for (const r of moje) await zmazNavrh(env, r.id);
  return moje.length;
}
