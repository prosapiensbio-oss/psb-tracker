/**
 * REZERVA FIRMY: ODLOŽIŤ 5 % Z PLATIEB KLIENTOV (Jerry, 26. 10. 2026).
 *
 * „Sprav v Kokpite pripomienku na odloženie 5 % 3. a 18. deň v mesiaci
 * s výpočtom, koľko to je." Je to prvý krok Profit First: najprv sa odloží,
 * potom sa míňa. Začína sa na 5 %, nie na 10 % — pri 10 % by bežný účet
 * v slabých mesiacoch (jún, august 2026) klesol pod nulu a rezerva by sa
 * vracala späť.
 *
 * Obdobia sa nekryjú a nič nevypadne:
 *   3. v mesiaci  → platby od 18. predošlého mesiaca do 2.
 *   18. v mesiaci → platby od 3. do 17.
 *
 * Rátajú sa všetky platby klientov (banka, hotovosť, bitcoin) — rezerva je
 * podiel z tržieb, nie z toho, čo prišlo na účet. Vrátenia (záporné platby)
 * sumu znižujú.
 *
 * Prevod posiela človek; pripomienka sa zavrie „Vybavené“. Neodložené
 * predošlé obdobie sa pripočíta k ďalšiemu, aby sa nestratilo.
 */
import { posunDen } from "./cas";

export const REZERVA_PODIEL = 0.05;
export const REZERVA_DNI = [3, 18] as const;
/** Prvý termín odloženia — staršie obdobia sa nepýtajú (pravidlo platí dopredu). */
export const REZERVA_START = "2026-10-18";

export type ObdobieRezervy = { splatne: string; od: string; do: string };
export type RezervaNaOdlozenie = ObdobieRezervy & {
  /** Súčet platieb klientov v období. */
  prijate: number;
  pocet: number;
  /** Koľko odložiť (zaokrúhlené na koruny). */
  suma: number;
};

const den = (r: number, m: number, d: number) => `${r}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Posledný deň odloženia, ktorý už nastal (3. alebo 18.), a obdobie, ktoré pokrýva. */
export function obdobieRezervy(dnes: string): ObdobieRezervy {
  const [r, m, d] = dnes.slice(0, 10).split("-").map(Number);
  if (d >= 18) return { splatne: den(r, m, 18), od: den(r, m, 3), do: den(r, m, 17) };
  if (d >= 3) {
    const [pr, pm] = m === 1 ? [r - 1, 12] : [r, m - 1];
    return { splatne: den(r, m, 3), od: den(pr, pm, 18), do: den(r, m, 2) };
  }
  // 1. a 2. v mesiaci: platí ešte 18. predošlého mesiaca.
  const [pr, pm] = m === 1 ? [r - 1, 12] : [r, m - 1];
  return { splatne: den(pr, pm, 18), od: den(pr, pm, 3), do: den(pr, pm, 17) };
}

/** Obdobie tesne pred daným (to, ktoré sa malo odložiť naposledy predtým). */
export function predosleObdobie(o: ObdobieRezervy): ObdobieRezervy {
  return obdobieRezervy(posunDen(o.splatne, -1));
}

export function rezervaZaObdobie(
  platby: { date: string; amount: number }[],
  o: ObdobieRezervy,
  podiel = REZERVA_PODIEL,
): RezervaNaOdlozenie {
  let prijate = 0, pocet = 0;
  for (const p of platby) {
    const d = String(p.date || "").slice(0, 10);
    if (d < o.od || d > o.do) continue;
    const a = Number(p.amount) || 0;
    if (!a) continue;
    prijate += a;
    pocet++;
  }
  return { ...o, prijate: Math.round(prijate), pocet, suma: Math.max(0, Math.round(prijate * podiel)) };
}
