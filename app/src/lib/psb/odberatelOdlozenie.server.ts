import type { D1Database } from "@cloudflare/workers-types";

const uid = () => crypto.randomUUID();
const teraz = () => new Date().toISOString();

/**
 * ODLOŽENIE PREDVOLENEJ FIRMY (Jerry, 20. 10. 2026: „vymazávať si to nemusel").
 * Keď sa pri klientovi mení firma alebo IČ, doterajšia sa uloží medzi ďalšie
 * firmy (`klient_odberatelia`) — ak tam už nie je. A tá, ktorá sa práve stáva
 * predvolenou, sa spomedzi ďalších vyradí, aby nebola dvakrát.
 *
 * Volá ju Kokpit (`/api/vydane-faktury`) aj odkaz po úvodnom (`/u/`), kde
 * fakturačné údaje vypĺňa klient sám — preto žije tu a nie v jednej route.
 */
export async function odlozOdberatela(
  DB: D1Database,
  klient: string,
  bolo: Record<string, string | null> | null,
  nove: { firma: string; ico: string; dic?: string; ulica?: string; psc?: string; mesto?: string; stat?: string },
  kto: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const firma = String(bolo?.firma || "").trim(), ico = String(bolo?.ico || "").trim();
  const zmena = (firma || ico) && (firma !== String(nove.firma || "").trim() || ico !== String(nove.ico || "").trim());
  const prikazy = [];
  if (zmena) {
    // Chyba čítania = „neviem, či tam je“ → zapíše sa; najhoršie vznikne
    // dvojica tej istej firmy, nie strata.
    const uz = await DB.prepare("SELECT id FROM klient_odberatelia WHERE klient = ?1 AND firma = ?2 AND ico = ?3")
      .bind(klient, firma, ico).first().catch(() => null);
    if (!uz) {
      prikazy.push(DB.prepare(
        `INSERT INTO klient_odberatelia (id, klient, firma, ico, dic, ulica, psc, mesto, stat, created_at, autor)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
      ).bind(uid(), klient, firma, ico, String(bolo?.dic || ""), String(bolo?.ulica || ""), String(bolo?.psc || ""),
        String(bolo?.mesto || ""), String(bolo?.stat || "Česká republika"), teraz(), kto || null));
    }
  }
  prikazy.push(DB.prepare("DELETE FROM klient_odberatelia WHERE klient = ?1 AND firma = ?2 AND ico = ?3")
    .bind(klient, String(nove.firma || "").trim(), String(nove.ico || "").trim()));
  /**
   * Bez `.catch(() => null)` (21. 10. 2026): volajúci hneď potom prepíše
   * firmu a IČ v `klient_fakturacia`. Keď sa doterajšia firma neodložila,
   * prepis by ju zmazal bez stopy — presne to, čomu má táto funkcia brániť.
   * Neúspech preto zastaví celú zmenu.
   */
  try {
    await DB.batch(prikazy);
  } catch (e) {
    return {
      ok: false,
      error: `Doterajšiu firmu${firma ? ` „${firma}“` : ""} sa nepodarilo odložiť medzi ďalšie firmy, preto sa nič nezmenilo. Skús to znova. (${String(e instanceof Error ? e.message : e).slice(0, 160)})`,
    };
  }
  return { ok: true };
}
