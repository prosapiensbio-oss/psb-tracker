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

import { KOKPIT_OD } from "./sedeniaZKalendara";

export type BalicekDlh = { cena: number | null; platnostOd: string; zdroj: string; zruseneAt?: string | null; nazov?: string; poznamka?: string | null };

/**
 * OTVÁRACÍ ZOSTATOK NIE JE PREDAJ.
 *
 * Naliatie z PTmindera (27 riadkov k 20. 9. 2026) prevzalo, koľko komu
 * zostávalo hodín — nie to, že si v ten deň niečo kúpil. Tie riadky nesú
 * katalógovú cenu starých produktov (ONE YEAR 77 240, DYNAMIKA, MFR), hoci
 * sú dávno zaplatené. Keby tvorili dlh, pribudlo by 99 378 Kč, ktoré nikto
 * nedlhuje (zmerané 12. 10. 2026 nad ostrými dátami).
 */
export const jeOtvaraciZostatok = (b: { poznamka?: string | null }): boolean =>
  /^\s*zostatok prevzatý/i.test(String(b.poznamka || ""));
export type PlatbaDlh = {
  suma: number; datum: string; zruseneAt?: string | null;
  /**
   * Zaplatené vopred — na balíček, ktorý ešte nevznikol (migrácia 0097).
   * Počíta sa aj vtedy, keď je staršia než prvý balíček z Kokpitu.
   */
  vopred?: boolean | number | null;
  /** Spôsob úhrady — pri bitcoine rozhoduje suma v korunách, nie kurz (viď `KURZ_BTC`). */
  sposob?: string;
};

/**
 * BITCOIN: KLIENT PLATÍ KORUNY, SATY SÚ LEN KURZ (Jerry, 15. 10. 2026:
 * „klient platí vždy rovnako v českej korune a množstvo sats sa len
 * prispôsobí aktuálnemu kurzu… ak prišla platba, dlh sa maže").
 *
 * Peter Gažo zaplatil 11. 10. svojich 20 093 Kč z QR kódu; BTC kniha mu
 * platbu prepočítala svojím kurzom na 19 682 Kč a Kokpit z rozdielu 411 Kč
 * spravil dlh, ktorý by balíček držal nezaplatený a bez hodín. Bitcoinová
 * platba do 10 % od ceny balíčka ho preto zaplatí CELÝ — a ani prebytok pri
 * rastúcom kurze sa neprenáša ďalej. Väčší rozdiel už nie je kurz, ale iná
 * suma (polovičná platba, iný balíček) — tam dlh svieti ďalej.
 */
export const KURZ_BTC = 0.1;


/**
 * Balíčky, ktoré tvoria dlh: nezrušené, s cenou. Od najstaršieho.
 *
 * ZDROJ UŽ NEROZHODUJE (Jerry, 12. 10. 2026: „zdrojom dlhu bude Kokpit
 * a PTminder bude len kontrola — ak sa v Kokpite zmenilo na 18 h, tak by sa
 * to malo zmeniť"). Do toho dňa sa počítali len riadky nahodené rukou
 * (`zdroj = rucne`), takže keď Jerry prepísal Dominike veľkosť balíčka
 * naliateho z PTmindera, nová cena nevstúpila nikam a karta ďalej hlásila
 * starý poplatok z PTmindera.
 *
 * PTminder zostáva poistkou: `zaplateneVPtminderi` ďalej odpúšťa balíčky,
 * ktoré on pozná ako zaplatené — bez toho by sa do dlhu vrátili všetky
 * naliate členstvá, ktoré klienti dávno zaplatili ešte pred Kokpitom.
 */
const balickyKokpitu = (balicky: BalicekDlh[]): BalicekDlh[] => balicky
  .filter((b) => !b.zruseneAt && (b.cena || 0) > 0 && !jeOtvaraciZostatok(b))
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
export function nezaplateneZKokpitu<B extends BalicekDlh>(
  balicky: B[],
  platby: PlatbaDlh[],
  /**
   * Balíček, ktorý PTminder pozná ako zaplatený (`zaplateneVPtminderi`).
   * Berie si z platieb Kokpitu len tie zo SVOJHO obdobia (do 45 dní od
   * začiatku) — novšie peniaze patria novšiemu predaju.
   *
   * Peter Gažo, 15. 10. 2026: bitcoinová platba z 11. 10. (19 682 Kč) sa
   * položila na jeho májové členstvo, lebo je najstaršie — to bolo dávno
   * zaplatené v PTminderi. Poistka potom staré členstvo odpustila, ale
   * peniaze už boli „minuté" a októbrový balíček ostal ako dlh v plnej výške.
   */
  zaplatenyInde?: (b: B) => boolean,
): (B & { doplatit: number })[] {
  const nase = balickyKokpitu(balicky) as B[];
  if (!nase.length) return [];
  const zasoba = zapocitanePlatby(platby, nase[0].platnostOd)
    .map((p) => ({ datum: p.datum, zostava: p.suma, bitcoin: p.sposob === "bitcoin", cela: true }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  // Vrátenie (záporná platba, `ukoncenieBalicka`) zmenší platby od
  // najnovšej — peniaze, ktoré odišli späť, nič nezaplatia (súčet ako predtým).
  for (const v of zasoba.filter((p) => p.zostava < 0)) {
    let dlh = -v.zostava;
    v.zostava = 0;
    for (const p of [...zasoba].reverse()) {
      if (dlh <= 0) break;
      if (p.zostava <= 0) continue;
      const k = Math.min(dlh, p.zostava);
      p.zostava -= k;
      dlh -= k;
    }
  }
  const zober = (kolko: number, smie: (datum: string) => boolean) => {
    let ostava = kolko;
    for (const p of zasoba) {
      if (ostava <= 0) break;
      if (p.zostava <= 0 || !smie(p.datum)) continue;
      const k = Math.min(ostava, p.zostava);
      p.zostava -= k;
      p.cela = false;
      ostava -= k;
    }
    return kolko - ostava;
  };
  const posun = (d: string, dni: number) => new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + dni * 86400000).toISOString().slice(0, 10);
  const out: (B & { doplatit: number })[] = [];
  for (const b of nase) {
    const cena = b.cena || 0;
    if (zaplatenyInde?.(b)) { const hranica = posun(b.platnostOd, 45); zober(cena, (d) => d <= hranica); continue; }
    // Len platba z obdobia balíčka (14 dní pred až 45 po začiatku) — inak by
    // októbrová platba Gaža „sedela" aj na májové členstvo s podobnou cenou.
    const od = posun(b.platnostOd, -14), po = posun(b.platnostOd, 45);
    const btc = zasoba.find((p) => p.bitcoin && p.cela && p.zostava > 0 && p.datum >= od && p.datum <= po
      && Math.abs(p.zostava - cena) <= cena * KURZ_BTC);
    if (btc) { btc.zostava = 0; btc.cela = false; continue; }
    const vzate = zober(cena, () => true);
    // Koruna tolerancie na zaokrúhlenie, ako pri rozdelení platby.
    if (vzate + 1 >= cena) continue;
    // Koľko na balíček ešte chýba — pri čiastočnej platbe menej než cena.
    out.push({ ...b, doplatit: Math.round(cena - vzate) });
  }
  return out;
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
 *  2. v tom istom okne má DVE alebo TRI platby, ktoré sa na cenu zložia
 *     (tolerancia 50 Kč alebo 1 %), alebo
 *  3. PTminder má členstvo, ktoré začína do troch dní od toho istého dňa,
 *     a nemá k nemu otvorený poplatok.
 *
 * BOD 2 PRIBUDOL 11. 10. 2026 A STÁL PENIAZE PRED KLIENTOM.
 *
 * Peter Gažo dostal SMS s odkazom na platbu a QR kód znel na ~42 000 Kč
 * namiesto 20 093 — dvojnásobok. Jeho júlové členstvo (24. 7., 20 093 Kč)
 * zaplatil NA DVAKRÁT: 8 000 Kč 7. 8. a 12 081 Kč 17. 8. Pravidlo hľadalo
 * jedinú platbu na celú sumu, žiadnu nenašlo, a tak zrátalo ako dlh aj
 * dávno zaplatené členstvo k tomu, ktoré naozaj otvorené je.
 *
 * Splátka nie je výnimka — Jerry ju od klientov bežne berie. Tolerancia je
 * zámerne malá (50 Kč / 1 %): poistka má zachytiť zaplatené, nie zahladiť
 * polovičnú platbu. Keď klient zaplatil len časť, dlh má svietiť ďalej.
 */
export function zaplateneVPtminderi<T extends BalicekDlh & { klient: string }>(
  nezaplatene: T[],
  ptPlatby: { klient: string; datum: string; suma: number }[],
  ptHistoria: { klient: string; od: string }[],
  ptOtvorene: { klient: string; datum: string }[],
  meno: (s: string) => string,
  /**
   * Platby z Kokpitu (banka, zošit) — len na rozpoznanie SPLÁTKY. Bez nich
   * sa splátka nerozpoznáva a poistka sa správa ako do 17. 10. 2026.
   */
  kokpitPlatby: { klient: string; datum: string; suma: number }[] = [],
): T[] {
  const dni = (a: string, b: string) => (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000;
  const pouzite = new Set<number>();
  return nezaplatene.filter((b) => {
    const k = meno(b.klient);
    const cena = Math.round(b.cena || 0);
    const vOkne = (j: number) => {
      const p = ptPlatby[j];
      return !pouzite.has(j) && meno(p.klient) === k
        && dni(b.platnostOd, p.datum) >= -14 && dni(b.platnostOd, p.datum) <= 45;
    };
    const i = ptPlatby.findIndex((p, j) => vOkne(j) && Math.abs(Math.round(p.suma) - cena) <= 1);
    if (i >= 0) { pouzite.add(i); return false; }

    // Splátky: dva alebo tri pohyby, ktoré sa na cenu zložia. Viac než tri
    // sa zámerne nehľadá — z piatich čísel sa dá poskladať skoro čokoľvek
    // a z poistky by sa stalo zahládzanie.
    const kand = ptPlatby.map((_, j) => j).filter(vOkne);
    const tol = Math.max(50, cena * 0.01);
    const sedi = (idx: number[]) => Math.abs(idx.reduce((a, j) => a + Math.round(ptPlatby[j].suma), 0) - cena) <= tol;
    for (let a = 0; a < kand.length; a++) {
      for (let c = a + 1; c < kand.length; c++) {
        if (sedi([kand[a], kand[c]])) { pouzite.add(kand[a]); pouzite.add(kand[c]); return false; }
        for (let d = c + 1; d < kand.length; d++) {
          if (sedi([kand[a], kand[c], kand[d]])) { pouzite.add(kand[a]); pouzite.add(kand[c]); pouzite.add(kand[d]); return false; }
        }
      }
    }
    /**
     * ČIASTOČNÁ PLATBA V KOKPITE = DLH JE ZVYŠOK, PTMINDER HO NEZMAŽE
     * (Jerry, 17. 10. 2026 pri Markéte Lozias: „platí balíky na dvakrát…
     * ak platí 7 790 na 2× a zaplatí 3 000, zostane dlžoba 4 790").
     * Bod 3 (členstvo bez otvoreného poplatku) je poistka pre prípad, že
     * Kokpit banku nevidí. Keď na balíček už prišla časť peňazí, banku vidí
     * — a PTminder pri splátke poplatok často vôbec nezaloží, takže by
     * zvyšok ticho odpustil. Body 1 a 2 (skutočné platby v PTminderi, ktoré
     * sa na cenu zložia) platia ďalej.
     */
    // Len balíčky od prechodu na Kokpit (1. 10. 2026). Staršie súdil PTminder
    // a jeho „zaplatené" platí: Kateřina Stoklásková zaplatila za júlové
    // členstvo 6 990 namiesto 7 790 a PTminder ho má ako vyrovnané — bez
    // tejto hranice by jej vznikol dlh 800 Kč, o ktorom nikto nevie.
    //
    // Splátka sa NEBERIE z `doplatit`: FIFO vie položiť októbrovú platbu na
    // starší balíček zaplatený v PTminderi a nový by potom vyzeral čiastočne
    // zaplatený, hoci peniaze naň prišli celé (nález nezávislej kontroly,
    // 17. 10. 2026). Splátka = platby z Kokpitu v okne balíčka (−14 až +45
    // dní), ktoré dajú aspoň 30 % ceny a menej než celú cenu.
    if (b.platnostOd >= KOKPIT_OD && cena > 0) {
      const vOkneKokpit = kokpitPlatby
        .filter((p) => meno(p.klient) === k && dni(b.platnostOd, p.datum) >= -14 && dni(b.platnostOd, p.datum) <= 45)
        .reduce((a, p) => a + (Number(p.suma) || 0), 0);
      if (vOkneKokpit >= cena * 0.3 && vOkneKokpit < cena - 1) return true;
    }
    const vHistorii = ptHistoria.some((h) => meno(h.klient) === k && Math.abs(dni(b.platnostOd, h.od)) <= 3);
    const otvoreny = ptOtvorene.some((o) => meno(o.klient) === k && Math.abs(dni(b.platnostOd, o.datum)) <= 3);
    return !(vHistorii && !otvoreny);
  });
}