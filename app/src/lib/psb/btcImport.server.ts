import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "../bindings.server";
import { audit } from "./audit.server";
import { btcNaPotvrdenie, navrhDielov, rozpisFaktury, satsDielov, type BtcBezMena, type BtcNaPotvrdenie, type BtcZKnihy, type DielFaktury, type DielPlatby, type LnFaktura } from "./btcSledovanie";
import { dnesPraha, terazPraha } from "./cas";
import { deriveClients, najdiKlienta } from "./compute";
import { loadData } from "./db.server";
import { polozkyDlhovMien } from "./dlhyMien.server";
import { normName } from "./format";
import { obsahOdkazu } from "./obsahOdkazu.server";

const uid = () => crypto.randomUUID();
const teraz = () => new Date().toISOString();

/** Koľko kto dlží — súčet položiek dlhu (`polozkyDlhovMien`). */
export async function dlhyMien(DB: D1Database, mena: string[]): Promise<Map<string, number>> {
  const kluce = new Set(mena.map((m) => normName(m)).filter(Boolean));
  const out = new Map<string, number>();
  if (!kluce.size) return out;
  const polozky = await polozkyDlhovMien(DB, mena);
  for (const k of kluce) out.set(k, 0);
  for (const x of polozky) {
    const k = normName(x.klient);
    if (kluce.has(k)) out.set(k, (out.get(k) || 0) + x.doplatit);
  }
  for (const [k, v] of out) out.set(k, Math.max(0, Math.round(v)));
  return out;
}

/**
 * Platba „vopred" (Jerry, 5. 10. 2026): klient v čase priradenia NIČ NEDLŽÍ,
 * takže nepatrí ničomu, čo už existuje, a čaká na balíček, ktorý príde.
 */
export async function jeVopred(DB: D1Database, klient: string): Promise<boolean> {
  return ((await dlhyMien(DB, [klient])).get(normName(klient)) || 0) === 0;
}

/** Podpis pre knihu. Správa sa líši podľa účelu, čítací podpis nič nezapíše. */
async function podpis(token: string, sprava: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sprava)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

const KNIHA = "https://btc.prosapiensbio.workers.dev/api/reserve";

/** Kniha väzbou `BTC`, bez prehliadača. `null` = neodpovedala. */
async function knihaZoServera(): Promise<{ platby: BtcZKnihy[]; bezMena: BtcBezMena[] } | null> {
  const env = bindings();
  const token = env.BTC_RESERVE_TOKEN;
  if (!token) return null;
  const exp = Date.now() + 60_000;
  const url = `${KNIHA}?exp=${exp}&sig=${await podpis(token, `exp=${exp}`)}&platby=1`;
  const r = env.BTC ? await env.BTC.fetch(new Request(url)) : await fetch(url);
  if (!r.ok) return null;
  const j = (await r.json()) as { ok?: boolean; platby?: BtcZKnihy[]; platbyBezMena?: BtcBezMena[] };
  return j.ok === false ? null : { platby: j.platby || [], bezMena: j.platbyBezMena || [] };
}

/** Priradí v knihe platbu bez mena jednému klientovi, alebo ju rozdelí medzi viacerých. */
async function priradVKnihe(id: number, klienti: string[]): Promise<{ ok: boolean; chyba?: string }> {
  const env = bindings();
  const token = env.BTC_RESERVE_TOKEN;
  if (!token) return { ok: false, chyba: "Kokpit nemá kľúč k BTC knihe." };
  const exp = Date.now() + 60_000;
  const sig = await podpis(token, `priradit=${exp}|${id}|${klienti.join("|")}`);
  const req = new Request(KNIHA, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ exp, sig, id, klienti }),
  });
  const r = env.BTC ? await env.BTC.fetch(req) : await fetch(req);
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return j.ok ? { ok: true } : { ok: false, chyba: j.error || `BTC kniha odpovedala ${r.status}.` };
}

type RiadokFaktury = { id: string; klient: string; rozpis_json: string; czk: number; sats: number; overit: string; vytvorena: string; zaplatena_at: string | null };

const naFakturu = (r: RiadokFaktury): LnFaktura => {
  let rozpis: DielFaktury[] = [];
  try { rozpis = JSON.parse(r.rozpis_json) as DielFaktury[]; } catch { /* poškodený riadok nič nespáruje */ }
  return { id: r.id, klient: r.klient, rozpis, czk: r.czk, sats: r.sats, vytvorena: r.vytvorena, zaplatenaAt: r.zaplatena_at };
};

/** Zapíše faktúru, ktorú práve dostal klient na odkaze. Pád nesmie zhodiť stránku. */
export async function zapisFakturu(DB: D1Database, f: { id: string; klient: string; rozpis: DielFaktury[]; czk: number; sats: number; overit: string }): Promise<void> {
  await DB.prepare("INSERT OR IGNORE INTO ln_faktury (id, klient, rozpis_json, czk, sats, overit, vytvorena, zaplatena_at) VALUES (?,?,?,?,?,?,?,NULL)")
    .bind(f.id, f.klient, JSON.stringify(f.rozpis), f.czk, f.sats, f.overit, teraz()).run().catch(() => null);
}

/**
 * Opýta sa Blinku na faktúry, ktoré môžu byť ešte zaplatené. Faktúra platí
 * hodinu; 26 h je rezerva pre výpadok plánovača. Len si poznačí, že je zaplatená:
 * do `platby` ju zapíše človek (Jerry, 3. 11. 2026).
 */
export async function sledujFaktury(DB: D1Database): Promise<{ overene: number; zaplatene: number }> {
  await DB.prepare("DELETE FROM ln_faktury WHERE zaplatena_at IS NULL AND vytvorena < datetime('now','-7 days')").run();
  const cakaju = (await DB.prepare("SELECT * FROM ln_faktury WHERE zaplatena_at IS NULL AND vytvorena >= ?1 ORDER BY vytvorena DESC LIMIT 30")
    .bind(new Date(Date.now() - 26 * 3_600_000).toISOString()).all<RiadokFaktury>()).results || [];
  let zaplatene = 0;
  for (const r of cakaju) {
    const j = await fetch(r.overit, { headers: { accept: "application/json" } })
      .then((x) => (x.ok ? (x.json() as Promise<{ settled?: boolean }>) : null)).catch(() => null);
    if (!j?.settled) continue;
    await DB.prepare("UPDATE ln_faktury SET zaplatena_at = ? WHERE id = ?").bind(teraz(), r.id).run();
    zaplatene += 1;
  }
  return { overene: cakaju.length, zaplatene };
}

export type PolozkaBtc = BtcNaPotvrdenie & {
  /** Predvyplnené diely, keď sa dá povedať, komu platba patrí. */
  diely: DielPlatby[];
  /** Suma z odkazu v SMS sedí; `diely` nesú ju, nie prepočet kurzom. */
  zOdkazu: boolean;
  /** Pri platbe bez mena: bitcoinoví klienti, ktorým suma sedí na odkaz. */
  navrhy: { klienti: string[]; diely: DielPlatby[] }[];
};

const SKRYTE = "btc_prijmy_skryte";

/**
 * Čo čaká na potvrdenie vo Workspace. Dohodnutá suma je tá z odkazu v SMS:
 * zaplatená faktúra ju nesie sama, inak sa zloží rovnako ako stránka `/v/`
 * (`obsahOdkazu` + `rozpisFaktury`). `null` = kniha neodpovedala.
 */
export async function polozkyBtc(DB: D1Database): Promise<PolozkaBtc[] | null> {
  await sledujFaktury(DB).catch(() => null);
  const kniha = await knihaZoServera();
  if (!kniha) return null;
  const [od, skr, zap, fa] = await Promise.all([
    DB.prepare("SELECT value FROM vzas_settings WHERE key = 'platby_od'").first<{ value: string }>().catch(() => null),
    DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(SKRYTE).first<{ value: string }>().catch(() => null),
    // Bez `.catch`: prázdny zoznam pri výpadku D1 by znova otvoril všetky platby.
    DB.prepare("SELECT DISTINCT fio_id FROM platby WHERE fio_id LIKE 'btc:%'").all<{ fio_id: string }>(),
    DB.prepare("SELECT * FROM ln_faktury WHERE zaplatena_at IS NOT NULL AND zaplatena_at >= ?1").bind(new Date(Date.now() - 45 * 86_400_000).toISOString()).all<RiadokFaktury>(),
  ]);
  let skryte: string[] = [];
  try { skryte = (JSON.parse(skr?.value || "[]") as unknown[]).map(String); } catch { /* poškodený zápis nič neskryje */ }
  const zoznam = btcNaPotvrdenie({
    kniha: kniha.platby,
    bezMena: kniha.bezMena,
    faktury: (fa.results || []).map(naFakturu),
    zapisane: (zap.results || []).map((r) => r.fio_id),
    skryte,
    odDna: `${String(od?.value || "").replace(/"/g, "") || dnesPraha().slice(0, 7)}-01`,
  });
  if (!zoznam.length) return [];

  // Drahé čítanie, ale len keď naozaj niečo čaká.
  const data = await loadData(DB);
  const clients = deriveClients(data);
  const mena = Object.keys(clients);
  const zlava = (m: string) => Number(data.clientOverrides?.[m]?.btcZlava) || 0;
  const pamat = new Map<string, DielFaktury[]>();
  const zOdkazu = async (klient: string): Promise<DielFaktury[]> => {
    if (pamat.has(klient)) return pamat.get(klient)!;
    let rozpis: DielFaktury[] = [];
    try {
      const c = clients[klient];
      if (c) {
        const { vypis, suma } = await obsahOdkazu(DB, data, c, { teraz: terazPraha() });
        // Faktúra sa platí na účet, nie cez Lightning. Bez platobného bloku platí dlh:
        // komu platí niekto iný, stránka sumu neukazuje, a tá istá suma je v dlhu.
        if (vypis.platba?.polozky?.length) rozpis = rozpisFaktury(vypis.platba.polozky, zlava);
        else if (vypis.platba && suma > 0 && !vypis.platba.vs) rozpis = rozpisFaktury([{ klient, suma, nazov: vypis.platba.popis, ja: true }], zlava);
      }
      if (!rozpis.length) {
        const dlh = (await dlhyMien(DB, [klient])).get(normName(klient)) || 0;
        if (dlh) rozpis = [{ klient, czk: dlh }];
      }
    } catch { /* bez odkazu ostane suma z knihy, človek ju vidí a môže ju prepísať */ }
    pamat.set(klient, rozpis);
    return rozpis;
  };

  const out: PolozkaBtc[] = [];
  for (const p of zoznam) {
    const moje = p.klientKnihy ? najdiKlienta(mena, p.klientKnihy) || "" : "";
    if (p.zFaktury) {
      out.push({ ...p, diely: p.zFaktury.map((d) => ({ klient: d.klient, suma: d.czk })), zOdkazu: true, navrhy: [] });
    } else if (moje) {
      const n = navrhDielov(p.czk, moje, await zOdkazu(moje));
      out.push({ ...p, diely: n.diely, zOdkazu: n.zOdkazu, navrhy: [] });
    } else {
      const navrhy: PolozkaBtc["navrhy"] = [];
      for (const m of mena.filter((x) => data.clientOverrides?.[x]?.bitcoin)) {
        const n = navrhDielov(p.czk, m, await zOdkazu(m));
        if (n.zOdkazu && n.diely.length) navrhy.push({ klienti: n.diely.map((d) => d.klient), diely: n.diely });
      }
      // Dvojica sa nájde od oboch: odkaz platiteľa aj vlastný dlh druhého. Stačí raz.
      const raz = new Map(navrhy.map((n) => [[...n.klienti].sort().join("|"), n]));
      out.push({ ...p, diely: p.klientKnihy ? [{ klient: "", suma: p.czk || 0 }] : [], zOdkazu: false, navrhy: [...raz.values()].slice(0, 4) });
    }
  }
  return out;
}

/**
 * Zapíše platbu, ktorú potvrdil človek, ako priradenie platby z banky.
 * Platba bez mena dostane meno aj v knihe, je to jej zdroj.
 */
export async function potvrdBtc(DB: D1Database, p: {
  zdroj: BtcNaPotvrdenie["zdroj"]; datum: string; sats: number; czk: number | null;
  klientKnihy?: string; idKnihy?: number; idFaktury?: string; diely: DielPlatby[];
}, kto: string | undefined): Promise<{ ok: true; nove: number } | { ok: false; chyba: string }> {
  const diely = p.diely.map((d) => ({ klient: String(d.klient || "").trim(), suma: Math.round(Number(d.suma) || 0) }));
  if (!diely.length || diely.some((d) => !d.klient || d.suma <= 0)) return { ok: false, chyba: "Každý diel potrebuje klienta a kladnú sumu." };
  if (new Set(diely.map((d) => normName(d.klient))).size !== diely.length) return { ok: false, chyba: "Ten istý klient je v dieloch dvakrát." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.datum) || !(p.sats > 0)) return { ok: false, chyba: "Platba nemá dátum alebo satoshi." };

  // Kľúč určuje, čo sa pri ďalšom čítaní pokladá za vybavené (`btcNaPotvrdenie`).
  let kluce: string[];
  if (p.zdroj === "faktura") {
    if (!p.idFaktury) return { ok: false, chyba: "Chýba faktúra." };
    kluce = diely.map(() => `btc:ln:${p.idFaktury}`);
  } else if (p.zdroj === "kniha") {
    if (!p.klientKnihy) return { ok: false, chyba: "Chýba meno z knihy." };
    kluce = diely.map(() => `btc:${p.datum}|${p.klientKnihy}|${p.sats}`);
  } else {
    if (!p.idKnihy) return { ok: false, chyba: "Chýba riadok knihy." };
    const v = await priradVKnihe(p.idKnihy, diely.map((d) => d.klient));
    if (!v.ok) return { ok: false, chyba: v.chyba || "BTC kniha to nezapísala." };
    const s = satsDielov(p.sats, diely.length);
    kluce = diely.map((d, i) => `btc:${p.datum}|${d.klient}|${s[i]}`);
  }
  const popis = (d: { suma: number }) => {
    const kurz = p.czk && Math.round(p.czk) !== d.suma && diely.length === 1 ? ` · dohodnutá suma, kurzom ${Math.round(p.czk).toLocaleString("sk-SK")} Kč` : "";
    return `${p.zdroj === "faktura" ? "Lightning faktúra" : "z BTC knihy"} · ${p.sats.toLocaleString("sk-SK")} sats${kurz}${diely.length > 1 ? ` · spoločná platba (${diely[0].klient})` : ""}`;
  };
  const zapisy = await Promise.all(diely.map(async (d, i) => DB.prepare(
    "INSERT OR IGNORE INTO platby (id, klient, datum, suma_czk, sposob, fio_id, poznamka, created_at, autor, vopred) VALUES (?,?,?,?,'bitcoin',?,?,?,?,?)",
  ).bind(uid(), d.klient, p.datum, d.suma, kluce[i], popis(d), teraz(), kto || null, (await jeVopred(DB, d.klient)) ? 1 : 0)));
  let nove = 0;
  for (const r of await DB.batch(zapisy)) nove += r.meta?.changes || 0;
  // Ignorovaný zápis by inak vyzeral ako úspech (viď zrušená platba, unikát fio_id + klient).
  if (!nove) return { ok: false, chyba: "Táto platba už v Kokpite je, možno ako zrušená." };
  await audit(DB, { action: "platby-btc-potvrdene", predmet: diely.map((d) => `${d.klient} ${d.suma}`).join(" · "), neu: `${p.zdroj} · ${p.datum} · ${p.sats} sats`, actor: kto });
  return { ok: true, nove };
}

/** Riadok, ktorý nie je platba klienta (duplicita, oprava zostatku). V knihe ostáva. */
export async function skryBtc(DB: D1Database, kluc: string): Promise<void> {
  const r = await DB.prepare("SELECT value FROM vzas_settings WHERE key = ?1").bind(SKRYTE).first<{ value: string }>().catch(() => null);
  let skryte: string[] = [];
  try { skryte = (JSON.parse(r?.value || "[]") as unknown[]).map(String); } catch { /* prepíše sa */ }
  await DB.prepare("INSERT INTO vzas_settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(SKRYTE, JSON.stringify([...new Set([...skryte, kluc])])).run();
}
