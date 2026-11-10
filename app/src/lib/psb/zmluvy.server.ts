import type { D1Database } from "@cloudflare/workers-types";

import { novyToken } from "./anamneza.server";
import { AKTUALNA_VERZIA, jePodpis, odtlacokZnenia, znenie } from "./zmluva6m";

/**
 * ZMLUVY 6M — databáza (migrácia 0138).
 *
 * Postup ako v DocuSeal: najprv podpíše poskytovateľ (v Kokpite, prstom alebo
 * perom), tým vznikne odkaz `/z/<token>`; klient na ňom odklikne pravidlá
 * a podpíše. Podpísaním sa klientovi zapne `contract_signed` — tá istá značka,
 * ktorú doteraz Jerry odškrtával ručne a z ktorej žije pripomienka
 * „nemá podpísanú zmluvu".
 */

export type ZmluvaRiadok = {
  id: string; klient: string; token: string; stav: "caka" | "podpisana" | "zrusena"; verzia: string; zdroj: string;
  poskytovatel_podpis: string; poskytovatel_at: string; autor: string | null;
  klient_meno: string | null; klient_podpis: string | null; klient_suhlasy_json: string | null;
  klient_at: string | null; klient_ip: string | null; klient_ua: string | null; odtlacok: string | null;
  otvorene_at: string | null; zrusene_at: string | null; vytvorene_at: string;
};

/** Riadok pre zoznam — bez podpisov (tie majú desiatky kB). */
export type ZmluvaZoznam = {
  id: string; klient: string; token: string; stav: ZmluvaRiadok["stav"]; verzia: string; zdroj: string;
  autor: string | null; vytvorene: string; otvorene: string | null; podpisane: string | null; zrusene: string | null;
  /** E-mail klienta z fakturačných údajov — predvyplní „Poslať mailom“. */
  email: string | null;
};

const BEZ_PODPISOV = "z.id, z.klient, z.token, z.stav, z.verzia, z.zdroj, z.autor, z.vytvorene_at, z.otvorene_at, z.klient_at, z.zrusene_at, f.email";

const naZoznam = (r: Record<string, unknown>): ZmluvaZoznam => ({
  id: String(r.id), klient: String(r.klient), token: String(r.token), stav: r.stav as ZmluvaRiadok["stav"],
  verzia: String(r.verzia), zdroj: String(r.zdroj || "kokpit"), autor: (r.autor as string) || null, vytvorene: String(r.vytvorene_at),
  otvorene: (r.otvorene_at as string) || null, podpisane: (r.klient_at as string) || null, zrusene: (r.zrusene_at as string) || null,
  email: (r.email as string) || null,
});

export async function zoznamZmluv(DB: D1Database): Promise<ZmluvaZoznam[]> {
  const r = await DB.prepare(`SELECT ${BEZ_PODPISOV} FROM zmluvy z LEFT JOIN klient_fakturacia f ON f.klient = z.klient ORDER BY z.vytvorene_at DESC`).all();
  return ((r.results || []) as Record<string, unknown>[]).map(naZoznam);
}

export async function podlaTokenu(DB: D1Database, token: string): Promise<ZmluvaRiadok | null> {
  return (await DB.prepare("SELECT * FROM zmluvy WHERE token = ?1").bind(token).first<ZmluvaRiadok>()) || null;
}

/** Posledný podpis toho istého poskytovateľa — tlačidlo „použiť minulý podpis“. */
export async function poslednyPodpis(DB: D1Database, autor: string): Promise<string | null> {
  const r = await DB.prepare("SELECT poskytovatel_podpis p FROM zmluvy WHERE autor = ?1 ORDER BY vytvorene_at DESC LIMIT 1")
    .bind(autor).first<{ p: string }>();
  return r?.p || null;
}

/**
 * Nová zmluva na podpis. Otvorená zmluva toho istého klienta sa zruší —
 * platí vždy posledný odkaz, inak by klient mohol podpísať starý a nový
 * by visel v zozname ako nepodpísaný.
 */
export async function vytvorZmluvu(DB: D1Database, v: { klient: string; podpis: string; autor: string }): Promise<{ ok: true; token: string; id: string } | { ok: false; error: string }> {
  if (!v.klient) return { ok: false, error: "Chýba klient." };
  if (!jePodpis(v.podpis)) return { ok: false, error: "Chýba podpis alebo je príliš veľký." };
  const teraz = new Date().toISOString();
  const id = crypto.randomUUID();
  const token = novyToken(14);
  await DB.batch([
    DB.prepare("UPDATE zmluvy SET stav = 'zrusena', zrusene_at = ?2 WHERE klient = ?1 AND stav = 'caka'").bind(v.klient, teraz),
    DB.prepare(
      `INSERT INTO zmluvy (id, klient, token, stav, verzia, poskytovatel_podpis, poskytovatel_at, autor, vytvorene_at)
       VALUES (?1, ?2, ?3, 'caka', ?4, ?5, ?6, ?7, ?6)`,
    ).bind(id, v.klient, token, AKTUALNA_VERZIA, v.podpis, teraz, v.autor || null),
  ]);
  return { ok: true, token, id };
}

export async function zrusZmluvu(DB: D1Database, id: string): Promise<boolean> {
  const r = await DB.prepare("UPDATE zmluvy SET stav = 'zrusena', zrusene_at = ?2 WHERE id = ?1 AND stav = 'caka'")
    .bind(id, new Date().toISOString()).run();
  return (r.meta?.changes || 0) > 0;
}

export async function oznacOtvorenie(DB: D1Database, token: string): Promise<void> {
  await DB.prepare("UPDATE zmluvy SET otvorene_at = COALESCE(otvorene_at, ?2) WHERE token = ?1")
    .bind(token, new Date().toISOString()).run().catch(() => undefined);
}

export type VysledokPodpisu = { ok: true } | { ok: false; error: string };

/**
 * PODPIS KLIENTA. Server overuje to isté, čo stránka (všetky pravidlá,
 * podpis, meno) — stránka sa dá obísť, databáza nie. `WHERE stav = 'caka'`
 * zaručí, že sa podpísaná zmluva nedá prepísať druhým odoslaním.
 */
export async function podpisKlienta(
  DB: D1Database,
  z: ZmluvaRiadok,
  vstup: { meno: string; podpis: string; tahy: number; zaskrtnute: Set<string>; ip: string; ua: string },
): Promise<VysledokPodpisu> {
  if (z.stav !== "caka") return { ok: false, error: z.stav === "podpisana" ? "Smlouva už je podepsaná." : "Tento odkaz už neplatí." };
  const zn = znenie(z.verzia);
  if (!zn) return { ok: false, error: "Znění smlouvy se nenašlo." };
  const chybaju = zn.pravidla.filter((p) => !vstup.zaskrtnute.has(p.id));
  if (chybaju.length) return { ok: false, error: `Odsouhlas prosím všechna pravidla (chybí: ${chybaju.map((p) => p.nazov).join(", ")}).` };
  const meno = vstup.meno.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!meno) return { ok: false, error: "Doplň prosím jméno a příjmení." };
  if (!(vstup.tahy > 0) || !jePodpis(vstup.podpis)) return { ok: false, error: "Chybí podpis — podepiš se prstem nebo perem do rámečku." };
  const teraz = new Date().toISOString();
  const suhlasy = zn.pravidla.map((p) => ({ id: p.id, nazov: p.nazov, text: p.text, odsuhlasene: teraz }));
  const r = await DB.prepare(
    `UPDATE zmluvy SET stav = 'podpisana', klient_meno = ?2, klient_podpis = ?3, klient_suhlasy_json = ?4,
            klient_at = ?5, klient_ip = ?6, klient_ua = ?7, odtlacok = ?8, otvorene_at = COALESCE(otvorene_at, ?5)
      WHERE id = ?1 AND stav = 'caka'`,
  ).bind(z.id, meno, vstup.podpis, JSON.stringify(suhlasy), teraz, vstup.ip.slice(0, 64), vstup.ua.slice(0, 300), await odtlacokZnenia(zn)).run();
  if (!(r.meta?.changes || 0)) return { ok: false, error: "Smlouva už je podepsaná nebo zrušená." };
  return { ok: true };
}

/** Podpísané za posledných N dní — pre notifikáciu „podpísal(a) zmluvu“. */
export async function nedavnoPodpisane(DB: D1Database, dni = 21): Promise<{ id: string; klient: string; at: string }[]> {
  const od = new Date(Date.now() - dni * 86400_000).toISOString();
  const r = await DB.prepare("SELECT id, klient, klient_at FROM zmluvy WHERE stav = 'podpisana' AND klient_at >= ?1").bind(od).all();
  return ((r.results || []) as { id: string; klient: string; klient_at: string }[]).map((x) => ({ id: x.id, klient: x.klient, at: x.klient_at }));
}

/** PDF zmluvy prevzatej z DocuSeal — poskladané z kúskov, alebo `null`. */
export async function pdfZmluvy(DB: D1Database, id: string): Promise<Uint8Array | null> {
  const r = await DB.prepare("SELECT data FROM zmluvy_pdf WHERE zmluva_id = ?1 ORDER BY poradie").bind(id).all<{ data: string }>();
  const b64 = (r.results || []).map((x) => x.data).join("");
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function zmluvaPodlaId(DB: D1Database, id: string): Promise<ZmluvaRiadok | null> {
  return (await DB.prepare("SELECT * FROM zmluvy WHERE id = ?1").bind(id).first<ZmluvaRiadok>()) || null;
}
