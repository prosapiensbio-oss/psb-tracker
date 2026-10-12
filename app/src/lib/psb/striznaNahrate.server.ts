import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

import { bindings } from "../bindings.server";
import type { Nahratie, StavNahratia } from "./striznaNahrate";

/** Spoločné pre /api/strizna/nahrate a /api/strizna/nahrate/<id>/… */
export type EnvNahrate = { DB?: D1Database; STORAGE?: R2Bucket };

export function envNahrate(): EnvNahrate {
  return bindings() as EnvNahrate;
}

export const chyba = (error: string, status = 400) =>
  Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

export const ok = (data: Record<string, unknown> = {}) =>
  Response.json({ ok: true, ...data }, { headers: { "cache-control": "no-store" } });

export type RiadokNahratia = {
  id: string;
  nazov: string;
  velkost: number;
  typ: string;
  kluc: string;
  upload_id: string | null;
  stav: StavNahratia;
  kto: string;
  zacate_kedy: string;
  nahrate_kedy: string | null;
  stiahnute_kedy: string | null;
};

export function naNahratie(r: RiadokNahratia): Nahratie {
  return {
    id: r.id,
    nazov: r.nazov,
    velkost: Number(r.velkost) || 0,
    typ: r.typ,
    stav: r.stav,
    nahrateKedy: r.nahrate_kedy,
    stiahnuteKedy: r.stiahnute_kedy,
    kto: r.kto,
  };
}

export async function nacitajNahratie(DB: D1Database, id: string): Promise<RiadokNahratia | null> {
  if (!/^[a-z0-9]{8,32}$/.test(id)) return null;
  return DB.prepare("SELECT * FROM strizna_nahrate WHERE id = ?1").bind(id).first<RiadokNahratia>();
}

/** Krátke náhodné id: časť pre poradie + náhoda. Len [a-z0-9]. */
export function noveId(): string {
  const n = crypto.getRandomValues(new Uint8Array(8));
  return Date.now().toString(36) + [...n].map((b) => (b % 36).toString(36)).join("");
}
