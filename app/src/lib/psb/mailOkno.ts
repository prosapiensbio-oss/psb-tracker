/**
 * KEDY SA ČÍTA SCHRÁNKA.
 *
 * Plánovač búcha na `/api/mail-dopyty?cron=1` každú hodinu. Dopyt mailom
 * príde párkrát za mesiac, takže dvadsaťštyri prihlásení denne kupuje
 * niekoľko hodín rýchlejšiu odpoveď — a platí sa za ne. 28. 9. 2026 nás
 * Websupport prestal púšťať na IMAP aj SMTP (webmail pritom heslo bral),
 * a séria neúspešných prihlásení každú hodinu taký zámok len predlžuje.
 *
 * Jerry v ten deň: „kľudne nech mail číta každý večer a ráno." Okná sú
 * preto dve, každé hodinu dlhé, v pražskom čase — appku aj Jerryho zaujíma
 * miestny čas, nie UTC, a v lete a v zime je to iný posun.
 *
 * ROZHODUJE SA TU, NIE V PLÁNOVAČI. Plánovač beží vo vlastnom workeri mimo
 * tohto repa; keby sa rozvrh písal tam, v Kokpite by nebolo vidieť, prečo
 * sa schránka číta práve takto, a jedno miesto by o druhom nevedelo.
 */

/** Začiatky okien v pražskom čase: ráno o 7:00, večer o 20:00. */
export const OKNA_HODIN = [7, 20] as const;

const PASMO = "Europe/Prague";

/** Hodina v pražskom čase (0–23). */
export function hodinaVPrahe(kedy: Date, pasmo = PASMO): number {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: pasmo, hour: "2-digit", hour12: false });
  return Number(f.format(kedy));
}

/** Deň a hodina naraz — kľúč okna, do ktorého beh patrí („2026-09-28|7"). */
function kluc(kedy: Date, pasmo: string): string {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: pasmo, year: "numeric", month: "2-digit", day: "2-digit" });
  return `${d.format(kedy)}|${hodinaVPrahe(kedy, pasmo)}`;
}

/**
 * Má sa teraz čítať?
 *
 * `poslednyBeh` je čas posledného pokusu (úspešného aj nie). V jednom okne
 * sa číta RAZ: plánovač môže v tej istej hodine zavolať viackrát a dvojité
 * prihlásenie je presne to, čomu sa vyhýbame.
 */
export function jeCasCitat(kedy: Date, poslednyBeh: string | null, pasmo = PASMO): boolean {
  if (!OKNA_HODIN.includes(hodinaVPrahe(kedy, pasmo) as (typeof OKNA_HODIN)[number])) return false;
  if (!poslednyBeh) return true;
  const predtym = new Date(poslednyBeh);
  if (Number.isNaN(predtym.getTime())) return true;
  return kluc(kedy, pasmo) !== kluc(predtym, pasmo);
}

/** Text pre obrazovku: kedy sa bude čítať nabudúce. */
export function najblizsieOkno(kedy: Date, pasmo = PASMO): string {
  const h = hodinaVPrahe(kedy, pasmo);
  const dalsia = OKNA_HODIN.find((x) => x > h);
  return dalsia ? `dnes o ${dalsia}:00` : `zajtra o ${OKNA_HODIN[0]}:00`;
}
