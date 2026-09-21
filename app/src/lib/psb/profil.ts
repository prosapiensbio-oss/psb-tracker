import type { ClientAgg } from "./compute";

/**
 * Porovnanie klienta s ostatnými — počítané tak, aby nepenalizovalo nováčikov.
 *
 * PREČO TENTO SÚBOR VZNIKOL
 *
 * Profil klienta porovnával štyri čísla s priemerom aktívnych klientov.
 * Kontrola nad ostrými dátami (21. 9. 2026) ukázala, že pri krátkej histórii
 * dve z nich klamali, a to o rád:
 *
 *   Dominika Križova  tempo podľa appky 0,3 sedenia/mes. — reálne 5,0
 *   Albert Matl       tempo podľa appky 0,7             — reálne 8,0
 *
 * Príčina: sedenia za 90 dní sa delili TROMI mesiacmi aj u človeka, ktorý
 * chodí dva týždne. Takých klientov bolo 12 zo 66 a každý z nich vyzeral
 * vedľa priemeru (3,1) ako ten, kto prestal chodiť — čo je presne opačná
 * informácia, než akú tie stĺpce majú dať.
 *
 * To isté platilo pre dochádzku: jej menovateľ je `max(6, týždne histórie)`,
 * takže klient s dvoma týždňami má strop 33 % a s jedným 17 %. Porovnanie
 * s priemerom 58 % z neho urobí lajdáka.
 *
 * A „zaplatené celkovo" neporovnáva hodnotu klienta, ale dĺžku vzťahu:
 * Michal Knapčok 51 934 Kč za 20 mesiacov je 2 520 Kč mesačne, Daniela
 * Šašinková 93 720 Kč je 4 547 Kč mesačne — a nový klient nemá šancu.
 */

const DEN = 86400000;
const MESIAC = 30.4 * DEN;

/** Ako dlho klient chodí, v mesiacoch. Minimum je pol mesiaca, aby sa nedelilo nulou. */
export function mesiacovVztahu(c: Pick<ClientAgg, "firstSession">, teraz: Date = new Date()): number {
  if (!c.firstSession) return 0.5;
  const m = (teraz.getTime() - Date.parse(c.firstSession)) / MESIAC;
  return Math.max(0.5, m);
}

/** Koľko týždňov klient chodí — pod šesť je dochádzka ešte nečitateľná. */
export function tyzdnovVztahu(c: Pick<ClientAgg, "firstSession">, teraz: Date = new Date()): number {
  if (!c.firstSession) return 0;
  return Math.max(0, (teraz.getTime() - Date.parse(c.firstSession)) / (7 * DEN));
}

/**
 * Tempo v sedeniach za mesiac z posledných 90 dní.
 *
 * Delí sa počtom mesiacov, ktoré klient NAOZAJ chodí — najviac tromi. Kto
 * chodí tri týždne, sa delí tromi týždňami, nie štvrťrokom.
 */
export function tempoMesacne(c: Pick<ClientAgg, "sessions" | "firstSession">, teraz: Date = new Date()): number {
  // Okno sa porovnáva po DŇOCH, nie po milisekundách. Sedenia majú v dátume
  // polnoc, takže pri porovnaní s presným časom vypadne tréning spadnutý
  // presne na hranicu — a tempo sa mení podľa toho, o koľkej si profil
  // otvoríš. Janka šnirychova tak mala 0,7 namiesto 1,0 (21. 9. 2026).
  const od = new Date(teraz.getTime() - 90 * DEN).toISOString().slice(0, 10);
  const n = c.sessions.filter((s) => String(s.date).slice(0, 10) >= od).length;
  const mesiacov = Math.min(3, mesiacovVztahu(c, teraz));
  return n / mesiacov;
}

/** Koľko klient platí mesačne — porovnateľné naprieč starými aj novými. */
export function zaplateneMesacne(zaplatene: number, c: Pick<ClientAgg, "firstSession">, teraz: Date = new Date()): number {
  return zaplatene / mesiacovVztahu(c, teraz);
}

/**
 * Dochádzka sa porovnáva až od šiestich týždňov.
 *
 * Kratšia história nedá 100 % ani pri dokonalej pravidelnosti (menovateľ je
 * `max(6, týždne)`), takže stĺpec by ukazoval nie dochádzku, ale to, ako
 * dávno klient začal.
 */
export function dochadzkaPorovnatelna(c: Pick<ClientAgg, "firstSession">, teraz: Date = new Date()): boolean {
  return tyzdnovVztahu(c, teraz) >= 6;
}

/**
 * Priemer z hodnôt ostatných.
 *
 * Nuly sa vyhadzujú zámerne: klient na pauze má tempo 0 a porovnávať sa
 * s ním znamená porovnávať sa s tým, kto nechodí. Vplyv je malý (2–5 %,
 * merané 21. 9. 2026 na 66 aktívnych), ale rozdiel je v tom, čo veta
 * „Ø ostatní" sľubuje.
 */
export function priemerOstatnych(hodnoty: number[]): number {
  const v = hodnoty.filter((n) => Number.isFinite(n) && n > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
