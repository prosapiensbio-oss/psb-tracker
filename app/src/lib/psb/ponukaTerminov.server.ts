import type { D1Database } from "@cloudflare/workers-types";

import { posli as posliPush, type Odber } from "./push.server";
import { jeTichyCas } from "./tichyCas";
import { vybranyUsek, type CasPonuky, type Obsadene } from "./ponukaTerminov";

/**
 * PONUKA TERMÍNOV — čo potrebuje server (API pre Kokpit aj stránka /t/).
 * Čisté pravidlá sú v `ponukaTerminov.ts`.
 */

export type RiadokPonuky = {
  token: string; klient: string; telefon: string | null; typ: string; plati_do: string;
  vybrany_id: string | null; vybrane_at: string | null; udalost_uid: string | null;
  /** Začiatok zvolený v rozmedzí (migrácia 0110); NULL = celý ponúknutý čas. */
  vybrany_zaciatok?: string | null;
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
 *
 * CHYBA DOPYTU IDE VON. Prázdny výsledok by tu znamenal „všetko voľné" —
 * klient by si vybral obsadený čas. Volajúci povie „skúste neskôr".
 */
export async function obsadeneVOkne(DB: D1Database, od: string, doDna: string, okremTokenu = ""): Promise<Obsadene[]> {
  const [udalosti, vybrane] = await Promise.all([
    DB.prepare(
      `SELECT trener, zaciatok, COALESCE(koniec, zaciatok) AS koniec FROM kal_udalosti
        WHERE zmizla_at IS NULL AND zaciatok >= ?1 AND zaciatok < ?2`,
    ).bind(od, doDna).all().then((x) => (x.results || []) as unknown as Obsadene[]),
    // Vybraté v rozmedzí obsadí len zvolenú hodinu, nie celé rozmedzie.
    DB.prepare(
      `SELECT c.id, c.trener, c.zaciatok, c.koniec, p.vybrany_zaciatok FROM ponuky_terminov p
         JOIN ponuky_terminov_casy c ON c.id = p.vybrany_id
        WHERE p.token != ?1 AND c.zaciatok >= ?2 AND c.zaciatok < ?3`,
    ).bind(okremTokenu, od, doDna).all()
      .then((x) => ((x.results || []) as unknown as (CasPonuky & { vybrany_zaciatok: string | null })[])
        .map((r) => vybranyUsek(r, r.vybrany_zaciatok)) as Obsadene[]),
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

type ObsahPushu = { titulok: string; text: string; url?: string; znacka?: string };

/**
 * Čo odišlo v nočnom tichu a nie je v registri, odkiaľ by to ráno poslal
 * `push-beh`: výber termínu (je rovno v kalendári, na nič nečaká) a žiadosť
 * o históriu. Riadok v `vzas_settings`, zoznam v JSON.
 */
const KLUC_ODLOZENE = "push_odlozene";

/**
 * Notifikácia trénerovi na telefón (ticho zlyhá — výber termínu sa kvôli nej nesmie stratiť).
 *
 * Klient klikne aj o polnoci a telefón by zazvonil (rozbor, 1. 11. 2026). V tichu
 * (`tichyCas.ts`) sa preto odloží a odíde prvým denným behom `push-beh`.
 */
export async function pushTrenerovi(DB: D1Database, trener: string, obsah: ObsahPushu, teraz: Date = new Date()): Promise<void> {
  try {
    if (jeTichyCas(teraz)) {
      // json_insert v jednom príkaze: dvaja klienti naraz sa neprepíšu.
      await DB.prepare(
        `INSERT INTO vzas_settings (key, value) VALUES (?1, json_array(json(?2)))
         ON CONFLICT(key) DO UPDATE SET value = json_insert(value, '$[#]', json(?2))`,
      ).bind(KLUC_ODLOZENE, JSON.stringify({ trener, obsah })).run();
      return;
    }
    await posliHned(DB, trener, obsah);
  } catch (e) { console.error("push trénerovi:", e); /* push nie je podmienka */ }
}

/**
 * Pošle, čo čakalo na koniec ticha; volá `push-beh` po nočnej kontrole. Zo zoznamu
 * sa maže až po odoslaní a len ak sa medzitým nezmenil: radšej raz navyše (rovnaká
 * značka notifikáciu na telefóne len nahradí) než stratiť. Vráti počet.
 */
export async function rozosliOdlozene(DB: D1Database): Promise<number> {
  try {
    const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(KLUC_ODLOZENE).first<{ value: string }>();
    if (!r?.value) return 0;
    const zoznam = JSON.parse(r.value) as { trener: string; obsah: ObsahPushu }[];
    for (const p of zoznam) await posliHned(DB, p.trener, p.obsah);
    await DB.prepare("DELETE FROM vzas_settings WHERE key = ?1 AND value = ?2").bind(KLUC_ODLOZENE, r.value).run();
    return zoznam.length;
  } catch (e) {
    console.error("odložené notifikácie:", e);
    return 0;
  }
}

async function posliHned(DB: D1Database, trener: string, obsah: ObsahPushu): Promise<void> {
  const nast = (await DB.prepare("SELECT key, value FROM vzas_settings WHERE key IN ('vapid_public','vapid_private')").all()).results as { key: string; value: string }[];
  const m = Object.fromEntries(nast.map((r) => [r.key, String(r.value || "")]));
  if (!m.vapid_public || !m.vapid_private) return;
  const kluce = { verejny: m.vapid_public, sukromny: m.vapid_private, kontakt: "mailto:prosapiensbio@gmail.com" };
  const odbery = (await DB.prepare("SELECT endpoint, p256dh, auth, kto FROM push_odbery").all()).results as unknown as (Odber & { kto: string })[];
  for (const o of odbery) {
    if ((o.kto || "").trim().toLowerCase() !== trener.trim().toLowerCase()) continue;
    await posliPush(o, obsah, kluce);
  }
}
