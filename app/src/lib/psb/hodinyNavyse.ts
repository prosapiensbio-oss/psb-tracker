/**
 * HODINY NAVYŠE — práca pre PSB mimo tréningov (Jerry a Terezka, 26. 10. 2026).
 *
 * Výplatný model A: nárok = 27 000 + (hodiny − 60) × 850 + hodiny navyše × 450.
 * Dôvod: za apríl – september 2026 si Jerry vybral o 29 % viac, než bol nárok,
 * a s hodinami navyše za 450 Kč by to vyšlo na −0,3 %. Dlh nerástol
 * z míňania, ale z práce, ktorú model nerátal (Kokpit, strih, marketing).
 *
 * Pravidlá dohody (plán: https://claude.ai/artifact/1c6RhnigeXFG3ha2Kb4rBN):
 *  - platí od októbra 2026; minulé mesiace sa NEPREPOČÍTAVAJÚ,
 *  - počíta sa len to, čo si človek zapíše pri týždennej únave (`<osoba>_hours`),
 *  - najviac 40 h mesačne na osobu,
 *  - oboch spolu najviac 25 000 Kč mesačne — nad tým sa obom kráti pomerne,
 *  - v stratovom mesiaci sa nárok nemení: čo firma nevyplatí, je jej dlh voči
 *    trénerovi (kladný kumulovaný dlh), o ktorom sa rozhodne v decembri.
 *
 * Týždeň sa zapisuje k pondelku a cez prelom mesiaca sa delí PO DŇOCH
 * (hodiny / 7 na každý deň). Inak by týždeň 28. 9. – 4. 10. padol celý do
 * septembra, ktorý model A ešte nemá.
 */

export const NAVYSE = { od: "2026-10", sadzba: 450, stropHodin: 40, spolocnyStrop: 25000 } as const;

export type HodinyNavyse = Record<string, { jerry: number; terezka: number }>;

const cislo = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Zápisy týždennej únavy (kľúč = pondelok) → hodiny navyše po mesiacoch. */
export function hodinyNavysePoMesiacoch(tyzdne: Record<string, Record<string, unknown> | undefined>): HodinyNavyse {
  const out: HodinyNavyse = {};
  for (const [pondelok, d] of Object.entries(tyzdne)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pondelok) || !d) continue;
    const j = cislo(d.jerry_hours), t = cislo(d.terezka_hours);
    if (!j && !t) continue;
    const zaciatok = Date.parse(`${pondelok}T12:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const mk = new Date(zaciatok + i * 86400000).toISOString().slice(0, 7);
      const e = (out[mk] ||= { jerry: 0, terezka: 0 });
      e.jerry += j / 7;
      e.terezka += t / 7;
    }
  }
  for (const e of Object.values(out)) {
    e.jerry = Math.round(e.jerry * 10) / 10;
    e.terezka = Math.round(e.terezka * 10) / 10;
  }
  return out;
}

export type PlatbaNavyse = {
  /** Uznané hodiny po strope 40 h (pred krátením spoločným stropom). */
  hodinyJerry: number;
  hodinyTerezka: number;
  /** Koruny do nároku po oboch stropoch. */
  jerry: number;
  terezka: number;
  /** Spoločný strop 25 000 Kč obom krátil. */
  skratene: boolean;
};

const NULA: PlatbaNavyse = { hodinyJerry: 0, hodinyTerezka: 0, jerry: 0, terezka: 0, skratene: false };

/** Koľko korún pridajú hodiny navyše do nároku v danom mesiaci. */
export function platbaNavyse(mesiac: string, h: { jerry: number; terezka: number } | undefined): PlatbaNavyse {
  if (!h || mesiac < NAVYSE.od) return NULA;
  const hj = Math.min(NAVYSE.stropHodin, Math.max(0, h.jerry || 0));
  const ht = Math.min(NAVYSE.stropHodin, Math.max(0, h.terezka || 0));
  let j = hj * NAVYSE.sadzba, t = ht * NAVYSE.sadzba;
  const spolu = j + t;
  const skratene = spolu > NAVYSE.spolocnyStrop;
  if (skratene) {
    const k = NAVYSE.spolocnyStrop / spolu;
    j *= k;
    t *= k;
  }
  return { hodinyJerry: hj, hodinyTerezka: ht, jerry: Math.round(j), terezka: Math.round(t), skratene };
}
