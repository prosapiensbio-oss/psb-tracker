import type { D1Database } from "@cloudflare/workers-types";

// Audit log a zamykanie období.
//
// Doteraz sa dalo v appke zmeniť čokoľvek a nezostala po tom stopa. Pri
// tréningových dátach to bolo únosné — dajú sa znova nahrať z PTmindera. Pri
// peniazoch z banky to únosné nie je: keď sa raz uzavretý mesiac ticho prepíše
// importom, nikto to nezistí a čísla vo VZAS prestanú zodpovedať tomu, čo bolo
// odovzdané účtovníčke.
//
// Preto dve veci, ktoré musia byť skôr než Fio:
//   • KAŽDÝ zápis nechá riadok — čo sa zmenilo, z čoho na čo a kedy.
//   • UZAVRETÝ MESIAC sa nedá prepísať. Nie varovaním, ale odmietnutím.
//
// Zámok je zámerne na mesiac, nie na tabuľku: účtovné obdobie je mesiac a
// uzávierka je prvý víkend nasledujúceho (viď prevadzka.md).

const uid = () => crypto.randomUUID();

export type AuditZapis = {
  /** Čo sa dialo — krátky strojový názov, napr. "override", "import", "zamok". */
  action: string;
  /** Koho/čoho sa to týka (meno klienta, kľúč nastavenia, názov súboru). */
  predmet?: string;
  /** Mesiac, ktorého sa zmena týka — kvôli zámkom. */
  month?: string | null;
  old?: unknown;
  neu?: unknown;
  reason?: string;
  actor?: string;
};

/** Zapíše riadok do auditu. Nikdy nezhodí volajúceho — log nesmie brániť práci. */
export async function audit(DB: D1Database | undefined, z: AuditZapis): Promise<void> {
  if (!DB) return;
  const skrat = (v: unknown) => {
    if (v === undefined || v === null) return null;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  };
  try {
    await DB.prepare(
      `INSERT INTO vzas_audit (id, at, actor, action, payment_id, month, old_value, new_value, reason)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
      .bind(uid(), new Date().toISOString(), z.actor || "app", z.action, z.predmet || null,
        z.month || null, skrat(z.old), skrat(z.neu), z.reason || null)
      .run();
  } catch {
    /* audit nesmie zhodiť zápis, ktorý loguje */
  }
}

/** Množina uzamknutých mesiacov ("YYYY-MM"). */
export async function zamknuteMesiace(DB: D1Database | undefined): Promise<Set<string>> {
  if (!DB) return new Set();
  try {
    const rs = await DB.prepare("SELECT month FROM vzas_periods WHERE locked = 1").all();
    return new Set((rs.results as { month: string }[]).map((r) => r.month));
  } catch {
    return new Set();
  }
}

/** True, ak mesiac patrí do uzavretého obdobia. */
export function jeZamknuty(zamky: Set<string>, isoDatum: string | null | undefined): boolean {
  if (!isoDatum) return false;
  return zamky.has(String(isoDatum).slice(0, 7));
}
