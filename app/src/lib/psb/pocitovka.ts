/**
 * POCITOVKA — tri otázky, ktoré si klepne klient sám.
 *
 * Jerry, 30. 9. 2026: „do SMS pridať nejaký subjektívny progres vnímania
 * pokroku, kde v troch otázkach na stupnici od 1 do 10 by sám zaťukal — to,
 * čo sme povedali, že robiť nebudeme, lebo je to robota navyše, tak že by to
 * robil ten klient sám."
 *
 * Meranie bolesti bolo 24. 9. 2026 zrušené a dôvod bol JEDINÝ: pri každom
 * tréningu by to bola práca navyše pre trénera. Tým, že sa pýta stránka,
 * na ktorú klient aj tak klikne z SMS, ten dôvod padol.
 *
 * SMER NIE JE PRI VŠETKÝCH ROVNAKÝ a je to zámer. Bolesť sa na svete meria
 * tak, že desať je najhoršie — prevrátiť ju „aby všetko rástlo" by znamenalo,
 * že klient klepne sedmičku v opačnom význame, než v akom ju pozná. Preto
 * každá otázka nesie `lepsie` a nikde sa smer nepočíta z hlavy.
 */
export type IdOtazky = "bolest" | "pohyb" | "posun";

export type OtazkaPocitu = {
  id: IdOtazky;
  text: string;
  nizke: string;
  vysoke: string;
  /** Ktorým smerom je to lepšie — čítajú to grafy aj vety, nehádať. */
  lepsie: "menej" | "viac";
};

export const POCITOVKA: OtazkaPocitu[] = [
  {
    id: "bolest",
    text: "Koľko ťa to za posledný týždeň bolelo?",
    nizke: "vôbec",
    vysoke: "najviac, čo poznáš",
    lepsie: "menej",
  },
  {
    id: "pohyb",
    text: "Ako ľahko ti išli bežné veci — schody, sedenie, nosenie?",
    nizke: "ťažko",
    vysoke: "ľahko",
    lepsie: "viac",
  },
  {
    id: "posun",
    text: "Cítiš, že sa v tele niečo mení k lepšiemu?",
    nizke: "vôbec",
    vysoke: "veľmi",
    lepsie: "viac",
  },
];

export type Meranie = {
  datum: string;
  bolest: number | null;
  pohyb: number | null;
  posun: number | null;
};

/**
 * Hodnota zo stránky. Mimo 1–10 a čokoľvek, čo nie je celé číslo, je `null` —
 * prázdna odpoveď, nie nula. Nula by sa v bolesti čítala ako „nebolí" a to
 * klient nepovedal.
 */
export function platnaHodnota(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(String(x ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

export type ZmenaOtazky = {
  prva: number;
  posledna: number;
  /** Kladné = zlepšenie, bez ohľadu na smer otázky. */
  lepsieO: number;
  dni: number;
};

export type ZhrnutiePocitov = {
  pocet: number;
  posledne?: Meranie;
  zmeny: Partial<Record<IdOtazky, ZmenaOtazky>>;
};

const denDo = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Zmena sa počíta PRE KAŽDÚ OTÁZKU ZVLÁŠŤ, z jej prvej a poslednej
 * vyplnenej hodnoty. Klient nemusí zakaždým klepnúť všetky tri a spoločné
 * „prvé a posledné meranie" by porovnávalo dva rôzne dni v tej istej vete.
 */
export function zhrnutiePocitov(merania: Meranie[]): ZhrnutiePocitov {
  const zoradene = merania.slice().sort((a, b) => a.datum.localeCompare(b.datum));
  const zmeny: Partial<Record<IdOtazky, ZmenaOtazky>> = {};

  for (const o of POCITOVKA) {
    const s = zoradene.filter((m) => m[o.id] != null);
    if (s.length < 2) continue;
    const prvy = s[0];
    const posledny = s[s.length - 1];
    const prva = prvy[o.id] as number;
    const posledna = posledny[o.id] as number;
    zmeny[o.id] = {
      prva,
      posledna,
      lepsieO: o.lepsie === "menej" ? prva - posledna : posledna - prva,
      dni: denDo(prvy.datum, posledny.datum),
    };
  }

  return { pocet: zoradene.length, posledne: zoradene[zoradene.length - 1], zmeny };
}

/**
 * Veta pre obrazovku aj pre Jarvisa — jedno znenie, aby dve miesta
 * nehovorili o tom istom inak.
 *
 * Jedno meranie NIE JE výsledok: „zostal rok" je vernosť, nie zlepšenie,
 * a jedna sedmička je len sedmička. Kým nie sú dve, veta to povie.
 */
export function vetaOPocitoch(z: ZhrnutiePocitov): string {
  if (!z.pocet || !z.posledne) return "Klient sa zatiaľ nehodnotil.";
  const kusy = POCITOVKA
    .map((o) => {
      const hodnota = z.posledne?.[o.id];
      if (hodnota == null) return "";
      const zm = z.zmeny[o.id];
      const smer = !zm ? "" : zm.lepsieO > 0 ? ` (lepšie o ${zm.lepsieO} za ${zm.dni} dní)`
        : zm.lepsieO < 0 ? ` (horšie o ${-zm.lepsieO} za ${zm.dni} dní)`
          : ` (bez zmeny za ${zm.dni} dní)`;
      return `${o.id}: ${hodnota}/10${smer}`;
    })
    .filter(Boolean);
  if (!kusy.length) return "Klient sa zatiaľ nehodnotil.";
  const zaklad = `${z.posledne.datum} — ${kusy.join(", ")}`;
  return z.pocet === 1 ? `${zaklad}. Je to prvé hodnotenie, porovnávať sa nemá s čím.` : zaklad;
}
