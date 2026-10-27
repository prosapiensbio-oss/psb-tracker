import { normName } from "./format";

/**
 * Najbližší tréning klienta PO úvodnom — z kalendára (Jerry, 28. 10. 2026).
 *
 * Okno „SMS po úvodnom" sa pýtalo na dátum a čas ďalšieho tréningu a pôsobilo
 * to ako plánovanie („prečo nie je poslať SMS, ale naplánovať"). Keď je ďalší
 * tréning už v kalendári, appka ho vie sama. Zrušené udalosti sa nerátajú.
 */
export type UdalostSms = { zaciatok: string; klient: string | null; typ: string | null; zmizlaAt?: string | null; zmizla_at?: string | null };

export function dalsiTreningPoUvodnom(udalosti: UdalostSms[], meno: string, uvodnyZaciatok: string): string | null {
  const k = normName(meno);
  const od = uvodnyZaciatok.slice(0, 16);
  const dalsie = udalosti
    .filter((u) => (u.typ === "trening" || u.typ === "uvodny") && !u.zmizlaAt && !u.zmizla_at
      && u.klient && normName(u.klient) === k && u.zaciatok.slice(0, 16) > od)
    .map((u) => u.zaciatok.slice(0, 16))
    .sort();
  return dalsie[0] ?? null;
}

/** Posledný úvodný klienta za `dni` dní — pre tlačidlo v profile. */
export function poslednyUvodny<T extends UdalostSms & { trener?: string | null }>(udalosti: T[], meno: string, dnes: string, dni = 30): T | null {
  const k = normName(meno);
  const hranica = new Date(Date.parse(`${dnes}T12:00:00Z`) - dni * 86400_000).toISOString().slice(0, 10);
  const uvodne = udalosti
    .filter((u) => u.typ === "uvodny" && !u.zmizlaAt && !u.zmizla_at && u.klient && normName(u.klient) === k
      && u.zaciatok.slice(0, 10) <= dnes && u.zaciatok.slice(0, 10) >= hranica)
    .sort((a, b) => b.zaciatok.localeCompare(a.zaciatok));
  return uvodne[0] ?? null;
}
