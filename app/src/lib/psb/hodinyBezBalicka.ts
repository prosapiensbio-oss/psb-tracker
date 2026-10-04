import { osCasuKlienta } from "./klientOsCasu";
import { normName } from "./format";
import { vypisHodin } from "./vypisHodin";

/**
 * HODINY, KTORÉ NEKRYJE ŽIADNY BALÍČEK.
 *
 * Jerry, 2. 10. 2026: „to by znamenalo, že klientom dávam zadarmo
 * tréningy." Nedáva — prečerpané hodiny sa odpíšu z ďalšieho balíčka hneď,
 * ako si ho klient kúpi (viď `priebehBalickov`). Lenže KEĎ SI HO NEKÚPI,
 * tie hodiny zostanú visieť a appka o nich nikde nehovorí.
 *
 * Práve títo ľudia zároveň vypadávajú z karty „Balíček dojde": tá stojí na
 * OBJEDNANÝCH termínoch a kto dochodil a nič si nedohodol, v nej nie je.
 * Čiže ten, komu najviac treba napísať, bol jediný neviditeľný.
 *
 * RÁTA SA LEN OD POSLEDNÉHO ZNÁMEHO BALÍČKA. PTminder vyváža balíčky až od
 * marca 2026; cez celú históriu by vyšli nezmysly ako −227 h u človeka,
 * ktorý chodí od roku 2024 a vždy riadne platil.
 */
/**
 * Ako ďaleko dozadu sa pozerá.
 *
 * Klient, ktorý odišiel pred rokom a ostalo mu sedem hodín, je strata — ale
 * nie je to úloha a karta je fronta úloh (Jerryho pravidlo: číslo bez akcie
 * do kokpitu nepatrí). Deväťdesiat dní je dosť na to, aby sa stihol vrátiť
 * a doplatiť, a málo na to, aby sa karta zaplnila ľuďmi, s ktorými sa už nič
 * robiť nedá. Na ostrých dátach to z dvanástich robí desiatich.
 */
export const OKNO_DNI = 90;

export type BezBalicka = {
  klient: string;
  /** Koľko hodín nekryje žiadny balíček. */
  hodin: number;
  /** Deň prvého nekrytého tréningu. */
  odKedy: string;
  /** Deň posledného balíčka, po ktorom to začalo. */
  balicek: string;
  trener: string;
};

type Zdroj = Parameters<typeof osCasuKlienta>[1];

export function hodinyBezBalicka(
  mena: string[],
  zdroj: Zdroj,
  trenerKlienta: (meno: string) => string,
  dnes: string = new Date().toISOString().slice(0, 10),
): BezBalicka[] {
  /**
   * Dáta sa rozdelia podľa klienta RAZ. `osCasuKlienta` si inak každé pole
   * prefiltruje samo, takže pri stodvadsiatich klientoch a troch a pol
   * tisíc sedeniach by to bolo stotisíc prechodov navyše pri každom
   * prekreslení dashboardu.
   */
  const podla = <T>(xs: T[] | undefined, kluc: (x: T) => string | null | undefined) => {
    const m = new Map<string, T[]>();
    for (const x of xs || []) {
      const k = normName(kluc(x) || "");
      if (!k) continue;
      (m.get(k) || m.set(k, []).get(k)!).push(x);
    }
    return m;
  };
  const sessions = podla(zdroj.sessions, (x) => x.client);
  const payments = podla(zdroj.payments, (x) => x.client);
  const packages = podla(zdroj.packages, (x) => x.client);
  const services = podla(zdroj.services, (x) => x.client);
  const poplatky = podla(zdroj.poplatky, (x) => x.klient);
  const zdarma = podla(zdroj.treningyZdarma, (x) => x.klient);
  const balicky = podla(zdroj.balicky, (x) => x.klient);
  const historia = podla(zdroj.historia, (x) => x.client);
  const kal = podla(zdroj.kalUdalosti, (x) => x.klient);

  const hranica = new Date(`${dnes}T00:00:00Z`);
  hranica.setUTCDate(hranica.getUTCDate() - OKNO_DNI);
  const odKedy = hranica.toISOString().slice(0, 10);

  const out: BezBalicka[] = [];
  for (const meno of mena) {
    const k = normName(meno);
    const os = osCasuKlienta(meno, {
      sessions: sessions.get(k) || [],
      payments: payments.get(k) || [],
      packages: packages.get(k) || [],
      services: services.get(k) || [],
      historia: historia.get(k) || [],
      poplatky: poplatky.get(k) || [],
      treningyZdarma: zdarma.get(k) || [],
      balicky: balicky.get(k) || [],
      kalUdalosti: kal.get(k) || [],
      doplneniaHodiny: zdroj.doplneniaHodiny,
    }, dnes);

    const riadky = vypisHodin(os, "", dnes, null).riadky;
    const balickyDni = riadky.filter((r) => r.druh === "balicekOd").map((r) => r.den).sort();
    // Bez balíčka sa nedá povedať, čo malo byť kryté — mlčať je správnejšie.
    if (!balickyDni.length) continue;
    const posledny = balickyDni[balickyDni.length - 1];

    const nekryte = riadky.filter((r) => r.druh === "trening" && r.dlh && r.den > posledny);
    if (!nekryte.length) continue;
    // Najnovší nekrytý tréning musí byť v okne; inak je to história.
    if (nekryte[0].den < odKedy) continue;
    out.push({
      klient: meno,
      hodin: Math.max(...nekryte.map((r) => r.dlh || 0)),
      odKedy: nekryte[nekryte.length - 1].den,
      balicek: posledny,
      trener: trenerKlienta(meno),
    });
  }
  // Najviac hodín hore; pri zhode ten, u koho to začalo najnovšie.
  return out.sort((a, b) => b.hodin - a.hodin || b.odKedy.localeCompare(a.odKedy));
}
