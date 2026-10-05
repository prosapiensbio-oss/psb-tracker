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
export type PlatbaDlh = {
  suma: number; datum: string; zruseneAt?: string | null;
  /**
   * Zaplatené vopred — na balíček, ktorý ešte nevznikol (migrácia 0097).
   * Počíta sa aj vtedy, keď je staršia než prvý balíček z Kokpitu.
   */
  vopred?: boolean | number | null;
};

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

/** Balíčky, ktoré tvoria dlh: z Kokpitu, nezrušené, s cenou. Od najstaršieho. */
const balickyKokpitu = (balicky: BalicekDlh[]): BalicekDlh[] => balicky
  .filter((b) => !b.zruseneAt && b.zdroj === "rucne" && (b.cena || 0) > 0)
  .sort((a, b) => a.platnostOd.localeCompare(b.platnostOd));

/** Platby, ktoré sa na balíčky z Kokpitu počítajú: od prvého z nich, alebo vopred. */
const zapocitanePlatby = (platby: PlatbaDlh[], od: string): PlatbaDlh[] =>
  platby.filter((p) => !p.zruseneAt && (p.datum >= od || !!p.vopred));

/**
 * KTORÉ BALÍČKY Z KOKPITU NIE SÚ ZAPLATENÉ.
 *
 * Jerry, 4. 10. 2026: „keď vznikne balík prvým tréningom, 6 h −1, vznikne
 * automaticky dlh za nové členstvo; keď príde platba a ja alebo Terezka ju
 * spárujeme, dlh zaniká a my pokračujeme 5 h." Nezaplatený balíček hodiny
 * nedáva (pravidlo z 3. 10.), takže treba vedieť KTORÝ — nielen koľko.
 *
 * Platby sa kladú na balíčky od najstaršieho, rovnako ako pri dlhu
 * (`dlhKlienta`), takže hodiny a dlh sa nemôžu rozísť: balíček je
 * nezaplatený práve vtedy, keď ho súčet platieb nepokryl celý. Čiastočne
 * zaplatený je nezaplatený — 7 790 na 18 h nie je 18 h (Jerry: „znak, že
 * veľkosť je zlá"). Prebytok ide na ďalší balíček, aj na ten, čo vznikne až
 * neskôr: to je platba vopred.
 */
export function nezaplateneZKokpitu(balicky: BalicekDlh[], platby: PlatbaDlh[]): (BalicekDlh & { doplatit: number })[] {
  const nase = balickyKokpitu(balicky);
  if (!nase.length) return [];
  let zostava = zapocitanePlatby(platby, nase[0].platnostOd).reduce((s, p) => s + p.suma, 0);
  const out: (BalicekDlh & { doplatit: number })[] = [];
  for (const b of nase) {
    const cena = b.cena || 0;
    // Koruna tolerancie na zaokrúhlenie, ako pri rozdelení platby.
    if (zostava + 1 >= cena) { zostava -= cena; continue; }
    // Koľko na balíček ešte chýba — pri čiastočnej platbe menej než cena.
    out.push({ ...b, doplatit: Math.round(cena - Math.max(0, zostava)) });
    zostava = 0;
  }
  return out;
}

export function dlhKlienta(balicky: BalicekDlh[], platby: PlatbaDlh[]): Dlh {
  const nase = balickyKokpitu(balicky);
  if (!nase.length) return { dlzi: 0, zaBalicky: 0, zaplatene: 0, od: "", pocet: 0 };

  const od = nase[0].platnostOd;
  const zaBalicky = nase.reduce((s, b) => s + (b.cena || 0), 0);
  const zaplatene = zapocitanePlatby(platby, od).reduce((s, p) => s + p.suma, 0);
  return {
    dlzi: Math.max(0, Math.round(zaBalicky - zaplatene)),
    zaBalicky: Math.round(zaBalicky),
    zaplatene: Math.round(zaplatene),
    od,
    pocet: nase.length,
  };
}

/**
 * ČO O ZAPLATENÍ VIE PTMINDER — poistka na čas prechodu.
 *
 * 4. 10. 2026 pri zapínaní pravidla „nezaplatený balíček z Kokpitu ide do
 * mínusu" vyšli dvaja klienti ako nezaplatení: Vítězslav Papiež (6 990,
 * 29. 9.) a Janka Šnirychová (3 990, 22. 9.). Obaja zaplatili — PTminder má
 * platby 29. 9. a 30. 9. Kokpit ich nemal, lebo výpis z Fio sa od 27. 9.
 * nestiahol. Kým beží PTminder, je to jeho platba, čo hovorí pravdu; Kokpit
 * ho prestane potrebovať, až keď sa banka sťahuje a páruje v ňom.
 *
 * Balíček je zaplatený podľa PTmindera, keď:
 *  1. PTminder má platbu toho klienta na rovnakú sumu (± 1 Kč) od dvoch
 *     týždňov pred začiatkom po 45 dní po ňom — každá platba len raz, alebo
 *  2. PTminder má členstvo, ktoré začína do troch dní od toho istého dňa,
 *     a nemá k nemu otvorený poplatok.
 */
export function zaplateneVPtminderi<T extends BalicekDlh & { klient: string }>(
  nezaplatene: T[],
  ptPlatby: { klient: string; datum: string; suma: number }[],
  ptHistoria: { klient: string; od: string }[],
  ptOtvorene: { klient: string; datum: string }[],
  meno: (s: string) => string,
): T[] {
  const dni = (a: string, b: string) => (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000;
  const pouzite = new Set<number>();
  return nezaplatene.filter((b) => {
    const k = meno(b.klient);
    const cena = Math.round(b.cena || 0);
    const i = ptPlatby.findIndex((p, j) => !pouzite.has(j) && meno(p.klient) === k
      && Math.abs(Math.round(p.suma) - cena) <= 1
      && dni(b.platnostOd, p.datum) >= -14 && dni(b.platnostOd, p.datum) <= 45);
    if (i >= 0) { pouzite.add(i); return false; }
    const vHistorii = ptHistoria.some((h) => meno(h.klient) === k && Math.abs(dni(b.platnostOd, h.od)) <= 3);
    const otvoreny = ptOtvorene.some((o) => meno(o.klient) === k && Math.abs(dni(b.platnostOd, o.datum)) <= 3);
    return !(vHistorii && !otvoreny);
  });
}