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
 *  2. Balíčky nahodené v Kokpite, na ktoré sa platby z Kokpitu kladú od
 *     najstaršieho; čiastočne zaplatený je nezaplatený (`nezaplateneZKokpitu`).
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

import { nezaplateneZKokpitu, zaplateneVPtminderi, type BalicekDlh, type PlatbaDlh } from "./dlhKlienta";
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
  balicky: { id?: string; klient: string; nazov: string; cena: number | null; platnostOd: string; zdroj: string; zruseneAt?: string | null }[];
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
 */
export function bezZdvojenych<T extends { datum: string; suma: number }>(
  poplatky: T[],
  balicky: { cena: number | null; platnostOd: string; zdroj: string; zruseneAt?: string | null }[],
): T[] {
  const nase = balicky
    .filter((b) => !b.zruseneAt && b.zdroj === "rucne" && (b.cena || 0) > 0)
    .map((b) => ({ den: den(b.platnostOd), cena: Math.round(b.cena || 0), pouzity: false }));
  if (!nase.length) return poplatky;
  return poplatky.filter((p) => {
    const d = den(p.datum);
    const c = Math.round(p.suma || 0);
    const presne = nase.find((b) => !b.pouzity && b.cena === c && b.den === d);
    const blizko = presne || nase.find((b) => !b.pouzity && b.cena === c && dni(b.den, d) <= 3);
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
    xs.push({ id: b.id, cena: b.cena, platnostOd: den(b.platnostOd), zdroj: b.zdroj, zruseneAt: b.zruseneAt ?? null, nazov: b.nazov });
    bal.set(k, xs);
  }
  const pl = new Map<string, PlatbaDlh[]>();
  for (const p of v.platby) {
    const k = normName(p.klient);
    const xs = pl.get(k) || [];
    xs.push({ suma: p.suma, datum: den(p.datum), zruseneAt: p.zruseneAt ?? null, vopred: p.vopred });
    pl.set(k, xs);
  }
  const podlaKokpitu = [...bal.entries()].flatMap(([k, bs]) =>
    nezaplateneZKokpitu(bs, pl.get(k) || []).map((b) => ({ ...(b as typeof b & { id?: string }), klient: meno.get(k) || k })));

  // 3. Poistka: čo PTminder pozná ako zaplatené, dlhom nie je.
  const kokpit = zaplateneVPtminderi(
    podlaKokpitu,
    v.ptPlatby,
    v.ptHistoria,
    otvorene.map((p) => ({ klient: p.klient, datum: den(p.datum) })),
    normName,
  );

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
