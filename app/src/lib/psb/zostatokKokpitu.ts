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
 *
 * NEZAPLATENÝ BALÍČEK JE NULA. Jerry, 3. 10. 2026: „nezaplatený balík je 0."
 * Balíček, na ktorom v PTminderi visí otvorený poplatok, hodiny nedáva, kým
 * nepríde platba — inak klient, ktorý dlží, vidí na karte aj na stránke plus.
 * Lukáš Hanus mal 3. 10. zaplatené členstvo 6 h od 9. 9., sedem tréningov
 * od vtedy a druhé členstvo od 2. 10. s otvoreným poplatkom 6 990 Kč: karta
 * hovorila +5 h (12 − 7), pravda je −1 h. To isté Daniela Šašinková (+5
 * namiesto −3) a Martin Vaško. Nezaplatený balíček zostáva „aktívny" — určuje
 * názov členstva aj odkedy sa počíta — len jeho hodiny sú nula.
 *
 * ZOSTATOK MÁ ZNAMIENKO. Mínus nie je dlh, je to značka, že klient trénuje
 * nad rámec; ďalší zaplatený balíček ju prepíše na hodiny. Karta, stránka
 * klienta a register preto ukazujú to isté záporné číslo, nie nulu.
 */
import { normName } from "./format";
import { jeBeta } from "./beta";

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
  /**
   * Ukončený s vrátením peňazí (`ukoncenieBalicka.ts`). Nevyčerpané hodiny
   * dostal klient späť v peniazoch, takže zostáva NULA — nech hovorí
   * čokoľvek iný, formálne ešte platný balíček.
   */
  ukonceny?: boolean;
  /** Cena balíčka v Kokpite (barter Sofie, `barterovePredaje`). */
  cena?: number | null;
};

export type SedeniePreZostatok = { client: string; date: string; duration?: number };

export type ZostatokKokpitu = {
  /** Koľko hodín zostáva. Záporné = odtrénované nad rámec zaplatených. */
  zostatok: number;
  /** Koľko hodín je odtrénovaných nad rámec balíčkov (kladná časť mínusu). */
  nadRamec: number;
  /** Hodín v aktívnych ZAPLATENÝCH balíčkoch spolu. */
  spolu: number;
  /** Hodín v aktívnych balíčkoch, ktoré ešte nie sú zaplatené — tie sa nepočítajú. */
  nezaplateneHodin: number;
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
/** Kľúč nezaplateného balíčka: `normName(klient)|platnostOd` — deň otvoreného poplatku. */
export const klucNezaplateneho = (klient: string, den: string): string => `${normName(klient)}|${String(den || "").slice(0, 10)}`;

export function zostatokKokpitu(
  balicky: BalicekPreZostatok[],
  klient: string,
  sedenia: SedeniePreZostatok[],
  dnes: string,
  zadarmo: Set<string> = new Set(),
  /**
   * Balíčky s otvoreným poplatkom (kľúč `klucNezaplateneho`). Tá istá
   * definícia ako na osi klienta (`klientOsCasu`: poplatok s dátumom dňa,
   * keď balíček začal) — jedno pravidlo, nie dve.
   */
  nezaplatene: Set<string> = new Set(),
): ZostatokKokpitu | null {
  const k = normName(klient);
  /**
   * UKONČENÝ BALÍČEK JE KONIEC (Radek Baláž, 14. 10. 2026).
   *
   * Po ukončení 13. 10. ukazoval profil −5: ukončený balíček už dnes
   * neplatil, ale starší, dávno vyčerpaný, platil v PTminderi do 20. 10.
   * Karta vzala len ten a pripísala mu všetky tréningy od jeho začiatku
   * (18 h − 23). Kto má balíček ukončený a vrátené peniaze, má nula —
   * kým si nekúpi nový (vtedy rozhoduje bežné pravidlo nižšie).
   */
  // Len skutočný balíček. Ukončený PREVZATÝ ZOSTATOK z PTmindera (kotva —
  // „Doplnenie členstva“ k 20. 9.) je upratanie, nie koniec spolupráce
  // (22. 10. 2026: Panagiotis Tsiolis mal 18 h od 10. 9. a karta ukázala
  // 0 h, lebo jeho doplnenie bolo „ukončené 29. 9. — v PTminderi už nie je“).
  const ukonceny = balicky
    .filter((b) => normName(b.klient) === k && !b.zruseneAt && b.ukonceny && !b.kotva && den(b.platnostOd) <= dnes)
    .sort((a, b) => den(b.platnostOd).localeCompare(den(a.platnostOd)))[0];
  if (ukonceny && !balicky.some((b) => normName(b.klient) === k && !b.zruseneAt && !b.ukonceny && den(b.platnostOd) > den(ukonceny.platnostOd))) {
    const hod = ukonceny.hodiny || 0;
    return {
      zostatok: 0, nadRamec: 0, spolu: hod, nezaplateneHodin: 0, minute: hod, od: den(ukonceny.platnostOd),
      nazov: ukonceny.nazov, platnostDo: ukonceny.platnostDo || null, pausal: false,
    };
  }
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
  const jeNezaplateny = (b: BalicekPreZostatok) => nezaplatene.has(klucNezaplateneho(b.klient, b.platnostOd));
  const spolu = pausal ? 0 : aktivne.filter((b) => !jeNezaplateny(b)).reduce((a, b) => a + (b.hodiny || 0), 0);
  const nezaplateneHodin = pausal ? 0 : aktivne.filter(jeNezaplateny).reduce((a, b) => a + (b.hodiny || 0), 0);

  let minute = 0;
  for (const s of sedenia) {
    if (normName(s.client) !== k) continue;
    const d = den(s.date);
    if (d > dnes || d < od || (odVylucne && d === od) || zadarmo.has(`${k}|${d}`)) continue;
    minute += (s.duration || 60) / 60;
  }
  minute = Math.round(minute * 100) / 100;

  const rozdiel = Math.round((spolu - minute) * 100) / 100;
  return {
    zostatok: pausal ? 0 : rozdiel,
    nadRamec: pausal ? 0 : Math.max(0, -rozdiel),
    spolu, nezaplateneHodin, minute, od,
    nazov: najnovsi.nazov,
    platnostDo: najnovsi.platnostDo || null,
    pausal,
  };
}

/**
 * ZOSTATOK BEZ ZÁLOHY Z PTMINDERA (odchod z PTmindera, krok 3 — 20. 10. 2026).
 *
 * Do 19. 10. 2026 sa do PTmindera zapisovalo, takže klient bez aktívneho
 * balíčka v Kokpite dostal na karte číslo z exportu („z PTmindera — v Kokpite
 * nie je aktívny balíček"). Po poslednom exporte to číslo zamrzne: tréningy
 * v ňom už neklesajú a karta by navždy tvrdila hodiny, ktoré klient dávno
 * minul. Pravidlo odteraz: BEZ BALÍČKA V KOKPITE = BEZ BALÍČKA.
 *
 * PREPÍNAČ. Naostro sa zapína až po rozhodnutí Jerryho — overenie 20. 10.
 * 2026 našlo klientku (Kateřina Stoklásková), ktorej doplnenie 2 h z 11. 10.
 * je len v PTminderi a do Kokpitu sa nenalialo. Dovtedy beží len v bete
 * (`jeBeta()` = adresa kokpit-beta). Server (push, /v/, automatické
 * balíčky) beží vždy podľa `..._NAOSTRO` — v bete je to len náhľad obrazovky.
 *
 * O peniazoch rozhoduje `dlhyKlientov`, nie toto; poistka
 * `zaplateneVPtminderi` v ňom od 21. 10. 2026 platí len pre balíčky spred 1. 10.
 */
// ZAPNUTÉ NAOSTRO 20. 10. 2026 — Jerry: „nechaj ich odtrénovať". Obom
// Stoklasovým sa doplnenie 2 h zapísalo do Kokpitu (balicky, zdroj rucne);
// snímka pred/po nad ostrou DB: mení sa len „0 z N" → „0 z 0" u 22
// neaktívnych a jednej pauzy, nikto nedostane notifikáciu bezbalicka|.
export const ZOSTATOK_BEZ_PTMINDERA_NAOSTRO = true;
export const zostatokBezPtmindera = (): boolean => ZOSTATOK_BEZ_PTMINDERA_NAOSTRO || jeBeta();

/**
 * Dni, keď klient trénoval a v Kokpite mu v ten deň NEPLATIL žiadny balíček.
 *
 * Kryje ho akýkoľvek nezrušený balíček s platnosťou cez ten deň — aj
 * vyčerpaný (tréning nad rámec je mínus a hlási ho notifikácia hodín, nie
 * táto). Tréning zadarmo sa nepočíta; nič nechýba. Len od `od` (KOKPIT_OD):
 * staršie tréningy kryl PTminder a appka o nich nesúdi.
 */
export function treningyBezBalicka(
  balicky: BalicekPreZostatok[],
  klient: string,
  sedenia: SedeniePreZostatok[],
  od: string,
  dnes: string,
  zadarmo: Set<string> = new Set(),
): string[] {
  const k = normName(klient);
  const moje = balicky.filter((b) => normName(b.klient) === k && !b.zruseneAt);
  const dni = new Set<string>();
  for (const s of sedenia) {
    if (normName(s.client) !== k) continue;
    const d = den(s.date);
    if (!d || d < od || d > dnes || zadarmo.has(`${k}|${d}`)) continue;
    const kryty = moje.some((b) => den(b.platnostOd) <= d && (!b.platnostDo || d <= den(b.platnostDo)));
    if (!kryty) dni.add(d);
  }
  return [...dni].sort();
}
