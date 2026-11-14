import { normName } from "./format";

/**
 * SÚKROMNÉ KONTAKTY (Jerry, 14. 11. 2026): „Leon Box je moja súkromná
 * udalosť, je to môj tréner boxu a je pre mňa jednoduchšie mu poslať termíny
 * cez Kokpit… on klient nebude, tak ho tam ani nerátaj a daj mu špeciálne
 * postavenie, kde jediné, čo je v Kokpite uložené, je jeho číslo a môžem naňho
 * poslať termíny."
 *
 * Človek, ktorému sa dajú poslať termíny (ponuka /t/), ale klientom nie je:
 * vybraný termín sa zapíše do kalendára ako súkromná udalosť s názvom
 * aktivity („Box“), nie ako tréning klienta — takže nevznikne balíček, dlh,
 * „nový klient po úvodnom“, SMS ani nič iné z klientskeho sveta.
 * Drží sa vo `vzas_settings.sukromne_kontakty` (JSON).
 */
export type SukromnyKontakt = { meno: string; telefon: string; aktivita: string };

export const KLUC_SUKROMNYCH = "sukromne_kontakty";

export function citajSukromne(hodnota: string | null | undefined): SukromnyKontakt[] {
  let v: unknown = null;
  try { v = JSON.parse(hodnota || "[]"); } catch { return []; }
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return []; } }
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ meno: String(x?.meno || "").trim(), telefon: String(x?.telefon || "").trim(), aktivita: String(x?.aktivita || "").trim() }))
    .filter((x) => x.meno);
}

export function najdiSukromny(meno: string, zoznam: SukromnyKontakt[]): SukromnyKontakt | null {
  const n = normName(meno || "");
  return n ? zoznam.find((k) => normName(k.meno) === n) || null : null;
}

/** Pridá alebo prepíše kontakt (podľa mena); `zmaz` ho odstráni. */
export function upravSukromne(zoznam: SukromnyKontakt[], k: SukromnyKontakt, zmaz = false): SukromnyKontakt[] {
  const bez = zoznam.filter((x) => normName(x.meno) !== normName(k.meno));
  return zmaz ? bez : [...bez, { meno: k.meno.trim(), telefon: k.telefon.trim(), aktivita: k.aktivita.trim() || k.meno.trim() }];
}
