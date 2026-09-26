/**
 * DVOJITÝ VÝPOČET: to isté číslo dvoma cestami.
 *
 * Jerry, 26. 9. 2026: „chcem, aby si nastavil dvojitý program — jeden, ktorý
 * dopočítava grafy, dlhy a všetko, čo vychádza z PTmindera a jeho reportov,
 * aby bol Kokpit schopný dopočítavať zvlášť aj bez nich."
 *
 * Každá metrika má dva zdroje:
 *   • EXPORT — `sessions`, `payments`, `poplatky` z PTmindera. To, na čom
 *     appka stojí dnes.
 *   • VLASTNÉ — Google kalendár, vlastné platby, vlastné balíčky. To, na čom
 *     má stáť, keď PTminder skončí.
 *
 * Porovnáva sa POSLEDNÝ MESIAC A DVA, nie roky. Jerry, 26. 9.: „nejde o to,
 * či to sedí spred dvoch rokov, ale za posledný mesiac dva." Staršie mesiace
 * sú história, ktorá sa už nezmení, a prepočítavať ich je práca bez ceny.
 *
 * NEÚPLNÝ MESIAC SA NEHODNOTÍ. Export chodí raz týždenne, takže v prebiehajúcom
 * mesiaci je vždy pozadu — hlásiť to ako nezhodu by znamenalo, že meradlo
 * svieti načerveno každý týždeň a človek si ho odvykne všímať.
 */

export type Metrika = "treningy" | "hodiny" | "klienti" | "trzby";

export type StranaMesiaca = { mesiac: string; treningy: number; hodiny: number; klienti: number; trzby: number };

export type RiadokPorovnania = {
  metrika: Metrika;
  nazov: string;
  export: number;
  vlastne: number;
  rozdiel: number;
  /** Rozdiel v percentách oproti exportu; 0 keď je export nula. */
  percent: number;
  sedi: boolean;
  jednotka: string;
};

export type MesiacDvojmo = {
  mesiac: string;
  /** Prebiehajúci mesiac alebo mesiac, kam export ešte nedočiahol. */
  neuplny: boolean;
  riadky: RiadokPorovnania[];
  /** Sedia všetky metriky, ktoré sa dajú hodnotiť. */
  sedi: boolean;
};

const PRAZDNA: Omit<StranaMesiaca, "mesiac"> = { treningy: 0, hodiny: 0, klienti: 0, trzby: 0 };

/**
 * Koľko smie byť rozdiel, aby to bola zhoda.
 *
 * Päť percent, najmenej však dva kusy: kalendár a export nikdy nesadnú na
 * jeden tréning presne (posunutá hodina, zrušenie na poslednú chvíľu).
 * Pri peniazoch je to rovnaké percento, ale najmenej dvesto korún.
 */
export function sedi(metrika: Metrika, exp: number, vlastne: number): boolean {
  const strop = metrika === "trzby"
    ? Math.max(200, Math.abs(exp) * 0.05)
    : Math.max(2, Math.abs(exp) * 0.05);
  return Math.abs(exp - vlastne) <= strop;
}

const POPIS: Record<Metrika, { nazov: string; jednotka: string }> = {
  treningy: { nazov: "Tréningy", jednotka: "" },
  hodiny: { nazov: "Odtrénované hodiny", jednotka: "h" },
  klienti: { nazov: "Klientov s tréningom", jednotka: "" },
  trzby: { nazov: "Peniaze, čo prišli", jednotka: "Kč" },
};

export function porovnajDvojmo(
  export_: StranaMesiaca[],
  vlastne: StranaMesiaca[],
  /** Posledný deň, po ktorý siaha export — ďalej je mesiac neúplný. */
  exportDo: string,
  /** Koľko mesiacov dozadu. Jerryho horizont sú dva. */
  kolko = 3,
  /** Dnešok — kvôli odrezaniu budúcnosti. */
  dnes = new Date().toISOString().slice(0, 7),
): MesiacDvojmo[] {
  // BUDÚCNOSŤ SA NEPOROVNÁVA. Kalendár má objednané hodiny aj na tri mesiace
  // dopredu; export o nich nevie a ani nemá. Bez tohto orezania vyplnili
  // prvé tri miesta november a december a posledný uzavretý mesiac —
  // jediný, ktorý naozaj niečo hovorí — vypadol.
  const mesiace = [...new Set([...export_, ...vlastne].map((x) => x.mesiac))]
    .filter((m) => m && m <= dnes)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, kolko);

  const najdi = (zoznam: StranaMesiaca[], m: string) => zoznam.find((x) => x.mesiac === m) || { mesiac: m, ...PRAZDNA };

  return mesiace.map((m) => {
    const e = najdi(export_, m);
    const v = najdi(vlastne, m);
    // Mesiac je neúplný, kým doň export nedočiahol celý — vtedy je rozdiel
    // vlastnosť kalendára, nie nezhoda.
    const neuplny = exportDo.slice(0, 7) <= m;
    const riadky = (Object.keys(POPIS) as Metrika[]).map((k) => {
      const rozdiel = Math.round((v[k] - e[k]) * 10) / 10;
      return {
        metrika: k,
        nazov: POPIS[k].nazov,
        jednotka: POPIS[k].jednotka,
        export: Math.round(e[k] * 10) / 10,
        vlastne: Math.round(v[k] * 10) / 10,
        rozdiel,
        percent: e[k] ? Math.round((rozdiel / e[k]) * 1000) / 10 : 0,
        sedi: neuplny ? true : sedi(k, e[k], v[k]),
      };
    });
    return { mesiac: m, neuplny, riadky, sedi: riadky.every((r) => r.sedi) };
  });
}
