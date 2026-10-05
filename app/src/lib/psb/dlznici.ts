/**
 * KTO DLŽÍ PENIAZE — NA JEDNOM MIESTE.
 *
 * Jerry, 28. 9. 2026: „a ďalšiu kartu, kde sú všetci ľudia, ktorí dlhujú
 * peniaze… ide mi o to, aby na jednom mieste boli balíčky a na ďalšom
 * peniaze."
 *
 * Dlh má DVA zdroje a ani jeden sám o sebe nie je celá odpoveď:
 *
 *   • `poplatky` — otvorené poplatky z PTmindera. Čo je v exporte, je
 *     nezaplatené; `loadData` z nich navyše odratáva platby zapísané
 *     v Kokpite, takže tu už stojí len to, čo naozaj zostáva.
 *   • `dlhKlienta` — balíčky nahodené v Kokpite, na ktoré ešte neprišla
 *     platba. Pohľadávka vzniká vytvorením balíčka (Jerry, 26. 9. 2026).
 *
 * Sčítať sa MUSIA, lebo hovoria o inom období: PTminder o starom svete,
 * Kokpit o tom, čo sa predalo od 22. 9. Klient môže dlžiť v oboch naraz
 * a dve karty vedľa seba by z jedného človeka spravili dvoch.
 */

import { dlhKlienta, type BalicekDlh, type PlatbaDlh } from "./dlhKlienta";
import { normName } from "./format";

export type Poplatok = { datum: string; klient: string; popis: string; suma: number };

export type Dlznik = {
  meno: string;
  trener: string;
  /** Spolu, čo dlží — z oboch zdrojov. */
  spolu: number;
  /** Z otvorených poplatkov PTmindera. */
  zPoplatkov: number;
  /** Z balíčkov nahodených v Kokpite, na ktoré neprišla platba. */
  zBalickov: number;
  /** Jednotlivé poplatky — nech je vidieť, za čo to je. */
  polozky: { datum: string; popis: string; suma: number }[];
  /** Najstarší nezaplatený deň; prázdne, keď dlh vznikol len z balíčkov. */
  najstarsi: string;
  /** Dní od najstaršieho poplatku; −1 = nedá sa povedať. */
  dni: number;
};

const den = (s: string) => (s || "").slice(0, 10);

/**
 * DLH JEDNÉHO KLIENTA — to isté, čo ráta karta dlžníkov, len pre jedného.
 *
 * Jerry, 1. 10. 2026 nad stránkou pre klienta: „prečo tam nie je QR na
 * platbu?" Lebo stránka počítala dlh len z balíčkov zapísaných v Kokpite
 * (`dlhKlienta`), kým karta dlžníkov k nim pripočítava aj otvorené poplatky
 * z PTmindera. Danielin dlh 9 400 Kč je práve taký poplatok — karta ho
 * ukázala, stránka tvrdila nulu a QR sa nenakreslil.
 *
 * Dve definície toho istého slova sa raz rozídu; toto je to miesto, kde sa
 * zišli späť. Poplatky prichádzajú už očistené o platby zapísané v Kokpite
 * (robí to `loadData`) — tu sa len sčítavajú.
 */
/**
 * TEN ISTÝ PREDAJ ZAPÍSANÝ V OBOCH SYSTÉMOCH SA NEPOČÍTA DVAKRÁT.
 *
 * Jerry, 3. 10. 2026: „ak som nahodil členstvo cez Kokpit v rovnaký deň ako
 * v PTminderi, tak platí ten Kokpit." Martin Vaško mal 27. 9. jeden predaj za
 * 6 990 Kč — zapísaný ručne v Kokpite a zároveň otvorený ako poplatok
 * v PTminderi. Appka ho sčítala a jeho stránka pýtala QR na 13 980 Kč.
 *
 * Páruje sa deň a suma: dva rôzne predaje v jeden deň za tú istú sumu by
 * boli zriedkavé a aj tak by sa jeden z nich zapísal len raz.
 */
/**
 * Poplatok z PTmindera, ktorý je ten istý predaj ako balíček z Kokpitu.
 *
 * Do 4. 10. 2026 len ten istý deň a cena. Odkedy balíček vzniká sám prvým
 * tréningom, jeho deň je deň tréningu, kým PTminder zapíše deň predaja —
 * rozdiel býva deň-dva. Rovnaká cena do troch dní = ten istý predaj; o týždeň
 * neskôr už je to druhý predaj (předplatné ide každý mesiac za tú istú sumu).
 * Každý balíček páruje najviac jeden poplatok.
 */
const bezZdvojenych = (poplatky: Poplatok[], balicky: BalicekDlh[]): Poplatok[] => {
  const nase = balicky
    .filter((b) => !b.zruseneAt && b.zdroj === "rucne" && (b.cena || 0) > 0)
    .map((b) => ({ den: den(b.platnostOd), cena: Math.round(b.cena || 0), pouzity: false }));
  if (!nase.length) return poplatky;
  const dni = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
  return poplatky.filter((p) => {
    const d = den(p.datum);
    const c = Math.round(p.suma || 0);
    const presne = nase.find((b) => !b.pouzity && b.cena === c && b.den === d);
    const blizko = presne || nase.find((b) => !b.pouzity && b.cena === c && dni(b.den, d) <= 3);
    if (!blizko) return true;
    blizko.pouzity = true;
    return false;
  });
};

export function dlhJednehoKlienta(
  poplatky: Poplatok[],
  balicky: BalicekDlh[],
  platby: PlatbaDlh[],
  /**
   * Dlh za balíčky z Kokpitu, ako ho spočítal server (`data.dlhKokpit`).
   * Keď je, prebíja vlastný výpočet — server pozná aj PTminder (poistka
   * na čas prechodu), takže dlh a hodiny na karte hovoria to isté.
   */
  zoServera?: { dlzi: number; pocet: number } | null,
): { dlzi: number; pocet: number; popis: string } {
  poplatky = bezZdvojenych(poplatky, balicky);
  const zPoplatkov = poplatky.reduce((a, p) => a + (p.suma || 0), 0);
  const zBalickov = zoServera ?? dlhKlienta(balicky, platby);
  const dlzi = Math.max(0, Math.round(zPoplatkov + zBalickov.dlzi));
  const pocet = poplatky.length + zBalickov.pocet;
  // Popis hovorí, za ČO to je — suma bez dôvodu je výzva na nedorozumenie.
  const popis = poplatky.length === 1 && !zBalickov.pocet
    ? poplatky[0].popis
    : pocet === 1 ? "nezaplacený balíček" : `nezaplacené balíčky (${pocet})`;
  return { dlzi, pocet, popis };
}

export function dlznici(
  poplatky: Poplatok[],
  /** Balíčky a platby podľa klienta — kľúčom je meno tak, ako stojí v dátach. */
  balicky: Record<string, BalicekDlh[]>,
  platby: Record<string, PlatbaDlh[]>,
  /** Ku ktorému trénerovi klient patrí; chýbajúci zostáva bez mena trénera. */
  treneri: Record<string, string> = {},
  dnes: string = new Date().toISOString().slice(0, 10),
  /** Dlh za balíčky z Kokpitu zo servera, kľúč `normName` — viď `dlhJednehoKlienta`. */
  zoServera?: Record<string, { dlzi: number; pocet: number }>,
): Dlznik[] {
  const podla = new Map<string, Dlznik>();
  const daj = (meno: string): Dlznik => {
    const k = normName(meno);
    let d = podla.get(k);
    if (!d) {
      d = {
        meno, trener: treneri[meno] || "", spolu: 0, zPoplatkov: 0, zBalickov: 0,
        polozky: [], najstarsi: "", dni: -1,
      };
      podla.set(k, d);
    }
    return d;
  };

  for (const p of poplatky.filter((x) => {
    // To isté párovanie ako pri jednom klientovi — inak by karta dlžníkov
    // a stránka klienta hovorili dve rôzne sumy o tom istom človeku.
    const b = balicky[x.klient] || balicky[normName(x.klient)] || [];
    return bezZdvojenych([x], b).length > 0;
  })) {
    const d = daj(p.klient);
    d.zPoplatkov += p.suma;
    d.polozky.push({ datum: den(p.datum), popis: p.popis, suma: p.suma });
  }

  // Mená z oboch zdrojov: kto dlží len za balíček, v poplatkoch nestojí.
  if (zoServera) {
    for (const [k, d] of Object.entries(zoServera)) {
      if (d.dlzi <= 0) continue;
      const meno = Object.keys(balicky).find((m) => normName(m) === k) || k;
      daj(meno).zBalickov += d.dlzi;
    }
  } else {
    for (const meno of Object.keys(balicky)) {
      const dlh = dlhKlienta(balicky[meno], platby[meno] || []);
      if (dlh.dlzi > 0) daj(meno).zBalickov += dlh.dlzi;
    }
  }

  const out = [...podla.values()];
  for (const d of out) {
    d.spolu = Math.round(d.zPoplatkov + d.zBalickov);
    d.polozky.sort((a, b) => a.datum.localeCompare(b.datum));
    d.najstarsi = d.polozky[0]?.datum || "";
    d.dni = d.najstarsi ? Math.round((Date.parse(dnes) - Date.parse(d.najstarsi)) / 86400000) : -1;
  }

  // Najvyšší dlh hore — pri rovnakej sume rozhoduje, ako dlho visí.
  return out
    .filter((d) => d.spolu > 0)
    .sort((a, b) => b.spolu - a.spolu || b.dni - a.dni || a.meno.localeCompare(b.meno));
}
