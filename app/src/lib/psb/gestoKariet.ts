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
