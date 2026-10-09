/**
 * DOTAZNÍK — čo potrebuje server: kolo, osobné odkazy, uloženie odpovede.
 *
 * Anonymita je v SCHÉME, nie v sľube: `dotaznik_odpovede` nemá token, klienta
 * ani čas (len deň). Odkaz si pamätá len `pouzity = 1` — bez času použitia,
 * ktorý by sa dal spárovať s dňom odpovede.
 */
import type { D1Database } from "@cloudflare/workers-types";

import { dnesPraha } from "./cas";
import { novyToken } from "./anamneza.server";
import { jePrazdna, type OdpovedDotazniku } from "./dotaznik";

export type KoloDotazniku = { id: string; nazov: string; created_at: string; uzavrete_at: string | null };

/** Otvorené kolo (posledné neuzavreté), alebo `null`. */
export async function otvoreneKolo(DB: D1Database): Promise<KoloDotazniku | null> {
  return DB.prepare("SELECT id, nazov, created_at, uzavrete_at FROM dotaznik_kola WHERE uzavrete_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .first<KoloDotazniku>().catch(() => null);
}

/** Otvorené kolo, alebo nové — prvá odoslaná SMS ho založí sama. */
export async function koloNaOdoslanie(DB: D1Database): Promise<KoloDotazniku> {
  const k = await otvoreneKolo(DB);
  if (k) return k;
  const teraz = new Date().toISOString();
  const nove: KoloDotazniku = { id: `kolo-${dnesPraha()}-${novyToken(4)}`, nazov: dnesPraha().slice(0, 7), created_at: teraz, uzavrete_at: null };
  await DB.prepare("INSERT INTO dotaznik_kola (id, nazov, created_at) VALUES (?1, ?2, ?3)").bind(nove.id, nove.nazov, teraz).run();
  return nove;
}

/**
 * Osobný odkaz klienta v kole — ten istý pri pripomienke, nový len pre
 * nového človeka. `UNIQUE (kolo, klient)` stráži, že dvakrát nevznikne.
 */
export async function tokenKlienta(DB: D1Database, kolo: string, klient: string): Promise<string> {
  const r = await DB.prepare("SELECT token FROM dotaznik_odkazy WHERE kolo = ?1 AND klient = ?2").bind(kolo, klient).first<{ token: string }>();
  if (r?.token) return r.token;
  const token = novyToken();
  await DB.prepare("INSERT OR IGNORE INTO dotaznik_odkazy (token, kolo, klient, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(token, kolo, klient, new Date().toISOString()).run();
  const znova = await DB.prepare("SELECT token FROM dotaznik_odkazy WHERE kolo = ?1 AND klient = ?2").bind(kolo, klient).first<{ token: string }>();
  return znova?.token || token;
}

export type StavOdkazu = "platny" | "pouzity" | "uzavrete" | "neplati";

export async function stavOdkazu(DB: D1Database, token: string): Promise<{ stav: StavOdkazu; kolo?: string }> {
  const r = await DB.prepare(
    `SELECT o.kolo, o.pouzity, k.uzavrete_at FROM dotaznik_odkazy o JOIN dotaznik_kola k ON k.id = o.kolo WHERE o.token = ?1`,
  ).bind(token).first<{ kolo: string; pouzity: number; uzavrete_at: string | null }>().catch(() => null);
  if (!r) return { stav: "neplati" };
  if (r.uzavrete_at) return { stav: "uzavrete", kolo: r.kolo };
  return { stav: r.pouzity ? "pouzity" : "platny", kolo: r.kolo };
}

/**
 * Uloží odpoveď a odkaz označí za použitý — v JEDNOM batchi, a označenie
 * je podmienené (`pouzity = 0`): dve odoslania naraz neuložia dve odpovede.
 * Vracia, či sa uložilo.
 */
export async function ulozOdpoved(DB: D1Database, token: string, kolo: string, o: OdpovedDotazniku): Promise<"ulozene" | "pouzity" | "prazdne"> {
  if (jePrazdna(o)) return "prazdne";
  const oznac = await DB.prepare("UPDATE dotaznik_odkazy SET pouzity = 1 WHERE token = ?1 AND pouzity = 0").bind(token).run();
  if (!oznac.meta?.changes) return "pouzity";
  try {
    await DB.prepare("INSERT INTO dotaznik_odpovede (id, kolo, den, odpovede_json) VALUES (?1, ?2, ?3, ?4)")
      .bind(novyToken(16), kolo, dnesPraha(), JSON.stringify(o)).run();
  } catch (e) {
    // Odpoveď sa neuložila → odkaz sa vráti do hry, inak by klient videl
    // „už ste odpovedali" nad prázdnom.
    await DB.prepare("UPDATE dotaznik_odkazy SET pouzity = 0 WHERE token = ?1").bind(token).run().catch(() => null);
    throw e;
  }
  return "ulozene";
}
