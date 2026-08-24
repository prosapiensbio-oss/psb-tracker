import { FAZA_MAPA } from "./mapaCyklu";
import { ZABER_MAPA, type Pohyb } from "./zabery";

/**
 * Dĺžka príspevku a sekvencia záberov.
 *
 * NA ČOM STOJÍ ODPORÚČANÁ DĹŽKA
 *
 * 1. VLASTNÉ DÁTA PSB (najdôležitejšie). 79 príspevkov s nameraným časom
 *    sledovania z Metricoolu, 23. 8. 2026: medián 12,7 s na jedno pozretie,
 *    75 % pod 16,1 s, 90 % pod 19,9 s. Ich publikum jednoducho pozerá trinásť
 *    sekúnd. Štyridsaťpäťsekundové video znamená, že dve tretiny obsahu nikto
 *    neuvidí.
 * 2. Zároveň: dlhšie sledované príspevky NEMAJÚ viac uložení (1,77 vs 2,00) —
 *    naháňať čas sledovania nie je to isté ako naháňať zámer. Preto je dĺžka
 *    odporúčanie, nie cieľ.
 * 3. Vonkajšie meranie ako strop: krátke video pod 30 s dokončí 65–70 % ľudí,
 *    okolo 60 s asi 70 %; najvýkonnejšie pásmo je 21–60 s.
 *
 * PREČO SA LÍŠI PODĽA FÁZY
 *
 * Človek, ktorý o probléme nevie, nemá dôvod vydržať — tam sa musí zmestiť do
 * pár sekúnd. Kto sa rozhoduje medzi nami a niekým iným, vydrží dlhšie, lebo
 * hľadá dôkaz. Nie je to vkus, je to rozdielna motivácia diváka.
 */
export type Dlzka = { min: number; max: number; preco: string };

export const DLZKA_PODLA_FAZY: Record<number, Dlzka> = {
  1: { min: 8, max: 15, preco: "Nemá dôvod vydržať — o probléme nevie. Musíš sa zmestiť pod medián sledovania (12,7 s)." },
  2: { min: 12, max: 20, preco: "Príznak už pozná, takže počúva — ale len kým nepočuje, že ide o predaj." },
  3: { min: 15, max: 30, preco: "Porovnáva riešenia a potrebuje vysvetlenie, prečo doterajšie pokusy nezabrali." },
  4: { min: 20, max: 45, preco: "Rozhoduje sa a hľadá dôkaz. Tu sa dlhšia stopáž vracia — vydrží, lebo chce." },
  5: { min: 30, max: 60, preco: "Je pripravený. Klientsky príbeh smie dýchať; kratší by pôsobil ako reklama." },
};

/** Priemerná dĺžka jedného záberu. Pod 2 s je to seká, nad 5 s pozornosť opadá. */
export const ZABER_SEK = { min: 2, ideal: 3, max: 5 };

/**
 * Koľko záberov sa do danej dĺžky zmestí.
 *
 * Vychádza z toho, že najvýkonnejšie krátke videá majú strih každé 2–4 sekundy
 * a divák potrebuje asi 3 sekundy, aby záber vôbec vstrebal. Priemerná dĺžka
 * záberu vo filme klesla z 12 s (1930) na ~2,5 s dnes — nie je to módna vec,
 * je to zmena toho, ako sa pozerá.
 */
export function pocetZaberov(sekund: number): { min: number; max: number } {
  return {
    min: Math.max(2, Math.round(sekund / ZABER_SEK.max)),
    max: Math.max(3, Math.round(sekund / ZABER_SEK.min)),
  };
}

export type Krok = {
  /** Id záberu z katalógu ZABERY, alebo prázdne, keď to ešte nie je rozhodnuté. */
  zaber: string;
  /** Čo je v tomto zábere vidieť — jedna veta. */
  co: string;
  /** Veta z hotového textu, ktorá k záberu patrí. */
  veta: string;
  sekund: number;
};

export type Nalez = { index: number; text: string; tvrdy: boolean };

/**
 * Kontrola sekvencie proti pravidlám strihu.
 *
 * PREČO TO KONTROLUJE APPKA A NIE MODEL
 *
 * Sú to tvrdé pravidlá s jednoznačným výsledkom — dva rovnaké pohyby po sebe
 * buď sú, alebo nie sú. Model by to posúdil zakaždým trochu inak a raz za čas
 * prehliadol. Čo sa dá spočítať, nenechávaj počítať v odpovedi.
 *
 * `tvrdy` odlišuje chybu od odporúčania: dva rovnaké pohyby za sebou sú chyba,
 * dlhý záber je len upozornenie.
 */
export function skontrolujSekvenciu(kroky: Krok[], cielSekund: number): Nalez[] {
  const n: Nalez[] = [];
  if (!kroky.length) return n;

  for (let i = 0; i < kroky.length; i++) {
    const k = kroky[i];
    if (k.sekund > ZABER_SEK.max) {
      n.push({ index: i, text: `Záber má ${k.sekund} s — nad ${ZABER_SEK.max} s pozornosť opadá.`, tvrdy: false });
    }
    if (k.sekund > 0 && k.sekund < ZABER_SEK.min) {
      n.push({ index: i, text: `Záber má ${k.sekund} s — pod ${ZABER_SEK.min} s ho divák nestihne vstrebať.`, tvrdy: false });
    }
    if (i === 0) continue;

    const a = ZABER_MAPA.get(kroky[i - 1].zaber)?.pohyb;
    const b = ZABER_MAPA.get(k.zaber)?.pohyb;
    if (!a || !b) continue;

    // Dva rovnaké pohyby za sebou. Pri nájazde to pôsobí ako zadrhnutie,
    // pri švihu sa z prostriedku stane trik.
    if (a === b && a !== "statický") {
      n.push({ index: i, text: `Dvakrát za sebou „${popisPohybu(a)}“ — pôsobí to ako chyba strihu. Zmeň druhý záber.`, tvrdy: true });
    }
    // Dva statické zábery po sebe: bez zmeny veľkosti je to skok (pravidlo 30°).
    if (a === "statický" && b === "statický") {
      n.push({ index: i, text: "Dva statické zábery po sebe — bez zmeny uhla a veľkosti to vyzerá ako preskočený strih.", tvrdy: true });
    }
    if (a === "švih" && b === "švih") {
      n.push({ index: i, text: "Dva švihy za sebou — z prostriedku sa stane trik.", tvrdy: true });
    }
  }

  const spolu = kroky.reduce((s, k) => s + (k.sekund || 0), 0);
  if (spolu > cielSekund * 1.3) {
    n.push({ index: -1, text: `Sekvencia trvá ${spolu} s, cieľ je ${cielSekund} s. Uber záber alebo skráť.`, tvrdy: false });
  }
  const rovnake = new Set(kroky.map((k) => k.zaber).filter(Boolean));
  if (kroky.length >= 3 && rovnake.size === 1) {
    n.push({ index: -1, text: "Celá sekvencia je jeden druh pohybu — striedanie veľkosti a pohybu drží pozornosť viac než samotný pohyb.", tvrdy: false });
  }
  return n;
}

const POPIS: Record<Pohyb, string> = {
  dopredu: "nájazd", odhalenie: "odhalenie", "oblúk": "oblúk",
  sklopenie: "z detailu na celok", "švih": "švih", "statický": "statický záber",
};
export const popisPohybu = (p: Pohyb) => POPIS[p];

/** Riadok o dĺžke do zadania pre Project. */
export function dlzkaDoZadania(faza: number): string {
  const d = DLZKA_PODLA_FAZY[faza];
  if (!d) return "";
  const z = pocetZaberov(d.max);
  return `DĹŽKA: ${d.min}–${d.max} sekúnd, teda zhruba ${z.min}–${z.max} záberov. ${d.preco} `
    + `Publikum PSB pozerá v mediáne 12,7 s na jedno pozretie (79 meraných príspevkov) — čo je za tým, to nikto neuvidí.`;
}

/** Názov fázy pre hlavičku — nech si obrazovka a zadanie neprotirečia. */
export const fazaNazov = (f: number) => FAZA_MAPA.get(f)?.nazov ?? "Nezaradené";

/**
 * Rozpísaná sekvencia do zadania pre Project.
 *
 * Ide tam CELÁ a s pokynom pripomienkovať, nie navrhovať znova. Keby ju
 * Project prepísal od nuly, zahodí sa rozhodnutie, ktoré Jerry už spravil —
 * a to je tá istá chyba ako pri hotovom texte.
 */
export function sekvenciaDoZadania(json: string): string {
  if (!json) return "";
  let kroky: Krok[];
  try {
    const p: unknown = JSON.parse(json);
    if (!Array.isArray(p)) return "";
    kroky = p as Krok[];
  } catch { return ""; }
  if (!kroky.length) return "";

  const riadky = kroky.map((k, i) => {
    const z = ZABER_MAPA.get(k.zaber);
    const casti = [
      `${i + 1}. ${z ? z.nazov : "záber neurčený"} (${k.sekund || "?"} s)`,
      k.co ? `vidieť: ${k.co}` : "",
      k.veta ? `veta: ${k.veta}` : "",
    ].filter(Boolean);
    return `   ${casti.join(" — ")}`;
  });
  const spolu = kroky.reduce((s, k) => s + (k.sekund || 0), 0);
  return [
    `SEKVENCIA ZÁBEROV (spolu ${spolu} s) — pripomienkuj ju, nenavrhuj znova:`,
    ...riadky,
    "Povedz, kde text a obraz nesedia, a ktorú vetu skrátiť, aby sa do svojho záberu zmestila.",
  ].join("\n");
}

/**
 * Koľko hashtagov je v texte.
 *
 * Caption ich má na konci — po zlúčení polí sa nedajú spočítať z vlastného
 * stĺpca, tak sa počítajú z textu. Zámerne to počíta len značky na hranici
 * slova, aby „#" uprostred vety alebo v adrese nerobilo falošný počet.
 */
export const pocetHashtagov = (text: string) =>
  ((text || "").match(/(?:^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
