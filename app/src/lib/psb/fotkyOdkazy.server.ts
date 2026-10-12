import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../bindings.server";
import type { FotkyKlientov } from "./fotkyOdkazy";
import { odsifruj } from "./sifra.server";

/**
 * Odpovede a súhlasy z odkazov s fotkami za posledných 60 dní — pre register.
 * Text odpovede je v databáze šifrovaný; rozšifruje sa tu, na serveri, len
 * pre prihláseného trénera (loadData). Chýbajúce tabuľky = prázdno, nie pád.
 */
export async function nacitajFotkyKlientov(DB: D1Database): Promise<FotkyKlientov> {
  const kluc = (bindings() as { ANAMNEZA_KLUC?: string }).ANAMNEZA_KLUC;
  const od = new Date(Date.now() - 60 * 86400000).toISOString();
  const [odp, suh] = await Promise.all([
    DB.prepare(`SELECT o.id, o.token, o.klient, o.text, o.vytvorene_at, k.trener FROM fotky_odpovede o
                LEFT JOIN fotky_odkazy k ON k.token = o.token WHERE o.vytvorene_at >= ?1 ORDER BY o.vytvorene_at`)
      .bind(od).all().then((x) => x.results as Record<string, unknown>[]).catch(() => []),
    DB.prepare("SELECT token, klient, suhlas, suhlas_at, trener FROM fotky_odkazy WHERE suhlas IS NOT NULL AND suhlas_at >= ?1")
      .bind(od).all().then((x) => x.results as Record<string, unknown>[]).catch(() => []),
  ]);
  const odpovede: FotkyKlientov["odpovede"] = [];
  for (const r of odp) {
    let text = "";
    if (kluc) { try { text = await odsifruj(String(r.text), kluc); } catch { /* prázdne */ } }
    odpovede.push({ id: Number(r.id), token: String(r.token), klient: String(r.klient), kedy: String(r.vytvorene_at), trener: (r.trener as string) || null, text: text || "(text sa nedá prečítať — pozri v profile)" });
  }
  return {
    odpovede,
    suhlasy: suh.map((r) => ({ token: String(r.token), klient: String(r.klient), kedy: String(r.suhlas_at), suhlas: r.suhlas === "ano" ? "ano" : "ne", trener: (r.trener as string) || null })),
  };
}
