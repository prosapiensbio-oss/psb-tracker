/**
 * PŘEDPLATNÉ POKRAČUJE SAMO (Jerry, 22. 10. 2026).
 *
 * Podmienky předplatného: 6 mesiacov, 6 h mesačne, nevyužité hodiny sa dajú
 * preniesť do ďalšieho mesiaca (najviac 2). Do toho dňa vznikalo ďalšie
 * obdobie až prvým tréningom, takže Robin Martinek mal 21. 10. ráno prázdnu
 * kartu, hoci 16. 10. zaplatil 6 990 Kč za obdobie od 21. 10. — a rytmus
 * sa posúval o deň, keď prišiel o deň neskôr.
 *
 * Ďalší mesiac vznikne PRVÝM TRÉNINGOM po konci predošlého (od 25. 10.
 * 2026; 22.–24. 10. vznikal v deň po konci):
 *  - kým předplatné ide v rade za sebou — aj po 6 mesiacoch ďalší polrok
 *    (Jerry, 22. 10. 2026: „nech pokračuje aj ďalší polrok"); polroky sa
 *    rátajú od prvého předplatného v rade („áno, od prvého"),
 *  - hodiny a cena podľa cenníka (stála iná cena dvakrát po sebe sa drží,
 *    ako pri `navrhNovehoBalicka`),
 *  - nevyužité hodiny sa prenesú samy, najviac 2 (na tie má klient podľa
 *    podmienok nárok vždy); o zvyšku nad 2 sa Kokpit pýta pred koncom
 *    mesiaca (`zostavaPoPlatnosti`, Jerry: „nech sa Kokpit opýta"). Keď
 *    Jerry na tú otázku odpovie „nechať prepadnúť", neprenáša sa nič.
 *
 * Keď klient minie hodiny skôr, nové obdobie začne skôr (Jerry 22. 10.:
 * pravidlo A) — zakladá ho tréning (`navrhNovehoBalicka`) a odtiaľto sa už
 * nič nezakladá, lebo ďalší balíček existuje.
 */
import { CENNIK, platnostDo } from "./cennik";
import { normName } from "./format";
import { jePredplatne, nazovProduktu } from "./nazvyProduktov";
import { PRESUN_MAX_HODIN } from "./platnostZostatok";
import { zvysokNaKonci, type BalicekPreZostatok, type SedeniePreZostatok } from "./zostatokKokpitu";

export type BalicekPredplatneho = BalicekPreZostatok & { cena?: number | null; zdroj?: string };

export type PokracovaniePredplatneho = {
  klient: string;
  odDna: string;
  doDna: string;
  nazov: string;
  hodiny: number;
  cena: number;
  /** Předplatné, ktoré skončilo. */
  predosle: { nazov: string; od: string; do: string };
  /** Koľko hodín mu na konci zostalo. */
  nevycerpane: number;
  /** Koľko sa prenesie samo — najviac 2 h. */
  prenos: number;
  /** Začiatok záväzku, koľký mesiac polroka a koľký polrok to je. */
  zaciatokZavazku: string;
  mesiac: number;
  polrok: number;
  cenaPoznamka?: string;
};

const den = (s: string | null | undefined) => String(s || "").slice(0, 10);
const posunDni = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Predplatné obdobia s medzerou do mesiaca sú jeden záväzok (chorobou, zmrazením). */
const MEDZERA_DNI = 31;
const ZAVAZOK_MESIACOV = 6;

const jeZvysok = (b: { nazov: string }) => /doplnenie|prenesen/i.test(b.nazov);

export function pokracovaniePredplatneho(
  klient: string,
  balicky: BalicekPredplatneho[],
  /** Staršie obdobia předplatného z PTmindera (história) — na začiatok záväzku. */
  historia: { nazov: string; od: string; do: string }[],
  sedenia: SedeniePreZostatok[],
  dnes: string,
  zadarmo: Set<string> = new Set(),
  nezaplatene: Set<string> = new Set(),
): PokracovaniePredplatneho | null {
  const k = normName(klient);
  const moje = balicky.filter((b) => normName(b.klient) === k && !b.zruseneAt);
  const predplatne = moje
    .filter((b) => jePredplatne(b.nazov) && b.hodiny != null && b.platnostDo && den(b.platnostOd) <= dnes)
    .sort((a, b) => den(a.platnostOd).localeCompare(den(b.platnostOd)));
  const posledne = predplatne[predplatne.length - 1];
  if (!posledne || den(posledne.platnostDo) >= dnes || posledne.ukonceny) return null;
  // Ďalší balíček už je (minul skôr, kúpil iný produkt) — nič sa nezakladá.
  if (moje.some((b) => b !== posledne && !jeZvysok(b) && !b.kotva && den(b.platnostOd) > den(posledne.platnostOd))) return null;
  /**
   * NOVÝ MESIAC ZAČÍNA PRVÝM TRÉNINGOM PO KONCI (Jerry, 25. 10. 2026: „nový
   * mesiac vždy bude začínať prvým tréningom"). Deň po konci posúval rytmus
   * na dni, keď klient nebol — Kalva skončil 16. 10., prišiel 19. 10.
   * a mesiac mu bežal od 17. Sedenia sú len tie, ktoré už začali, takže
   * dnešný tréning o 18:00 ráno nič nezaloží.
   */
  const koniec = den(posledne.platnostDo);
  const prvy = sedenia
    .filter((s) => normName(s.client) === k && den(s.date) > koniec && den(s.date) <= dnes && !zadarmo.has(`${k}|${den(s.date)}`))
    .map((s) => den(s.date))
    .sort()[0];
  if (!prvy) return null;
  const odDna = prvy;
  // Kto po konci mesiac neprišiel, nepokračuje automaticky — to je návrat.
  if (odDna > posunDni(koniec, MEDZERA_DNI)) return null;

  // Začiatok záväzku: prvé předplatné v rade za sebou (Kokpit aj PTminder).
  const obdobia = [
    ...predplatne.map((b) => ({ od: den(b.platnostOd), do: den(b.platnostDo) })),
    ...historia.filter((h) => jePredplatne(h.nazov) && h.od && h.do).map((h) => ({ od: den(h.od), do: den(h.do) })),
  ].sort((a, b) => a.od.localeCompare(b.od));
  let zaciatok = den(posledne.platnostOd);
  for (let zmena = true; zmena;) {
    zmena = false;
    for (const o of obdobia) {
      if (o.od < zaciatok && o.do >= posunDni(zaciatok, -MEDZERA_DNI)) { zaciatok = o.od; zmena = true; }
    }
  }
  const poradie = obdobia.filter((o) => o.od >= zaciatok && o.od <= den(posledne.platnostOd))
    .reduce((s, o, i, xs) => (i > 0 && o.od === xs[i - 1].od ? s : s + 1), 0) + 1;

  const pekny = nazovProduktu(posledne.nazov);
  const sablona = CENNIK.find((s) => s.nazov === pekny && (s.hodiny || 0) > 0)
    ?? CENNIK.find((s) => s.nazov === "6h Předplatné")!;
  const ceny = predplatne.slice(-2).map((b) => (b.cena == null ? null : Math.round(Number(b.cena))));
  const katalog = sablona.cena ?? 0;
  const stalaInaCena = ceny.length === 2 && ceny[0] != null && ceny[0] === ceny[1] && ceny[0] !== katalog;
  const cena = stalaInaCena ? (ceny[1] as number) : katalog;

  const nevycerpane = Math.max(0, zvysokNaKonci(moje, klient, sedenia, posledne, zadarmo, nezaplatene));
  return {
    klient: posledne.klient,
    odDna,
    doDna: platnostDo(odDna, sablona.tyzdnov, sablona.mesiacov),
    nazov: sablona.nazov,
    hodiny: sablona.hodiny || 6,
    cena,
    predosle: { nazov: posledne.nazov, od: den(posledne.platnostOd), do: den(posledne.platnostDo) },
    nevycerpane,
    prenos: Math.min(nevycerpane, PRESUN_MAX_HODIN),
    zaciatokZavazku: zaciatok,
    mesiac: ((poradie - 1) % ZAVAZOK_MESIACOV) + 1,
    polrok: Math.floor((poradie - 1) / ZAVAZOK_MESIACOV) + 1,
    cenaPoznamka: stalaInaCena ? `platí stále ${cena} Kč, cenník je ${katalog}` : undefined,
  };
}
