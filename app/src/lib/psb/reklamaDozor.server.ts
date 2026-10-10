import type { D1Database } from "@cloudflare/workers-types";

import { posunDen, dnesPraha } from "./cas";
import type { DozorData, DozorKampan, Vyhodnotenie } from "./reklamaDozor";

const json = <T>(s: unknown, inak: T): T => {
  try { return JSON.parse(String(s ?? "")) as T; } catch { return inak; }
};
const cisloNastavenia = (s: unknown): number | null => {
  const v = Number(String(json<string>(s, String(s ?? ""))).replace(/"/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * Dozor reklám pre `loadData` — bežiace kampane, dni za 60 dní, rozhodnutia.
 *
 * Keď tabuľky ešte nie sú (migrácia 0109), vráti `undefined` a register
 * o reklame mlčí — nie spadne celé `/api/data`.
 */
export async function nacitajDozor(DB: D1Database): Promise<DozorData | undefined> {
  try {
    const od = posunDen(dnesPraha(), -62);
    const [k, d, v, s] = await Promise.all([
      DB.prepare("SELECT * FROM reklama_dozor").all(),
      DB.prepare("SELECT kampan_id, den, spend, kliky, na_stranke FROM reklama_dni WHERE den >= ?1").bind(od).all(),
      DB.prepare("SELECT * FROM reklama_vyhodnotenia ORDER BY kedy DESC LIMIT 200").all(),
      DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('reklama_strop_mesiac','reklama_ciel_dopyt','reklama_dozor_at')").all(),
    ]);
    const nast: Record<string, unknown> = {};
    for (const r of s.results as { key: string; value: string }[]) nast[r.key] = r.value;
    return {
      kampane: (k.results as Record<string, unknown>[]).map((r): DozorKampan => ({
        id: String(r.kampan_id), nazov: String(r.nazov || ""), ciel: String(r.ciel || ""), stav: String(r.stav || ""),
        zaciatok: String(r.zaciatok || ""), dennyRozpocet: r.denny_rozpocet == null ? null : Number(r.denny_rozpocet),
        sady: json(r.sady, []), problemy: json(r.problemy, []), updatedAt: String(r.updated_at || ""),
      })),
      dni: (d.results as Record<string, unknown>[]).map((r) => ({
        kampanId: String(r.kampan_id), den: String(r.den), spend: Number(r.spend) || 0, kliky: Number(r.kliky) || 0, naStranke: Number(r.na_stranke) || 0,
      })),
      vyhodnotenia: (v.results as Record<string, unknown>[]).map((r): Vyhodnotenie => ({
        kampanId: String(r.kampan_id), kedy: String(r.kedy), rozhodnutie: String(r.rozhodnutie) as Vyhodnotenie["rozhodnutie"],
        minuteKc: r.minute_kc == null ? null : Number(r.minute_kc), dopyty: r.dopyty == null ? null : Number(r.dopyty),
        dm: r.dm == null ? null : Number(r.dm), rozpocetPo: r.rozpocet_po == null ? null : Number(r.rozpocet_po), poznamka: String(r.poznamka || ""),
      })),
      nastavenie: { stropMesiac: cisloNastavenia(nast.reklama_strop_mesiac), cielDopyt: cisloNastavenia(nast.reklama_ciel_dopyt) },
      aktualizovane: String(json<string>(nast.reklama_dozor_at, String(nast.reklama_dozor_at || ""))),
    };
  } catch {
    return undefined;
  }
}
