// Matyáš — záskokový tréner od septembra 2026.
//
// Jerry, 7. a 14. 9. 2026: Matyáš sa vracia, ale NIE s vlastnými klientmi.
// Zaskakuje hodiny za Jerryho a Terezku, ich klienti zostávajú ich. Úvodné
// sám nerobí — výnimka je človek, ktorý príde cez referenciu priamo k nemu;
// ten úvodný je jeho a klient tiež (a dá sa to prepísať, aj cez Jarvisa).
// Kalendár nemá, odtrénované prichádza len z PTmindera. Je zamestnanec (DPP),
// sadzba 370 Kč za hodinu.
//
// PREČO TOTO MUSÍ BYŤ OSOBITNE: Kokpit lepil do jedného poľa „kto trénoval"
// a „čí je klient" (najviac sedení za pol roka). Záskok to rozbije: dva týždne
// dovolenky a Jerryho klient by sa ticho stal Matyášovým — a keďže Matyáš nie
// je v prepínači, notifikácie o ňom by začali chodiť obom.

export const ZASKOK = "Matyáš";
/** Od kedy platí model záskoku. Staršie sedenia sú z čias, keď mal vlastných klientov. */
export const ZASKOK_OD = "2026-09-01";
/** Kč za odtrénovanú hodinu (Excel „Matyáš vyplata", 2025 – 3/2026). */
export const SADZBA_ZASKOK_KC = 370;

const najviac = (pocty: Record<string, number>, filter: (t: string) => boolean): string | undefined =>
  Object.entries(pocty).filter(([t, n]) => filter(t) && n > 0).sort((a, b) => b[1] - a[1])[0]?.[0];

/**
 * Komu klient patrí — automaticky, bez ručnej voľby.
 *
 * 1. Nový klient (prvé sedenie od septembra 2026), ktorého úvodný viedol
 *    Matyáš → Matyášov. Prišiel k nemu, nie k zakladateľom.
 * 2. Inak rozhodujú len sedenia Jerryho a Terezky za pol roka — záskok
 *    vlastníka nemení.
 * 3. Bez nich za pol roka ich sedenia za celý život (klient na pauze).
 * 4. Klient, ktorý nikdy netrénoval s Jerrym ani Terezkou (Matyášovi klienti
 *    z roku 2025), zostáva tomu, s kým trénoval.
 */
export function vlastnikKlienta(v: {
  celkom: Record<string, number>;
  nedavno: Record<string, number>;
  /** Tréneri sedení z PRVÉHO dňa klienta. */
  prvyDenTreneri: string[];
  prvyDatum: string;
  /** TRAINERS z compute.ts — odovzáva sa, aby moduly neimportovali jeden druhý dokola. */
  zakladatelia: readonly string[];
}): string {
  const jeZakladatel = (t: string) => v.zakladatelia.includes(t);
  const prvy = (v.prvyDatum || "").slice(0, 10);
  if (prvy >= ZASKOK_OD && v.prvyDenTreneri.length > 0 && v.prvyDenTreneri.every((t) => t === ZASKOK)) return ZASKOK;
  return najviac(v.nedavno, jeZakladatel)
    || najviac(v.celkom, jeZakladatel)
    || najviac(v.celkom, () => true)
    || "—";
}

/**
 * Mzda za záskok po mesiacoch: odtrénované hodiny × sadzba.
 *
 * Úvodný (keď nejaký bude — len referencia priamo k nemu) sa ráta ako
 * bežná hodina; Jerry pre záskok inú sumu nedohodol. Rok 2025 a jan–jún 2026
 * sú v Exceli a tie sa nepočítajú nanovo — sadzba tam za úvodné kolísala.
 */
export function mzdaZaskoku(
  sedenia: { date: string; sessionTrainer: string; duration: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sedenia) {
    if (s.sessionTrainer !== ZASKOK) continue;
    const mk = s.date.slice(0, 7);
    out[mk] = (out[mk] || 0) + (s.duration / 60) * SADZBA_ZASKOK_KC;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}
