/**
 * TAJOMSTVÁ VO `vzas_settings` — jediný zoznam.
 *
 * Tabuľka drží vedľa seba ciele, cenník aj heslo k pošte a kľúč k SMS bráne.
 * `GET /api/vzas-settings` do novembra 2026 vracal všetko každému prihlásenému,
 * `POST` zapisoval starú aj novú hodnotu čitateľne do `vzas_audit`, záloha
 * a Jarvis (`dopyt_db`) videli to isté. Server si tajomstvá číta priamo z D1
 * a prehliadač ich nikdy nepotreboval — okrem jedného miesta v Údajoch, ktoré
 * dnes ukáže len „nastavené".
 *
 * Kľúč v tomto zozname: hodnota neopustí server, do auditu ide `[skryté]`.
 * Nové tajomstvo patrí sem. Keby naň niekto zabudol, chytí ho `VZORY_TAJNYCH`
 * podľa mena — radšej skryť navyše než poslať von.
 */
export const TAJNE_KLUCE = [
  "gads_dev_token",
  "google_sa",
  "mail_heslo",
  "mailer_token",
  "meta_capi_token",
  "meta_token",
  "metricool_klient",
  "metricool_pkce",
  "metricool_token",
  "psi_api_key",
  "sms_kluc",
  "vapid_private",
  "web_lead_secret",
] as const;

/** Časti mena, ktoré samy osebe znamenajú tajomstvo. Bez SQL zástupných znakov. */
export const VZORY_TAJNYCH = ["token", "heslo", "secret", "private", "_kluc", "api_key", "pkce"] as const;

export const SKRYTE = "[skryté]";

const MNOZINA = new Set<string>(TAJNE_KLUCE);

export function jeTajnyKluc(kluc: unknown): boolean {
  if (typeof kluc !== "string") return false;
  // Kľúče nastavení sú vždy malými písmenami bez medzier. Predmet auditu môže
  // byť aj meno klienta — to tajomstvo nikdy nie je.
  if (!/^[a-z0-9_]+$/.test(kluc)) return false;
  return MNOZINA.has(kluc) || VZORY_TAJNYCH.some((v) => kluc.includes(v));
}

/**
 * Odpoveď `GET /api/vzas-settings`: netajné hodnoty a pri tajných len áno/nie.
 * `nastavene` má vždy všetky kľúče zo zoznamu, aby `false` znamenalo „nie je",
 * nie „nevieme".
 */
export function rozdelNastavenia(riadky: { key: string; value: string }[]): {
  settings: Record<string, unknown>;
  nastavene: Record<string, boolean>;
} {
  const settings: Record<string, unknown> = {};
  const nastavene: Record<string, boolean> = {};
  for (const k of TAJNE_KLUCE) nastavene[k] = false;
  for (const r of riadky) {
    let hodnota: unknown;
    try { hodnota = JSON.parse(r.value); } catch { hodnota = r.value; }
    if (jeTajnyKluc(r.key)) nastavene[r.key] = hodnota !== null && hodnota !== "";
    else settings[r.key] = hodnota;
  }
  return { settings, nastavene };
}

/** Hodnota do auditu: pri tajnom predmete len fakt, že niečo bolo. */
export function hodnotaDoAuditu<T>(predmet: unknown, hodnota: T): T | string {
  if (hodnota === undefined || hodnota === null) return hodnota;
  return jeTajnyKluc(predmet) ? SKRYTE : hodnota;
}

/** Riadok `vzas_audit` pred odoslaním von (záloha, zoznam v Uzávierkach). */
export function maskujAuditRiadok<T extends { payment_id?: unknown; old_value?: unknown; new_value?: unknown }>(r: T): T {
  if (!jeTajnyKluc(r.payment_id)) return r;
  return { ...r, old_value: hodnotaDoAuditu(r.payment_id, r.old_value), new_value: hodnotaDoAuditu(r.payment_id, r.new_value) };
}
