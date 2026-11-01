import type { D1Database } from "@cloudflare/workers-types";

/**
 * Limit pokusov o prihlásenie. Dva počty v jednom okne:
 *   IP + meno → 10 (hádanie hesla jedného konta)
 *   IP samotná → 30 (menením mena by sa limit obišiel)
 *
 * V tabuľke je len hash kľúča: do poľa s menom sa občas omylom napíše heslo.
 * Každá chyba databázy tu znamená „neblokuj" — výpadok limitu nesmie nikoho
 * vymknúť z vlastnej appky.
 */
export const LIMIT_MENO = 10;
export const LIMIT_IP = 30;
export const OKNO_MS = 15 * 60_000;

const hash = async (s: string) => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const kluce = async (ip: string, login: string) => ({ meno: await hash(`${ip}|${login}`), ip: await hash(`${ip}|*`) });

/** Koľko milisekúnd ešte čakať; 0 = neblokované. */
export async function zostavaBlok(DB: D1Database | undefined, ip: string, login: string, teraz = Date.now()): Promise<number> {
  if (!DB) return 0;
  try {
    const k = await kluce(ip, login);
    const rs = await DB.prepare("SELECT kluc, pocet, prve_at FROM login_pokusy WHERE kluc IN (?1, ?2)").bind(k.meno, k.ip).all();
    let zostava = 0;
    for (const r of (rs.results || []) as { kluc: string; pocet: number; prve_at: string }[]) {
      const limit = r.kluc === k.ip ? LIMIT_IP : LIMIT_MENO;
      const koniec = Date.parse(r.prve_at) + OKNO_MS;
      if (r.pocet >= limit && koniec > teraz) zostava = Math.max(zostava, koniec - teraz);
    }
    return zostava;
  } catch {
    return 0;
  }
}

export async function zapisZlyhanie(DB: D1Database | undefined, ip: string, login: string, teraz = Date.now()): Promise<void> {
  if (!DB) return;
  try {
    const k = await kluce(ip, login);
    const nowIso = new Date(teraz).toISOString();
    const hranica = new Date(teraz - OKNO_MS).toISOString();
    const zapis = `INSERT INTO login_pokusy (kluc, pocet, prve_at) VALUES (?1, 1, ?2)
      ON CONFLICT(kluc) DO UPDATE SET
        pocet = CASE WHEN prve_at < ?3 THEN 1 ELSE pocet + 1 END,
        prve_at = CASE WHEN prve_at < ?3 THEN ?2 ELSE prve_at END`;
    await DB.batch([
      DB.prepare(zapis).bind(k.meno, nowIso, hranica),
      DB.prepare(zapis).bind(k.ip, nowIso, hranica),
      DB.prepare("DELETE FROM login_pokusy WHERE prve_at < ?1").bind(new Date(teraz - 24 * 3600_000).toISOString()),
    ]);
  } catch {
    /* tabuľka ešte nie je — limit neplatí, prihlásenie áno */
  }
}

/** Po úspechu sa maže len počet pre meno; počet za IP dobehne sám. */
export async function vymazPokusy(DB: D1Database | undefined, ip: string, login: string): Promise<void> {
  if (!DB) return;
  try {
    await DB.prepare("DELETE FROM login_pokusy WHERE kluc = ?1").bind((await kluce(ip, login)).meno).run();
  } catch {
    /* viď vyššie */
  }
}
