import { dnesPraha } from "./cas";
import { jePredplatne } from "./nazvyProduktov";

/** Hodiny prenesené zo skončeného předplatného (najviac 2) — nie je to predaj. */
export const NAZOV_PRENESENYCH = "Prenesené hodiny";
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
  dnes: string = dnesPraha(),
): ZostavaPoPlatnosti[] {
  const out: ZostavaPoPlatnosti[] = [];
  for (const c of clients) {
    if (c.status === "Neaktívny") continue;
    const doDna = den(c.packageValidTo);
    if (!doDna || c.packageRemaining <= 0) continue;
    const dni = dniMedzi(doDna, dnes);
    if (dni < -VOPRED_DNI) continue;
    const predplatne = c.clientType === "6M Predplatné" || jePredplatne(c.membership);
    // Do 2 h sa pri předplatnom prenesú samy s ďalším mesiacom
    // (`pokracovaniePredplatneho`, 22. 10. 2026); pýta sa len o zvyšku nad 2 h.
    if (predplatne && c.packageRemaining <= PRESUN_MAX_HODIN) continue;
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

/**
 * Veta do notifikácie — to, čo sa má dať prečítať bez otvárania appky.
 *
 * MOŽNOSTI V NEJ NIE SÚ. Jerry, 28. 9. 2026: „toto sa nepýtaj a daj to dole
 * medzi možnosti." Vymenovať v texte, čo sa dá urobiť, a potom poslať človeka
 * urobiť to inam, je polovičná odpoveď; veta hovorí STAV, tlačidlá ponúkajú
 * rozhodnutie (`moznostiPlatnosti`).
 */
export function vetaPlatnosti(x: ZostavaPoPlatnosti): string {
  const kedy = x.dni < 0
    ? `platnosť končí o ${-x.dni} ${-x.dni === 1 ? "deň" : -x.dni < 5 ? "dni" : "dní"}`
    : x.dni === 0 ? "platnosť skončila dnes" : `platnosť skončila pred ${x.dni} dňami`;
  return `${x.meno}: ${kedy} (${x.membership}) a zostáva ${x.hodin} h.`;
}

/**
 * Tri Jerryho východiská ako tlačidlá pod upozornením.
 *
 * „Prepadlo" iba zapíše odpoveď. Ostatné dve hodiny naozaj dopíšu ako ručný
 * balíček — inak by sa upozornenie zajtra vrátilo, lebo zostatok z PTmindera
 * sa rozhodnutím nemení.
 */
export function moznostiPlatnosti(x: ZostavaPoPlatnosti): {
  popis: string;
  poznamka: string;
  balicek?: { klient: string; nazov: string; hodiny: number; platnostOd: string };
}[] {
  const out: { popis: string; poznamka: string; balicek?: { klient: string; nazov: string; hodiny: number; platnostOd: string } }[] = [
    { popis: "nechať prepadnúť", poznamka: `${x.hodin} h prepadlo — platnosť skončila ${x.platnostDo}` },
  ];
  /**
   * Pri balíčku sa prenášajú najviac 2 h (Jerry, 23. 10. 2026: „preniesť 2 h
   * alebo prepadnúť?“) — ako doplnenie, ktoré klient odtrénuje po konci
   * platnosti. Pri předplatnom je celý zvyšok len pre chorobu alebo vopred
   * ohlásenú dovolenku; bežné 2 h sa prenesú samy s ďalším mesiacom.
   */
  if (!x.predplatne) {
    const h = Math.min(PRESUN_MAX_HODIN, x.hodin);
    out.push({
      popis: `preniesť ${h} h ako doplnenie`,
      poznamka: `${h} h doplnenie z členstva do ${x.platnostDo}${x.hodin > h ? `, ${Math.round((x.hodin - h) * 100) / 100} h prepadlo` : ""} — odtrénuje ich nad rámec platnosti`,
      balicek: { klient: x.meno, nazov: "Doplnenie členstva", hodiny: h, platnostOd: x.platnostDo },
    });
  } else {
    out.push({
      popis: `choroba / dovolenka: preniesť všetkých ${x.hodin} h`,
      poznamka: `nedočerpané hodiny z členstva do ${x.platnostDo} — choroba alebo ohlásená dovolenka`,
      balicek: { klient: x.meno, nazov: "Doplnenie členstva", hodiny: x.hodin, platnostOd: x.platnostDo },
    });
  }
  if (x.predplatne) {
    out.push({
      popis: `preniesť ${x.presunHodin} h do ďalšieho`,
      poznamka: `presun z členstva do ${x.platnostDo} (najviac 2 h, zvyšok prepadá)`,
      balicek: { klient: x.meno, nazov: NAZOV_PRENESENYCH, hodiny: x.presunHodin, platnostOd: x.platnostDo },
    });
  }
  return out;
}
