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
 * Adresa napísaná bez „https://".
 *
 * Jarvis ju tak píše bežne — „prosapiens.cz/arm-lines", „instagram.com/p/XY"
 * — a v krátkej odpovedi skoro vždy. Kým sa chytala len úplná adresa, polovica
 * odkazov zostala obyčajným textom a Jerry 17. 8. 2026 hlásil, že prekliky
 * chýbajú. Domény sú vymenované zámerne: „niečo.sk" vo vete je slovo, nie
 * odkaz, a robiť odkaz z každej bodky by vyrobilo viac škody než úžitku.
 */
const DOMENY = /^(?:www\.)?(prosapiens\.cz|instagram\.com|prosapiensbio\.workers\.dev)(\/\S*)?$/i;

export function jeAdresaBezSchemy(x: string): boolean {
  const t = (x || "").trim().replace(/[.,;:]$/, "");
  return !t.includes("://") && DOMENY.test(t);
}

/** Doplní „https://" tam, kde chýba. Vracia null, keď to adresa nie je. */
export function naPlnuAdresu(x: string): string | null {
  const t = (x || "").trim().replace(/[.,;:]$/, "");
  if (jeVonkajsiOdkaz(t)) return t;
  if (jeAdresaBezSchemy(t)) return `https://${t.replace(/^www\./i, "www.")}`;
  return null;
}

/**
 * Ciele navigácie v appke.
 *
 * Sú tu aj STARÉ id („financie", „vysledky", „6m"), lebo ich `navigate`
 * dodnes mapuje na dnešné miesta a odkazy s nimi fungujú. Vyhodiť ich zo
 * zoznamu by potichu zabilo funkčné odkazy v registri aj v starých debatách.
 */
export const CIELE = [
  // dnešné záložky. „mesiac“ je Výsledky a „udaje“ je Upload — nápisy sa
  // 29. 8. 2026 zmenili, id zámerne nie.
  "dashboard", "kalendar", "tracker", "vzas", "marketing", "mesiac", "udaje", "jarvis",
  // sekcie Klientov
  "treningy", "klienti",
  // presmerované staré id — navigate ich prekladá
  "vysledky", "financie", "6m",
] as const;

const MNOZINA = new Set<string>(CIELE);

/** Vedie tento cieľ na obrazovku, ktorá naozaj existuje? */
export function jePlatnyCiel(tab: string): boolean {
  return MNOZINA.has((tab || "").trim());
}

/**
 * Meno klienta v odpovedi: čo sa ZOBRAZÍ a kam odkaz VEDIE.
 *
 * Jarvis obaľuje mená do «». Do 18. 8. 2026 musel písať meno vždy v prvom
 * páde, lebo appka ním zároveň hľadala klienta — a vychádzalo z toho
 * „tréning s Richard Matl" v každej vete, kde niekoho spomenul. Skloňovať
 * za neho nevieme: slovenské priezviská sa ohýbajú rôzne a zlé skloňovanie
 * je horšie než žiadne.
 *
 * Preto tvar «Richardom Matlom|Richard Matl» — vľavo veta, vpravo kľúč.
 * Bez zvislice je to jedno aj druhé, takže staré odpovede fungujú ďalej.
 */
export function menoOdkazu(vnutro: string): { text: string; meno: string } {
  const [zobrazene = "", presne] = (vnutro || "").split("|");
  const text = zobrazene.trim();
  return { text, meno: (presne || zobrazene).trim() };
}

/** Vlastný web. Adresy v tabuľkách sú raz celé, raz len cesta. */
const WEB = "https://www.prosapiens.cz";

/**
 * Adresa podstránky vlastného webu — z čohokoľvek, čo je v tabuľke.
 *
 * Tabuľky o webe držia adresu v troch tvaroch: Search Console dáva celé
 * `https://www.prosapiens.cz/fascie/`, karta o rýchlosti si doménu odsekáva
 * a nechá `fascie/`, a v texte sa občas objaví `www.prosapiens.cz/fascie/`.
 * Preklik má fungovať vo všetkých troch, inak by to bol odkaz, ktorý raz
 * vedie a raz nie.
 *
 * Vracia null pri prázdnom vstupe a pri adrese na cudzí web — z tej sa
 * podstránka nášho webu spraviť nedá a tichý odkaz inam je horší než text.
 */
export function adresaStranky(url: string): string | null {
  const t = (url || "").trim();
  if (!t) return null;
  const plna = naPlnuAdresu(t);
  if (plna) return plna;
  // Cudzia doména alebo iná schéma — nie je to naša podstránka.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || /^(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/|$)/i.test(t)) return null;
  return `${WEB}/${t.replace(/^\/+/, "")}`;
}
