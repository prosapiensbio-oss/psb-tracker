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
};

const den = (s: string) => (s || "").slice(0, 10);
const dniMedzi = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * Hodiny, ktoré klientovi zostávajú podľa VLASTNEJ evidencie Kokpitu.
 * `null` = medzi jeho balíčkami je paušál, zostatok sa nepočíta.
 */
function zostatokVKokpite(vlastne: Balicek[], udalosti: Udalost[], meno: string, dnes: string): number | null {
  const k = normName(meno);
  const moje = vlastne.filter((b) => normName(b.klient) === k && jeAktivny(b, dnes));
  if (!moje.length) return 0;
  if (moje.some((b) => b.hodiny == null)) return null;
  const od = moje.reduce((m, b) => (b.platnostOd < m ? b.platnostOd : m), moje[0].platnostOd);
  const predane = moje.reduce((a, b) => a + (b.hodiny || 0), 0);
  return predane - odtrenovane(udalosti, meno, od, dnes);
}

export function bezAktivnehoBalicka(
  clients: KlientPreKartu[],
  vlastne: Balicek[],
  udalosti: Udalost[],
  dnes: string = new Date().toISOString().slice(0, 10),
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
    });
  }

  /**
   * Hore ten, kto má objednaný termín — na ten nemá hodinu a je to najbližšia
   * vec, ktorú treba vybaviť. Potom kto bol naposledy, lebo balíček sa predáva
   * čerstvému klientovi, nie tomu, kto nechodí dva mesiace.
   */
  return out.sort((a, b) =>
    b.objednanych - a.objednanych
    || b.poslednyTrening.localeCompare(a.poslednyTrening)
    || a.meno.localeCompare(b.meno));
}
