import type { D1Database } from "@cloudflare/workers-types";

import { deriveClients } from "./compute";
import { loadData } from "./db.server";
import { audit } from "./audit.server";
import { mailHtml, mailText } from "./mailSablona";
import { SKUPINY, spocitajSkupiny, type Skupina } from "./mailSkupiny";

/**
 * MAILER: odosielanie cez Resend (Jerry, 4. 11. 2026).
 *
 * Mail odchádza VÝHRADNE po Jerryho kliknutí. Automat iba dokončí to, na čo už
 * klikol, keď sa to nevošlo do denného limitu (bezplatný plán 100 mailov denne;
 * 90 necháva rezervu na odpovede a potvrdenia, ktoré sa rátajú do toho istého).
 *
 * Neposiela sa cez websupportové SMTP, aby kampaň nikdy neohrozila faktúry.
 */

export const ZAKLAD_ODKAZOV = "https://kokpit.prosapiensbio.workers.dev";
const API = "https://api.resend.com";
const PREDVOLENY_ODOSIELATEL = "Filip Stráňavský <filip@news.prosapiens.cz>";
const PREDVOLENY_LIMIT = 90;

export type NastavenieMailera = {
  kluc: string; tajomstvoWebhooku: string; odosielatel: string; dennyLimit: number;
  darcekNazov: string; darcekUrl: string; skuskaAdresa: string;
};

export async function nastavenieMailera(DB: D1Database): Promise<NastavenieMailera> {
  const r = await DB.prepare(
    `SELECT key, value FROM vzas_settings WHERE key IN
     ('mail_resend_api_key','mail_resend_webhook_secret','mail_odosielatel','mail_denny_limit','mail_darcek','mail_skuska_adresa')`,
  ).all<{ key: string; value: string }>();
  const m = new Map((r.results || []).map((x) => {
    let v: unknown = x.value;
    try { v = JSON.parse(x.value); } catch { /* holý text */ }
    return [x.key, v] as const;
  }));
  const darcek = (m.get("mail_darcek") || {}) as { nazov?: string; url?: string };
  const limit = Number(m.get("mail_denny_limit"));
  return {
    kluc: String(m.get("mail_resend_api_key") || ""),
    tajomstvoWebhooku: String(m.get("mail_resend_webhook_secret") || ""),
    odosielatel: String(m.get("mail_odosielatel") || PREDVOLENY_ODOSIELATEL),
    dennyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : PREDVOLENY_LIMIT,
    darcekNazov: String(darcek.nazov || ""),
    darcekUrl: String(darcek.url || ""),
    skuskaAdresa: String(m.get("mail_skuska_adresa") || ""),
  };
}

export const novyToken = (predpona: string) => {
  const b = crypto.getRandomValues(new Uint8Array(15));
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return predpona + [...b].map((x) => abc[x % abc.length]).join("");
};

type MailPreResend = {
  from: string; to: string[]; subject: string; html: string; text: string; reply_to?: string;
  headers?: Record<string, string>; tags?: { name: string; value: string }[];
};

async function volaj(kluc: string, cesta: string, telo?: unknown, idempotencia?: string): Promise<{ ok: boolean; status: number; data: any; chyba: string }> {
  try {
    const r = await fetch(`${API}${cesta}`, {
      method: telo === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${kluc}`,
        "content-type": "application/json",
        ...(idempotencia ? { "idempotency-key": idempotencia } : {}),
      },
      body: telo === undefined ? undefined : JSON.stringify(telo),
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => ({})) as any;
    return { ok: r.ok, status: r.status, data, chyba: r.ok ? "" : String(data?.message || data?.name || `HTTP ${r.status}`).slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 0, data: null, chyba: `spojenie zlyhalo: ${String(e).slice(0, 200)}` };
  }
}

export const posliJedenMail = (kluc: string, mail: MailPreResend) => volaj(kluc, "/emails", mail);

/** Stav domény, aby obrazovka vedela povedať, čo ešte chýba. Kľúč musí mať plný prístup. */
export async function stavDomeny(kluc: string): Promise<{ overena: boolean; meno: string; stav: string; chyba: string }> {
  if (!kluc) return { overena: false, meno: "", stav: "", chyba: "" };
  const r = await volaj(kluc, "/domains");
  if (!r.ok) return { overena: false, meno: "", stav: "", chyba: r.chyba };
  const d = ((r.data?.data || []) as { name: string; status: string }[]).find((x) => x.name === "news.prosapiens.cz");
  return { overena: d?.status === "verified", meno: d?.name || "", stav: d?.status || "chýba", chyba: "" };
}

export async function textPrijatehoMailu(kluc: string, id: string): Promise<string> {
  const r = await volaj(kluc, `/emails/receiving/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(r.chyba);
  const text = String(r.data?.text || "");
  if (text.trim()) return text.slice(0, 8000);
  return String(r.data?.html || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

/** Odteraz sa tejto adrese nepíše. Platí aj pre klienta, ktorý v zozname ešte nebol. */
export async function zakazAdresu(DB: D1Database, email: string, stav: string, dovod: string, kedy: string) {
  const mail = email.toLowerCase();
  const u = await DB.prepare("UPDATE mail_odberatelia SET status = ?2, dovod = ?3, odhlaseny_at = ?4, updated_at = ?4 WHERE lower(email) = ?1")
    .bind(mail, stav, dovod, kedy).run();
  if (!u.meta?.changes) {
    await DB.prepare("INSERT INTO mail_odberatelia (id, email, status, dovod, odhlaseny_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5)")
      .bind(`z_${crypto.randomUUID()}`, mail, stav, dovod, kedy).run();
  }
}

const dovodSkupiny = (id: string) => SKUPINY.find((s) => s.id === id)?.dovodVMaili || "";
export const odkazOdhlasenia = (token: string) => `${ZAKLAD_ODKAZOV}/m/${token}`;

export type VydanieDb = {
  id: string; druh: string; tema: string; preco: string; predmet: string; nadpis: string; predhlavicka: string;
  telo: string; skupiny: string; stav: string; vytvorene_at: string; upravene_at: string; skuska_at: string; odoslane_at: string; autor: string;
};

export function zlozMail(v: VydanieDb, p: { token: string; email: string; meno: string; skupina: string }, odosielatel: string): MailPreResend {
  const odhl = odkazOdhlasenia(p.token);
  const vstup = {
    druh: v.druh, predmet: v.predmet, nadpis: v.nadpis, predhlavicka: v.predhlavicka, telo: v.telo,
    meno: p.meno, odhlasitUrl: odhl, dovodVMaili: dovodSkupiny(p.skupina),
  };
  return {
    from: odosielatel,
    to: [p.email],
    reply_to: /<([^>]+)>/.exec(odosielatel)?.[1] || odosielatel,
    subject: v.predmet,
    html: mailHtml(vstup),
    text: mailText(vstup),
    headers: { "List-Unsubscribe": `<${odhl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "vydanie", value: v.id.replace(/[^A-Za-z0-9_-]/g, "") }],
  };
}

/** Koľko dnes ešte smie odísť. Rátajú sa ostré, skúšobné aj potvrdzovacie maily. */
export async function zostavaDnes(DB: D1Database, limit: number, teraz = new Date()): Promise<number> {
  const od = new Date(teraz.getTime() - 86400000).toISOString();
  const a = await DB.prepare("SELECT COUNT(*) n FROM mail_prijemcovia WHERE odoslane_at >= ?1").bind(od).first<{ n: number }>();
  const b = await DB.prepare("SELECT COUNT(*) n FROM mail_odberatelia WHERE suhlas_at >= ?1").bind(od).first<{ n: number }>();
  return Math.max(0, limit - Number(a?.n || 0) - Number(b?.n || 0));
}

export type VysledokFronty = { odoslane: number; zlyhane: number; vynechane: number; zostava: number; chyba: string };

/**
 * Pošle ďalšiu dávku z toho, na čo Jerry klikol. Pred odoslaním ešte raz overí
 * odhlásenia: medzi kliknutím a druhým dňom sa mohol niekto odhlásiť.
 */
export async function posliFrontu(DB: D1Database, teraz = new Date()): Promise<VysledokFronty> {
  const vysl: VysledokFronty = { odoslane: 0, zlyhane: 0, vynechane: 0, zostava: 0, chyba: "" };
  const n = await nastavenieMailera(DB);
  const pocetCaka = async () => Number((await DB.prepare("SELECT COUNT(*) n FROM mail_prijemcovia WHERE stav = 'caka'").first<{ n: number }>())?.n || 0);
  if (!(await pocetCaka())) return vysl;
  if (!n.kluc) { vysl.zostava = await pocetCaka(); vysl.chyba = "Chýba kľúč Resendu."; return vysl; }

  const smie = Math.min(await zostavaDnes(DB, n.dennyLimit, teraz), 100);
  if (smie <= 0) { vysl.zostava = await pocetCaka(); return vysl; }

  const riadky = (await DB.prepare(
    `SELECT token, vydanie, email, meno, skupina FROM mail_prijemcovia WHERE stav = 'caka' ORDER BY rowid LIMIT ?1`,
  ).bind(smie).all<{ token: string; vydanie: string; email: string; meno: string; skupina: string }>()).results || [];
  if (!riadky.length) return vysl;

  // Jedna dávka patrí jednému vydaniu; ďalšie ide v ďalšom behu.
  const idVydania = riadky[0].vydanie;
  const v = await DB.prepare("SELECT * FROM mail_vydania WHERE id = ?1").bind(idVydania).first<VydanieDb>();
  if (!v) { vysl.chyba = `Vydanie ${idVydania} sa nenašlo.`; return vysl; }

  const zakazane = new Set(((await DB.prepare(
    "SELECT lower(email) email FROM mail_odberatelia WHERE status IN ('unsubscribed','bounced','complained')",
  ).all<{ email: string }>()).results || []).map((x) => x.email));

  const davka = riadky.filter((r) => r.vydanie === idVydania);
  const ist = davka.filter((r) => !zakazane.has(r.email.toLowerCase()));
  const vynech = davka.filter((r) => zakazane.has(r.email.toLowerCase()));
  if (vynech.length) {
    await DB.batch(vynech.map((r) => DB.prepare("UPDATE mail_prijemcovia SET stav = 'vynechany', chyba = 'odhlásený pred odoslaním' WHERE token = ?1").bind(r.token)));
    vysl.vynechane = vynech.length;
  }

  if (ist.length) {
    const r = await volaj(n.kluc, "/emails/batch", ist.map((p) => zlozMail(v, p, n.odosielatel)), `davka-${idVydania}-${ist[0].token}`);
    if (!r.ok) {
      vysl.chyba = r.chyba;
      vysl.zostava = await pocetCaka();
      await audit(DB, { action: "mail-davka-zlyhala", predmet: idVydania, neu: r.chyba, actor: "mailer" }).catch(() => {});
      return vysl;
    }
    const idcka = ((r.data?.data || []) as { id: string }[]).map((x) => x.id);
    const kedy = teraz.toISOString();
    await DB.batch([
      ...ist.map((p, i) => DB.prepare("UPDATE mail_prijemcovia SET stav = 'odoslany', resend_id = ?2, odoslane_at = ?3, chyba = '' WHERE token = ?1").bind(p.token, idcka[i] || "", kedy)),
      ...ist.map((p) => DB.prepare("UPDATE mail_odberatelia SET odoslanych = odoslanych + 1 WHERE lower(email) = ?1").bind(p.email.toLowerCase())),
    ]);
    vysl.odoslane = ist.length;
  }

  const zostatok = await DB.prepare("SELECT COUNT(*) n FROM mail_prijemcovia WHERE vydanie = ?1 AND stav = 'caka'").bind(idVydania).first<{ n: number }>();
  if (!Number(zostatok?.n || 0)) {
    await DB.prepare("UPDATE mail_vydania SET stav = 'odoslane', odoslane_at = ?2 WHERE id = ?1").bind(idVydania, teraz.toISOString()).run();
  }
  vysl.zostava = await pocetCaka();
  return vysl;
}

/** Skupiny z aktuálnych dát. Volá ich obrazovka aj odoslanie, aby sa číslo nerozišlo. */
export async function skupinyZDatabazy(DB: D1Database, teraz = new Date()): Promise<Skupina[]> {
  const data = await loadData(DB);
  const klienti = Object.values(deriveClients(data)).map((c) => ({
    name: c.name, status: c.status, sessions: c.sessions.map((s) => ({ sessionType: s.sessionType, date: s.date })),
  }));
  const vsetky = async <T,>(sql: string) => ((await DB.prepare(sql).all<T>()).results || []) as T[];
  const [odberatelia, fakturacia, leady, anamnezy, nedavne] = await Promise.all([
    vsetky<any>("SELECT email, meno, status, klient, skupiny, suhlas_at, potvrdene_at FROM mail_odberatelia"),
    vsetky<any>("SELECT klient, email FROM klient_fakturacia WHERE email <> ''"),
    vsetky<any>("SELECT email, name, druh, note, status FROM leads WHERE email <> '' AND druh <> 'kontrola'"),
    vsetky<any>("SELECT klient, suhlasy_json FROM anamnezy"),
    vsetky<any>("SELECT email, odoslane_at FROM mail_prijemcovia WHERE skuska = 0 AND odoslane_at <> ''"),
  ]);
  return spocitajSkupiny({ klienti, odberatelia, fakturacia, leady, anamnezy, nedavne, teraz });
}
