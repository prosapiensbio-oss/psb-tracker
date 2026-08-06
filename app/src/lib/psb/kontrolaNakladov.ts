// Náklad, ktorý zmizol — a nezhoda s Excelom.
//
// Všetky doterajšie kontroly appky sa pozerajú na to, ČO V DÁTACH JE: klient,
// ktorý nechodí, mesiac, ktorý nesedí, číslo, ktoré kleslo. Nájom, ktorý sa
// nezaplatil, tak nemá ako vyskočiť — nie je tam nič, na čo by sa dalo
// pozrieť. Presne preto zostal júl 2026 bez nájmu štúdia neviditeľný, hoci
// išlo o 29 250 Kč a o tú istú sumu nadhodnotený zisk.
//
// Ticho je informácia. Kto platil šesť mesiacov po sebe a siedmy nie, je buď
// chyba v zaradení, alebo neuhradená faktúra — a oboje treba vedieť hneď, nie
// pri ročnej uzávierke.

export type BankovyMesiac = Record<string, Record<string, number>>; // mesiac → kategória → suma

export type NalezNakladu = {
  kluc: string;
  kategoria: string;
  mesiac: string;
  /** Koľko sa platievalo (medián predošlých mesiacov). */
  obvykle: number;
  /** Koľko je teraz. */
  teraz: number;
  /** Z koľkých mesiacov sa pravidelnosť odvodila. */
  zMesiacov: number;
  druh: "chyba" | "kleslo";
};

const median = (v: number[]): number => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Pravidelné náklady, ktoré v poslednom uzavretom mesiaci nedorazili.
 *
 * „Pravidelný" = objavil sa aspoň v troch zo štyroch predošlých mesiacov.
 * Tri sú minimum, pri ktorom sa dá hovoriť o zvyku a nie o zhode náhod;
 * štvormesačné okno drží kontrolu citlivú na to, čo platí teraz, a nie na
 * predplatné zrušené vlani.
 *
 * Prah 2 000 Kč zámerne: appka, ktorá hlási chýbajúce 200 Kč za doménu,
 * naučí človeka register preskakovať — a s ním aj chýbajúci nájom.
 */
export function chybajuceNaklady(
  podlaMesiaca: BankovyMesiac,
  poslednyMesiac: string,
  prah = 2000,
): NalezNakladu[] {
  const mesiace = Object.keys(podlaMesiaca).sort();
  const koniec = mesiace.indexOf(poslednyMesiac);
  if (koniec < 3) return [];
  const predosle = mesiace.slice(Math.max(0, koniec - 4), koniec);
  if (predosle.length < 3) return [];

  const out: NalezNakladu[] = [];
  const vsetkyKategorie = new Set<string>();
  for (const m of predosle) for (const k of Object.keys(podlaMesiaca[m] || {})) vsetkyKategorie.add(k);

  for (const kat of vsetkyKategorie) {
    // Výplaty a súkromné nákupy sem nepatria: kolíšu zo svojej podstaty a
    // hlásiť „tento mesiac si si vybral menej" nie je nález, je to šum.
    if (kat.startsWith("vyplaty") || kat === "mimo" || kat.startsWith("spolocne.")) continue;
    const sumy = predosle.map((m) => podlaMesiaca[m]?.[kat] ?? 0);
    const kolkokrat = sumy.filter((s) => s > 0).length;
    if (kolkokrat < 3) continue;
    const obvykle = median(sumy.filter((s) => s > 0));
    if (obvykle < prah) continue;
    const teraz = podlaMesiaca[poslednyMesiac]?.[kat] ?? 0;
    if (teraz === 0) out.push({ kluc: `chyba|${kat}|${poslednyMesiac}`, kategoria: kat, mesiac: poslednyMesiac, obvykle, teraz, zMesiacov: kolkokrat, druh: "chyba" });
    else if (teraz < obvykle * 0.5) out.push({ kluc: `kleslo|${kat}|${poslednyMesiac}`, kategoria: kat, mesiac: poslednyMesiac, obvykle, teraz, zMesiacov: kolkokrat, druh: "kleslo" });
  }
  return out.sort((a, b) => b.obvykle - a.obvykle);
}

export type NezhodaSExcelom = {
  kluc: string;
  kategoria: string;
  mesiac: string;
  excel: number;
  banka: number;
  rozdiel: number;
};

/**
 * Kde sa excelové číslo rozchádza s bankou.
 *
 * Platí len pre mesiace, ktoré import zámerne neprepisuje (do jún 2026) — tam
 * stoja dva nezávislé zdroje vedľa seba a rozdiel medzi nimi je zistenie.
 *
 * Kategórie BEZ jediného bankového pohybu sa preskakujú: platilo sa v
 * hotovosti alebo pohyb sedí inde, a hlásiť to ako nezhodu by znamenalo
 * vyrobiť desiatky falošných poplachov. Nezhoda je len tam, kde banka niečo
 * vie a hovorí niečo iné než Excel.
 */
export function nezhodySExcelom(
  podlaMesiaca: BankovyMesiac,
  excelHodnota: (kategoria: string, mesiac: string) => number | undefined,
  doMesiaca: string,
  prah = 1000,
): NezhodaSExcelom[] {
  const out: NezhodaSExcelom[] = [];
  for (const [mesiac, podlaKategorie] of Object.entries(podlaMesiaca)) {
    if (mesiac >= doMesiaca) continue;
    for (const [kat, banka] of Object.entries(podlaKategorie)) {
      // Spoločné výdavky sa s bankou nezrovnajú nikdy: potraviny, Ahsoka a
      // pomôcky sa z polovice platia v hotovosti, takže banka o nich vie len
      // časť. Hlásiť to ako nezhodu znamená zaplniť register šumom a
      // vytlačiť z prvých miest to, čo je naozaj chyba (Štát Jerry mar 26).
      if (kat.startsWith("vyplaty") || kat.startsWith("spolocne.") || kat === "mimo" || banka <= 0) continue;
      const excel = excelHodnota(kat, mesiac);
      if (excel === undefined) continue;
      const rozdiel = Math.round(Math.abs(Math.abs(excel) - banka));
      if (rozdiel < prah) continue;
      out.push({ kluc: `nezhoda|${kat}|${mesiac}`, kategoria: kat, mesiac, excel: Math.abs(excel), banka, rozdiel });
    }
  }
  return out.sort((a, b) => b.rozdiel - a.rozdiel);
}


// ── dvojitý zápis ────────────────────────────────────────────────────────────
//
// Ten istý výdavok vie doraziť dvoma cestami: z banky aj zo zošita. Splátka
// Jarkovi za júl 2026 tak vyšla 12 000 Kč namiesto 6 000 — a keďže tá kategória
// znižuje aj dlh, mýlili sa naraz náklady aj dlh. Nikto by si toho nevšimol,
// lebo obe čísla vyzerajú úplne normálne; našlo sa to len tým, že sa niekto
// ručne pozrel.
//
// Pravidlo je jednoduché a zámerne úzke: kategória, ktorá historicky chodí
// NAJVIAC RAZ za mesiac, ich zrazu má viac. Nájom, splátka, poistka, štát —
// tam je druhý pohyb v mesiaci podozrivý. Potraviny alebo apps sa takto
// nekontrolujú, tam je desať pohybov normálnych.

export type Pohyb = { datum: string; suma: number; hotovost: boolean; popis: string };

export type DvojityZapis = {
  kluc: string;
  kategoria: string;
  mesiac: string;
  pohyby: Pohyb[];
  spolu: number;
  /** Koľko takých pohybov býva za mesiac inokedy (typicky 1). */
  obvykle: number;
};

export function dvojiteZapisy(
  podlaMesiaca: Record<string, Record<string, Pohyb[]>>,
  prah = 2000,
): DvojityZapis[] {
  const out: DvojityZapis[] = [];
  const mesiace = Object.keys(podlaMesiaca).sort();
  // Koľko pohybov mala kategória v ktorom mesiaci — z toho sa určí zvyk.
  // Kľúčom MUSÍ byť mesiac, nie poradie: kategória v niektorých mesiacoch
  // chýba, takže index do zoznamu počtov nesedí s indexom do zoznamu mesiacov.
  // Prvá verzia to mala poľom a kontrola preto nenašla nič.
  const pocty: Record<string, Record<string, number>> = {};
  for (const m of mesiace) {
    for (const [kat, p] of Object.entries(podlaMesiaca[m] || {})) {
      (pocty[kat] ||= {})[m] = p.length;
    }
  }
  for (const m of mesiace) {
    for (const [kat, p] of Object.entries(podlaMesiaca[m] || {})) {
      if (p.length < 2) continue;
      if (kat.startsWith("vyplaty") || kat === "mimo" || kat.startsWith("spolocne.")) continue;
      const spolu = p.reduce((a, x) => a + x.suma, 0);
      if (spolu < prah) continue;

      // PRAVIDLO B — jeden pohyb z banky, druhý zo zošita, podobná suma.
      //
      // Toto je ten prípad, kvôli ktorému kontrola vznikla, a pravidlo A ho
      // NENAŠLO: splátky Jarkovi sa do júla platili v hotovosti, takže tá
      // kategória nemá v banke žiadnu históriu, z ktorej by sa dal odvodiť
      // zvyk. Prvý mesiac, kedy kategória vôbec pribudne, je pritom presne
      // ten, kedy je dvojitý zápis najpravdepodobnejší.
      //
      // História sa tu nepotrebuje: dva zdroje a takmer rovnaká suma v tom
      // istom mesiaci hovoria samy za seba.
      const dvaZdroje = p.some((x) => x.hotovost) && p.some((x) => !x.hotovost);
      let podobne = false;
      if (dvaZdroje) {
        for (const a of p.filter((x) => x.hotovost)) {
          for (const b of p.filter((x) => !x.hotovost)) {
            const max = Math.max(Math.abs(a.suma), Math.abs(b.suma));
            if (max > 0 && Math.abs(Math.abs(a.suma) - Math.abs(b.suma)) / max <= 0.25) podobne = true;
          }
        }
      }

      // PRAVIDLO A — kategória, ktorá inokedy chodí najviac raz za mesiac.
      const ostatne = Object.entries(pocty[kat] || {}).filter(([mk]) => mk !== m).map(([, n]) => n);
      const zvyk = ostatne.length >= 3 && Math.max(...ostatne) <= 1;

      if (!podobne && !zvyk) continue;
      // Najsilnejší signál: jeden z banky, druhý zo zošita. Ale hlási sa aj
      // dvojica z jedného zdroja — dvakrát zaplatený nájom je rovnaký problém.
      out.push({
        kluc: `dvojity|${kat}|${m}`,
        kategoria: kat, mesiac: m, pohyby: p, spolu,
        obvykle: ostatne.length ? Math.max(1, Math.round(ostatne.reduce((a, x) => a + x, 0) / ostatne.length)) : 1,
      });
    }
  }
  return out.sort((a, b) => b.spolu - a.spolu);
}


// ── kontrola príjmov ─────────────────────────────────────────────────────────
//
// Tržby počíta appka z PTmindera a z banky ich zámerne nikdy neberie — inak by
// sa tá istá platba počítala dvakrát. Lenže tým sa aj stráca jediná možnosť
// PTminder skontrolovať: keď sa niekomu zabudne zapísať platba, appka o tom
// nevie, lebo sa pozerá len na PTminder.
//
// Táto kontrola postaví oba zdroje vedľa seba. Nie je to alarm na každú
// korunu — nie všetko, čo príde na účet, je tržba (vklad od investora, vratky,
// preplatky) — takže sa hlási až rozdiel, ktorý niečo znamená.

export type NezhodaPrijmov = {
  kluc: string;
  mesiac: string;
  banka: number;
  ptminder: number;
  rozdiel: number;
  /** true = na účte prišlo VIAC než hovorí PTminder (chýbajúca platba). */
  bankaViac: boolean;
};

export function nezhodyPrijmov(
  /** mesiac → súčet príchodzích pohybov (banka + zošit), bez tých v koši „mimo". */
  bankaPrijmy: Record<string, number>,
  /** mesiac → tržby z PTmindera. */
  ptminder: Record<string, number>,
  /** Do koľkých mesiacov spätne. Staršie sa už aj tak neopravujú. */
  odMesiaca = "2026-01",
  prahKc = 3000,
  prahPct = 0.05,
): NezhodaPrijmov[] {
  const out: NezhodaPrijmov[] = [];
  for (const [mesiac, banka] of Object.entries(bankaPrijmy)) {
    if (mesiac < odMesiaca) continue;
    const pt = ptminder[mesiac] || 0;
    // Mesiac bez PTmindera nie je nezhoda, len nenahratý mesiac — na to je
    // vlastná kontrola a hlásiť to tu druhýkrát by bol šum.
    if (!pt) continue;
    const rozdiel = Math.round(banka - pt);
    const abs = Math.abs(rozdiel);
    if (abs < prahKc || abs / pt < prahPct) continue;
    out.push({
      kluc: `prijmy|${mesiac}`,
      mesiac, banka: Math.round(banka), ptminder: Math.round(pt),
      rozdiel: abs, bankaViac: rozdiel > 0,
    });
  }
  return out.sort((a, b) => b.rozdiel - a.rozdiel);
}
