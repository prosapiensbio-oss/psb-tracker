/**
 * PLATBY MESIACA — čo treba každý mesiac poslať RUČNE.
 *
 * Jerry, 30. 10. 2026, nad zoznamom pravidelných výdavkov: „z týchto platieb
 * chcem, aby si mi spravil zoznam, ktorý musím odklikať, alebo ktorý sa mi
 * pripomenie, že mám zaplatiť." Spúšťačom bol október: Jarvis tvrdil, že je
 * všetko zaplatené, a nájom Fanderlíková (29 750 Kč) vo výpise nebol.
 *
 * Kartou strhávané predplatné (Claude, Adobe, PTminder…) sem nepatria —
 * zaplatia sa samy. Sem patrí len to, na čo sa dá ZABUDNÚŤ.
 *
 * Zaplatené sa pozná dvoma spôsobmi a stačí jeden:
 * 1. pohyb vo výpise z Fio v tom mesiaci (sťahuje sa každú noc, takže
 *    dnešný prevod odškrtne zajtra ráno),
 * 2. Jerryho klik „zaplatené" — kľúč `platba-mesiaca|<id>|<RRRR-MM>`
 *    v `anomaly_ack`. Ten istý kľúč má notifikácia, takže „Vybavené"
 *    v notifikácii odškrtne aj zoznam a naopak.
 */
import { dnesPraha } from "./cas";

export type PohybPlatby = { datum: string; suma: number; kategoria: string; text: string };

export type PravidelnaPlatba = {
  id: string;
  nazov: string;
  /** Na zobrazenie — pri štáte Terezky sú to dve platby, pri Jarkovi rozpätie. */
  suma: string;
  /** Deň v mesiaci, od ktorého sa pripomína. */
  den: number;
  /** Doplnok k termínu, keď ho Jerry povedal inak než „pripomenúť X." */
  termin?: string;
  /** Koľko pohybov za mesiac znamená „zaplatené" (štát Terezky = zdravotné + sociálne). */
  pocet?: number;
  je: (p: PohybPlatby) => boolean;
};

const t = (p: PohybPlatby) => p.text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const PRAVIDELNE_PLATBY: PravidelnaPlatba[] = [
  {
    id: "stat-jerry", nazov: "Štát Jerry", suma: "9 761 Kč", den: 15,
    je: (p) => p.kategoria === "fixne.prevadzka.statJerry",
  },
  {
    id: "stat-terezka", nazov: "Štát Terezka", suma: "3 024 + 1 595 Kč", den: 18, pocet: 2,
    je: (p) => p.kategoria === "fixne.prevadzka.statTerezka",
  },
  {
    id: "najom-pradlacka", nazov: "Nájom Přadlácká", suma: "23 000 Kč", den: 23,
    je: (p) => p.kategoria === "spolocne.Nájom" || /pradl/.test(t(p)) && /najom|najem/.test(t(p)),
  },
  {
    // Kaucia (25 000, 3. 9.) aj upratovanie (2 750) nesú meno ulice — nájom nie sú.
    id: "najom-fanderlikova", nazov: "Nájom Fanderlíková", suma: "29 750 Kč", den: 24,
    je: (p) => !/kauc|uprat/.test(t(p))
      && (p.kategoria === "fixne.prevadzka.najom" || /fanderl/.test(t(p)) && /najom|najem/.test(t(p))),
  },
  {
    // „pripomenúť do 25." — zaplatiť do 25., preto pripomienka o päť dní skôr.
    id: "splatka-jarek", nazov: "Splátka Jarek", suma: "5 000–6 000 Kč", den: 20, termin: "do 25.",
    je: (p) => p.kategoria === "fixne.prevadzka.splatkaJarek",
  },
];

/** Prvý mesiac, za ktorý sa pýta — staršie mesiace nikto spätne platiť nebude. */
export const PLATBY_MESIACA_OD = "2026-10";

export const klucPlatbyMesiaca = (id: string, mesiac: string) => `platba-mesiaca|${id}|${mesiac}`;

export type StavPlatby = {
  platba: PravidelnaPlatba;
  mesiac: string;
  /** Pohyby z banky, ktoré ju v tom mesiaci kryjú. */
  pohyby: PohybPlatby[];
  /** „banka" = vo výpise, „rucne" = odkliknuté, null = nezaplatené. */
  zaplatene: "banka" | "rucne" | null;
  /** Deň pripomenutia v tom mesiaci už prišiel. */
  pripomenut: boolean;
};

const predoslyMesiac = (m: string) => {
  const [r, mm] = m.split("-").map(Number);
  return mm === 1 ? `${r - 1}-12` : `${r}-${String(mm - 1).padStart(2, "0")}`;
};

/** Stav všetkých platieb za jeden mesiac. */
export function stavPlatieb(
  mesiac: string,
  pohyby: PohybPlatby[],
  ack: Record<string, unknown>,
  dnes: string = dnesPraha(),
): StavPlatby[] {
  const vMesiaci = pohyby.filter((p) => p.datum.slice(0, 7) === mesiac && p.suma < 0);
  return PRAVIDELNE_PLATBY.map((platba) => {
    const kryje = vMesiaci.filter(platba.je);
    const zaplatene = kryje.length >= (platba.pocet || 1) ? "banka" as const
      : ack[klucPlatbyMesiaca(platba.id, mesiac)] ? "rucne" as const : null;
    const denPripomenutia = `${mesiac}-${String(platba.den).padStart(2, "0")}`;
    return { platba, mesiac, pohyby: kryje, zaplatene, pripomenut: dnes.slice(0, 10) >= denPripomenutia };
  });
}

/**
 * Čo treba zaplatiť — bežný mesiac od dňa pripomenutia a predošlý celý.
 *
 * Predošlý mesiac preto, že nezaplatený nájom 1. novembra nezmizne len tým,
 * že sa otočil kalendár. Starší než predošlý sa už nepýta.
 */
export function platbyNaZaplatenie(
  pohyby: PohybPlatby[],
  ack: Record<string, unknown>,
  dnes: string = dnesPraha(),
): StavPlatby[] {
  const teraz = dnes.slice(0, 7);
  const mesiace = [predoslyMesiac(teraz), teraz].filter((m) => m >= PLATBY_MESIACA_OD);
  return mesiace.flatMap((m) => stavPlatieb(m, pohyby, ack, dnes))
    .filter((s) => !s.zaplatene && s.pripomenut);
}
