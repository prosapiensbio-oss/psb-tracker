/**
 * Čo vyšlo predtým, než niekto napísal.
 *
 * PREČO TO NIE JE „KOĽKO DOPYTOV MALO PRED SEBOU KLIENTSKY PRÍBEH"
 *
 * Publikuje sa 5–7 príspevkov mesačne. V ľubovoľných štrnástich dňoch teda
 * takmer vždy nejaký vyšiel — a keby sa počítalo len to, vyšlo by, že pred
 * 95 % dopytov bola edukácia, pred 60 % klientsky príbeh a pred každým dopytom
 * niečo. Také číslo nič nehovorí; hovorí len o tom, ako často sa publikuje.
 *
 * Preto sa každý podiel porovnáva so ZÁKLADOM: ako často tá kategória vyšla
 * v štrnástich dňoch pred NÁHODNÝM dňom toho istého obdobia. Rozdiel medzi
 * tými dvomi číslami je jediné, čo o obsahu naozaj niečo tvrdí.
 *
 * PREČO SA TO STÁLE NEDÁ BRAŤ AKO DÔKAZ
 *
 * Pri 35 dopytoch za rok a piatich kategóriách vychádza na jednu kategóriu pár
 * prípadov. Rozdiel „o 20 % častejšie" je pri siedmich dopytoch jeden človek.
 * Preto sa pri každom riadku vracia aj počet — a obrazovka má povinnosť ho
 * ukázať vedľa percenta, nie pod čiarou.
 */

export type Prispevok = { datum: string; kategoria: string };
export type Dopyt = { date: string };

export type Riadok = {
  kategoria: string;
  /** Koľko dopytov malo túto kategóriu v okne pred sebou. */
  dopytov: number;
  /** Podiel z dopytov, v %. */
  podielDopytov: number;
  /** Ako často tá kategória vyšla v okne pred bežným dňom, v %. */
  zaklad: number;
  /**
   * Podiel pri dopytoch mínus základ, v percentuálnych bodoch. Kladné číslo
   * znamená „pred dopytmi to vychádzalo častejšie než pred bežným dňom".
   */
  rozdiel: number;
  /** Koľko kusov tej kategórie v období vôbec vyšlo — miera vzorky. */
  kusov: number;
};

const denPred = (den: string, dni: number) =>
  new Date(Date.parse(`${den.slice(0, 10)}T00:00:00Z`) - dni * 86400000).toISOString().slice(0, 10);

/** Všetky dni od prvého po posledný dopyt — základ, proti ktorému sa meria. */
function dniObdobia(od: string, doD: string): string[] {
  const von: string[] = [];
  let d = od.slice(0, 10);
  for (let i = 0; i < 2000 && d <= doD.slice(0, 10); i++) {
    von.push(d);
    d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  return von;
}

/**
 * `dni` je šírka okna pred dňom. Štrnásť je dohodnuté zadanie: kratšie okno by
 * minulo ľudí, ktorí sa rozhodujú týždeň, dlhšie by zahrnulo skoro všetko.
 */
export function obsahPredDopytmi(dopyty: Dopyt[], prispevky: Prispevok[], dni = 14): {
  riadky: Riadok[]; dopytov: number; dniZakladu: number;
} {
  const platneD = dopyty.map((d) => d.date?.slice(0, 10)).filter((d): d is string => !!d).sort();
  const platneP = prispevky.filter((p) => p.datum && p.kategoria);
  const prazdne = { riadky: [], dopytov: platneD.length, dniZakladu: 0 };
  if (!platneD.length || !platneP.length) return prazdne;

  // Obdobie začína prvým príspevkom — pred ním niet čo merať — a končí tam,
  // kde skončí neskorší z dvoch zdrojov.
  //
  // Prvá verzia brala PRIENIK oboch rozsahov a bola priprísna: pri jednom
  // príspevku a jednom neskoršom dopyte vyšlo obdobie prázdne a funkcia
  // nevrátila nič. Základ sa navyše musí počítať nad DLHŠÍM úsekom než sú
  // samotné dopyty — základ meraný len na dňoch dopytov vyjde vždy rovnaký
  // ako podiel pri dopytoch a rozdiel by bol vždy nula.
  const odP = platneP.reduce((a, p) => (p.datum < a ? p.datum : a), platneP[0].datum).slice(0, 10);
  const doP = platneP.reduce((a, p) => (p.datum > a ? p.datum : a), platneP[0].datum).slice(0, 10);
  const od = odP;
  const poslednyDopyt = platneD[platneD.length - 1];
  const doD = poslednyDopyt > doP ? poslednyDopyt : doP;

  const vObdobi = platneD.filter((x) => x >= od && x <= doD);
  const dni_ = dniObdobia(od, doD);
  // Dopyty mimo obdobia obsahu sa nedajú vyhodnotiť — radšej nič než čísla
  // o dňoch, ku ktorým appka nemá jediný príspevok.
  if (!vObdobi.length || !dni_.length) return { riadky: [], dopytov: vObdobi.length, dniZakladu: dni_.length };

  const kategorie = [...new Set(platneP.map((p) => p.kategoria))];
  const maVOkne = (den: string, kat: string) => {
    const odKedy = denPred(den, dni);
    return platneP.some((p) => p.kategoria === kat && p.datum.slice(0, 10) < den.slice(0, 10) && p.datum.slice(0, 10) >= odKedy);
  };

  const riadky = kategorie.map((kat) => {
    const dopytovS = vObdobi.filter((d) => maVOkne(d, kat)).length;
    const dniS = dni_.filter((d) => maVOkne(d, kat)).length;
    const podielDopytov = (dopytovS / vObdobi.length) * 100;
    const zaklad = (dniS / dni_.length) * 100;
    return {
      kategoria: kat,
      dopytov: dopytovS,
      podielDopytov,
      zaklad,
      rozdiel: podielDopytov - zaklad,
      kusov: platneP.filter((p) => p.kategoria === kat && p.datum >= od && p.datum <= doD).length,
    };
  });

  return {
    riadky: riadky.sort((a, b) => b.rozdiel - a.rozdiel),
    dopytov: vObdobi.length,
    dniZakladu: dni_.length,
  };
}

/**
 * Vzorka, pri ktorej má zmysel o rozdiele hovoriť.
 *
 * Nie je to štatistika, je to brzda. Pri piatich dopytoch v kategórii je
 * rozdiel dvadsať percentuálnych bodov jeden človek, a obrazovka, ktorá to
 * napíše ako zistenie, klame.
 */
export const MALO_DAT = (r: Riadok) => r.dopytov < 8;
