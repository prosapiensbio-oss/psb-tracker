/**
 * NEDEĽNÁ PRIPOMIENKA — KOMU NAPÍSAŤ.
 *
 * Jerry, 29. 9. 2026: „notifikácia pre tú SMS by prišla v nedeľu cez obed
 * alebo podvečer, keď by malo teoreticky všetko sedieť."
 *
 * Má to svoju logiku. Počas týždňa čísla bežia: tréning z utorka je
 * v kalendári hneď, v PTminderi o pár dní, a správa poslaná v stredu môže
 * stáť na zostatku, ktorý sa do piatku pohne. V nedeľu je týždeň uzavretý —
 * čo sa malo odtrénovať, sa odtrénovalo.
 *
 * PRIPOMIENKA NIE JE ODOSLANIE. Kokpit nepošle klientovi nič; povie, koľko
 * ľudí čaká na správu, a otvorí obrazovku, kde sa to robí. Dôvod je ten istý
 * ako všade okolo SMS: časť zostatkov je dopočítaná a hromadné odoslanie by
 * bolo hromadné riziko.
 */

/** Hodiny (v Prahe), v ktorých sa pripomienka posiela. Obed a podvečer. */
export const HODINY_PRIPOMIENKY = [12, 18];

/** Nedeľa. `Date.getUTCDay()` počíta od nedele = 0. */
const NEDELA = 0;

/**
 * Praha voči UTC. Rovnaká úvaha ako v `mailOkno.ts`: letný čas od poslednej
 * marcovej do poslednej októbrovej nedele, bez knižnice.
 */
export function vPrahe(d: Date): { den: number; hodina: number } {
  const r = new Date(d.getTime());
  const m = r.getUTCMonth();
  const leto = m > 2 && m < 9 ? true : m === 2 ? r.getUTCDate() >= 25 : m === 9 ? r.getUTCDate() < 25 : false;
  r.setUTCHours(r.getUTCHours() + (leto ? 2 : 1));
  return { den: r.getUTCDay(), hodina: r.getUTCHours() };
}

/**
 * Je čas? Cron môže bežať každú hodinu — rozhoduje sa tu, aby sa rozvrh dal
 * zmeniť v kóde a nie v cudzej službe, ku ktorej sa človek dostane raz za rok.
 */
export function jeCasPripomienky(teraz: Date = new Date()): boolean {
  const { den, hodina } = vPrahe(teraz);
  return den === NEDELA && HODINY_PRIPOMIENKY.includes(hodina);
}

export type CakaNaSpravu = {
  meno: string;
  trener: string;
  /** Zostatok hodín; 0 alebo záporné = má sa mu ozvať. */
  zostatok: number;
  /** `true` = počet hodín je dopočítaný, nie z exportu. */
  odvodene: boolean;
};

/**
 * Text pripomienky pre jedného trénera.
 *
 * Mená sa vypisujú, nie počítajú: „3 klienti" prinúti človeka appku otvoriť,
 * aby zistil kto — a v nedeľu ju neotvorí. Tri mená rozhodnú hneď.
 * Nad päť sa zvyšok zhrnie číslom, inak by sa správa nezmestila na zamknutú
 * obrazovku a stala by sa z nej ďalšia, ktorú netreba čítať.
 */
export function textPripomienky(xs: CakaNaSpravu[], spornych = 0): { titulok: string; text: string } | null {
  if (!xs.length) return null;
  const zoradene = xs.slice().sort((a, b) => a.zostatok - b.zostatok || a.meno.localeCompare(b.meno));
  const vidno = zoradene.slice(0, 5);
  const riadky = vidno.map((x) => {
    const stav = x.zostatok < 0 ? `−${-x.zostatok} h` : "dochodené";
    return `${x.meno} — ${x.odvodene ? "≈" : ""}${stav}`;
  });
  const zvysok = zoradene.length - vidno.length;
  if (zvysok > 0) riadky.push(`a ďalší ${zvysok}`);
  /**
   * Nerozhodnuté hodiny idú do TEJ ISTEJ správy, nie do vlastnej.
   *
   * Je to podmienka, nie samostatná úloha: kým sa nevie, kto naozaj prišiel,
   * niektoré z tých zostatkov sú vedľa — a správa by odišla na zlé číslo.
   */
  if (spornych > 0) {
    riadky.push(`⚠︎ ${spornych} ${spornych === 1 ? "hodina" : spornych < 5 ? "hodiny" : "hodín"} bez odpovede „bol tam?" — najprv tie`);
  }
  return {
    titulok: `Komu napísať (${zoradene.length})`,
    text: riadky.join("\n"),
  };
}
