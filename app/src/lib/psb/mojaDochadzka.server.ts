import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "./audit.server";
import { btcVyplatySurove } from "./btcVyplaty.server";
import { citajDochadzku, KLUC_DOCHADZKY, navrhyNakupov, platiSaJosemu, type Aktivita, type DataDochadzky, type UdalostDochadzky } from "./mojaDochadzka";

export async function nacitajDochadzku(DB: D1Database): Promise<DataDochadzky> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(KLUC_DOCHADZKY).first<{ value: string }>().catch(() => null);
  return citajDochadzku(r?.value);
}

export async function ulozDochadzku(DB: D1Database, d: DataDochadzky): Promise<void> {
  await DB.prepare("INSERT INTO vzas_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(KLUC_DOCHADZKY, JSON.stringify(d)).run();
}

/** Všetky udalosti, ktoré niektorá aktivita ráta — celá história, nie okno kalendára. */
export async function udalostiDochadzky(DB: D1Database, aktivity: Aktivita[]): Promise<UdalostDochadzky[]> {
  if (!aktivity.length) return [];
  const nazvy = [...new Set(aktivity.flatMap((a) => a.nazvy.map((n) => n.trim().toLowerCase())).filter(Boolean))].slice(0, 40);
  const guillermo = aktivity.some((a) => a.guillermo);
  const serie = [...new Set(aktivity.flatMap((a) => a.serie || []).map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]{8,}$/.test(x)))].slice(0, 10);
  const podmienky = [
    ...(nazvy.length ? [`lower(nazov) IN (${nazvy.map((_, i) => `?${i + 1}`).join(",")})`] : []),
    ...(guillermo ? ["typ = 'guillermo'"] : []),
    ...serie.map((_, i) => `uid LIKE ?${nazvy.length + i + 1} || '%'`),
  ];
  if (!podmienky.length) return [];
  const r = await DB.prepare(
    `SELECT uid, trener, zaciatok, koniec, nazov, typ FROM kal_udalosti WHERE zmizla_at IS NULL AND (${podmienky.join(" OR ")}) ORDER BY zaciatok`,
  ).bind(...nazvy, ...serie).all<UdalostDochadzky>();
  return r.results || [];
}

/**
 * Čo sa dá sledovať: súkromné udalosti v kalendári toho človeka, ktoré sa
 * opakujú (aspoň 3× za 4 mesiace), a Guillermo, keď ho v kalendári má.
 */
export async function kandidatiDochadzky(DB: D1Database, kto: string): Promise<{ nazov: string; pocet: number; guillermo: boolean }[]> {
  const r = await DB.prepare(
    `SELECT CASE WHEN typ = 'guillermo' THEN 'Guillermo' ELSE nazov END n, typ = 'guillermo' g, COUNT(*) pocet
       FROM kal_udalosti
      WHERE trener = ?1 AND zmizla_at IS NULL AND typ IN ('sukromne', 'guillermo') AND zaciatok >= date('now', '-120 days') AND nazov IS NOT NULL
      GROUP BY n, g HAVING COUNT(*) >= 3 ORDER BY pocet DESC LIMIT 8`,
  ).bind(kto).all<{ n: string; g: number; pocet: number }>().catch(() => ({ results: [] as { n: string; g: number; pocet: number }[] }));
  const out = (r.results || []).map((x) => ({ nazov: x.n, pocet: x.pocet, guillermo: !!x.g }));
  // Guillermo patrí tomu, kto má nákupy na starej karte (ucastnik), aj keď sú
  // sedenia v cudzom kalendári.
  if (!out.some((x) => x.guillermo)) {
    const g = await DB.prepare("SELECT (SELECT COUNT(*) FROM guillermo_hodiny WHERE ucastnik = ?1) moje, (SELECT COUNT(*) FROM kal_udalosti WHERE typ = 'guillermo' AND zmizla_at IS NULL) pocet")
      .bind(kto).first<{ moje: number; pocet: number }>().catch(() => null);
    if (g && Number(g.moje) > 0) out.unshift({ nazov: "Guillermo", pocet: Number(g.pocet) || 0, guillermo: true });
  }
  return out;
}

/**
 * Pri pridaní Guillerma sa prevezme stará karta: posledná kotva (zostatok
 * k dňu) ako prvá platba a nákupy po nej. Suma pri kotve je súčet nákupov
 * do nej — aby zošit povedal, koľko to stálo.
 */
export async function prevzatieGuillerma(DB: D1Database, kto: string): Promise<{ datum: string; hodiny: number; sumaKc: number | null; poznamka: string }[]> {
  const r = await DB.prepare("SELECT datum, druh, hodiny, suma_czk FROM guillermo_hodiny WHERE ucastnik = ?1 OR ucastnik IS NULL ORDER BY datum")
    .bind(kto).all<{ datum: string; druh: string; hodiny: number; suma_czk: number | null }>().catch(() => ({ results: [] }));
  const z = r.results || [];
  const kotva = z.filter((x) => x.druh === "zostatok").pop();
  const od = kotva?.datum || "";
  const out: { datum: string; hodiny: number; sumaKc: number | null; poznamka: string }[] = [];
  if (kotva) {
    const suma = z.filter((x) => x.druh === "nakup" && x.datum <= od).reduce((s, x) => s + (Number(x.suma_czk) || 0), 0);
    out.push({ datum: od, hodiny: Number(kotva.hodiny) || 0, sumaKc: suma || null, poznamka: "prevzaté zo starej karty Guillermo" });
  }
  for (const x of z.filter((y) => y.druh === "nakup" && y.datum > od)) {
    out.push({ datum: x.datum, hodiny: Number(x.hodiny) || 0, sumaKc: x.suma_czk ?? null, poznamka: "prevzaté zo starej karty Guillermo" });
  }
  return out.filter((x) => x.hodiny > 0);
}

/**
 * Cena 1 BTC v Kč aj v € — aby karta vedela povedať, koľko satoshi poslať
 * (Guillermo 65 €/h, platí sa na josefp@blink.sv). Coinbase (ten istý zdroj
 * ako `kurzBtc`), schovaný na 10 minút. Bez kurzu karta sats nepíše.
 */
export async function kurzBtcMeny(DB: D1Database): Promise<{ czk: number; eur: number; kedy: string } | null> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = 'btc_kurz_meny'").first<{ value: string }>().catch(() => null);
  try {
    const k = r?.value ? (JSON.parse(r.value) as { czk: number; eur: number; kedy: string }) : null;
    if (k && k.czk > 0 && k.eur > 0 && Date.now() - Date.parse(k.kedy) < 10 * 60_000) return k;
  } catch { /* prepíše sa */ }
  try {
    const res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=BTC", { headers: { accept: "application/json", "user-agent": "Kokpit/1.0 (ProSapiens Biomechanic)" } });
    const j = (await res.json().catch(() => null)) as { data?: { rates?: Record<string, string> } } | null;
    const czk = Number(j?.data?.rates?.CZK) || 0, eur = Number(j?.data?.rates?.EUR) || 0;
    if (!(czk > 0 && eur > 0)) return null;
    const k = { czk, eur, kedy: new Date().toISOString() };
    await DB.prepare("INSERT INTO vzas_settings (key, value) VALUES ('btc_kurz_meny', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(JSON.stringify(k)).run().catch(() => null);
    return k;
  } catch {
    return null;
  }
}

/**
 * Doplní platby, ktoré prišli z Fio a z bitcoinovej knihy (15. 11. 2026).
 * Volá sa pri každom čítaní karty aj notifikácií; čo už je zapísané alebo
 * zmazané, sa nezopakuje. Chyba zdroja nič nezhodí — karta ukáže, čo má.
 */
export async function doplnPlatbyDochadzky(DB: D1Database, d: DataDochadzky): Promise<{ d: DataDochadzky; pridane: number }> {
  if (!d.aktivity.length) return { d, pridane: 0 };
  const od = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const fio = ((await DB.prepare(
    `SELECT id, date, amount_czk, counterparty, note, moja_poznamka FROM fio_transactions WHERE amount_czk < 0 AND date >= ?1`,
  ).bind(od).all<{ id: string | number; date: string; amount_czk: number; counterparty: string | null; note: string | null; moja_poznamka: string | null }>().catch(() => ({ results: [] }))).results || [])
    .map((r) => ({ id: String(r.id), datum: String(r.date).slice(0, 10), suma: -Number(r.amount_czk), text: [r.counterparty, r.note, r.moja_poznamka].filter(Boolean).join(" · ") }));
  const guillermo = d.aktivity.some(platiSaJosemu);
  const btc = guillermo ? (await btcVyplatySurove()) || [] : [];
  const kurz = guillermo ? await kurzBtcMeny(DB) : null;
  const navrhy = navrhyNakupov(d, fio, btc, kurz ? kurz.czk / kurz.eur : null);
  if (!navrhy.length) return { d, pridane: 0 };
  const teraz = new Date().toISOString();
  const nove: DataDochadzky = { ...d, nakupy: [...d.nakupy, ...navrhy.map((n, i) => ({ ...n, id: `${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`, vytvorene: teraz }))] };
  // Medzitým mohol niekto zapísať: zapíše sa nad čerstvým stavom, nie nad tým, čo sa čítalo.
  const cerstve = await nacitajDochadzku(DB);
  const uz = new Set(cerstve.nakupy.map((n) => n.zdroj).filter(Boolean));
  const naozaj = navrhy.filter((n) => !uz.has(n.zdroj));
  if (!naozaj.length) return { d: cerstve, pridane: 0 };
  const vysledok: DataDochadzky = { ...cerstve, nakupy: [...cerstve.nakupy, ...nove.nakupy.filter((n) => n.zdroj && naozaj.some((x) => x.zdroj === n.zdroj))] };
  await ulozDochadzku(DB, vysledok);
  for (const n of naozaj) {
    const a = vysledok.aktivity.find((x) => x.id === n.aktivitaId);
    await audit(DB, { action: "dochadzka-nakup-samo", predmet: `${a?.kto || ""} · ${a?.nazov || ""}`, neu: { datum: n.datum, hodiny: n.hodiny, suma: n.sumaKc, zdroj: n.zdroj }, actor: "kokpit" }).catch(() => {});
  }
  return { d: vysledok, pridane: naozaj.length };
}
