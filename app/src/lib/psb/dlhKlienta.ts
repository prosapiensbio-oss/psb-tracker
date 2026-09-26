/**
 * ČO KLIENT DLŽÍ ZA BALÍČKY.
 *
 * Jerry, 26. 9. 2026: „vytvoril som balíček, ale nevznikol dlh." Mal pravdu —
 * balíček sa zapísal a nikde sa neprejavilo, že zaň ešte nezaplatil. Pritom
 * je to jeho vlastná definícia: pohľadávka vzniká vytvorením balíčka.
 *
 * PREČO SA RÁTAJÚ LEN RUČNE NAHODENÉ BALÍČKY
 *
 * Balíčky naliate z PTmindera sú história — zaplatené boli v starom svete
 * a platby k nim v Kokpite nie sú. Keby sa počítali, appka by každému
 * dlhoročnému klientovi vyrobila dlh desiatok tisíc, ktorý nikdy nevznikol.
 *
 * PREČO SA RÁTAJÚ LEN PLATBY OD PRVÉHO RUČNÉHO BALÍČKA
 *
 * Z toho istého dôvodu opačne: platby z banky sú v appke od januára 2026,
 * balíčky od 22. 9. Staršia platba patrí k niečomu, čo v zozname balíčkov
 * nie je, a umazala by dlh, ktorý naozaj je.
 */

export type BalicekDlh = { cena: number | null; platnostOd: string; zdroj: string; zruseneAt?: string | null; nazov?: string };
export type PlatbaDlh = { suma: number; datum: string; zruseneAt?: string | null };

export type Dlh = {
  /** Koľko ešte nie je pokryté platbami. Nikdy záporné. */
  dlzi: number;
  /** Súčet cien ručne nahodených balíčkov. */
  zaBalicky: number;
  /** Platby, ktoré sa do toho počítali. */
  zaplatene: number;
  /** Odkedy sa platby počítajú — deň prvého ručného balíčka. */
  od: string;
  /** Balíčky, ktoré do dlhu vstúpili — na vysvetlenie čísla. */
  pocet: number;
};

export function dlhKlienta(balicky: BalicekDlh[], platby: PlatbaDlh[]): Dlh {
  const nase = balicky
    .filter((b) => !b.zruseneAt && b.zdroj === "rucne" && (b.cena || 0) > 0)
    .sort((a, b) => a.platnostOd.localeCompare(b.platnostOd));
  if (!nase.length) return { dlzi: 0, zaBalicky: 0, zaplatene: 0, od: "", pocet: 0 };

  const od = nase[0].platnostOd;
  const zaBalicky = nase.reduce((s, b) => s + (b.cena || 0), 0);
  const zaplatene = platby
    .filter((p) => !p.zruseneAt && p.datum >= od)
    .reduce((s, p) => s + p.suma, 0);
  return {
    dlzi: Math.max(0, Math.round(zaBalicky - zaplatene)),
    zaBalicky: Math.round(zaBalicky),
    zaplatene: Math.round(zaplatene),
    od,
    pocet: nase.length,
  };
}
