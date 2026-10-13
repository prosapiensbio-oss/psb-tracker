/**
 * UKONČENIE BALÍČKA A VRÁTENIE PEŇAZÍ.
 *
 * Jerry, 13. 10. 2026: „Radek Baláž musí skončiť s tréningami, ideme mu
 * vrátiť peniaze za nedochodené tréningy — na túto situáciu v Kokpite nie
 * sme vôbec pripravení, za celý čas, čo existuje PSB, sa to stane prvýkrát."
 * A k sume: „ak si platil 18 h, koľko je hodinovka; ak mu tam ostáva 14 h,
 * koľko mu treba vrátiť — a toľko mu vrátime."
 *
 * PRAVIDLO: vracajú sa NEVYČERPANÉ hodiny za cenu, za ktorú ich kúpil
 * (cena balíčka / jeho hodiny). Odtrénované sa neprepočítavajú na cenu
 * menšieho balíčka — Jerry to zvolil ako férovejšie voči klientovi.
 *
 * Ako sa to zapíše (jedno miesto, akcia `ukonci` v `/api/balicky`):
 *  • balíček sa stiahne na to, čo naozaj čerpal — hodiny = odtrénované,
 *    cena = pôvodná cena mínus vrátené, platnosť končí v deň ukončenia;
 *    pôvodná veľkosť a cena zostanú v poznámke aj v audite;
 *  • vrátenie je PLATBA SO ZÁPORNOU SUMOU. Dlh potom vyjde presne nula
 *    (balíček 4 700 = zaplatené 21 150 − 16 450) a tržby mesiaca, v ktorom
 *    peniaze odišli, klesnú o vrátenú sumu.
 *
 * Os času záporné platby nečíta ako platby (`vypisHodin.ts`): nevynulujú
 * mínus a nezaplatia balíček. Klient ich vidí ako „vráceno".
 */

const kc = (n: number) => Math.round(n).toLocaleString("sk-SK").replace(/[\s ]/g, " ");
const datumSk = (iso: string) => {
  const [r, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d}. ${m}. ${r}`;
};

export type NavrhUkoncenia = {
  /** Cena jednej hodiny tak, ako ju klient kúpil. */
  hodinovka: number;
  nevycerpane: number;
  /** Koľko vrátiť — nevyčerpané × hodinovka, na celé koruny. */
  vratit: number;
  /** Cena, na ktorú sa balíček stiahne — pôvodná mínus vrátené. */
  novaCena: number;
};

/** Výpočet z cenníka balíčka. `null`, keď balíček nemá hodiny alebo cenu (paušál, doplnenie). */
export function navrhUkoncenia(v: { hodiny: number | null | undefined; cena: number | null | undefined; odtrenovane: number }): NavrhUkoncenia | null {
  const hodiny = Number(v.hodiny) || 0;
  const cena = Number(v.cena) || 0;
  if (hodiny <= 0 || cena <= 0) return null;
  const odtrenovane = Math.min(hodiny, Math.max(0, Math.round(Number(v.odtrenovane) || 0)));
  const hodinovka = cena / hodiny;
  const nevycerpane = hodiny - odtrenovane;
  const vratit = Math.round(nevycerpane * hodinovka);
  return { hodinovka, nevycerpane, vratit, novaCena: Math.round((cena - vratit) * 100) / 100 };
}

/**
 * Čo by zápis pokazilo. Vracia vetu pre človeka, alebo `null`, keď je to v poriadku.
 * Tú istú kontrolu robí obrazovka (aby tlačidlo nesľubovalo) aj server (aby
 * neprešlo nič, čo obrazovka nepustila).
 */
export function chybaUkoncenia(v: {
  hodiny: number | null | undefined; cena: number | null | undefined;
  odtrenovane: number; vratit: number; den: string; platnostOd: string;
}): string | null {
  const hodiny = Number(v.hodiny) || 0;
  const cena = Number(v.cena) || 0;
  if (hodiny <= 0 || cena <= 0) return "Balíček bez hodín alebo bez ceny sa ukončiť s vrátením nedá.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.den)) return "Chýba deň ukončenia.";
  if (v.den < String(v.platnostOd).slice(0, 10)) return "Deň ukončenia je pred začiatkom balíčka.";
  const odtr = Number(v.odtrenovane);
  if (!Number.isInteger(odtr) || odtr < 0 || odtr > hodiny) return `Odtrénované hodiny musia byť 0 až ${hodiny}.`;
  const vratit = Number(v.vratit);
  if (!(vratit > 0)) return "Suma na vrátenie musí byť kladná.";
  if (vratit > cena) return `Vrátiť sa dá najviac cena balíčka (${kc(cena)} Kč).`;
  return null;
}

/** Poznámka k ukončenému balíčku — aby sa o rok dalo prečítať, čo sa stalo a prečo je cena iná. */
export function poznamkaUkoncenia(v: { den: string; hodiny: number; cena: number; odtrenovane: number; vratit: number }): string {
  const nevycerpane = v.hodiny - v.odtrenovane;
  const hodinovka = v.cena / v.hodiny;
  return `ukončené ${datumSk(v.den)} — vrátené ${kc(v.vratit)} Kč za ${nevycerpane} nevyčerpaných h (${kc(hodinovka)} Kč/h); pôvodne ${v.hodiny} h za ${kc(v.cena)} Kč`;
}

/** Poznámka k zápornej platbe — klient aj účtovníčka ju čítajú bez kontextu. */
export const poznamkaVratenia = (nevycerpane: number) =>
  `vrátenie za ${nevycerpane} nevyčerpaných h — balíček ukončený`;
