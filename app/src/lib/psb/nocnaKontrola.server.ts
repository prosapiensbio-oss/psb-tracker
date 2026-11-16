/**
 * Vstup pre nočnú kontrolu dát (`nocnaKontrola.ts`) z D1 a zápis výsledku.
 *
 * Výsledok leží vo `vzas_settings.kontrola_dat` ako jeden JSON: posledný beh
 * nahrádza predošlý celý. Nález, ktorý sa medzitým vyriešil, tak ráno zmizne
 * sám; „Vybavené“ v registri drží kľúč pre to, čo sa vyriešiť nedá.
 */
import type { D1Database } from "@cloudflare/workers-types";

import { dnesPraha, posunDen } from "./cas";
import { normName } from "./format";
import { kontrolujData, type NalezDat } from "./nocnaKontrola";
import { znamiKlienti } from "./nahodTrening.server";
import { najdiKlientaVTexte, textPlatby, vzorPlatby, type FioRiadok } from "./platbyEvidencia";
import { jePrevodRezervy } from "./rezervaOdlozenie";

export const KLUC_KONTROLY_DAT = "kontrola_dat";
export type VysledokKontrolyDat = { beh: string; nalezy: NalezDat[] };

export async function spustiKontroluDat(DB: D1Database, dnes = dnesPraha()): Promise<VysledokKontrolyDat> {
  const od14 = posunDen(dnes, -14);
  const do21 = posunDen(dnes, 21);
  const od60 = posunDen(dnes, -60);
  const od120 = posunDen(dnes, -120);

  const [klienti, udalostiR, trenerR, aktivniR, fioR, priradeneR] = await Promise.all([
    znamiKlienti(DB, 400),
    DB.prepare(
      `SELECT uid, trener, zaciatok, nazov, klient, typ, zmizla_at FROM kal_udalosti
        WHERE zaciatok >= ?1 AND zaciatok <= ?2`,
    ).bind(od14, `${do21}T23:59`).all(),
    // Tréner klienta = kto ho viedol naposledy (kalendár, potom export).
    DB.prepare(
      `SELECT klient, trener FROM (
         SELECT klient, trener, zaciatok d FROM kal_udalosti WHERE klient IS NOT NULL AND zmizla_at IS NULL
         UNION ALL SELECT client_name, session_trainer, date FROM sessions WHERE session_trainer IN ('Jerry','Terezka')
       ) ORDER BY d`,
    ).all(),
    DB.prepare(
      `SELECT DISTINCT klient m FROM kal_udalosti WHERE klient IS NOT NULL AND zmizla_at IS NULL AND zaciatok >= ?1
       UNION SELECT DISTINCT client_name FROM sessions WHERE date >= ?1`,
    ).bind(od60).all(),
    // Príjmy bez priradenia: nie v platbách, nie „nie je klient", bez pravidla platiteľa.
    DB.prepare(
      `SELECT f.id, f.date, f.amount_czk, f.counterparty, f.note, f.typ FROM fio_transactions f
        WHERE f.amount_czk > 0 AND f.date >= ?1
          AND COALESCE(f.category, '') NOT IN ('prijem.produkt', 'prijem.ine')
          AND COALESCE(f.typ, '') <> 'hotovosť'
          AND f.id NOT IN (SELECT fio_id FROM platby WHERE fio_id IS NOT NULL AND zrusene_at IS NULL)
          AND f.id NOT IN (SELECT fio_id FROM platba_nie_klient)`,
    ).bind(od60).all(),
    DB.prepare(
      `SELECT p.klient, p.datum, f.id, f.date, f.amount_czk, f.counterparty, f.note, f.typ
         FROM platby p JOIN fio_transactions f ON f.id = p.fio_id
        WHERE p.zrusene_at IS NULL AND p.datum >= ?1
          -- Zošit hotovosti píše človek („Patrik Lutovský zo zošita“), nie banka:
          -- meno v ňom nie je dôkaz, ako sa klient naozaj volá.
          AND COALESCE(f.typ, '') <> 'hotovosť'`,
    ).bind(od120).all(),
  ]);

  const trenerKlienta: Record<string, string> = {};
  for (const r of (trenerR.results || []) as { klient: string; trener: string }[]) {
    if (r.klient && r.trener) trenerKlienta[r.klient] = r.trener;
  }
  // Kľúč klienta je tvar zo `znamiKlienti`; tréner sa k nemu priradí aj cez iný zápis mena.
  const podlaNorm = new Map(Object.entries(trenerKlienta).map(([k, t]) => [normName(k), t]));
  for (const k of klienti) if (!trenerKlienta[k] && podlaNorm.has(normName(k))) trenerKlienta[k] = podlaNorm.get(normName(k)) as string;

  const pravidla = new Set(
    (((await DB.prepare("SELECT vzor FROM platba_mapovanie").all()).results || []) as { vzor: string }[]).map((r) => r.vzor),
  );
  const prijmyBezKlienta = ((fioR.results || []) as unknown as FioRiadok[])
    .filter((r) => !pravidla.has(vzorPlatby(r)))
    .filter((r) => !jePrevodRezervy(r.counterparty))
    .map((r) => ({ r, text: textPlatby(r) }))
    .filter(({ text }) => !/vklad do bankomatu|vklad hotovosti/i.test(text))
    // Keď meno v texte sedí, appka návrh má — to nie je táto chyba.
    .filter(({ text }) => najdiKlientaVTexte(text, klienti).length === 0)
    .map(({ r, text }) => ({ id: r.id, datum: r.date.slice(0, 10), suma: r.amount_czk, text }));

  const nalezy = kontrolujData({
    dnes,
    klienti,
    trenerKlienta,
    aktivni: ((aktivniR.results || []) as { m: string }[]).map((r) => r.m).filter(Boolean),
    udalosti: ((udalostiR.results || []) as Record<string, unknown>[]).map((u) => ({
      uid: String(u.uid), trener: String(u.trener), zaciatok: String(u.zaciatok), nazov: String(u.nazov || ""),
      klient: (u.klient as string | null) || null, typ: (u.typ as string | null) || null, zmizla: !!u.zmizla_at,
    })),
    prijmyBezKlienta,
    priradene: ((priradeneR.results || []) as unknown as (FioRiadok & { klient: string; datum: string })[])
      .map((r) => ({ klient: r.klient, datum: String(r.datum).slice(0, 10), text: textPlatby(r) })),
  });
  return { beh: new Date().toISOString(), nalezy };
}

export async function zapisKontroluDat(DB: D1Database, v: VysledokKontrolyDat): Promise<void> {
  await DB.prepare(
    "INSERT INTO vzas_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(KLUC_KONTROLY_DAT, JSON.stringify(v), v.beh).run();
}
