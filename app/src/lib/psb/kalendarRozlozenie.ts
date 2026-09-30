/**
 * Dve hodiny v rovnakom čase sa v mriežke kreslili JEDNA NA DRUHÚ — obe
 * mali `left: 2, right: 2`, takže z dvoch mien vzniklo nečitateľné
 * prekrytie („Radek Baláž" cez „Robin Martinek"). Na monitore sa to dalo
 * prehliadnuť, na telefóne je to polovica obsahu stĺpca.
 *
 * Toto rozloží prekrývajúce sa udalosti vedľa seba: skupina sa hľadá
 * tranzitívne (A sa prekrýva s B, B s C → všetky tri sú jedna skupina),
 * aby mali rovnakú šírku a nevznikli schody.
 */
export type Usek = { od: number; do: number };

export type Miesto = { stlpec: number; zo: number };

/** Vracia pre každý úsek (v poradí, v akom prišiel) stĺpec a počet stĺpcov skupiny. */
export function rozlozUdalosti(useky: Usek[]): Miesto[] {
  const poradie = useky
    .map((u, i) => ({ i, od: u.od, do: Math.max(u.do, u.od + 1) }))
    .sort((a, b) => a.od - b.od || a.do - b.do);

  const miesta: Miesto[] = useky.map(() => ({ stlpec: 0, zo: 1 }));
  let skupina: { i: number; stlpec: number }[] = [];
  let konce: number[] = [];
  let koniecSkupiny = -Infinity;

  const uzavri = () => {
    const zo = Math.max(1, konce.length);
    for (const x of skupina) miesta[x.i] = { stlpec: x.stlpec, zo };
    skupina = [];
    konce = [];
  };

  for (const u of poradie) {
    // Nová skupina začína tam, kde sa už nič nepreteká.
    if (u.od >= koniecSkupiny) { uzavri(); koniecSkupiny = -Infinity; }

    let stlpec = konce.findIndex((k) => k <= u.od);
    if (stlpec === -1) { stlpec = konce.length; konce.push(u.do); }
    else konce[stlpec] = u.do;

    skupina.push({ i: u.i, stlpec });
    koniecSkupiny = Math.max(koniecSkupiny, u.do);
  }
  uzavri();
  return miesta;
}

/**
 * Meno do bloku na telefóne. Stĺpec má na 390 px asi 46 px, a keď sa v tej
 * hodine prekrývajú dvaja tréneri, ostane na jedno meno 22 px — „Anna Nová"
 * sa tam láme na „An / na / No / vá". Dve písmená na riadok nie sú meno,
 * sú to schody.
 *
 *   • jedna udalosť v hodine → „Monika Č." (krstné celé, priezvisko skratkou)
 *   • dve a viac vedľa seba  → „MČ" (iniciály; celé meno povie klepnutie)
 *
 * Na monitore sa nič neskracuje — tam je miesta dosť.
 */
export function menoDoBloku(nazov: string, uzke: boolean, zo: number): string {
  const cele = String(nazov || "").trim();
  if (!uzke || !cele) return cele;
  const kusy = cele.split(/\s+/).filter(Boolean);
  if (zo > 1) {
    if (kusy.length === 1) return kusy[0].slice(0, 3);
    return kusy.slice(0, 2).map((k) => k[0].toUpperCase()).join("");
  }
  if (kusy.length === 1) return kusy[0];
  return `${kusy[0]} ${kusy[1][0].toUpperCase()}.`;
}
