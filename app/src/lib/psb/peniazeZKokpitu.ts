/**
 * PENIAZE Z KOKPITU — tretia tretina odchodu z PTmindera.
 *
 * Jerry, 6. 10. 2026: „pokračuj s peniazmi a grafmi z vlastných dát."
 * Dochádzka sa prepla 1. 10. 2026 (`KOKPIT_OD`, `spojDochadzku`), hodiny na
 * karte tiež. Peniaze nie: každá tržba, graf aj príjem v P&L stál na
 * `payments` z exportu PTmindera. Tu je ten istý vzor ako pri tréningoch:
 * PRED zvoleným mesiacom PTminder, OD NEHO vlastná evidencia (`platby` —
 * banka z Fio, hotovosť zo zošita, bitcoin a iné ručne). PTminder zostáva
 * vedľa ako kontrola (`data.paymentsPtminder`).
 *
 * PREPÍNA SA MESIACOM A LEN KEĎ TEN MESIAC SEDÍ. Na rozdiel od dochádzky
 * nejde o pevný dátum: 6. 10. 2026 mala vlastná evidencia za september
 * 190 026 Kč proti 324 849 Kč v PTminderi — chýbala hotovosť (zošit nebol
 * zapísaný od 28. 8.), bitcoin a desať nepriradených príjmov z banky.
 * Keby sa prepla hneď, tržby by spadli o tretinu a vyzeralo by to ako zlý
 * mesiac, nie ako nedopísaný zošit. Preto `mozePrepnut`: mesiac a všetky
 * po ňom musia s PTminderom sedieť a nesmie čakať nepriradený príjem.
 */
import type { PaymentRow } from "./types";

/** Kľúč vo `vzas_settings`: mesiac RRRR-MM, od ktorého sú peniaze z Kokpitu. Prázdne = PTminder. */
export const PENIAZE_KLUC = "peniaze_kokpit_od";

export type VlastnaPlatba = { klient: string; datum: string; suma: number; sposob: string; zruseneAt?: string | null };

/** Spôsob platby v Kokpite → metóda v tvare exportu (bank | cash | other). */
export const metodaZoSposobu = (sposob: string): string =>
  sposob === "banka" || sposob === "prevod" ? "bank" : sposob === "hotovost" ? "cash" : "other";

/**
 * Jeden zoznam platieb pre celú appku. Bez zvoleného mesiaca je to export
 * PTmindera bez zmeny — prepínač nič nerobí, kým ho niekto nezapne.
 */
export function spojPlatby(ptminder: PaymentRow[], vlastne: VlastnaPlatba[], od: string): PaymentRow[] {
  if (!/^\d{4}-\d{2}$/.test(od)) return ptminder;
  const pred = ptminder.filter((p) => String(p.date || "").slice(0, 7) < od);
  const z = vlastne
    .filter((p) => !p.zruseneAt && String(p.datum || "").slice(0, 7) >= od && p.klient)
    .map((p) => ({
      date: `${String(p.datum).slice(0, 10)}T00:00:00.000Z`,
      client: p.klient,
      amount: p.suma,
      method: metodaZoSposobu(p.sposob),
      note: "Kokpit",
    }));
  return [...pred, ...z];
}

/** Riadok mesačného porovnania (`porovnajPlatby`) — len polia, ktoré brána potrebuje. */
export type MesiacPorovnania = { mesiac: string; kokpit: number; ptminder: number };

/**
 * Smie sa peniaze prepnúť od mesiaca `od`?
 *
 * Áno, keď každý porovnávaný mesiac od `od` sedí s PTminderom (rozdiel
 * najviac 200 Kč alebo 1 %, čo je viac — jedna zabudnutá platba za úvodný
 * by inak bránila navždy) a v žiadnom z nich nečaká nepriradený príjem
 * z banky. Mesiac, v ktorom PTminder ešte nič nemá, sa nesúdi: nie je
 * s čím porovnať. Vracia aj dôvody — veta „nesedí" bez čísla by sa
 * nedala opraviť.
 */
export function mozePrepnut(
  od: string,
  mesiace: MesiacPorovnania[],
  nepriradene: { datum: string; suma: number }[],
): { ok: boolean; dovody: string[] } {
  const dovody: string[] = [];
  const posudzovane = mesiace.filter((m) => m.mesiac >= od && m.ptminder > 0);
  if (!posudzovane.length) dovody.push(`za ${od} a neskôr ešte PTminder nemá platby — nie je s čím porovnať`);
  for (const m of posudzovane.sort((a, b) => a.mesiac.localeCompare(b.mesiac))) {
    const rozdiel = Math.round(m.kokpit - m.ptminder);
    if (Math.abs(rozdiel) > Math.max(200, m.ptminder * 0.01)) {
      dovody.push(`${m.mesiac}: Kokpit ${Math.round(m.kokpit)} Kč, PTminder ${Math.round(m.ptminder)} Kč (${rozdiel > 0 ? "+" : ""}${rozdiel})`);
    }
  }
  const cakaju = nepriradene.filter((p) => String(p.datum).slice(0, 7) >= od);
  if (cakaju.length) {
    dovody.push(`${cakaju.length} príjmov z banky od ${od} čaká na priradenie (${Math.round(cakaju.reduce((a, p) => a + p.suma, 0))} Kč)`);
  }
  return { ok: dovody.length === 0, dovody };
}
