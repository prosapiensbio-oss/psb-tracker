import { normName } from "./format";
import type { DlhPolozka } from "./zaplatene";

/**
 * FAKTÚRA NA BALÍČEK JE UHRADENÁ, KEĎ JE ZAPLATENÝ JEJ BALÍČEK.
 *
 * Jerry, 23. 10. 2026 nad Martinom Vaškom: „8. 10. sa založila faktúra a on
 * ju 8. 10. zaplatil, tým sa vynuloval ten dlh — nemala by tam byť faktúra,
 * ktorá je po splatnosti." Uhradenú dovtedy značil len klik „uhradená";
 * platba z banky zaplatila balíček (jedno pravidlo `dlhyKlientov`), ale
 * faktúra o tom nevedela a svietila červeno.
 *
 * Rozhoduje TO ISTÉ pravidlo ako dlh: balíček faktúry žije (nie je zrušený)
 * a medzi položkami dlhu nie je. Čiastočne zaplatený balíček (Lucia: dlh
 * 4 290 z 5 640) v dlhu ostáva, takže jeho faktúra uhradená nie je.
 * Deň úhrady je platba klienta na sumu faktúry (± 1 Kč) od 30 dní pred
 * vystavením; keď taká nie je, dnešok.
 */
export function faktureUhradeneBalickom(
  faktury: { id: string; klient: string; balicekId: string | null; vystavene: string; celkom: number; uhradeneAt: string | null; stornoAt: string | null }[],
  ziveBalicky: Set<string>,
  dlhy: DlhPolozka[],
  platby: { id: string; klient: string; datum: string; suma: number }[],
  dnes: string,
): { id: string; den: string; platbaId: string | null }[] {
  const vDlhu = new Set(dlhy.map((d) => d.id).filter(Boolean) as string[]);
  const posun = (d: string, n: number) => new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const out: { id: string; den: string; platbaId: string | null }[] = [];
  for (const f of faktury) {
    if (f.uhradeneAt || f.stornoAt || !f.balicekId) continue;
    if (!ziveBalicky.has(f.balicekId) || vDlhu.has(f.balicekId)) continue;
    const p = platby
      .filter((x) => normName(x.klient) === normName(f.klient) && Math.abs(Math.round(x.suma) - Math.round(f.celkom)) <= 1
        && x.datum >= posun(f.vystavene, -30) && x.datum <= dnes)
      .sort((a, b) => a.datum.localeCompare(b.datum))[0];
    out.push({ id: f.id, den: p?.datum || dnes, platbaId: p?.id || null });
  }
  return out;
}
