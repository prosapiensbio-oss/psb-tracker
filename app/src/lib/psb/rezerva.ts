import { pnlCalc, poslednyMesiacSDatami, salaryCalc, VZAS_MONTHS } from "./vzas";

/**
 * Rezerva — koľko mesiacov firma ustojí bez jedinej tržby.
 *
 * PREČO SAMOSTATNÝ SÚBOR
 *
 * Číslo žilo len vnútri dlaždice na Kokpite. Obrazovka hlásila „1,2 mes.
 * · 219 371 Kč — účet, hotovosť aj BTC", ale do Jarvisovho kontextu sa nikdy
 * nedostalo, takže na otázku „aká je rezerva" odpovedal, že appka rezervu
 * nepočíta, a ponúkol namiesto nej stav pokladne (1 100 Kč). Dve odpovede na
 * to isté v jednej appke, a tá horšia znela istejšie.
 *
 * Preto sa počíta tu a obe strany si berú to isté číslo.
 */

/** Priemerný break-even za posledných 6 UZAVRETÝCH mesiacov. */
export function breakEvenPriemer(): { be: number | null; bePriem: number | null; mesiac: string | null } {
  try {
    const p = pnlCalc();
    // Posledný uzavretý mesiac, nie posledný s dátami — bežiaci mesiac má
    // tržby priebežne a náklady až s Fio, takže by z neho vyšiel nezmysel.
    let i = poslednyMesiacSDatami();
    const beziaci = new Date().toISOString().slice(0, 7);
    while (i > 0 && (VZAS_MONTHS[i] as string) >= beziaci) i--;
    if ((VZAS_MONTHS[i] as string) >= beziaci) i = poslednyMesiacSDatami();
    const j = salaryCalc("jerry");
    const t = salaryCalc("terezka");
    // Break-even ráta s NÁROKOM trénerov, nie s tým, čo si reálne vzali —
    // čo si niekto vezme navyše, je pôžička, nie náklad.
    const beZa = (k: number) => p.bezVyplat[k] + j.narok[k] + t.narok[k] + p.matyas[k];
    const od = Math.max(0, i - 5);
    const idx = Array.from({ length: i - od + 1 }, (_, k) => od + k);
    return {
      be: beZa(i),
      bePriem: idx.reduce((a, k) => a + beZa(k), 0) / idx.length,
      mesiac: (VZAS_MONTHS[i] as string) || null,
    };
  } catch {
    return { be: null, bePriem: null, mesiac: null };
  }
}

export type RezervaVstup = {
  btcCzk: number | null;
  /** Ručne zapísaný stav účtu a hotovosti (Peniaze → Cashflow). */
  stavPenazi: { fio: number; hotovost: number; datum: string } | null;
  bePriem: number | null;
};

export type Rezerva = {
  majetok: number | null;
  mesiace: number | null;
  /** Je v majetku všetko, alebo len bitcoin? */
  uplna: boolean;
  bePriem: number | null;
  datumStavu: string | null;
};

/**
 * Rezerva sa delí PRIEMERNÝM break-evenom za pol roka, nie tým z posledného
 * mesiaca: mesiac s výplatami za rekordný mesiac je o tretinu drahší a runway
 * sa neplánuje podľa najdrahšieho mesiaca.
 */
export function spocitajRezervu(v: RezervaVstup): Rezerva {
  const btc = v.btcCzk;
  const majetok = v.stavPenazi ? (btc ?? 0) + v.stavPenazi.fio + v.stavPenazi.hotovost : btc;
  const mesiace = majetok !== null && v.bePriem !== null && v.bePriem > 0 ? majetok / v.bePriem : null;
  return {
    majetok,
    mesiace,
    uplna: !!v.stavPenazi,
    bePriem: v.bePriem,
    datumStavu: v.stavPenazi?.datum || null,
  };
}
