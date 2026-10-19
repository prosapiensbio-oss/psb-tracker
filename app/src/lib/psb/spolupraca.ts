/**
 * ODKEDY JE ČLOVEK KLIENT A AKO DLHO SPOLUPRACUJEME.
 *
 * Jerry, 19. 10. 2026: „do profilu mi pridaj okrem dátumu narodenia aj koľko
 * dní má do narodenín aj ako dlho s klientom spolupracujeme — 1r 3m 16d."
 *
 * Kokpit má sedenia až od 3. 1. 2025, takže „prvé sedenie v dátach" pri
 * klientoch spred roku 2025 klamalo (Michal Knapčok chodí od októbra 2022).
 * Začiatok = PRVÝ TRÉNING: v Kokpite, alebo z archívu sedení PTmindera
 * (`ptminder_klienti.prvy_trening`, export od 1/2022). Registrácia (Sign up
 * date) a vytvorenie (Created Date) z Client Listu sú len záloha, keď tréning
 * nepoznáme — registrácia predbieha tréning aj o mesiace (Anna Nová: 1/2024
 * vs. prvý tréning 10/2024) a niekedy je to dátum narodenia (Iva Stoklasková
 * 1965) — dátum pred rokom 2021 sa preto neberie vôbec.
 */

/** Skorší dátum už nie je spolupráca, ale preklep (dátum narodenia v poli registrácie). */
export const SPOLUPRACA_NAJSKOR = "2021-01-01";

const jeDen = (s?: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export type ZaciatokSpoluprace = { den: string; zdroj: "kokpit" | "ptminder" };

export function zaciatokSpoluprace(
  v: { prvyTrening?: string | null; prvyTreningArchiv?: string | null; registracia?: string | null; vytvoreny?: string | null },
  dnes: string,
): ZaciatokSpoluprace | null {
  const najskorsi = (xs: ZaciatokSpoluprace[]) => (xs.length ? xs.reduce((a, b) => (b.den < a.den ? b : a)) : null);
  const ok = (d: string) => jeDen(d) && d >= SPOLUPRACA_NAJSKOR && d <= dnes;
  const treningy: ZaciatokSpoluprace[] = [];
  const prvy = (v.prvyTrening || "").slice(0, 10);
  if (ok(prvy)) treningy.push({ den: prvy, zdroj: "kokpit" });
  const archiv = (v.prvyTreningArchiv || "").slice(0, 10);
  if (ok(archiv)) treningy.push({ den: archiv, zdroj: "ptminder" });
  if (treningy.length) return najskorsi(treningy);
  return najskorsi([v.registracia, v.vytvoreny].filter((d): d is string => !!d && ok(d)).map((den) => ({ den, zdroj: "ptminder" as const })));
}

/** Kalendárny rozdiel dvoch dní: roky, mesiace, dni (ako vek, nie 30-dňové mesiace). */
export function trvanie(od: string, doDna: string): { r: number; m: number; d: number } | null {
  if (!jeDen(od) || !jeDen(doDna) || doDna < od) return null;
  const [r1, m1, d1] = od.split("-").map(Number);
  const [r2, m2, d2] = doDna.split("-").map(Number);
  // Pripočítaj celé mesiace (31. 1. + 1 mesiac = 28. 2., deň sa zreže na
  // koniec mesiaca), zvyšok sú dni — 31. 1. → 1. 3. = 1m 1d.
  const plusMesiacov = (n: number) => {
    const r = r1 + Math.floor((m1 - 1 + n) / 12), m = ((m1 - 1 + n) % 12) + 1;
    const posledny = new Date(Date.UTC(r, m, 0)).getUTCDate();
    return Date.UTC(r, m - 1, Math.min(d1, posledny));
  };
  const koniec = Date.UTC(r2, m2 - 1, d2);
  let mesiacov = (r2 - r1) * 12 + (m2 - m1);
  while (mesiacov > 0 && plusMesiacov(mesiacov) > koniec) mesiacov--;
  const d = Math.round((koniec - plusMesiacov(mesiacov)) / 86400000);
  return { r: Math.floor(mesiacov / 12), m: mesiacov % 12, d };
}

/** „1r 3m 16d" — nulové časti zhora sa vynechajú („3m 16d"), deň ostane vždy. */
export function trvanieText(od: string, doDna: string): string {
  const t = trvanie(od, doDna);
  if (!t) return "";
  if (!t.r && !t.m && !t.d) return "dnes";
  const kusy: string[] = [];
  if (t.r) kusy.push(`${t.r}r`);
  if (t.r || t.m) kusy.push(`${t.m}m`);
  kusy.push(`${t.d}d`);
  return kusy.join(" ");
}

/** Dni do najbližších narodenín podľa pražského dňa; 0 = dnes. */
export function dniDoNarodenin(narodeniny: string, dnes: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(narodeniny || "");
  if (!m || !jeDen(dnes)) return null;
  const [r, mm, dd] = dnes.split("-").map(Number);
  const dnesUTC = Date.UTC(r, mm - 1, dd);
  let d = Date.UTC(r, Number(m[2]) - 1, Number(m[3]));
  if (d < dnesUTC) d = Date.UTC(r + 1, Number(m[2]) - 1, Number(m[3]));
  return Math.round((d - dnesUTC) / 86400000);
}
