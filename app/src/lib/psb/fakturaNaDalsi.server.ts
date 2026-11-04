import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "./audit.server";
import { normName } from "./format";
import { balicekBerieFakturu, type CakajucaFaktura } from "./fakturaNaDalsi";

/**
 * Najstaršia faktúra klienta, ktorá čaká na balíček. Väzba na zrušený balíček
 * neplatí: po zrušení automatu ju má dostať ten, ktorý vznikne namiesto neho.
 * Bez `.catch`: výpadok dopytu nesmie vyzerať ako „žiadna faktúra nečaká".
 */
export async function cakajucaFaktura(DB: D1Database, klient: string): Promise<CakajucaFaktura | null> {
  const rs = await DB.prepare(
    `SELECT id, cislo, klient, dalsi_nazov, dalsi_hodiny, ks, cena_czk FROM vydane_faktury
      WHERE na_dalsi_balicek = 1 AND storno_at IS NULL
        AND (balicek_id IS NULL OR balicek_id NOT IN (SELECT id FROM balicky WHERE zrusene_at IS NULL))
      ORDER BY vystavene, cislo`,
  ).all();
  const kto = normName(klient);
  return ((rs.results || []) as unknown as CakajucaFaktura[]).find((f) => normName(f.klient) === kto) ?? null;
}

/**
 * Priradí čakajúcu faktúru práve vzniknutému balíčku. Balíček už stojí, takže
 * chyba tu ho nesmie zhodiť: bez väzby sa len ponúkne na faktúru, čo sa dá vidieť.
 */
export async function pripojFakturuKBalicku(DB: D1Database, b: { id: string; klient: string; nazov: string; hodiny: number | null }, kto?: string | null): Promise<void> {
  try {
    const f = await cakajucaFaktura(DB, b.klient);
    if (!f || !balicekBerieFakturu(b.nazov, b.hodiny, f)) return;
    await DB.prepare("UPDATE vydane_faktury SET balicek_id = ?2 WHERE id = ?1").bind(f.id, b.id).run();
    await audit(DB, { action: "faktura-na-dalsi-pripojena", predmet: `${f.cislo} · ${b.klient}`, neu: b.nazov, actor: kto || undefined });
  } catch (e) {
    console.error("faktúra na ďalší balíček sa nepripojila", b.klient, e);
  }
}

/** Klienti s čakajúcou faktúrou — notifikácia im už tlačidlo neponúkne. */
export async function klientiSCakajucouFakturou(DB: D1Database): Promise<string[]> {
  const rs = await DB.prepare(
    `SELECT DISTINCT klient FROM vydane_faktury
      WHERE na_dalsi_balicek = 1 AND storno_at IS NULL
        AND (balicek_id IS NULL OR balicek_id NOT IN (SELECT id FROM balicky WHERE zrusene_at IS NULL))`,
  ).all();
  return ((rs.results || []) as { klient: string }[]).map((r) => String(r.klient));
}
