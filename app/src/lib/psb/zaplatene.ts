/**
 * ČO JE NEZAPLATENÉ — JEDNO PRAVIDLO PRE CELÝ KOKPIT.
 *
 * Jerry, 5. 10. 2026: „sprav jedno pravidlo." Do toho dňa rozhodovalo o tom
 * istom slove trinásť miest a aspoň dvanásť z nich vedelo o jednom klientovi
 * povedať niečo iné: karta dlžníkov odstraňovala zdvojený predaj, Dnes ho
 * odstraňovala z opačnej strany a v inom okne dní, profil ho sčítal dvakrát,
 * Prehľad peňazí a Jarvis poznali len PTminder, hodiny brali surové poplatky
 * a otázka „suma nesedí" nevedela o platbách z PTmindera.
 *
 * Odteraz sa to počíta TU, raz, na serveri (`loadData` → `data.dlhy`), a každá
 * obrazovka len číta. Položka dlhu je jeden predaj, ktorý ešte nie je
 * zaplatený, s tým, koľko z neho chýba.
 *
 * PRAVIDLO, krok za krokom:
 *
 *  1. Otvorené poplatky z PTmindera, z ktorých sa odratajú platby zapísané
 *     v Kokpite — suma na korunu, −10 až +60 dní, jedna platba na jeden
 *     poplatok (`poplatkyPoOdrataniPlatieb`).
 *  2. VŠETKY balíčky v Kokpite, na ktoré sa platby z Kokpitu kladú od
 *     najstaršieho; čiastočne zaplatený je nezaplatený (`nezaplateneZKokpitu`).
 *     Do 12. 10. 2026 rozhodovali len riadky nahodené rukou (`zdroj = rucne`)
 *     — preto keď Jerry prepísal Dominike veľkosť balíčka naliateho
 *     z PTmindera zo 6 h na 18 h, nová cena nevstúpila nikam a karta ďalej
 *     hlásila starý poplatok 6 622 Kč. Jerry: „zdrojom dlhu bude Kokpit
 *     a PTminder bude len kontrola — ak sa v Kokpite zmenilo na 18 h, tak by
 *     sa to malo zmeniť." Výnimka je otvárací zostatok z naliatia
 *     (`jeOtvaraciZostatok`): prevzaté hodiny nie sú predaj.
 *  3. Poistka na čas súbežného chodu: balíček z Kokpitu, ktorý PTminder pozná
 *     ako zaplatený, dlhom nie je (`zaplateneVPtminderi`).
 *  4. Ten istý predaj zapísaný v oboch systémoch je JEDEN: poplatok
 *     z PTmindera s rovnakou cenou do troch dní od balíčka z Kokpitu ustúpi
 *     balíčku — zaplatenému aj nezaplatenému (Jerry, 3. 10. 2026: „platí ten
 *     Kokpit"). Dlh z neho potom nesie len balíček.
 *
 * Kto čo z toho číta:
 *  • hodiny — balíček, ktorého deň začiatku je v zozname, hodiny nedáva
 *    (karta klienta aj os času, kľúč klient + deň);
 *  • peniaze — súčet `doplatit` je dlh (karta dlžníkov, profil, Dnes,
 *    Prehľad peňazí, stránka za odkazom a QR, Jarvis);
 *  • otázka „suma nesedí" — balíček z Kokpitu, ktorý dostal niečo, ale nie
 *    celú cenu;
 *  • príznak „platba vopred" — klient, ktorý v zozname nemá nič.
 *
 * Čo sem zámerne NEPATRÍ: tržby z kalendára (`platnyBalicek` oceňuje hodinu
 * aj z nezaplateného balíčka — tržba vzniká tréningom, nie platbou) a karta
 * „Bez balíčka" (kto má nezaplatený balíček, balíček MÁ — patrí do „Dlhujú",
 * nie medzi tých, čo si majú kúpiť nový).
 */

import { jeOtvaraciZostatok, nezaplateneZKokpitu, zaplateneVPtminderi, type BalicekDlh, type PlatbaDlh } from "./dlhKlienta";
import { normName } from "./format";
import { poplatkyPoOdrataniPlatieb, type Platba } from "./platbyEvidencia";

export type DlhPolozka = {
  klient: string;
  /** Deň predaja — pri balíčku deň začiatku, pri poplatku deň poplatku. */
  den: string;
  /** Za čo: názov balíčka alebo popis poplatku z PTmindera. */
  nazov: string;
  /** Celá cena predaja. */
  cena: number;
  /** Koľko z neho ešte chýba (pri čiastočnej platbe menej než cena). */
  doplatit: number;
  zdroj: "ptminder" | "kokpit";
  /** Id balíčka v Kokpite (len pri `zdroj: "kokpit"`). */
  id?: string;
};

export type VstupDlhov = {
  /** Otvorené poplatky z PTmindera tak, ako prišli v exporte. */
  poplatky: { id?: string; klient: string; datum: string; popis: string; suma: number }[];
  /** Platby zapísané v Kokpite (tabuľka `platby`). */
  platby: { id?: string; klient: string; datum: string; suma: number; zruseneAt?: string | null; vopred?: boolean | number | null; sposob?: string; fioId?: string | null }[];
  /** Balíčky v Kokpite (tabuľka `balicky`) — rozhodujú len ručne nahodené. */
  balicky: { id?: string; klient: string; nazov: string; cena: number | null; platnostOd: string; zdroj: string; zruseneAt?: string | null; poznamka?: string | null }[];
  /** Platby z PTmindera — len pre poistku (krok 3). */
  ptPlatby: { klient: string; datum: string; suma: number }[];
  /** Začiatky členstiev z histórie PTmindera — len pre poistku (krok 3). */
  ptHistoria: { klient: string; od: string }[];
};

const den = (s: string) => String(s || "").slice(0, 10);
const dni = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

/**
 * Krok 4: poplatok z PTmindera, ktorý je ten istý predaj ako balíček
 * z Kokpitu. Do 4. 10. 2026 len ten istý deň; odkedy balíček vzniká sám prvým
 * tréningom, deň býva o deň-dva iný. Rovnaká cena do troch dní = ten istý
 * predaj; o týždeň neskôr už je to druhý (předplatné ide každý mesiac za tú
 * istú sumu). Každý balíček zoberie najviac jeden poplatok; presný deň má
 * prednosť pred blízkym.
 *
 * ZĽAVA ZNAMENÁ, ŽE CENY SA NEROVNAJÚ — a to ma 11. 10. 2026 stálo zle
 * poslaný QR kód. Peter Gažo si 9. 10. kúpil jeden 18-hodinový balíček.
 * PTminder ho vedie za cenníkových 21 150 Kč, Kokpit si ho založil sám za
 * 20 093 Kč, lebo Gažo platí bitcoinom a má 5 % zľavu. Dva zápisy toho
 * istého predaja, dve rôzne sumy — pravidlo „rovnaká cena" ich nespojilo
 * a QR v SMS znel na 41 243 Kč namiesto 20 093.
 *
 * Preto sa ceny porovnávajú so zľavou: balíček smie byť LACNEJŠÍ než
 * poplatok, najviac však o tretinu. Drahší byť nesmie — to už nie je zľava,
 * to je iný predaj. A rozdiel nad tretinu tiež nie: polovičná suma v ten
 * istý deň je skôr doplatok než zľava a tie sa spájať nemajú.
 */
export function bezZdvojenych<T extends { datum: string; suma: number }>(
  poplatky: T[],
  balicky: { cena: number | null; platnostOd: string; zdroj: string; zruseneAt?: string | null; poznamka?: string | null }[],
): T[] {
  const nase = balicky
    .filter((b) => !b.zruseneAt && (b.cena || 0) > 0 && !jeOtvaraciZostatok(b))
    .map((b) => ({ den: den(b.platnostOd), cena: Math.round(b.cena || 0), pouzity: false }));
  if (!nase.length) return poplatky;
  return poplatky.filter((p) => {
    const d = den(p.datum);
    const c = Math.round(p.suma || 0);
    // Zľava: balíček smie byť lacnejší, najviac o tretinu; drahší nie.
    const sediCena = (cena: number) => cena === c || (cena < c && cena >= c * (2 / 3));
    // Ten istý deň: aj DRAHŠÍ balíček — to je zväčšenie, nie iný predaj.
    // Dominika si 12. 10. 2026 namiesto 6 h zobrala 18 h; v Kokpite je teda
    // 17 978 Kč a v PTminderi stále poplatok za 6 622. Je to jeden predaj,
    // len PTminder drží jeho starú podobu. Viac než o tretinu lacnejší
    // zostáva zakázaný — to je doplatok vedľa poplatku.
    const sediVDen = (cena: number) => sediCena(cena) || cena > c;
    const presne = nase.find((b) => !b.pouzity && sediVDen(b.cena) && b.den === d);
    const blizko = presne || nase.find((b) => !b.pouzity && sediCena(b.cena) && dni(b.den, d) <= 3);
    if (!blizko) return true;
    blizko.pouzity = true;
    return false;
  });
}

/**
 * Všetko, čo klienti dlžia, ako zoznam predajov. Volá ho `loadData` (raz pre
 * všetkých) a `/api/platby` pri príznaku „vopred" (pre jedného klienta).
 */
export function dlhyKlientov(v: VstupDlhov): {
  polozky: DlhPolozka[];
  /** Poplatky po kroku 1 — zoznam, ktorý appka drží ako `data.poplatky`. */
  otvorenePoplatky: VstupDlhov["poplatky"];
  /**
   * Poplatky, ktoré v kroku 4 ustúpili balíčku z Kokpitu (klient + deň).
   * Dlhom nie sú, ale ich deň hodiny dávať nesmie: v PTminderi pod ním stojí
   * dvojča toho istého predaja a keby dalo hodiny, rátali by sa dvakrát
   * (alebo z nezaplateného predaja). Tak to bolo aj pred jedným pravidlom.
   */
  dvojcata: { klient: string; den: string }[];
} {
  // 1. Poplatky mínus platby z Kokpitu.
  const otvorene = poplatkyPoOdrataniPlatieb(
    v.poplatky,
    v.platby.map((p): Platba => ({
      id: p.id || "", klient: p.klient, datum: p.datum, sumaCzk: p.suma,
      sposob: p.sposob || "", fioId: p.fioId ?? null, zruseneAt: p.zruseneAt ?? null,
    })),
  ).otvorene;

  // 2. Balíčky z Kokpitu proti platbám z Kokpitu, po klientoch.
  const bal = new Map<string, (BalicekDlh & { id?: string })[]>();
  const meno = new Map<string, string>();
  for (const b of v.balicky) {
    const k = normName(b.klient);
    if (!meno.has(k)) meno.set(k, b.klient);
    const xs = bal.get(k) || [];
    xs.push({ id: b.id, cena: b.cena, platnostOd: den(b.platnostOd), zdroj: b.zdroj, zruseneAt: b.zruseneAt ?? null, nazov: b.nazov, poznamka: b.poznamka ?? null });
    bal.set(k, xs);
  }
  const pl = new Map<string, PlatbaDlh[]>();
  for (const p of v.platby) {
    const k = normName(p.klient);
    const xs = pl.get(k) || [];
    xs.push({ suma: p.suma, datum: den(p.datum), zruseneAt: p.zruseneAt ?? null, vopred: p.vopred });
    pl.set(k, xs);
  }
  // 3. Poistka: čo PTminder pozná ako zaplatené, dlhom nie je.
  //    Poistka sa pýta len na balíčky, ktoré platby z Kokpitu nepokryli
  //    (ako vždy — nad všetkými by si zaplatené balíčky brali platby
  //    PTmindera patriace ďalším). Keď niektorý odpustí, rozdelenie sa
  //    zopakuje: odpustený balíček si z platieb Kokpitu nechá len tie zo
  //    svojho obdobia a zvyšok ide novším (Gažo 15. 10. 2026, viď
  //    `nezaplateneZKokpitu`). Novším sa tak peňazí len pridá, nikdy neuberie.
  const kokpit = [...bal.entries()].flatMap(([k, bsPovodne]) => {
    const klient = meno.get(k) || k;
    // Poradové číslo, nie obsah: dva rovnaké balíčky (deň, cena, názov) sú
    // dva predaje a odpustenie jedného nesmie zasiahnuť druhý.
    const bs = bsPovodne.map((b, i) => ({ ...b, poradie: i }));
    const prve = nezaplateneZKokpitu(bs, pl.get(k) || []).map((b) => ({ ...b, klient }));
    const nezaplatene = zaplateneVPtminderi(
      prve, v.ptPlatby, v.ptHistoria,
      otvorene.map((p) => ({ klient: p.klient, datum: den(p.datum) })),
      normName,
    );
    if (nezaplatene.length === prve.length) return nezaplatene;
    const ostali = new Set(nezaplatene.map((b) => b.poradie));
    const odpustene = new Set(prve.filter((b) => !ostali.has(b.poradie)).map((b) => b.poradie));
    return nezaplateneZKokpitu(bs, pl.get(k) || [], (b) => odpustene.has(b.poradie))
      .map((b) => ({ ...b, klient }));
  });

  // 4. Ten istý predaj v oboch systémoch je jeden — poplatok ustúpi balíčku.
  const poKlientoch = new Map<string, VstupDlhov["poplatky"]>();
  for (const p of otvorene) {
    const k = normName(p.klient);
    poKlientoch.set(k, [...(poKlientoch.get(k) || []), p]);
  }
  const poplatky = [...poKlientoch.entries()].flatMap(([k, ps]) => bezZdvojenych(ps, bal.get(k) || []));
  const zostali = new Set(poplatky);
  const dvojcata = otvorene.filter((p) => !zostali.has(p)).map((p) => ({ klient: p.klient, den: den(p.datum) }));

  const polozky: DlhPolozka[] = [
    ...poplatky.map((p): DlhPolozka => ({
      klient: p.klient, den: den(p.datum), nazov: p.popis, cena: Math.round(p.suma || 0),
      doplatit: Math.round(p.suma || 0), zdroj: "ptminder",
    })),
    ...kokpit.map((b): DlhPolozka => ({
      klient: b.klient, den: den(b.platnostOd), nazov: b.nazov || "", cena: Math.round(b.cena || 0),
      doplatit: Math.round(b.doplatit), zdroj: "kokpit", id: (b as { id?: string }).id,
    })),
  ].filter((x) => x.doplatit > 0)
    .sort((a, b) => a.den.localeCompare(b.den) || a.klient.localeCompare(b.klient));

  return { polozky, otvorenePoplatky: otvorene, dvojcata };
}

/** Dlh jedného klienta zo spoločného zoznamu. */
export const dlhyKlienta = (dlhy: DlhPolozka[] | undefined, klient: string): DlhPolozka[] => {
  const k = normName(klient);
  return (dlhy || []).filter((d) => normName(d.klient) === k);
};
