/**
 * DRUHÝ BALÍČOK K TOMU ISTÉMU (Jerry, 7. 10. 2026: „tomuto skús do budúcna
 * nejako zabrániť").
 *
 * Papiež mal Předplatné 6 h od 29. 9. a ponuka po platbe chcela zapísať
 * ďalšie s tým istým dňom. Zaplatený balíček, ktorý začína do dvoch týždňov
 * od iného živého balíčka toho istého klienta, je skoro vždy omyl — 6 h sa
 * za 14 dní odtrénuje len výnimočne. Server sa preto spýta; človek môže
 * potvrdiť, že naozaj chce druhý.
 *
 * Doplnenie členstva a hodiny za 0 Kč (prenos, dopísanie) sa nepočítajú:
 * to nie je ďalší kúpený balíček, len hodiny navyše.
 */
export const OKNO_DUPLICITY_DNI = 14;

export type ExistujuciBalicek = { nazov: string; platnost_od: string; cena_czk: number | null; zrusene_at?: string | null };

const den = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

export function jePlatenyBalicek(nazov: string, cena: number | null | undefined): boolean {
  return !/doplnenie/i.test(nazov) && (Number(cena) || 0) > 0;
}

export function podobnyBalicek(existujuce: ExistujuciBalicek[], od: string): ExistujuciBalicek | null {
  const t = den(od);
  if (!Number.isFinite(t)) return null;
  return existujuce.find((b) => !b.zrusene_at
    && jePlatenyBalicek(b.nazov, b.cena_czk)
    && Math.abs(den(b.platnost_od) - t) <= OKNO_DUPLICITY_DNI * 86400000) || null;
}

/** Na obrazovke: server ohlásil druhý balíček — opýtaj sa, či naozaj. */
export function potvrdDruhyBalicek(j: unknown): boolean {
  const o = j as { duplicita?: unknown; error?: string } | null;
  if (!o?.duplicita || typeof window === "undefined") return false;
  return window.confirm(`${o.error || "Klient už má podobný balíček."}\n\nNaozaj zapísať druhý?`);
}
