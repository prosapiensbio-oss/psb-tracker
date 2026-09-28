/**
 * KTO VEDIE ÚVODNÉ TRÉNINGY.
 *
 * Úvodný tréning je jediné sedenie, ktoré rozhoduje o tom, či z dopytu bude
 * klient. Kto ho vedie, nie je rozpis práce — je to otázka, kto firme robí
 * nových klientov. Jerry, 28. 9. 2026: „pomer, koľko % úvodných robil Jerry
 * vs. Terezka."
 *
 * ČÍSLA SÚ MALÉ A TO MENÍ TVAR GRAFU.
 *
 * Úvodných je 67 za 21 mesiacov, teda zhruba tri za mesiac. Mesačný podiel
 * by skákal medzi 0 %, 50 % a 100 % podľa toho, či v tom mesiaci prišli dvaja
 * ľudia alebo traja — z takej krivky sa nedá prečítať nič. Podiel sa preto
 * počíta z KĹZAVÉHO OKNA (predvolene šesť mesiacov): každý bod hovorí „za
 * posledného pol roka viedol Jerry toľkoto percent". Mesiac s jedným úvodným
 * tak krivkou nešvihne, ale trvalejší posun na nej vidno.
 *
 * Mesačné počty sa vracajú zvlášť a nie sú prepočítané na percentá — objem
 * a pomer sú dve rôzne otázky a jeden graf ich nemá miešať.
 *
 * POČÍTAJÚ SA LEN JERRY A TEREZKA. Matyáš u nás skončil 20. 9. 2026 a jeho
 * štyri úvodné sú záskok, nie tretia strana pomeru — v grafe robili tretiu
 * krivku, ktorá rovno pri vzniku karty patrila minulosti (Jerry, 28. 9.
 * 2026: „Matyáša odstráň"). Jeho sedenia nevstupujú ani do základu percent,
 * inak by Jerry a Terezka nedali dokopy sto.
 */

import { TRAINERS } from "./compute";
import { monthKey } from "./format";
import type { SessionRow } from "./types";

export type PodielTrenera = { trener: string; pocet: number; podiel: number };

export type MesiacUvodnych = {
  mesiac: string;
  /** Počet úvodných podľa trénera — kľúče sú len tí, ktorí v ňom nejaké mali. */
  podla: Record<string, number>;
  celkom: number;
};

export type KlzavyBod = {
  mesiac: string;
  /** Podiel v percentách za okno končiace týmto mesiacom. */
  podiel: Record<string, number>;
  /** Koľko úvodných to okno obsahuje — bod postavený na dvoch nič nehovorí. */
  zaklad: number;
};

export type UvodneRozbor = {
  celkom: number;
  treneri: PodielTrenera[];
  mesiace: MesiacUvodnych[];
  klzave: KlzavyBod[];
};

/** Mesiace medzi prvým a posledným — vrátane tých, v ktorých nebolo nič.
 *  Bez nich by graf ticho preskočil prázdny mesiac a skrátil os času. */
function radMesiacov(od: string, do_: string): string[] {
  const rad: string[] = [];
  let [r, m] = od.split("-").map(Number);
  const [rk, mk] = do_.split("-").map(Number);
  while (r < rk || (r === rk && m <= mk)) {
    rad.push(`${r}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; r += 1; }
  }
  return rad;
}

export function rozborUvodnych(
  sessions: SessionRow[],
  okno = 6,
  treneriVPomere: readonly string[] = TRAINERS,
): UvodneRozbor {
  const uvodne = sessions.filter(
    (s) => s.sessionType === "UVODNE" && s.date && treneriVPomere.includes(s.sessionTrainer),
  );

  const podlaTrenera: Record<string, number> = {};
  const podlaMesiaca: Record<string, Record<string, number>> = {};
  for (const s of uvodne) {
    const t = s.sessionTrainer || "neznámy";
    const m = monthKey(s.date);
    if (!m) continue;
    podlaTrenera[t] = (podlaTrenera[t] || 0) + 1;
    (podlaMesiaca[m] ||= {})[t] = (podlaMesiaca[m][t] || 0) + 1;
  }

  /**
   * V pomere stoja VŠETCI zo zoznamu, aj ten, kto v období nemá ani jeden.
   * Nula je odpoveď („tento mesiac som neviedol žiadny"), chýbajúca krivka
   * je diera — a graf by pri nej menil počet čiar podľa filtra obdobia.
   */
  const celkom = uvodne.length;
  const treneri = celkom
    ? treneriVPomere
      .map((trener) => ({ trener, pocet: podlaTrenera[trener] || 0, podiel: (podlaTrenera[trener] || 0) / celkom * 100 }))
      .sort((a, b) => b.pocet - a.pocet || a.trener.localeCompare(b.trener))
    : [];

  const kluce = Object.keys(podlaMesiaca).sort();
  const rad = kluce.length ? radMesiacov(kluce[0], kluce[kluce.length - 1]) : [];
  const mesiace: MesiacUvodnych[] = rad.map((mesiac) => {
    const podla = podlaMesiaca[mesiac] || {};
    return { mesiac, podla, celkom: Object.values(podla).reduce((a, b) => a + b, 0) };
  });

  const klzave: KlzavyBod[] = mesiace.map((_, i) => {
    const od = Math.max(0, i - okno + 1);
    const sucet: Record<string, number> = {};
    let zaklad = 0;
    for (const m of mesiace.slice(od, i + 1)) {
      for (const [t, n] of Object.entries(m.podla)) sucet[t] = (sucet[t] || 0) + n;
      zaklad += m.celkom;
    }
    const podiel: Record<string, number> = {};
    for (const t of treneriVPomere) podiel[t] = zaklad ? ((sucet[t] || 0) / zaklad) * 100 : 0;
    return { mesiac: mesiace[i].mesiac, podiel, zaklad };
  });

  return { celkom, treneri, mesiace, klzave };
}
