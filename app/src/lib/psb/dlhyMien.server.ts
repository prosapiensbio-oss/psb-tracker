import type { D1Database } from "@cloudflare/workers-types";

import { normName } from "./format";
import { dlhyKlientov, type DlhPolozka } from "./zaplatene";

/**
 * POLOŽKY DLHU PRE ZOPÁR MIEN NARAZ — tým istým pravidlom ako `loadData`
 * (`dlhyKlientov`). Volá to príznak „vopred" pri zápise platby, rozdelenie
 * bitcoinovej platby (`plati_za`) a od 23. 10. 2026 aj zoznam faktúr: faktúra
 * na balíček je uhradená, keď balíček v dlhu nie je (Martin Vaško — faktúra
 * 20261006 svietila po splatnosti, hoci jeho platba z 9. 10. balíček zaplatila).
 * Jedno čítanie pre všetky mená: tabuľky sú malé.
 */
export async function polozkyDlhovMien(DB: D1Database, mena: string[]): Promise<DlhPolozka[]> {
  const kluce = new Set(mena.map((m) => normName(m)).filter(Boolean));
  if (!kluce.size) return [];
  // Len riadky týchto klientov (LIKE na prvé písmeno priezviska by bolo krehké;
  // tabuľky sú malé). História môže chýbať (pred migráciou 0095) — vtedy
  // poistka beží bez nej; ide súbežne, nech platba nečaká na dve kolá.
  const [[bal, pl, pop, ptp], hist] = await Promise.all([
    DB.batch([
      DB.prepare("SELECT id, klient, nazov, cena_czk, platnost_od, zdroj, poznamka, zrusene_at FROM balicky"),
      DB.prepare("SELECT id, klient, datum, suma_czk, sposob, fio_id, zrusene_at, vopred FROM platby"),
      // Rovnaké poradie ako `loadData` — párovanie v `bezZdvojenych` od neho závisí.
      DB.prepare("SELECT id, datum, client_name, popis, suma_czk FROM poplatky ORDER BY datum DESC"),
      DB.prepare("SELECT client_name, date, amount_czk FROM payments"),
    ]),
    DB.prepare("SELECT klient, od FROM ptminder_historia").all().catch(() => ({ results: [] })),
  ]);
  type B = { id: string; klient: string; nazov: string; cena_czk: number | null; platnost_od: string; zdroj: string; poznamka: string | null; zrusene_at: string | null };
  type P = { id: string; klient: string; datum: string; suma_czk: number; sposob: string; fio_id: string | null; zrusene_at: string | null; vopred: number | null };
  type O = { id: string; datum: string; client_name: string; popis: string; suma_czk: number };
  type T = { client_name: string; date: string; amount_czk: number };
  type H = { klient: string; od: string | null };
  const moje = <X,>(xs: X[], meno: (x: X) => string) => xs.filter((x) => kluce.has(normName(meno(x))));
  return dlhyKlientov({
    poplatky: moje((pop.results || []) as unknown as O[], (x) => x.client_name)
      .map((p) => ({ id: p.id, klient: p.client_name, datum: p.datum, popis: p.popis || "", suma: Number(p.suma_czk) || 0 })),
    platby: moje((pl.results || []) as unknown as P[], (x) => x.klient)
      .map((p) => ({ id: p.id, klient: p.klient, datum: String(p.datum).slice(0, 10), suma: Number(p.suma_czk) || 0, zruseneAt: p.zrusene_at, vopred: p.vopred, sposob: p.sposob, fioId: p.fio_id })),
    balicky: moje((bal.results || []) as unknown as B[], (x) => x.klient)
      .map((b) => ({ id: b.id, klient: b.klient, nazov: b.nazov, cena: b.cena_czk, platnostOd: String(b.platnost_od).slice(0, 10), zdroj: b.zdroj, poznamka: b.poznamka, zruseneAt: b.zrusene_at })),
    ptPlatby: moje((ptp.results || []) as unknown as T[], (x) => x.client_name)
      .map((p) => ({ klient: p.client_name, datum: String(p.date || "").slice(0, 10), suma: Number(p.amount_czk) || 0 })),
    ptHistoria: moje((hist.results || []) as unknown as H[], (x) => x.klient)
      .map((h) => ({ klient: h.klient, od: String(h.od || "").slice(0, 10) })),
  }).polozky;
}
