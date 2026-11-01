/**
 * KTO SMIE ČO S KONTAMI (rozbor Kokpitu, 1. 11. 2026).
 *
 * `POST /api/users` rolu nekontroloval: „obaja majú plný prístup, konto je
 * identita, nie oprávnenie." Lenže kto zmení heslo cudziemu kontu, prevezme jeho
 * identitu. Terezka aj token Strižne tak vedeli prepísať heslo Jerryho.
 *
 * K DÁTAM majú Jerry aj Terezka prístup rovnaký; toto sa týka len kont. Jedno
 * pravidlo pre server aj obe obrazovky s kontami (Uzávierka, Údaje).
 *
 *   správca  (konto s loginom `jerry`)  všetko
 *   tréner   (iné aktívne konto)        len vlastné heslo
 *   cudzí    (Strižňa, „btc", neznáme)  nič
 *
 * Správca sa pozná podľa LOGINU: meno sa dá premenovať, login je kľúč riadku.
 *
 * Zabudnuté heslo: Terezke ho nastaví Jerry, Jerrymu ho obnoví správca cez
 * databázu. Záchrana cez spoločné heslo skončila s ním (1. 11. 2026).
 */
export type RolaKonta = "spravca" | "trener" | "cudzi";
export type AkciaKonta = "nove" | "heslo" | "uprava" | "odhlas-vsade";

export const LOGIN_SPRAVCU = "jerry";
/** Identita tokenu Strižne (`zistiUzivatela` v auth.server.ts). */
export const IDENTITA_STRIZNE = "Strižňa";

/** Rola podľa identity zo session a riadku konta, ktorému patrí. */
export function rolaKonta(ja: string | null, konto: { login: string; active?: number | boolean | null } | null): RolaKonta {
  if (!ja || ja === IDENTITA_STRIZNE || !konto) return "cudzi";
  if (konto.active === 0 || konto.active === false) return "cudzi";
  return konto.login === LOGIN_SPRAVCU ? "spravca" : "trener";
}

/** Smie rola túto akciu na tomto konte? `mojLogin` = konto prihláseného. */
export function smieKonta(rola: RolaKonta, mojLogin: string | null, akcia: AkciaKonta, cielLogin: string): boolean {
  switch (rola) {
    case "spravca": return true;
    case "trener": return akcia === "heslo" && !!mojLogin && mojLogin === cielLogin;
    case "cudzi": return false;
  }
}
