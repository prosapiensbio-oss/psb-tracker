import type { D1Database } from "@cloudflare/workers-types";

import { audit } from "./audit.server";
import { dnesPraha } from "./cas";
import { najdiPresun } from "./kalendarZmeny";
import { hromadnePresuny, type Zmena } from "./workspaceKarty";

type ZmenaNaPresun = Pick<Zmena, "id" | "kedy" | "klient" | "nazov" | "druh" | "pred">;

/**
 * Ku ktorej zmiznutej hodine appka našla nový termín.
 *
 * Počíta sa na serveri, nie v prehliadači: okno udalostí má 21 dní dozadu
 * a zmena spred mesiaca by svojho náprotivka nemala kde nájsť. Dopyt je
 * ohraničený dňami zmien, ktoré čakajú na odpoveď.
 */
export async function presunyZmien(DB: D1Database, zmeny: ZmenaNaPresun[]): Promise<Record<string, { zaciatok: string; kandidatov: number }>> {
  const dni = zmeny.filter((z) => z.druh === "zrusene" && z.pred).map((z) => String(z.pred).slice(0, 10)).sort();
  if (!dni.length) return {};
  const od = dnesPraha(new Date(Date.parse(`${dni[0]}T00:00:00Z`) - 14 * 86400000));
  const po = dnesPraha(new Date(Date.parse(`${dni[dni.length - 1]}T00:00:00Z`) + 14 * 86400000));
  const kandidati = ((await DB.prepare(
    "SELECT uid, klient, nazov, zaciatok, prvy_raz FROM kal_udalosti WHERE zmizla_at IS NULL AND zaciatok >= ?1 AND zaciatok <= ?2",
  ).bind(`${od}T00:00`, `${po}T23:59`).all().catch(() => ({ results: [] }))).results || []) as unknown as { uid: string; klient: string | null; nazov: string; zaciatok: string; prvy_raz: string | null }[];
  const vTvare = kandidati.map((u) => ({ uid: u.uid, klient: u.klient, nazov: u.nazov, zaciatok: u.zaciatok, prvyRaz: u.prvy_raz }));
  return Object.fromEntries(zmeny.flatMap((z) => {
    const p = najdiPresun(z, vTvare);
    return p ? [[z.id, { zaciatok: p.zaciatok, kandidatov: p.kandidatov }]] : [];
  }));
}

/**
 * ZJAVNÝ PRESUN SA NEPÝTA (Jerry, 1. 11. 2026: „prečo musím vyťukávať, že sme
 * presunuli, ak je očividné, že sa ten tréning iba presunul — je to robota
 * navyše"). Martin Spok 29. 10.: tá istá udalosť, 7:00 → 7:30.
 *
 * Sám sa uzavrie to, čo appka dovtedy ponúkala na hromadné odkliknutie
 * (`hromadnePresuny`): posun a zmiznutá hodina s JEDINÝM novým termínom. Pri
 * viacerých kandidátoch ostáva otázka — tam naozaj nevie, ktorý to je.
 *
 * Riadok s `odpovedane_at` sa stroja netýka: je to otázka, ktorú človek vrátil
 * krokom späť, a bez tejto podmienky by ju ďalšia snímka hneď zavrela znova.
 */
export async function uzavriZjavnePresuny(DB: D1Database, kedy: string): Promise<number> {
  const zmeny = ((await DB.prepare(
    "SELECT id, kedy, trener, druh, nazov, klient, pred, po FROM kal_zmeny WHERE vysvetlene = 0 AND odpovedane_at IS NULL AND druh IN ('posunute','zrusene') ORDER BY kedy DESC LIMIT 200",
  ).all()).results || []) as unknown as Zmena[];
  if (!zmeny.length) return 0;
  const { posuny, vyzeraNaPresun } = hromadnePresuny(zmeny, await presunyZmien(DB, zmeny));
  const riadky = [...posuny, ...vyzeraNaPresun];
  if (!riadky.length) return 0;
  await DB.batch(riadky.map((r) => DB.prepare(
    "UPDATE kal_zmeny SET vysvetlene = 1, poznamka = ?1, odpovedane_at = ?2 WHERE id = ?3 AND vysvetlene = 0",
  ).bind(r.poznamka, kedy, r.id)));
  await audit(DB, { action: "kalendar-presun-sam", predmet: `${riadky.length} zmien`, neu: riadky.map((r) => `${r.meno}: ${r.poznamka}`).join("; ").slice(0, 400), actor: "Kokpit" });
  return riadky.length;
}
