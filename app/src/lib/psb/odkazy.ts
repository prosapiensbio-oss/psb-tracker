/**
 * Kam smie odkaz v Jarvisovej odpovedi viesť.
 *
 * Jerry, 16. 8. 2026: „toto musí fungovať na 100 %, aby prekliky viedli presne
 * tam, kam majú — a keď to vedie mimo Kokpitu, má sa otvoriť nová karta."
 *
 * Za jeden deň zlyhali tri odkazy v troch rôznych podobách: názov článku
 * obalený ako meno klienta, adresa Instagramu napísaná do políčka pre názov
 * záložky, a predtým neplatný cieľ po presťahovaní sekcie. Spoločné mali to,
 * že tlačidlo sa vykreslilo VŽDY a či niekam vedie sa zistilo až klikom.
 *
 * Preto sa cieľ overuje ešte pred vykreslením a existujú len tri možnosti:
 *   1. adresa mimo Kokpitu  → odkaz, ktorý sa otvorí v novej karte,
 *   2. platná obrazovka     → tlačidlo, ktoré prepne záložku,
 *   3. čokoľvek iné         → obyčajný text, ŽIADNE tlačidlo.
 *
 * Tretí bod je dôležitý: mŕtve tlačidlo je horšie než žiadne. Kto naň klikne
 * a nič sa nestane, prestane veriť aj tým, ktoré fungujú.
 */

/** Adresa mimo Kokpitu — článok na webe, príspevok na Instagrame, čokoľvek. */
export function jeVonkajsiOdkaz(x: string): boolean {
  return /^https?:\/\/\S+$/i.test((x || "").trim());
}

/**
 * Ciele navigácie v appke.
 *
 * Sú tu aj STARÉ id („financie", „vysledky", „6m"), lebo ich `navigate`
 * dodnes mapuje na dnešné miesta a odkazy s nimi fungujú. Vyhodiť ich zo
 * zoznamu by potichu zabilo funkčné odkazy v registri aj v starých debatách.
 */
export const CIELE = [
  // dnešné záložky
  "dashboard", "kalendar", "tracker", "vzas", "marketing", "mesiac", "jarvis",
  // sekcie Klientov
  "treningy", "klienti",
  // presmerované staré id — navigate ich prekladá
  "vysledky", "udaje", "financie", "6m",
] as const;

const MNOZINA = new Set<string>(CIELE);

/** Vedie tento cieľ na obrazovku, ktorá naozaj existuje? */
export function jePlatnyCiel(tab: string): boolean {
  return MNOZINA.has((tab || "").trim());
}
