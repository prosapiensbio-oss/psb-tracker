import { breakEvenRad, poslednyMesiacSDatami, VZAS_MONTHS } from "./vzas";

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

/**
 * Posledný UZAVRETÝ mesiac, o ktorom appka niečo vie.
 *
 * Nie posledný s dátami: bežiaci mesiac má tržby priebežne a náklady až
 * s Fio, takže by z neho vyšiel nezmysel (tržba prezlečená za zisk).
 * Bežiaci mesiac sa preskočí; keby všetky dáta ležali v ňom (čerstvá
 * inštalácia), vezme sa posledný s dátami ako núdza.
 *
 * Revízia 18. 8. 2026: túto slučku mali Dashboard, DashGrafy aj rezerva
 * každý vo vlastnej kópii — teraz je tu a všetci ju volajú.
 */
export function poslednyUzavretyIdx(): number {
  let i = poslednyMesiacSDatami();
  const beziaci = new Date().toISOString().slice(0, 7);
  while (i > 0 && (VZAS_MONTHS[i] as string) >= beziaci) i--;
  if ((VZAS_MONTHS[i] as string) >= beziaci) i = poslednyMesiacSDatami();
  return i;
}

// Samotný vzorec žije vo vzas.ts (computeKpis ho potrebuje tiež a vzas.ts
// nemôže importovať odtiaľto — bol by to kruh). Tu sa len re-exportuje,
// aby komponenty mali jedno miesto pre všetko okolo break-evenu.
export { breakEvenRad } from "./vzas";

/** Priemerný break-even za posledných 6 UZAVRETÝCH mesiacov. */
export function breakEvenPriemer(): { be: number | null; bePriem: number | null; mesiac: string | null } {
  try {
    const rad = breakEvenRad();
    const i = poslednyUzavretyIdx();
    const od = Math.max(0, i - 5);
    const idx = Array.from({ length: i - od + 1 }, (_, k) => od + k);
    return {
      be: rad[i],
      bePriem: idx.reduce((a, k) => a + rad[k], 0) / idx.length,
      mesiac: (VZAS_MONTHS[i] as string) || null,
    };
  } catch {
    return { be: null, bePriem: null, mesiac: null };
  }
}

export type RezervaVstup = {
  btcCzk: number | null;
  /**
   * Zostatok na účte — z hlavičky bankového výpisu (`fio_zostatok`),
   * NIE z ručného zápisu. Do 27. 8. 2026 rezerva čítala ručný
   * `stav_penazi.fio` a automatický zostatok z importu ignorovala: dva
   * zostatky, každá obrazovka iný. Ručný zápis zostáva ako náhrada pre
   * mesiace pred tým, než to import vedel čítať.
   */
  ucet: { suma: number; datum: string } | null;
  /** Hotovosť — jediné číslo, ktoré sa naozaj musí zapisovať ručne. */
  hotovost: { suma: number; datum: string } | null;
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
  const maNieco = v.ucet !== null || v.hotovost !== null;
  const majetok = maNieco ? (btc ?? 0) + (v.ucet?.suma ?? 0) + (v.hotovost?.suma ?? 0) : btc;
  const mesiace = majetok !== null && v.bePriem !== null && v.bePriem > 0 ? majetok / v.bePriem : null;
  // Najstarší z dátumov — rezerva je len taká čerstvá ako jej najstarší vstup.
  const datumy = [v.ucet?.datum, v.hotovost?.datum].filter((x): x is string => !!x).sort();
  return {
    majetok,
    mesiace,
    uplna: v.ucet !== null && v.hotovost !== null,
    bePriem: v.bePriem,
    datumStavu: datumy[0] || null,
  };
}

/**
 * Cieľ rezervy v mesiacoch. Jedno miesto — dlaždica, Jarvis aj karta
 * v Peniazoch hovoria o tom istom čísle.
 */
export const CIEL_MESIACOV = 3;

/**
 * Koľko korún chýba do cieľa.
 *
 * 18. 8. 2026 sa Jerry spýtal na rezervu dvakrát a dostal dve rôzne čísla:
 * najprv „chýba ti zhruba 113 500 Kč", o hodinu „313 700 Kč". Vstupy boli
 * rovnaké a správne je to druhé (3 × 178 522 − 221 858 = 313 708) — model
 * si ten rozdiel počítal v hlave a raz sa pomýlil. Odteraz ho dostane
 * spočítaný a už len prečíta.
 *
 * Keď je rezerva nad cieľom, vráti 0 — nie záporné číslo, ktoré by sa dalo
 * prečítať ako dlh.
 */
export function chybaDoCiela(r: Pick<Rezerva, "majetok" | "bePriem">): number | null {
  if (r.majetok === null || r.bePriem === null || r.bePriem <= 0) return null;
  return Math.max(0, Math.round(CIEL_MESIACOV * r.bePriem - r.majetok));
}
