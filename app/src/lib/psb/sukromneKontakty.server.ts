import type { D1Database } from "@cloudflare/workers-types";

import { citajSukromne, KLUC_SUKROMNYCH, type SukromnyKontakt } from "./sukromneKontakty";

export async function nacitajSukromne(DB: D1Database): Promise<SukromnyKontakt[]> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(KLUC_SUKROMNYCH).first<{ value: string }>().catch(() => null);
  return citajSukromne(r?.value);
}

export async function ulozSukromne(DB: D1Database, zoznam: SukromnyKontakt[]): Promise<void> {
  await DB.prepare("INSERT INTO vzas_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(KLUC_SUKROMNYCH, JSON.stringify(zoznam)).run();
}

/**
 * Z klienta urobí súkromný kontakt aj spätne: jeho udalosti v kalendári
 * prejdú na súkromné (a pravidlo mena tiež, aby to platilo aj pre ďalšie),
 * a balíček, ktorý mu appka založila sama prvým „tréningom“, sa zruší —
 * ale len taký, na ktorý neprišla žiadna platba. Zaplatené sa nechá
 * na človeka; to by bol omyl, ktorý treba vidieť, nie ticho zmazať.
 */
export async function odklientuj(DB: D1Database, meno: string): Promise<{ udalosti: number; balicky: number; balickyZaplatene: number }> {
  const teraz = new Date().toISOString();
  const zaplatene = await DB.prepare("SELECT COUNT(*) n FROM platby WHERE klient = ?1 AND zrusene_at IS NULL").bind(meno).first<{ n: number }>();
  const maPlatbu = (Number(zaplatene?.n) || 0) > 0;
  const vys = await DB.batch([
    DB.prepare("UPDATE kal_udalosti SET typ = 'sukromne', klient = NULL, typ_rucne = 1 WHERE klient = ?1 OR nazov = ?1").bind(meno),
    DB.prepare("UPDATE kal_mapovanie SET typ = 'sukromne', klient = NULL, potvrdene_at = ?2 WHERE nazov = ?1 OR klient = ?1").bind(meno, teraz),
    DB.prepare("INSERT OR IGNORE INTO kal_mapovanie (nazov, trener, cas, klient, typ, potvrdene_at, vedome) VALUES (?1, 'Jerry', '', NULL, 'sukromne', ?2, 1)").bind(meno, teraz),
    maPlatbu
      ? DB.prepare("SELECT 1 WHERE ?1 = ?1").bind(meno)
      : DB.prepare("UPDATE balicky SET zrusene_at = ?2 WHERE klient = ?1 AND zrusene_at IS NULL AND poznamka LIKE 'automaticky%'").bind(meno, teraz),
  ]);
  const balickyZaplatene = maPlatbu
    ? Number((await DB.prepare("SELECT COUNT(*) n FROM balicky WHERE klient = ?1 AND zrusene_at IS NULL").bind(meno).first<{ n: number }>())?.n) || 0
    : 0;
  return { udalosti: vys[0].meta?.changes || 0, balicky: maPlatbu ? 0 : vys[3].meta?.changes || 0, balickyZaplatene };
}
