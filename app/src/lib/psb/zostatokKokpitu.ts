/**
 * ZOSTATOK HODÍN Z BALÍČKOV V KOKPITE — OD 1. 10. 2026 JE TO ČÍSLO NA KARTE.
 *
 * Druhá tretina odchodu z PTmindera (prvá je dochádzka z kalendára). Karta
 * klienta dovtedy brala zostatok z exportu PTmindera, a to má dve chyby,
 * ktoré sa odchodom nedajú obísť:
 *
 *  • Balíček zapísaný len v Kokpite karta nevidí. Vítězslav Papiež dostal
 *    29. 9. 2026 „Předplatné 6 h" v Kokpite — os času ukazovala 5 h,
 *    karta 0 h.
 *  • Pri členstvách PTminder zostatok v exporte vôbec nedá (je za ikonou),
 *    takže karta ho aj tak dopočítavala sama — len z cudzích balíčkov.
 *
 * Pravidlo je to isté ako v meradle súbežného chodu (`porovnajBalicky`):
 * hodiny aktívnych balíčkov mínus odtrénované od začiatku najstaršieho
 * z nich. Pri prekryve sa nedá povedať, ktorému balíčku hodina patrí, ale
 * súčet je jednoznačný. Tréningy sa berú z dochádzky appky (od 1. 10.
 * z kalendára), takže 90-minútový tréning je 1,5 h a tréning zadarmo sa
 * neodpočíta.
 *
 * KOTVA. Balíček naliaty z PTmindera bez dátumu nesie zostatok ku dňu
 * naliatia („zostatok prevzatý z PTmindera k 2026-09-20"). Tréning z toho
 * dňa sa neodpočítava — PTminder ho v tom čísle už má. Rovnaké pravidlo
 * platí pre ručnú kotvu na karte klienta.
 */
import { normName } from "./format";

export type BalicekPreZostatok = {
  klient: string;
  nazov: string;
  /** `null` = paušál, hodiny sa nepočítajú. */
  hodiny: number | null;
  platnostOd: string;
  platnostDo: string | null;
  zruseneAt?: string | null;
  /** `true` = hodiny sú zostatok k `platnostOd`, nie celý balíček. */
  kotva?: boolean;
};

export type SedeniePreZostatok = { client: string; date: string; duration?: number };

export type ZostatokKokpitu = {
  /** Koľko hodín zostáva (nie menej ako 0). */
  zostatok: number;
  /** Koľko hodín je odtrénovaných nad rámec balíčkov. */
  nadRamec: number;
  /** Hodín v aktívnych balíčkoch spolu. */
  spolu: number;
  minute: number;
  od: string;
  /** Najnovší aktívny balíček — ten sa ukazuje ako „členstvo". */
  nazov: string;
  platnostDo: string | null;
  pausal: boolean;
};

const den = (s: string) => String(s || "").slice(0, 10);

export const jeAktivnyBalicek = (b: BalicekPreZostatok, dnes: string): boolean =>
  !b.zruseneAt && den(b.platnostOd) <= dnes && (!b.platnostDo || den(b.platnostDo) >= dnes);

/**
 * `null` = klient nemá v Kokpite žiadny aktívny balíček. To nie je nula —
 * appka o ňom nevie a karta to má povedať, nie tváriť sa, že hodiny minul.
 */
export function zostatokKokpitu(
  balicky: BalicekPreZostatok[],
  klient: string,
  sedenia: SedeniePreZostatok[],
  dnes: string,
  zadarmo: Set<string> = new Set(),
): ZostatokKokpitu | null {
  const k = normName(klient);
  const aktivne = balicky
    .filter((b) => normName(b.klient) === k && jeAktivnyBalicek(b, dnes))
    .sort((a, b) => den(b.platnostOd).localeCompare(den(a.platnostOd)));
  if (!aktivne.length) return null;

  const najnovsi = aktivne[0];
  const pausal = aktivne.some((b) => b.hodiny == null);
  const od = aktivne.reduce((a, b) => (den(b.platnostOd) < a ? den(b.platnostOd) : a), den(aktivne[0].platnostOd));
  // Deň kotvy sa vynechá, len keď je kotvou práve ten najstarší balíček —
  // inak by sa vynechal deň, ktorý iný aktívny balíček normálne pokrýva.
  const odVylucne = aktivne.some((b) => b.kotva && den(b.platnostOd) === od);
  const spolu = pausal ? 0 : aktivne.reduce((a, b) => a + (b.hodiny || 0), 0);

  let minute = 0;
  for (const s of sedenia) {
    if (normName(s.client) !== k) continue;
    const d = den(s.date);
    if (d > dnes || d < od || (odVylucne && d === od) || zadarmo.has(`${k}|${d}`)) continue;
    minute += (s.duration || 60) / 60;
  }
  minute = Math.round(minute * 100) / 100;

  return {
    zostatok: pausal ? 0 : Math.max(0, Math.round((spolu - minute) * 100) / 100),
    nadRamec: pausal ? 0 : Math.max(0, Math.round((minute - spolu) * 100) / 100),
    spolu, minute, od,
    nazov: najnovsi.nazov,
    platnostDo: najnovsi.platnostDo || null,
    pausal,
  };
}
