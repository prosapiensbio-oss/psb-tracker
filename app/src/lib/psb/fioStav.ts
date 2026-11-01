/**
 * KEDY SA Z BANKY NAPOSLEDY STIAHLO — jedna veta pre všetky miesta.
 *
 * „Stiahnuť príjmy z Fio" stálo na troch obrazovkách, hoci sa Fio od 14. 10.
 * 2026 sťahuje samo každú noc, a nikde nebol čas posledného stiahnutia. Výzva
 * na tlačidlo pri čerstvom behu je práca navyše; bez času zase človek nevie,
 * či klient, ktorý dnes zaplatil, už v Kokpite byť môže.
 */

import { dnesPraha, posunDen } from "./cas";

/** Nočný beh je o 4:10 UTC; 30 h pokryje posun o pár hodín bez falošného poplachu. */
export const FIO_CERSTVE_HODIN = 30;

export type StavFio = {
  /** Posledné úspešné stiahnutie (nočné aj ručné), ISO. */
  stiahnute?: string | null;
  stiahnuteKto?: string | null;
  /** Posledný nočný beh zlyhal. */
  nocnyChyba?: { kedy: string; chyba: string } | null;
};

export function jeFioCerstve(s: StavFio, teraz: Date = new Date()): boolean {
  if (!s.stiahnute || s.nocnyChyba) return false;
  const t = Date.parse(s.stiahnute);
  return Number.isFinite(t) && teraz.getTime() - t <= FIO_CERSTVE_HODIN * 3600000;
}

/** „dnes 5:10", „včera 5:10", „28. 10. 5:10" — vždy pražský čas. */
export function kedyFio(iso: string, teraz: Date = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const den = dnesPraha(d);
  const cas = d.toLocaleTimeString("sk-SK", { timeZone: "Europe/Prague", hour: "numeric", minute: "2-digit" });
  const dnes = dnesPraha(teraz);
  if (den === dnes) return `dnes ${cas}`;
  if (den === posunDen(dnes, -1)) return `včera ${cas}`;
  return `${Number(den.slice(8))}. ${Number(den.slice(5, 7))}. ${cas}`;
}

/** Veta vedľa tlačidla. */
export function vetaFio(s: StavFio, teraz: Date = new Date()): string {
  const kto = s.stiahnuteKto === "plánovač" ? " (nočný beh)" : "";
  const kedy = s.stiahnute ? `Z banky stiahnuté ${kedyFio(s.stiahnute, teraz)}${kto}` : "Z banky sa ešte nič nestiahlo";
  if (s.nocnyChyba) return `${kedy}. Nočný beh ${kedyFio(s.nocnyChyba.kedy, teraz)} zlyhal${s.nocnyChyba.chyba ? `: ${s.nocnyChyba.chyba}` : ""}`;
  return kedy;
}
