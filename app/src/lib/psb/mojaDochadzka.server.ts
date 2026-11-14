import type { D1Database } from "@cloudflare/workers-types";

import { citajDochadzku, KLUC_DOCHADZKY, type Aktivita, type DataDochadzky, type UdalostDochadzky } from "./mojaDochadzka";

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
