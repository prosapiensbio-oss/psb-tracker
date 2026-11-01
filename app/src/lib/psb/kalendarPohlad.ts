/**
 * ČO SA V KALENDÁRI UKÁŽE PRI OTVORENÍ (rozbor Kokpitu, 1. 11. 2026).
 *
 * V nedeľu „3 dni" ukazovalo piatok–nedeľu, teda minulosť, a „Týždeň" uplynulý
 * týždeň, hoci záložka Termíny už stála na 2. 11. Kalendár sa otvára kvôli tomu,
 * čo príde.
 *
 *   „3 dni" a „Deň" začínajú DNES. Tri dni preto smú prejsť cez koniec týždňa
 *   (nedeľa, pondelok, utorok) — poloha je `posun` (týždne od tohto) a `zac`
 *   (deň od pondelka, 0–6), dni za nedeľou sú dni budúceho týždňa.
 *
 *   „Týždeň" v nedeľu ukazuje BUDÚCI týždeň; šípka späť a „dnes" vrátia tento.
 *   Jedno pravidlo bez ohľadu na hodinu: nedeľný večer je príprava na pondelok
 *   a tie pár nedeľných tréningov je jeden klik vzdialených.
 *
 * Deň je vždy pražský (`dnesPraha`) — sem chodí hotový reťazec, takže tu žiadne
 * časové pásmo nie je a test platí aj s TZ=UTC.
 */
export type RozsahKalendara = 7 | 3 | 1;
export type PolohaKalendara = { posun: number; zac: number };

/** Hranice stiahnutého kalendára: tri týždne dozadu, dva dopredu. */
export const POSUN_OD = -3;
export const POSUN_DO = 2;

/** Deň od pondelka: pondelok 0 … nedeľa 6. */
export const denOdPondelka = (den: string): number => (new Date(`${den}T12:00:00Z`).getUTCDay() + 6) % 7;

export function polohaDnes(dnes: string, rozsah: RozsahKalendara): PolohaKalendara {
  const d = denOdPondelka(dnes);
  if (rozsah === 7) return { posun: d === 6 ? 1 : 0, zac: 0 };
  return { posun: 0, zac: d };
}

/**
 * Pondelok až posledný deň, ktorý môže byť v tomto rozsahu vidno. Pri troch
 * dňoch od nedele to sú ešte dva dni budúceho týždňa, preto 9 dní a nie 7.
 */
export function dniTyzdnaPohladu(pondelok: string, rozsah: RozsahKalendara): string[] {
  const zaklad = Date.parse(`${pondelok}T12:00:00Z`);
  return Array.from({ length: rozsah === 3 ? 9 : 7 }, (_, i) => new Date(zaklad + i * 86400000).toISOString().slice(0, 10));
}

/**
 * Šípka: o toľko dní, koľko je vidno; cez okraj týždňa do susedného, pri týždni
 * o celý týždeň. `null` = za hranicou stiahnutého kalendára, ďalej sa nejde.
 */
export function krokPolohy(p: PolohaKalendara, rozsah: RozsahKalendara, smer: 1 | -1): PolohaKalendara | null {
  if (rozsah === 7) {
    const posun = p.posun + smer;
    return posun < POSUN_OD || posun > POSUN_DO ? null : { posun, zac: p.zac };
  }
  const novy = p.zac + smer * rozsah;
  if (novy < 0) return p.posun <= POSUN_OD ? null : { posun: p.posun - 1, zac: novy + 7 };
  if (novy > 6) return p.posun >= POSUN_DO ? null : { posun: p.posun + 1, zac: novy - 7 };
  return { posun: p.posun, zac: novy };
}
