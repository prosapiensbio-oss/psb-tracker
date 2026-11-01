import { fmtDMY, normName } from "./format";
import { textNadRamec } from "./zostatokText";

/**
 * KLIENT, KTORÝ DLŽÍ, NIE JE V „BALÍČEK DOJDE“ (kontrola po nasadení, 1. 11. 2026).
 *
 * Jedenásť ľudí bolo na Dnes dvakrát: v Nezaplatené aj v Balíček dojde (Čechova,
 * Kaňovský, Kalva, Hrůzová…). U nich „hodiny minuté“ neznamená, že treba predať
 * ďalší balíček: balíček majú, len nezaplatený — a nezaplatený hodiny nedáva
 * (`jedno pravidlo zaplatený`). Akcia je v oboch zoznamoch tá istá: jedna SMS
 * s odkazom, kde je stav hodín aj QR. Dve zmienky o jednom človeku sú len dvojité
 * čítanie, a tlak na nový predaj u toho, kto ešte neplatil za ten posledný, je
 * práve to, čo sa nemá stať.
 *
 * Preto človek ostáva LEN v Nezaplatené a stav hodín má napísaný v riadku.
 * Odznak „dlží X Kč“ v Balíček dojde by zoznam nechal rovnako dlhý.
 */
export type RiadokDojde = {
  meno: string;
  /** Koľko má teraz — zostatok mínus odtrénované, čo karta ešte nevidí. */
  teraz: number;
  uzDosiel: boolean;
  dojde: string;
};

/** Stav hodín pre riadok v Nezaplatené. */
export function poznamkaHodinDlznika(r: RiadokDojde): string {
  if (r.teraz < 0) return textNadRamec(-r.teraz);
  if (r.uzDosiel) return "hodiny minuté";
  return r.dojde ? `dôjde ${fmtDMY(r.dojde)}` : `${r.teraz} h zostáva`;
}

/**
 * Veta pod „Balíček dojde“. Do 1. 11. 2026 hovorila „6 ľudí s minutými hodinami“,
 * hoci rátala všetkých dlžníkov vyradených zo zoznamu — aj Papiežove 2 h.
 */
export function vetaDlznikovMimoDojde(pocet: number): string {
  const kto = pocet === 1 ? "1 klient dlží" : pocet < 5 ? `${pocet} klienti dlžia` : `${pocet} klientov dlží`;
  return `${kto} za balíček, preto tu nie sú: stoja v Nezaplatené vyššie, stav hodín majú v riadku.`;
}

/** `hodinyDlznikov` má kľúč `normName` — tvar mena z dlhu a z kalendára sa môže líšiť v dĺžňoch. */
export function rozdelDojdeADlh<T extends RiadokDojde>(riadky: T[], dlznici: string[]): { riadky: T[]; hodinyDlznikov: Map<string, string> } {
  const kto = new Set(dlznici.map(normName));
  const hodinyDlznikov = new Map<string, string>();
  const ostatne: T[] = [];
  for (const r of riadky) {
    const k = normName(r.meno);
    if (kto.has(k)) hodinyDlznikov.set(k, poznamkaHodinDlznika(r));
    else ostatne.push(r);
  }
  return { riadky: ostatne, hodinyDlznikov };
}
