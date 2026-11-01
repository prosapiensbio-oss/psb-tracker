/**
 * KTO SMIE ČO S KONTAMI (rozbor Kokpitu, 1. 11. 2026).
 *
 * `POST /api/users` rolu nekontroloval: „obaja majú plný prístup, konto je
 * identita, nie oprávnenie." Lenže kto zmení heslo cudziemu kontu, prevezme jeho
 * identitu. Terezka, session zo spoločného hesla aj token Strižne tak vedeli
 * prepísať heslo Jerryho, a pravidlo „spoločné heslo neotvorí konto" (login.ts)
 * sa dalo obísť jednou požiadavkou.
 *
 * K DÁTAM majú Jerry aj Terezka prístup rovnaký; toto sa týka len kont. Jedno
 * pravidlo pre server aj obe obrazovky s kontami (Uzávierka, Údaje).
 *
 *   správca  (konto s loginom `jerry`)  všetko okrem záchrany, tú nepotrebuje
 *   tréner   (iné aktívne konto)        len vlastné heslo
 *   záchrana (session „app")            len nové heslo existujúcemu kontu
 *   cudzí    (Strižňa, „btc", neznáme)  nič
 *
 * Správca sa pozná podľa LOGINU: meno sa dá premenovať, login je kľúč riadku.
 *
 * Záchrana je cesta „Zabudnuté heslo" z prihlasovacej obrazovky. Inak by sa
 * človek, ktorý heslo zabudol, do konta nevrátil, preto ostáva — ale ako vlastná
 * akcia s vlastným riadkom auditu, nie ako bežná zmena hesla.
 */
export type RolaKonta = "spravca" | "trener" | "zachrana" | "cudzi";
export type AkciaKonta = "nove" | "heslo" | "uprava" | "odhlas-vsade" | "zachrana";

export const LOGIN_SPRAVCU = "jerry";
export const IDENTITA_ZACHRANY = "app";
/** Identita tokenu Strižne (`zistiUzivatela` v auth.server.ts). */
export const IDENTITA_STRIZNE = "Strižňa";

/** Rola podľa identity zo session a riadku konta, ktorému patrí. */
export function rolaKonta(ja: string | null, konto: { login: string; active?: number | boolean | null } | null): RolaKonta {
  if (ja === IDENTITA_ZACHRANY) return "zachrana";
  if (!ja || ja === IDENTITA_STRIZNE || !konto) return "cudzi";
  if (konto.active === 0 || konto.active === false) return "cudzi";
  return konto.login === LOGIN_SPRAVCU ? "spravca" : "trener";
}

/** Smie rola túto akciu na tomto konte? `mojLogin` = konto prihláseného. */
export function smieKonta(rola: RolaKonta, mojLogin: string | null, akcia: AkciaKonta, cielLogin: string): boolean {
  switch (rola) {
    case "spravca": return akcia !== "zachrana";
    case "trener": return akcia === "heslo" && !!mojLogin && mojLogin === cielLogin;
    case "zachrana": return akcia === "zachrana";
    case "cudzi": return false;
  }
}
