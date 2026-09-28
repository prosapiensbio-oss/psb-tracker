/**
 * PLATNOSŤ SKONČILA, HODINY ZOSTALI.
 *
 * Jerry, 28. 9. 2026: „keď niekomu skončí platnosť členstva, ale ostane mu
 * tam nejako hodiny, chcem, aby ma notifikácie na to upozornili."
 *
 * Doteraz sa to nedozvedel od nikoho. Karta „Balíček dojde" hovorí o tom,
 * komu hodiny DOCHÁDZAJÚ, a klienta po platnosti zámerne neťahá dopredu —
 * lenže práve on je ten prípad, kde treba rozhodnúť, a to v deň, keď sa to
 * stane. O mesiac sa to už nedá: klient medzitým buď chodil, alebo nie.
 *
 * TRI MOŽNOSTI, KTORÉ Z TOHO PLYNÚ (Jerryho slovami)
 *
 *  1. **Prepadlo** — hodiny zaniknú. Nič sa nedopisuje.
 *  2. **Doplnenie členstva** — „má ako keby tréning zdarma, ale vlastne
 *     nemá, len ho odtrénuje nad rámec platnosti". Hodiny sa zapíšu ako
 *     doplnenie, takže ich appka ďalej odpočítava.
 *  3. **Pri predplatnom** to isté, alebo **presun do ďalšieho balíčka —
 *     najviac dve hodiny**. Zvyšok nad dve hodiny prepadá aj tu; preniesť
 *     celé nedočerpané členstvo by znamenalo, že platnosť neznamená nič.
 *
 * Appka nerozhoduje, ktorá z nich platí — to je vec dohody s klientom.
 * Ponúkne ich a zapíše, na čom sa Jerry rozhodol.
 */

export const PRESUN_MAX_HODIN = 2;

/** Koľko dní pred koncom platnosti sa začne upozorňovať. */
export const VOPRED_DNI = 3;

export type KlientPlatnost = {
  name: string;
  status: string;
  primaryTrainer: string;
  membership: string;
  packageRemaining: number;
  packageValidTo: string;
  clientType: string;
};

export type ZostavaPoPlatnosti = {
  meno: string;
  trener: string;
  membership: string;
  hodin: number;
  platnostDo: string;
  /** Záporné = koľko dní ešte zostáva; 0 a viac = koľko dní je po platnosti. */
  dni: number;
  /** Predplatné má navyše možnosť presunu do ďalšieho balíčka. */
  predplatne: boolean;
  /** Koľko hodín sa smie preniesť; 0 pri balíčku (presun sa neponúka). */
  presunHodin: number;
};

const den = (s: string) => (s || "").slice(0, 10);
const dniMedzi = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * Komu skončila (alebo do pár dní skončí) platnosť a ešte mu zostávajú hodiny.
 *
 * Neaktívny klient sa nehlási: jeho hodiny sú vec, ktorú netreba riešiť dnes.
 */
export function zostavaPoPlatnosti(
  clients: KlientPlatnost[],
  dnes: string = new Date().toISOString().slice(0, 10),
): ZostavaPoPlatnosti[] {
  const out: ZostavaPoPlatnosti[] = [];
  for (const c of clients) {
    if (c.status === "Neaktívny") continue;
    const doDna = den(c.packageValidTo);
    if (!doDna || c.packageRemaining <= 0) continue;
    const dni = dniMedzi(doDna, dnes);
    if (dni < -VOPRED_DNI) continue;
    const predplatne = c.clientType === "6M Predplatné";
    out.push({
      meno: c.name,
      trener: c.primaryTrainer,
      membership: c.membership,
      hodin: c.packageRemaining,
      platnostDo: doDna,
      dni,
      predplatne,
      presunHodin: predplatne ? Math.min(PRESUN_MAX_HODIN, c.packageRemaining) : 0,
    });
  }
  // Najviac hodín hore — tam je najviac čo stratiť. Pri zhode ten, komu to
  // skončilo dávnejšie.
  return out.sort((a, b) => b.hodin - a.hodin || b.dni - a.dni || a.meno.localeCompare(b.meno));
}

/** Veta do notifikácie — to, čo sa má dať prečítať bez otvárania appky. */
export function vetaPlatnosti(x: ZostavaPoPlatnosti): string {
  const kedy = x.dni < 0
    ? `platnosť končí o ${-x.dni} ${-x.dni === 1 ? "deň" : -x.dni < 5 ? "dni" : "dní"}`
    : x.dni === 0 ? "platnosť skončila dnes" : `platnosť skončila pred ${x.dni} dňami`;
  const moznosti = x.predplatne
    ? `nechať prepadnúť, dopísať ako doplnenie, alebo preniesť ${x.presunHodin} h do ďalšieho balíčka`
    : "nechať prepadnúť, alebo dopísať ako doplnenie a nechať ho to odtrénovať";
  return `${x.meno}: ${kedy} (${x.membership}) a zostáva ${x.hodin} h — ${moznosti}`;
}
