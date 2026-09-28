/**
 * KTO CHODÍ A NEMÁ NA ČO.
 *
 * Jerry, 28. 9. 2026: „chcem novú kartu — všetci aktívni ľudia, ktorí nemajú
 * aktívne balíky." Doteraz sa to dalo zistiť len tak, že človek prechádzal
 * klientov po jednom; karta „Balíček dojde" odpovedá na inú otázku — komu
 * hodiny DOCHÁDZAJÚ. Tu už došli.
 *
 * PREČO SA PÝTAME OBOCH ZDROJOV
 *
 * Zostatok z PTmindera (karta klienta) nevie o balíčku, ktorý Jerry nahodil
 * v Kokpite, a naopak. Keby sa zoznam staval len z jedného, klient by v ňom
 * zostal svietiť aj potom, čo mu balíček pribudol — a karta, ktorá sa po
 * vybavení nevyprázdni, sa prestane čítať.
 *
 * PAUŠÁL V ZOZNAME NIE JE
 *
 * GOLD, ONE YEAR a spol. stoja v exporte navždy na 0/0, lebo sa nemíňajú po
 * hodinách. Bez tejto výnimky by karta hlásila „nemá balíček" u ľudí, ktorí
 * majú predplatené celé mesiace — je to tá istá pasca, na akú sa 19. 8. 2026
 * naletelo pri anomálii „chodí, ale má 0 hodín".
 */

import { jeAktivny, odtrenovane, type Balicek } from "./balickyEvidencia";
import { osCasuKlienta } from "./klientOsCasu";
import { priebehBalickov } from "./vypisHodin";
import { normName } from "./format";

/** Len to, čo z karty klienta naozaj potrebujeme. */
export type KlientPreKartu = {
  name: string;
  status: string;
  primaryTrainer: string;
  membership: string;
  packageRemaining: number;
  packageTotal: number;
  packageValidTo: string;
  lastSession: string;
};

type Udalost = { klient: string | null; zaciatok: string; typ: string | null };

export type BezBalicka = {
  meno: string;
  trener: string;
  /** Čo o ňom hovorí posledný export. */
  membership: string;
  /** Prečo je v zozname — veta, ktorá sa dá prečítať bez ďalšieho klikania. */
  dovod: "hodiny minuté" | "platnosť skončila" | "žiadne členstvo";
  platnostDo: string;
  poslednyTrening: string;
  /** Dní od posledného tréningu; −1 = netrénoval nikdy. */
  dni: number;
  /** Koľko má objednaných termínov, na ktoré nemá hodinu. */
  objednanych: number;
  /**
   * Koľko tréningov už odtrénoval bez krytia — to isté číslo, aké v profile
   * stojí ako −1, −2, −3. Nula znamená „je presne na nule", nie „nič nedlží
   * hodinami": to sú dve rôzne veci a Jerryho zaujíma práve tá druhá.
   */
  vMinuse: number;
};

const den = (s: string) => (s || "").slice(0, 10);
const dniMedzi = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * Tréningy z OBOCH zdrojov v jednom tvare.
 *
 * Kalendár drží len pár týždňov dozadu, export nesie celú históriu, ale
 * končí posledným nahratím. Kto počíta minuté hodiny len z jedného, spočíta
 * ich málo. Páruje sa po DŇOCH — klient v jeden deň druhýkrát netrénuje
 * a dvojica by hodinu strhla dvakrát (to isté pravidlo ako na osi času).
 */
export function treningyZObochZdrojov(
  sessions: { client: string; date: string }[],
  kalUdalosti: Udalost[],
): Udalost[] {
  const out: Udalost[] = [];
  const uz = new Set<string>();
  for (const s of sessions) {
    const kluc = `${normName(s.client)}|${den(s.date)}`;
    if (uz.has(kluc)) continue;
    uz.add(kluc);
    out.push({ klient: s.client, zaciatok: s.date, typ: "trening" });
  }
  for (const u of kalUdalosti) {
    if (!u.klient || (u.typ !== "trening" && u.typ !== "uvodny")) continue;
    const kluc = `${normName(u.klient)}|${den(u.zaciatok)}`;
    if (uz.has(kluc)) continue;
    uz.add(kluc);
    out.push(u);
  }
  return out;
}

/**
 * Hodiny, ktoré klientovi zostávajú podľa VLASTNEJ evidencie Kokpitu.
 * `null` = medzi jeho balíčkami je paušál, zostatok sa nepočíta.
 *
 * POČÍTAJÚ SA LEN RUČNE NAHODENÉ BALÍČKY.
 *
 * Zvyšok `balicky` je kópia exportu — tie isté členstvá, ktoré už nesie
 * `packageRemaining` na karte klienta. Počítať ich druhýkrát znamená viesť
 * jednu vec v dvoch knihách, a tá druhá je horšia: odtrénované hodiny sa
 * k nej rátajú z kalendára, ktorý siaha pár týždňov dozadu, kým platnosť
 * balíčka beží mesiace. Richard Matl mal takto 10. 8. kúpených 6 h, všetky
 * minuté — a karta ho zo zoznamu vynechala, lebo v okne kalendára videla
 * len dva tréningy a usúdila, že mu štyri hodiny zostávajú (28. 9. 2026).
 */
function zostatokVKokpite(vlastne: Balicek[], udalosti: Udalost[], meno: string, dnes: string): number | null {
  const k = normName(meno);
  const moje = vlastne.filter((b) => b.zdroj === "rucne" && normName(b.klient) === k && jeAktivny(b, dnes));
  if (!moje.length) return 0;
  if (moje.some((b) => b.hodiny == null)) return null;
  const od = moje.reduce((m, b) => (b.platnostOd < m ? b.platnostOd : m), moje[0].platnostOd);
  const predane = moje.reduce((a, b) => a + (b.hodiny || 0), 0);
  return predane - odtrenovane(udalosti, meno, od, dnes);
}

/**
 * Koľko tréningov klient odtrénoval bez krytia — z TEJ ISTEJ osi času,
 * akú vidí jeho profil.
 *
 * Nepočíta sa tu nanovo: mínus má jednu definíciu (`priebehBalickov`) a keby
 * si ho karta rátala po svojom, o týždeň by na obrazovke stálo −1 a v kope
 * −3. Číslo pri poslednom tréningu je aktuálna séria — os je zoradená
 * najnovším hore, takže stačí prvý tréning, na ktorý sa narazí.
 */
export function vMinuseKlienta(
  meno: string,
  zdroj: Parameters<typeof osCasuKlienta>[1],
  zostatokTeraz: number | null,
  dnes: string = new Date().toISOString().slice(0, 10),
): number {
  const os = osCasuKlienta(meno, zdroj, dnes);
  const { stavy } = priebehBalickov(os, zostatokTeraz, dnes);
  for (const u of os) {
    if (u.druh !== "trening") continue;
    return stavy.get(u)?.dlh ?? 0;
  }
  return 0;
}

export function bezAktivnehoBalicka(
  clients: KlientPreKartu[],
  vlastne: Balicek[],
  udalosti: Udalost[],
  dnes: string = new Date().toISOString().slice(0, 10),
  /**
   * Koľko je klient v mínuse. Dáva ho volajúci, lebo potrebuje celú os času
   * — a tá sa oplatí postaviť len tým pár ľuďom, ktorí v zozname naozaj sú,
   * nie všetkým stodvadsiatim piatim.
   */
  minus?: (meno: string) => number,
): BezBalicka[] {
  const out: BezBalicka[] = [];
  for (const c of clients) {
    if (c.status !== "Aktívny") continue;

    const vKokpite = zostatokVKokpite(vlastne, udalosti, c.name, dnes);
    // Paušál v Kokpite = predplatené mesiace, nie hodiny. Nepatrí sem.
    if (vKokpite === null) continue;
    if (vKokpite > 0) continue;

    // Paušál z exportu: má členstvo, ale to sa po hodinách nemíňa.
    const pausalZExportu = !!c.membership && c.packageTotal === 0;
    if (pausalZExportu && !(c.packageValidTo && den(c.packageValidTo) < dnes)) continue;

    const poPlatnosti = !!c.packageValidTo && den(c.packageValidTo) < dnes;
    if (c.packageRemaining > 0 && !poPlatnosti) continue;

    const dovod: BezBalicka["dovod"] = !c.membership
      ? "žiadne členstvo"
      : poPlatnosti && c.packageRemaining > 0 ? "platnosť skončila" : "hodiny minuté";

    const posledny = den(c.lastSession);
    const k = normName(c.name);
    out.push({
      meno: c.name,
      trener: c.primaryTrainer,
      membership: c.membership,
      dovod,
      platnostDo: den(c.packageValidTo),
      poslednyTrening: posledny,
      dni: posledny ? dniMedzi(posledny, dnes) : -1,
      objednanych: udalosti.filter((u) =>
        u.klient && normName(u.klient) === k
        && (u.typ === "trening" || u.typ === "uvodny")
        && den(u.zaciatok) > dnes).length,
      vMinuse: minus ? minus(c.name) : 0,
    });
  }

  /**
   * HORE TEN, KTO JE NAJHLBŠIE V MÍNUSE.
   *
   * Prvá verzia radila podľa objednaných termínov. Jerry, 28. 9. 2026:
   * „vidím, že je tam 2 objednané termíny, ale mňa skôr bude zaujímať, koľko
   * sú už v mínuse." Objednaný termín je budúcnosť, ktorá sa dá ešte prehodiť;
   * odtrénovaná hodina bez krytia je hotová vec a stojí peniaze.
   *
   * Až potom rozhodujú objednané termíny a nakoniec kto bol naposledy —
   * balíček sa predáva čerstvému klientovi, nie tomu, kto nechodí dva mesiace.
   */
  return out.sort((a, b) =>
    b.vMinuse - a.vMinuse
    || b.objednanych - a.objednanych
    || b.poslednyTrening.localeCompare(a.poslednyTrening)
    || a.meno.localeCompare(b.meno));
}
