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

/**
 * ODPOČET PO BALÍČKOCH — ako to robí človek s kartičkou (22. 10. 2026).
 *
 * Do 22. 10. 2026 platilo „hodiny aktívnych balíčkov mínus tréningy od
 * začiatku najstaršieho z nich". Kým žiadny balíček neskončí, je to to isté.
 * Keď ale skončí platnosť balíčka, ktorý sa prekrýval s ďalším, pravidlo
 * zahodilo jeho hodiny a tréningy, ktoré z neho odišli, nechalo visieť na
 * ostatných. Nezávislá kontrola (Fable) to overila na ostrých dátach: Martin
 * Vaško mal 22. 10. správne −1, ale 26. 10., keď mu skončí členstvo, by
 * ukázal −7 — doplnenie bez konca platnosti (kotva k 20. 9.) držalo začiatok
 * odpočtu a šesť tréningov skončeného členstva by sa odpočítalo druhýkrát.
 * To isté hrozilo Lozias, Sofii a každému s prekrývajúcimi sa balíčkami.
 *
 * Odteraz každý tréning minie hodinu z najstaršieho platného balíčka, ktorý
 * ešte hodiny má. Čo balíček nevyčerpal do konca platnosti, prepadne (ako
 * doteraz). Tréning, na ktorý hodina nezostala, je mínus a prvý ďalší
 * zaplatený balíček ho prepíše na hodiny („mínus je dočasná značka").
 *
 * KOTVA (zostatok prevzatý z PTmindera) je otváracia položka: PTminder v nej
 * má všetko do toho dňa, takže mínus spred nej sa ruší a tréning z toho dňa
 * sa neodpočíta.
 *
 * DOPLNENIE A PRENESENÉ HODINY sú zvyšok balíčka, ktorý práve skončil. Keď
 * začnú, balíčky končiace najneskôr v ten deň už nič nedávajú — inak by sa
 * zvyšok rátal dvakrát (raz v starom balíčku, raz v doplnení).
 *
 * Vráti zostatok: hodiny platných balíčkov mínus nepokrytý mínus.
 */
function odpocetPoBalickoch(
  balickyKlienta: BalicekPreZostatok[],
  k: string,
  sedenia: SedeniePreZostatok[],
  dnes: string,
  zadarmo: Set<string>,
  jeNezaplateny: (b: BalicekPreZostatok) => boolean,
): number {
  const { zvysok, minus } = prebehOdpoctu(balickyKlienta, k, sedenia, dnes, zadarmo, jeNezaplateny);
  let spolu = 0;
  for (const [b, r] of zvysok) if (jeAktivnyBalicek(b, dnes)) spolu += r;
  return Math.round((spolu - minus) * 100) / 100;
}

/**
 * Koľko hodín balíčku zostalo v posledný deň platnosti — to isté pravidlo
 * ako karta. Z toho sa berie prenos do ďalšieho mesiaca předplatného.
 */
export function zvysokNaKonci(
  balicky: BalicekPreZostatok[],
  klient: string,
  sedenia: SedeniePreZostatok[],
  balicek: BalicekPreZostatok,
  zadarmo: Set<string> = new Set(),
  nezaplatene: Set<string> = new Set(),
): number {
  const k = normName(klient);
  const koniecDna = den(balicek.platnostDo || "");
  if (!koniecDna) return 0;
  const { zvysok } = prebehOdpoctu(balicky.filter((b) => normName(b.klient) === k), k, sedenia, koniecDna, zadarmo,
    (b) => nezaplatene.has(klucNezaplateneho(b.klient, b.platnostOd)));
  return Math.round((zvysok.get(balicek) || 0) * 100) / 100;
}

function prebehOdpoctu(
  balickyKlienta: BalicekPreZostatok[],
  k: string,
  sedenia: SedeniePreZostatok[],
  dnes: string,
  zadarmo: Set<string>,
  jeNezaplateny: (b: BalicekPreZostatok) => boolean,
): { zvysok: Map<BalicekPreZostatok, number>; minus: number } {
  const moje = balickyKlienta.filter((b) => !b.zruseneAt && den(b.platnostOd) <= dnes && b.hodiny != null);
  const koniec = (b: BalicekPreZostatok) => (b.platnostDo ? den(b.platnostDo) : "9999-12-31");
  // Reťaz: platné balíčky a všetko, čo sa s nimi prekrýva (aj už skončené) —
  // skončený balíček minul tréningy, ktoré sa nesmú pripísať ďalším.
  let start = moje.filter((b) => jeAktivnyBalicek(b, dnes)).reduce((a, b) => (den(b.platnostOd) < a ? den(b.platnostOd) : a), dnes);
  for (let zmena = true; zmena;) {
    zmena = false;
    for (const b of moje) {
      if (den(b.platnostOd) < start && koniec(b) >= start) { start = den(b.platnostOd); zmena = true; }
    }
  }
  const retaz = moje.filter((b) => koniec(b) >= start)
    .sort((a, b) => den(a.platnostOd).localeCompare(den(b.platnostOd)) || koniec(a).localeCompare(koniec(b)));
  const zvysok = new Map<BalicekPreZostatok, number>();
  const jeZvysok = (b: BalicekPreZostatok) => !b.kotva && /doplnenie|prenesen/i.test(b.nazov);
  const dniKotvy = new Set(retaz.filter((b) => b.kotva).map((b) => den(b.platnostOd)));

  const treningy = sedenia
    .filter((s) => normName(s.client) === k)
    .map((s) => ({ d: den(s.date), h: (s.duration || 60) / 60 }))
    .filter((t) => t.d >= start && t.d <= dnes && !zadarmo.has(`${k}|${t.d}`) && !dniKotvy.has(t.d))
    .sort((a, b) => a.d.localeCompare(b.d));

  let minus = 0;
  let i = 0;
  const zacni = (b: BalicekPreZostatok) => {
    const d = den(b.platnostOd);
    if (b.kotva) minus = 0;
    // Čo zo skončených balíčkov naozaj zostalo — prenesené hodiny viac byť nemôžu.
    let zdroj = 0, zdrojov = 0;
    if (jeZvysok(b)) for (const [x, r] of zvysok) if (koniec(x) <= d) { zdroj += Math.max(0, r); zdrojov++; zvysok.set(x, 0); }
    // Ukončený prevzatý zostatok Jerry uzavrel („v PTminderi už nie je") —
    // nedáva nič (Jitka Heinrichová: inak by mala 5 h namiesto 4).
    let h = jeNezaplateny(b) || (b.kotva && b.ukonceny) ? 0 : b.hodiny || 0;
    /**
     * PRENESENÉ HODINY NIE SÚ VIAC, NEŽ ZOSTALO (Jaroslav Kalva, 23. 10. 2026).
     * Presun sa zapisuje tri dni pred koncom s vtedajším zostatkom: Kalvovi
     * 13. 10. zostávali 2 h, 15. 10. jednu ešte odtrénoval a prenieslo sa 2.
     * Doplnenie sa nestrihá — to môže byť aj hodina navyše z dobrej vôle.
     */
    if (/prenesen/i.test(b.nazov) && zdrojov > 0) h = Math.min(h, zdroj);
    const vezmi = Math.min(h, minus);
    h -= vezmi; minus -= vezmi;
    zvysok.set(b, h);
  };
  for (const t of treningy) {
    while (i < retaz.length && den(retaz[i].platnostOd) <= t.d) zacni(retaz[i++]);
    let h = t.h;
    for (const [b, r] of zvysok) {
      if (h <= 0) break;
      if (r <= 0 || koniec(b) < t.d) continue;
      const vezmi = Math.min(r, h);
      zvysok.set(b, r - vezmi); h -= vezmi;
    }
    minus += h;
  }
  while (i < retaz.length) zacni(retaz[i++]);
  return { zvysok, minus };
}

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

  // Paušál hodiny nepočíta; inak rozhoduje odpočet po balíčkoch.
  const rozdiel = pausal ? Math.round((spolu - minute) * 100) / 100
    : odpocetPoBalickoch(balicky.filter((b) => normName(b.klient) === k), k, sedenia, dnes, zadarmo, jeNezaplateny);
  if (!pausal) minute = Math.round((spolu - rozdiel) * 100) / 100;
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
