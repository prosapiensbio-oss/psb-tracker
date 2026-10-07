import type { D1Database } from "@cloudflare/workers-types";

import { posli as posliPush, type Odber } from "./push.server";
import type { CasPonuky, Obsadene } from "./ponukaTerminov";

/**
 * PONUKA TERMÍNOV — čo potrebuje server (API pre Kokpit aj stránka /t/).
 * Čisté pravidlá sú v `ponukaTerminov.ts`.
 */

export type RiadokPonuky = {
  token: string; klient: string; telefon: string | null; typ: string; plati_do: string;
  vybrany_id: string | null; vybrane_at: string | null; udalost_uid: string | null;
  zrusene_at: string | null; kto: string | null; created_at: string;
};

export async function nacitajPonuku(DB: D1Database, token: string): Promise<{ p: RiadokPonuky; casy: CasPonuky[] } | null> {
  const p = await DB.prepare("SELECT * FROM ponuky_terminov WHERE token = ?1").bind(token).first<RiadokPonuky>();
  if (!p) return null;
  const casy = ((await DB.prepare("SELECT id, trener, zaciatok, koniec FROM ponuky_terminov_casy WHERE token = ?1 ORDER BY zaciatok")
    .bind(token).all()).results || []) as unknown as CasPonuky[];
  return { p, casy };
}

/**
 * Čo je obsadené v okne od–do: živé udalosti v kalendároch trénerov
 * (zmiznutá udalosť nie je obsadený čas) a termíny, ktoré si už niekto
 * vybral z INEJ ponuky. Vlastná ponuka sa vynechá — jej vybraný termín
 * už stojí v kalendári ako udalosť.
 */
export async function obsadeneVOkne(DB: D1Database, od: string, doDna: string, okremTokenu = ""): Promise<Obsadene[]> {
  const [udalosti, vybrane] = await Promise.all([
    DB.prepare(
      `SELECT trener, zaciatok, COALESCE(koniec, zaciatok) AS koniec FROM kal_udalosti
        WHERE zmizla_at IS NULL AND zaciatok >= ?1 AND zaciatok < ?2`,
    ).bind(od, doDna).all().then((x) => (x.results || []) as unknown as Obsadene[]).catch(() => [] as Obsadene[]),
    DB.prepare(
      `SELECT c.trener, c.zaciatok, c.koniec FROM ponuky_terminov p
         JOIN ponuky_terminov_casy c ON c.id = p.vybrany_id
        WHERE p.token != ?1 AND c.zaciatok >= ?2 AND c.zaciatok < ?3`,
    ).bind(okremTokenu, od, doDna).all().then((x) => (x.results || []) as unknown as Obsadene[]).catch(() => [] as Obsadene[]),
  ]);
  return [...udalosti, ...vybrane];
}

/** Okno, ktoré pokrýva všetky časy ponuky (deň prvého až deň po poslednom). */
export function oknoCasov(casy: { zaciatok: string }[]): { od: string; do: string } {
  const dni = casy.map((c) => c.zaciatok.slice(0, 10)).sort();
  const posledny = dni[dni.length - 1] || "9999-12-31";
  const dalsi = new Date(Date.parse(`${posledny}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { od: dni[0] || "0000-01-01", do: dalsi };
}

/** Notifikácia trénerovi na telefón (ticho zlyhá — výber termínu sa kvôli nej nesmie stratiť). */
export async function pushTrenerovi(DB: D1Database, trener: string, obsah: { titulok: string; text: string; url?: string; znacka?: string }): Promise<void> {
  try {
    const nast = (await DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('vapid_public','vapid_private')").all()).results as { key: string; value: string }[];
    const m = Object.fromEntries(nast.map((r) => [r.key, String(r.value || "")]));
    if (!m.vapid_public || !m.vapid_private) return;
    const kluce = { verejny: m.vapid_public, sukromny: m.vapid_private, kontakt: "mailto:prosapiensbio@gmail.com" };
    const odbery = (await DB.prepare("SELECT endpoint, p256dh, auth, kto FROM push_odbery").all()).results as unknown as (Odber & { kto: string })[];
    for (const o of odbery) {
      if ((o.kto || "").trim().toLowerCase() !== trener.trim().toLowerCase()) continue;
      await posliPush(o, obsah, kluce);
    }
  } catch { /* push nie je podmienka */ }
}
