// Porovnanie bitcoinových platieb s PTminderom.
//
// PREČO JE TO TU A NIE V OBRAZOVKE
//
// Do 31. 8. 2026 žil celý tento výpočet ako osemdesiatriadkový `useMemo`
// v `Financie.tsx`. Karta „Kontrola bitcoinových platieb" teda vedela, že
// niečo nesedí — a nikto sa to nedozvedel, kým na tú kartu niekto nešiel.
// Jerry, 31. 8. 2026: „to by mala byť notifikácia pre Jerryho… peniaze má na
// starosti on."
//
// Presun sem je podmienka toho, aby obrazovka, register aj Jarvis hovorili
// to isté číslo z toho istého výpočtu — pravidlo, ktoré appku už raz stálo
// dve odpovede na tú istú otázku o rezerve.

import { fmtCZK, fmtDMY } from "./format";
import { menoKluc, PAROVANIE, type BtcKnihaPlatba } from "./compute";
import type { PaymentRow } from "./types";

/** Čo od jedného klienta prišlo do štyroch dní, je jedna platba. */
const OKNO_ZHLUKU_DNI = 4;

type Zhluk = { kluc: string; meno: string; od: number; suma: number };

/**
 * Zhluk = jedna platba, aj keď prišla na viackrát.
 *
 * Krčmár poslal 77 tisíc v štyroch kusoch za dva dni. Porovnávať transakciu
 * proti transakcii preto vyrába falošné poplachy.
 */
function zhlukni<T>(polozky: T[], meno: (x: T) => string, datum: (x: T) => number, suma: (x: T) => number): Zhluk[] {
  const podlaKlienta: Record<string, T[]> = {};
  for (const x of polozky) (podlaKlienta[menoKluc(meno(x))] ||= []).push(x);
  const out: Zhluk[] = [];
  for (const [k, zoz] of Object.entries(podlaKlienta)) {
    let akt: Zhluk | null = null;
    for (const x of [...zoz].sort((a, b) => datum(a) - datum(b))) {
      const d = datum(x);
      if (akt && (d - akt.od) / 86400000 <= OKNO_ZHLUKU_DNI) akt.suma += suma(x);
      else { akt = { kluc: k, meno: meno(x), od: d, suma: suma(x) }; out.push(akt); }
    }
  }
  return out;
}

export type BtcNezhoda = {
  /** Stabilný kľúč pre register — nesie meno a deň, nie sumu. Suma sa pri
   *  doplatku mení a odklepnutá nezhoda by sa vrátila ako nová. */
  kluc: string;
  klient: string;
  datum: string;
  text: string;
  tone: "orange";
};

export type BtcPorovnanie = {
  spolu: number;
  sedi: number;
  nesedi: BtcNezhoda[];
  ciastocne: string[];
};

export function porovnajBtcPlatby(payments: PaymentRow[], btcPlatby: BtcKnihaPlatba[]): BtcPorovnanie {
  const btc = zhlukni(
    btcPlatby.filter((b) => b.klient && b.czk != null),
    (b) => b.klient as string, (b) => new Date(b.datum).getTime(), (b) => b.czk as number,
  );
  const pt = zhlukni(
    payments.filter((p) => p.amount > 0),
    (p) => p.client, (p) => new Date(p.date).getTime(), (p) => p.amount,
  );

  const pouzite = new Set<number>();
  const nesedi: BtcNezhoda[] = [];
  const ciastocne: string[] = [];
  let sedi = 0;

  for (const b of btc) {
    let najdene = -1;
    for (let i = 0; i < pt.length; i++) {
      // Na spárovanie treba širšie okno než na zhlukovanie: zápis v PTminderi
      // a pohyb v bitcoine sa bežne líšia o niekoľko dní (Gažo — bitcoin
      // 12. 2., zápis 4. 2.).
      if (pouzite.has(i) || pt[i].kluc !== b.kluc) continue;
      if (Math.abs(pt[i].od - b.od) / 86400000 > PAROVANIE.oknoDni) continue;
      najdene = i;
      break;
    }
    const den = new Date(b.od).toISOString().slice(0, 10);
    if (najdene < 0) {
      nesedi.push({
        kluc: `btc|chyba|${den}|${b.meno}`, klient: b.meno, datum: den, tone: "orange",
        text: `«${b.meno}» ${fmtCZK(b.suma)} z ${fmtDMY(den)} — v BTC appke je, v PTminderi nie`,
      });
      continue;
    }
    pouzite.add(najdene);
    const rozdiel = pt[najdene].suma - b.suma;
    const limit = Math.max(PAROVANIE.toleranciaKc, b.suma * PAROVANIE.toleranciaPct);
    // Asymetria je zámerná. Keď je v PTminderi VIAC než v BTC appke, klient
    // zaplatil časť inak (Lukáš Kríž platil na dvakrát) — to nie je
    // nezrovnalosť. Opačný smer je vážny: peniaze dorazili a v PTminderi po
    // nich nie je stopa.
    if (rozdiel > limit) {
      ciastocne.push(`«${b.meno}» ${fmtDMY(den)}: v BTC ${fmtCZK(b.suma)} z ${fmtCZK(pt[najdene].suma)} — zvyšok inou cestou`);
      sedi++;
    } else if (-rozdiel > limit) {
      nesedi.push({
        kluc: `btc|viac|${den}|${b.meno}`, klient: b.meno, datum: den, tone: "orange",
        text: `«${b.meno}» ${fmtDMY(den)}: BTC appka ${fmtCZK(b.suma)} vs PTminder ${fmtCZK(pt[najdene].suma)} — v BTC prišlo o ${fmtCZK(-rozdiel)} VIAC`,
      });
    } else sedi++;
  }
  return { sedi, nesedi, ciastocne, spolu: btc.length };
}

/**
 * Koľko kto zaplatil v bitcoine — a čo to má za hodnotu dnes.
 *
 * Jerry, 2. 9. 2026: „pýtal som sa Jarvisa, koľko Knapčok platil v CZK, a
 * povedal mi správne. Keď som sa spýtal, koľko to bolo v BTC, nevedel."
 * Nevedel právom: satoshi boli na karte klienta, v jeho kontexte nie. Je to
 * presne tá chyba, na ktorú má appka vlastné pravidlo — číslo, ktoré vidí
 * obrazovka, musí vidieť aj Jarvis, a z toho istého výpočtu.
 *
 * POZOR NA ZÁMENU S PORTFÓLIOM. `zhodnotenie` z BTC appky je vážený výnos
 * CELEJ rezervy proti nákupnej cene a Kokpit si ho zámerne neráta sám (raz
 * mu vyšlo −8,5 % tam, kde BTC appka hlásila −3,76 %). Toto je iná, oveľa
 * jednoduchšia otázka: satoshi krát dnešný kurz. Žiadny vážený priemer, len
 * to, čo by tie mince stáli teraz.
 */
export type BtcKlient = {
  klient: string;
  sats: number;
  /** Koľko to bolo v korunách v deň platby — súčet cez všetky jeho platby. */
  czkVtedy: number;
  /** Čo tie satoshi stoja dnes. `null`, keď nepoznáme kurz. */
  czkDnes: number | null;
  rozdielCzk: number | null;
  rozdielPct: number | null;
  platieb: number;
};

const SATS_V_BTC = 100_000_000;

/** Čo tie satoshi stoja dnes. `null`, keď kurz nepoznáme — vtedy sa netvrdí nič. */
export const satsNaCzk = (sats: number, kurzCzkZaBtc: number | null): number | null =>
  kurzCzkZaBtc && sats ? Math.round((sats / SATS_V_BTC) * kurzCzkZaBtc) : null;

/**
 * Jednotlivé platby, nie súčty.
 *
 * Jerry, 3. 9. 2026: „chcel by som, aby vedel zistiť aj za poslednú platbu."
 * Predtým som do kontextu dával len súčet za klienta a Jarvis musel povedať,
 * že rozpad nemá — hoci ho appka mala celý čas, len som ho cestou zahodil.
 * Riadkov je 32, takže niet dôvodu ich agregovať skôr, než sa treba pýtať.
 */
export function btcPlatbyJednotlivo(
  platby: { klient: string | null; datum: string; czk: number | null; sats?: number }[],
  kurzCzkZaBtc: number | null,
  menaKlientov: string[] = [],
): { klient: string; datum: string; sats: number; czkVtedy: number; czkDnes: number | null }[] {
  const ptPodlaKluca: Record<string, string> = {};
  for (const m of menaKlientov) ptPodlaKluca[menoKluc(m)] = m;
  return platby
    .filter((p) => p.klient)
    .map((p) => {
      const sats = p.sats || 0;
      return {
        klient: ptPodlaKluca[menoKluc(p.klient as string)] || (p.klient as string),
        datum: String(p.datum).slice(0, 10),
        sats,
        czkVtedy: Math.round(p.czk || 0),
        czkDnes: satsNaCzk(sats, kurzCzkZaBtc),
      };
    })
    .sort((a, b) => b.datum.localeCompare(a.datum));
}

export function btcPodlaKlientov(
  platby: { klient: string | null; czk: number | null; sats?: number }[],
  kurzCzkZaBtc: number | null,
  /** Mená z PTmindera — BTC kniha ich píše inak („Procházka" vs „Prochadzka"). */
  menaKlientov: string[] = [],
): BtcKlient[] {
  const podlaKluca: Record<string, { meno: string; sats: number; czk: number; n: number }> = {};
  // Kľúč je fuzzy (priezvisko + krstné), nie presný reťazec — inak by ten istý
  // človek vyšiel ako dvaja.
  const ptPodlaKluca: Record<string, string> = {};
  for (const m of menaKlientov) ptPodlaKluca[menoKluc(m)] = m;

  for (const p of platby) {
    if (!p.klient) continue;
    const k = menoKluc(p.klient);
    const z = podlaKluca[k] || (podlaKluca[k] = { meno: ptPodlaKluca[k] || p.klient, sats: 0, czk: 0, n: 0 });
    z.sats += p.sats || 0;
    z.czk += p.czk || 0;
    z.n++;
  }

  return Object.values(podlaKluca)
    .map((z) => {
      const czkDnes = kurzCzkZaBtc && z.sats ? Math.round((z.sats / SATS_V_BTC) * kurzCzkZaBtc) : null;
      const czkVtedy = Math.round(z.czk);
      return {
        klient: z.meno, sats: z.sats, czkVtedy, czkDnes,
        rozdielCzk: czkDnes === null ? null : czkDnes - czkVtedy,
        // Percento len keď je z čoho — delenie nulou by dalo Infinity a to by
        // Jarvis prečítal ako číslo.
        rozdielPct: czkDnes === null || czkVtedy <= 0 ? null : Math.round(((czkDnes - czkVtedy) / czkVtedy) * 1000) / 10,
        platieb: z.n,
      };
    })
    .sort((a, b) => b.sats - a.sats);
}
