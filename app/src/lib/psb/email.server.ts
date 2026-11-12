import type { D1Database } from "@cloudflare/workers-types";

import { postavZnamych, roztried } from "./emailTriedenie";
import type { Kategoria, ZnamiLudia } from "./emailTriedenie";
import type { ImapSprava } from "./imapParse";

/**
 * KARTA EMAIL — databáza (migrácia 0139, 12. 11. 2026).
 *
 * Kokpit si pamätá len hlavičky a stav práce; obsah mailu ide zo schránky až
 * pri otvorení (`stiahniTela`). Do `email_odoslane` ide to, čo sme napísali
 * my — náš text, bez neho by konverzácia v pohľade Ľudia nedávala zmysel.
 */

export type EmailRiadok = {
  id: string; uid: number; validity: string;
  odMeno: string; odMail: string; odpovedatMail: string; komu: string;
  predmet: string; datum: string; kategoria: Kategoria; klient: string | null; dovod: string;
  stav: "nove" | "precitane" | "vybavene"; vybavil: string | null; vybaveneAt: string | null; odpovedaneAt: string | null;
};

const naRiadok = (r: Record<string, unknown>): EmailRiadok => ({
  id: String(r.id), uid: Number(r.uid), validity: String(r.validity),
  odMeno: String(r.od_meno || ""), odMail: String(r.od_mail || ""), odpovedatMail: String(r.odpovedat_mail || r.od_mail || ""),
  komu: String(r.komu || ""), predmet: String(r.predmet || ""), datum: String(r.datum || ""),
  kategoria: (r.kategoria as Kategoria) || "ostatne", klient: (r.klient as string) || null, dovod: String(r.dovod || ""),
  stav: (r.stav as EmailRiadok["stav"]) || "nove", vybavil: (r.vybavil as string) || null,
  vybaveneAt: (r.vybavene_at as string) || null, odpovedaneAt: (r.odpovedane_at as string) || null,
});

/** Dátum z hlavičky do ISO; nezrozumiteľný = čas načítania (radí sa podľa neho). */
export function datumIso(hlavicka: string, nahradny: string): string {
  const d = new Date(hlavicka);
  return isNaN(d.getTime()) ? nahradny : d.toISOString();
}

/** Kto je kto: klienti, ich e-maily a e-maily z dopytov — z tých istých tabuliek ako zvyšok appky. */
export async function znamiZDb(DB: D1Database): Promise<ZnamiLudia> {
  const q = async <T,>(sql: string): Promise<T[]> => ((await DB.prepare(sql).all().catch(() => ({ results: [] }))).results || []) as T[];
  const [ptm, fak, kont, klienti, dopyty] = await Promise.all([
    q<{ email: string; klient: string }>("SELECT email, meno klient FROM ptminder_klienti WHERE email <> ''"),
    q<{ email: string; klient: string }>("SELECT email || ' ' || dalsie_maily email, klient FROM klient_fakturacia WHERE email <> '' OR dalsie_maily <> ''"),
    q<{ email: string; klient: string }>("SELECT email, klient FROM fakturacne_kontakty WHERE email <> '' AND klient <> ''"),
    q<{ meno: string }>("SELECT DISTINCT client_name meno FROM sessions WHERE date >= date('now','-400 days') UNION SELECT meno FROM ptminder_klienti"),
    q<{ email: string; meno: string }>("SELECT email, name meno FROM leads WHERE email <> ''"),
  ]);
  return postavZnamych({ maily: [...fak, ...ptm, ...kont], klienti: klienti.map((x) => x.meno).filter(Boolean), dopyty });
}

/**
 * Uloží hlavičky prečítaných správ. Už uložená správa sa NEPREPISUJE —
 * nesie stav práce (prečítané, vybavené) a ten patrí človeku, nie behu.
 */
/**
 * PRVÉ NAČÍTANIE: maily staršie než `pred` vojdú rovno ako vybavené. Sú to
 * týždne staré veci, ktoré sa medzitým vybavili mimo Kokpitu (dopyty sú
 * v appke dávno zapísané) — ako nevybavené by kartu rozsvietili celú.
 * Vidieť sú pod „ukázať vybavené“.
 */
export const VYBAVIL_STARSIE = "staršie — pri prvom načítaní";

export async function ulozHlavicky(DB: D1Database, spravy: ImapSprava[], validity: string, n: { vlastne: string[]; ignoruj: string[] }, znami?: ZnamiLudia, starsieAkoVybavene?: string): Promise<number> {
  if (!spravy.length || !validity) return 0;
  const z = znami || (await znamiZDb(DB));
  const teraz = new Date().toISOString();
  const prikazy = spravy.map((s) => {
    const r = roztried(s, n.vlastne, n.ignoruj, z);
    const datum = datumIso(s.datum, teraz);
    return DB.prepare(
      `INSERT OR IGNORE INTO email_spravy (id, uid, validity, od_meno, od_mail, odpovedat_mail, komu, predmet, datum, kategoria, klient, dovod, stav, nacitane_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?14, ?13)`,
    ).bind(`${validity}:${s.uid}`, Number(s.uid), validity, r.odMeno, r.odMail, r.odpovedatMail, (s.komu || "").slice(0, 300),
      (s.predmet || "").slice(0, 300), datum, r.kategoria, r.klient, r.dovod.slice(0, 120), teraz,
      starsieAkoVybavene && datum < starsieAkoVybavene ? "vybavene" : "nove");
  });
  const vys = await DB.batch(prikazy);
  return vys.reduce((a, x) => a + (x.meta?.changes || 0), 0);
}

/** Staršie nové maily z prvého načítania označí za vybavené (raz, pri spustení karty). */
export async function vybavStarsie(DB: D1Database, pred: string): Promise<number> {
  const r = await DB.prepare("UPDATE email_spravy SET stav = 'vybavene', vybavene_at = ?2, vybavil = ?3 WHERE stav = 'nove' AND datum < ?1")
    .bind(pred, new Date().toISOString(), VYBAVIL_STARSIE).run();
  return r.meta?.changes || 0;
}

/** Zoznam: všetko nevybavené + vybavené za posledných `dni` dní. */
export async function zoznamEmailov(DB: D1Database, dni = 21): Promise<EmailRiadok[]> {
  const od = new Date(Date.now() - dni * 864e5).toISOString();
  const r = await DB.prepare(
    "SELECT * FROM email_spravy WHERE stav <> 'vybavene' OR datum >= ?1 ORDER BY datum DESC LIMIT 400",
  ).bind(od).all();
  return ((r.results || []) as Record<string, unknown>[]).map(naRiadok);
}

export async function emailPodlaId(DB: D1Database, id: string): Promise<EmailRiadok | null> {
  const r = await DB.prepare("SELECT * FROM email_spravy WHERE id = ?1").bind(id).first<Record<string, unknown>>();
  return r ? naRiadok(r) : null;
}

/** Zmena stavu. Prečítané sa nikdy nevráti na nové samo; vybavené vie vrátiť len človek. */
export async function nastavStav(DB: D1Database, id: string, stav: EmailRiadok["stav"], kto: string): Promise<boolean> {
  const teraz = new Date().toISOString();
  const sql = stav === "vybavene"
    ? "UPDATE email_spravy SET stav = 'vybavene', vybavene_at = ?2, vybavil = ?3, precitane_at = COALESCE(precitane_at, ?2) WHERE id = ?1"
    : stav === "precitane"
      ? "UPDATE email_spravy SET stav = CASE WHEN stav = 'nove' THEN 'precitane' ELSE stav END, precitane_at = COALESCE(precitane_at, ?2) WHERE id = ?1 AND ?3 = ?3"
      : "UPDATE email_spravy SET stav = 'precitane', vybavene_at = NULL, vybavil = NULL WHERE id = ?1 AND ?2 = ?2 AND ?3 = ?3";
  const r = await DB.prepare(sql).bind(id, teraz, kto).run();
  return (r.meta?.changes || 0) > 0;
}

/** Ručné preradenie — klient, ktorého appka nespoznala, alebo iná skupina. */
export async function preradEmail(DB: D1Database, id: string, v: { kategoria?: Kategoria; klient?: string | null }): Promise<boolean> {
  const r = await DB.prepare(
    "UPDATE email_spravy SET kategoria = COALESCE(?2, kategoria), klient = CASE WHEN ?4 = 1 THEN ?3 ELSE klient END, dovod = 'preradené ručne' WHERE id = ?1",
  ).bind(id, v.kategoria || null, v.klient ?? null, v.klient === undefined ? 0 : 1).run();
  return (r.meta?.changes || 0) > 0;
}

export async function zapisOdoslany(DB: D1Database, v: { spravaId: string | null; komu: string; klient: string | null; predmet: string; text: string; kto: string }): Promise<void> {
  const teraz = new Date().toISOString();
  await DB.batch([
    DB.prepare("INSERT INTO email_odoslane (id, sprava_id, komu, klient, predmet, text, kto, kedy) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(crypto.randomUUID(), v.spravaId, v.komu.toLowerCase(), v.klient, v.predmet.slice(0, 300), v.text.slice(0, 20000), v.kto, teraz),
    ...(v.spravaId ? [DB.prepare("UPDATE email_spravy SET odpovedane_at = ?2 WHERE id = ?1").bind(v.spravaId, teraz)] : []),
  ]);
}

/**
 * POHĽAD ĽUDIA — všetko, čo sme si s človekom vymenili, na jednej osi.
 * Prichádzajúce maily nesú len hlavičku (obsah sa doťahuje zo schránky),
 * ostatné je z Kokpitu: naše odpovede, faktúry, SMS, zmluvy.
 */
export type BublinaKonverzacie =
  | { druh: "prisiel"; kedy: string; id: string; predmet: string; uid: number; validity: string }
  | { druh: "odoslany"; kedy: string; predmet: string; text: string; kto: string }
  | { druh: "faktura"; kedy: string; cislo: string; suma: number; komu: string }
  | { druh: "sms"; kedy: string; co: string; kto: string }
  | { druh: "zmluva"; kedy: string; co: string };

export async function konverzacia(DB: D1Database, v: { mail: string; klient: string | null }): Promise<BublinaKonverzacie[]> {
  const mail = v.mail.toLowerCase();
  const k = v.klient || "\u0000";
  const q = async (sql: string, ...b: unknown[]) => ((await DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results || []) as Record<string, unknown>[];
  const [prisle, odoslane, faktury, sms, zmluvy] = await Promise.all([
    q("SELECT id, uid, validity, predmet, datum FROM email_spravy WHERE od_mail = ?1 OR klient = ?2 ORDER BY datum DESC LIMIT 60", mail, k),
    q("SELECT predmet, text, kto, kedy FROM email_odoslane WHERE komu = ?1 OR klient = ?2 ORDER BY kedy DESC LIMIT 60", mail, k),
    q("SELECT cislo, celkom_czk, odoslane_at, odoslane_komu FROM vydane_faktury WHERE klient = ?1 AND odoslane_at IS NOT NULL ORDER BY odoslane_at DESC LIMIT 30", k),
    q("SELECT action, payment_id, actor, at FROM vzas_audit WHERE action LIKE 'sms-%' AND action NOT IN ('sms-zlyhala','sms-brana-nastavena') AND payment_id LIKE ?1 ORDER BY at DESC LIMIT 40", `${k} · %`),
    q("SELECT stav, vytvorene_at, klient_at, zrusene_at FROM zmluvy WHERE klient = ?1", k),
  ]);
  const DRUH_SMS: Record<string, string> = {
    "sms-odoslana": "SMS o hodinách", "sms-uvodny": "SMS pred úvodným", "sms-ponuka": "SMS s ponukou termínov",
    "sms-faktura": "SMS s faktúrou", "sms-zmluva": "SMS so zmluvou", "sms-hromadna": "hromadná SMS", "sms-dotaznik": "SMS s dotazníkom",
  };
  const out: BublinaKonverzacie[] = [
    ...prisle.map((r) => ({ druh: "prisiel" as const, kedy: String(r.datum), id: String(r.id), predmet: String(r.predmet || ""), uid: Number(r.uid), validity: String(r.validity) })),
    ...odoslane.map((r) => ({ druh: "odoslany" as const, kedy: String(r.kedy), predmet: String(r.predmet || ""), text: String(r.text || ""), kto: String(r.kto || "") })),
    ...faktury.map((r) => ({ druh: "faktura" as const, kedy: String(r.odoslane_at), cislo: String(r.cislo), suma: Number(r.celkom_czk) || 0, komu: String(r.odoslane_komu || "") })),
    ...sms.map((r) => {
      const fa = /faktúra (\d{8})/.exec(String(r.payment_id || ""))?.[1];
      return { druh: "sms" as const, kedy: String(r.at), co: `${DRUH_SMS[String(r.action)] || "SMS"}${fa ? ` ${fa}` : ""}`, kto: String(r.actor || "") };
    }),
    ...zmluvy.flatMap((r) => [
      { druh: "zmluva" as const, kedy: String(r.vytvorene_at), co: "zmluva 6M poslaná na podpis" },
      ...(r.klient_at ? [{ druh: "zmluva" as const, kedy: String(r.klient_at), co: "zmluvu 6M podpísal(a)" }] : []),
    ]),
  ];
  return out.filter((x) => x.kedy && x.kedy !== "null").sort((a, b) => (a.kedy < b.kedy ? -1 : 1));
}
