/**
 * Šmyknutie dvoma prstami po trackpade → o kartu ďalej alebo späť.
 *
 * macOS posiela vodorovné šmýkanie ako `wheel` s deltaX; žiadne prsty sa
 * „nevidia". Rozhodovanie je tu, mimo komponentu, aby sa dalo odskúšať —
 * prvá verzia žila v `useEffect` a jej chybu našiel až Jerry rukou.
 *
 * PREČO TO PRVÁ VERZIA VEDELA LEN RAZ
 *
 * Zámok po prepnutí sa púšťal po 260 ms úplného TICHA. Lenže Mac po šmyknutí
 * posiela dozvuk zotrvačnosti ešte vyše sekundu a každá jeho udalosť ticho
 * odložila. Kto šmykol druhýkrát počas dozvuku, ten ho odložil znova — zámok
 * sa tak dal držať donekonečna presne tým, čím ho chcel človek pustiť.
 * Jerry: „mám pocit, že to funguje iba raz a druhý raz už používam tlačidlo."
 *
 * Nečaká sa preto na ticho, ale na DOZNENIE. Dozvuk je veľký a rýchlo slabne;
 * nové gesto prstami začína malými hodnotami. Zámok padne, len čo príde slabá
 * udalosť alebo medzera — a poistkou je časovač v komponente, ktorý ho pustí
 * sám, keď dozvuk skončí.
 */

export type StavGesta = {
  /** Koľko sa nazbieralo v prebiehajúcom geste. */
  suma: number;
  /** Beží dozvuk po prepnutí? Kým beží, nové prepnutie sa neprijíma. */
  cakaNaPokoj: boolean;
  /** Čas poslednej udalosti. */
  tik: number;
};

export const novyStavGesta = (): StavGesta => ({ suma: 0, cakaNaPokoj: false, tik: 0 });

/** Nad týmto je udalosť ešte dozvuk, nie prst. */
const SILNY = 3;
/** Takáto medzera medzi udalosťami už znamená nové gesto. */
const MEDZERA_MS = 180;
/** Kratšia medzera stačí na to, aby sa dozvuk považoval za doznený. */
const POKOJ_MS = 120;

/**
 * Spracuje jednu udalosť kolesa. Vracia smer (1 ďalej, −1 späť), alebo 0.
 * Stav `g` sa mení na mieste — je to ref v komponente.
 */
export function krokGesta(
  g: StavGesta,
  e: { deltaX: number; deltaY: number; cas: number },
  prah = 60,
): 1 | -1 | 0 {
  // Zvislé rolovanie sa nesmie ukradnúť — inak by sa karta prepla vždy, keď
  // niekto roluje zoznam vnútri nej.
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return 0;

  const medzera = e.cas - g.tik;
  g.tik = e.cas;

  if (g.cakaNaPokoj) {
    if (Math.abs(e.deltaX) > SILNY && medzera < POKOJ_MS) return 0;
    g.cakaNaPokoj = false;
    g.suma = 0;
  }
  if (medzera > MEDZERA_MS) g.suma = 0;

  g.suma += e.deltaX;
  if (Math.abs(g.suma) < prah) return 0;

  const smer: 1 | -1 = g.suma > 0 ? 1 : -1;
  g.suma = 0;
  g.cakaNaPokoj = true;
  return smer;
}

/**
 * ŤAH PRSTOM PO DOTYKOVEJ OBRAZOVKE.
 *
 * Jerry, 28. 9. 2026: „na telefóne sa mi nedajú jednotlivé karty vo
 * Workspace posúvať posunom palca do strany." Nedali — `krokGesta` vyššie
 * číta `wheel`, a ten telefón neposiela vôbec.
 *
 * ROZHODUJE SA POČAS ŤAHU, NIE AŽ NA JEHO KONCI.
 *
 * Prvá verzia čakala na zdvihnutie prsta a merala aj čas: ťah dlhší než
 * 800 ms sa nepočítal, aby sa označovanie textu nepletlo so švihnutím.
 * Jerrymu nezabrala ani raz. Človek, ktorý skúša, či appka vôbec reaguje,
 * ťahá POMALY a sleduje pritom obrazovku — a presne taký ťah podmienka
 * zahodila. Čas je preto preč a smer padne hneď, ako prst prejde kus cesty;
 * karta sa pohne ešte počas ťahu, takže je aj vidieť, že gesto zabralo.
 *
 * DVE PODMIENKY, KAŽDÁ MÁ SVOJ DÔVOD
 *
 *  • Vodorovná zložka musí byť väčšia než zvislá. Vnútri karty sa roluje
 *    prstom; pri rolovaní je zvislá zložka násobne väčšia, takže sa karta
 *    neprepne. Pôvodný 1,5-násobok bol priveľa: palec ide po OBLÚKU a pri
 *    ťahu o 80 px do strany klesne aj o 50.
 *  • Musí prejsť aspoň kus šírky — krátke šklbnutie býva začiatok rolovania
 *    alebo nepresný klik na meno klienta.
 */
export type StavSvihu = { x: number; y: number; cas: number; aktivny: boolean };

export const novyStavSvihu = (): StavSvihu => ({ x: 0, y: 0, cas: 0, aktivny: false });

export const zacniSvih = (s: StavSvihu, x: number, y: number, cas: number): void => {
  s.x = x; s.y = y; s.cas = cas; s.aktivny = true;
};

/**
 * `1` = ďalšia karta, `-1` = predchádzajúca, `0` = zatiaľ nič.
 *
 * Volá sa pri KAŽDOM pohybe aj na konci ťahu. Len čo raz odpovie, ťah sa
 * uzavrie — druhé volanie vráti nulu, takže jeden ťah prepne o jednu kartu
 * a nie o tri.
 */
export function krokSvihu(s: StavSvihu, x: number, y: number, sirkaOkna: number): 1 | -1 | 0 {
  if (!s.aktivny) return 0;
  const dx = x - s.x;
  const dy = y - s.y;
  if (Math.abs(dx) <= Math.abs(dy)) return 0;
  // Na úzkej obrazovke je 12 % šírky ~45 px, na širokej by to bolo priveľa —
  // preto strop. Spodná hranica drží krátke šklbnutia mimo.
  const hranica = Math.max(44, Math.min(sirkaOkna * 0.12, 110));
  if (Math.abs(dx) < hranica) return 0;
  s.aktivny = false;
  // Ťah doľava odkrýva to, čo je vpravo — teda ďalšiu kartu.
  return dx < 0 ? 1 : -1;
}
