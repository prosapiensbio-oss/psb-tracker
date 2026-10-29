import { normName } from "./format";
import { nazovProduktu } from "./nazvyProduktov";
import type { DlhPolozka } from "./zaplatene";

/**
 * ČO KLIENTI Z FAKTÚRY EŠTE DLŽIA A NA FAKTÚRE NIE JE.
 *
 * Jerry, 29. 10. 2026: „faktúra by mi mala sama navrhnúť, že je tam dlh
 * 100 Kč, a spýtať sa — pridať dlh na faktúru? Zistí, že som pridal Lindu,
 * zrazu je dlh 200 Kč — pridať aj ten?" Branislav zaplatil za úvodný 1 000
 * z 1 100 a zvyšok by inak visel mimo faktúry, ktorú firma zaplatí.
 *
 * Dlh je ten istý, aký ukazuje karta dlžníkov (`data.dlhy`, jedno pravidlo
 * „zaplatený"). Vynecháva sa balíček, ktorý na faktúre už je (hlavná položka
 * alebo ďalšia s `balicekId`) — fakturovať ho druhý raz by bol dvojnásobok.
 * Pýta sa za VŠETKÝCH klientov na faktúre, takže pridaním Lindy pribudne
 * aj jej dlh. Rozhoduje človek; samo sa na faktúru nepridá nič.
 */
export type DlhNaFakturu = { kluc: string; klient: string; balicekId: string | null; suma: number; popis: string; nazov: string; den: string };

export function dlhyNaFakturu(dlhy: DlhPolozka[] | undefined, klienti: string[], naFakture: (string | null | undefined)[]): DlhNaFakturu[] {
  const kto = new Set(klienti.map((k) => normName(k)).filter(Boolean));
  const uz = new Set(naFakture.filter(Boolean) as string[]);
  const out: DlhNaFakturu[] = [];
  for (const d of dlhy || []) {
    if (!kto.has(normName(d.klient)) || d.doplatit <= 0) continue;
    if (d.id && uz.has(d.id)) continue;
    const nazov = nazovProduktu(d.nazov) || d.nazov;
    const den = `${Number(d.den.slice(8, 10))}. ${Number(d.den.slice(5, 7))}. ${d.den.slice(0, 4)}`;
    const ciastocne = d.doplatit < d.cena;
    out.push({
      kluc: d.id || `${normName(d.klient)}|${d.den}|${d.nazov}`,
      klient: d.klient, balicekId: d.id || null, suma: Math.round(d.doplatit), nazov, den: d.den,
      popis: `${ciastocne ? "Doplatek — " : ""}${nazov} (${den})`,
    });
  }
  return out.sort((a, b) => a.den.localeCompare(b.den));
}
