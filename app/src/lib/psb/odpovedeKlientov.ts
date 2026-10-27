import { POSUN } from "./pocitovka";
import type { MeranieRow } from "./types";

/**
 * NOTIFIKÁCIA: KLIENT NAPÍSAL, AKO SA CÍTI (Jerry, 27. 10. 2026: „áno, pridaj
 * notifikáciu"). Odpoveď zo stránky po úvodnom („Jak se dnes cítíte?") aj
 * z pocitovky na stránke klienta ležala len v profile v bloku „Ako sa cíti"
 * — kto ho neotvoril, nedozvedel sa, že mu niekto napísal.
 *
 * Len odpovede KLIENTA (`zdroj = klient`) a len za posledných 14 dní — staršia
 * odpoveď už nečaká na reakciu. Kľúč je klient + deň (v tabuľke je na deň
 * jeden riadok), takže „Vybavené" platí na tú jednu odpoveď.
 */
export const ODPOVED_OKNO_DNI = 14;

export type OdpovedKlienta = { key: string; klient: string; datum: string; title: string; detail: string };

export function odpovedeKlientov(merania: MeranieRow[], dnes: string): OdpovedKlienta[] {
  const hranica = new Date(Date.parse(`${dnes}T12:00:00Z`) - ODPOVED_OKNO_DNI * 86400_000).toISOString().slice(0, 10);
  return merania
    .filter((m) => m.zdroj === "klient" && m.datum >= hranica && m.datum <= dnes)
    .map((m) => {
      const text = (m.poznamka || "").trim();
      const cisla = m.oblasti.filter((o) => o.sila != null).map((o) => `${o.oblast} ${o.sila}/10`);
      const posun = m.posun != null ? POSUN.moznosti.find((x) => x.hodnota === m.posun)?.text : undefined;
      const casti = [
        text ? `„${text.length > 400 ? `${text.slice(0, 400)}…` : text}“` : "",
        cisla.length ? cisla.join(" · ") : "",
        posun ? `zmena k lepšímu: ${posun}` : "",
      ].filter(Boolean);
      const [, mm, dd] = m.datum.split("-").map(Number);
      return {
        key: `odpoved-klienta|${m.klient}|${m.datum}`,
        klient: m.klient,
        datum: m.datum,
        title: text ? `${m.klient} napísal(a), ako sa cíti` : `${m.klient} vyplnil(a), ako sa cíti`,
        detail: `${m.klient} (${dd}. ${mm}.): ${casti.join(" — ") || "odpoveď bez textu"}`,
      };
    })
    .sort((a, b) => b.datum.localeCompare(a.datum));
}
