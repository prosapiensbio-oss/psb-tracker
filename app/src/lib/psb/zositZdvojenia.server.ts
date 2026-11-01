import type { D1Database } from "@cloudflare/workers-types";

import { zamknuteMesiace } from "./audit.server";
import { najdiZdvojenia, ZDVOJENIA_KLUC, ZDVOJENIA_OD, type PlatbaZdvojenia, type PohybZdvojenia } from "./zositZdvojenia";

export async function vybaveneZdvojenia(DB: D1Database): Promise<string[]> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(ZDVOJENIA_KLUC).first<{ value: string }>();
  if (!r?.value) return [];
  const v = JSON.parse(r.value) as unknown;
  return Array.isArray(v) ? v.map(String) : [];
}

export async function zdvojeniaZoServera(DB: D1Database) {
  const [pohyby, platby, nieKlient] = await DB.batch([
    DB.prepare("SELECT id, date, amount_czk, counterparty, note, typ, category, created_at FROM fio_transactions WHERE date >= ?1").bind(ZDVOJENIA_OD),
    DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, zrusene_at FROM platby WHERE datum >= ?1 OR fio_id IS NOT NULL").bind(ZDVOJENIA_OD),
    DB.prepare("SELECT fio_id FROM platba_nie_klient"),
  ]);
  return najdiZdvojenia({
    pohyby: (pohyby.results || []) as unknown as PohybZdvojenia[],
    platby: (platby.results || []) as unknown as PlatbaZdvojenia[],
    nieKlient: new Set(((nieKlient.results || []) as unknown as { fio_id: string }[]).map((x) => x.fio_id)),
    vybavene: new Set(await vybaveneZdvojenia(DB)),
    zamky: await zamknuteMesiace(DB),
  });
}
