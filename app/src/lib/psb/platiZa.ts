/**
 * JEDEN ČLOVEK PLATÍ ZA VIACERÝCH — ODKAZ, QR AJ PÁROVANIE PLATBY.
 *
 * Jerry, 21. 10. 2026: „Jakub Kaňovský platí aj za Kadličkovú v BTC — ako
 * vyriešime túto platbu, aby som mu poslal odkaz s QR bitcoinovou platbou?"
 *
 * Dvojice, čo platia jedným prevodom, appka dovtedy poznala len SPÄTNE —
 * `spolocniPlatitelia` ich odvodzuje z už rozdelených pohybov (Dan Kouřil
 * a Monika Schonwalderova sa dvojicou stali, až keď Jerry prvý spoločný
 * prevod rozdelil ručne). To stačí na zaradenie platby, ktorá už prišla.
 * Nestačí to na QR, ktoré ide klientovi PRED ňou: stránka `/v/` nemá odkiaľ
 * vedieť, že má pýtať aj za niekoho druhého, a lightningová faktúra znie na
 * presnú sumu — tá musí byť správna hneď napoprvé.
 *
 * Preto je to zápis pri klientovi (`client_overrides.plati_za`), nie dedukcia:
 * Jerry to povie raz a platí to dovtedy, kým to nezmení.
 *
 * Čo z toho vyplýva pre celý reťazec:
 *  - stránka a mail ukážu ROZPIS (za koho koľko), nie jednu nevysvetlenú sumu;
 *  - lightningová faktúra je na SÚČET, ale každá položka sa počíta z cenníka
 *    a zo zľavy TOHO klienta, za ktorého je (zľavy sa líšia — Knapčok 30 %);
 *  - keď platba príde, musí sa rozdeliť na toľko platieb, koľko je ľudí,
 *    inak by jednému prebývala a druhému chýbala (to je presne tá chyba,
 *    ktorú dávka 28. 9. 2026 spravila Danovi a Monike).
 */
import { cenaPoZlave, katalogovaCena } from "./lightning";
import { normName } from "./format";

/** Mená sa v stĺpci oddeľujú zvislicou — v mene sa nevyskytuje. */
export const ODDELOVAC = "|";

/** Zoznam mien, za ktoré klient platí. Prázdno = platí len za seba. */
export function menaPlatiZa(raw: unknown): string[] {
  const text = Array.isArray(raw) ? raw.join(ODDELOVAC) : String(raw ?? "");
  const out: string[] = [];
  for (const kus of text.split(ODDELOVAC)) {
    const m = kus.trim();
    if (m && !out.some((x) => normName(x) === normName(m))) out.push(m);
  }
  return out;
}

/** Tvar na zápis do databázy; prázdny zoznam je `null`, nie prázdny reťazec. */
export function zapisPlatiZa(raw: unknown): string | null {
  const mena = menaPlatiZa(raw);
  return mena.length ? mena.join(ODDELOVAC) : null;
}

/** Jedna položka rozpisu — za koho a koľko. */
export type PolozkaPlatby = {
  klient: string;
  suma: number;
  /** Za čo to je — názov balíčka alebo popis poplatku. */
  nazov: string;
  /** `true` pri položke samotného platiteľa. */
  ja: boolean;
};

/**
 * KOĽKO JE TO V KORUNÁCH A V SATOSHI — POLOŽKA PO POLOŽKE.
 *
 * Zľava sa počíta z CENNÍKA, nie zo zapísanej sumy (pravidlo z 5. 10. 2026:
 * v zapísanej cene bitcoinového klienta už zľava je a odpočítať ju druhý raz
 * znamená dvojitú zľavu). Keď produkt v cenníku nie je, položka sa berie
 * tak, ako stojí — radšej žiadna zľava než dvojitá.
 *
 * `zlavaKlienta` je per človek: Anna má 5 %, Knapčok 30 % a spoločná platba
 * sa nesmie počítať zľavou platiteľa.
 */
export function czkZaPolozky(
  polozky: PolozkaPlatby[],
  zlavaKlienta: (meno: string) => number,
): { czk: number; plna: number; zlava: number } {
  let czk = 0;
  let plna = 0;
  const zlavy = new Set<number>();
  for (const p of polozky) {
    const katalog = katalogovaCena(p.nazov);
    const zaklad = katalog ?? p.suma;
    const zlava = katalog ? zlavaKlienta(p.klient) : 0;
    plna += zaklad;
    czk += cenaPoZlave(zaklad, zlava);
    zlavy.add(zlava);
  }
  // Jedna zľava sa dá napísať na stránku („sleva 5 % z 15 580 Kč“); dve
  // rôzne nie — vtedy sa radšej nepíše nič než číslo, ktoré neplatí na celok.
  const zlava = zlavy.size === 1 ? [...zlavy][0] : 0;
  return { czk: Math.round(czk), plna: Math.round(plna), zlava: zlava && plna > czk ? zlava : 0 };
}

/**
 * „za: Anna Kadličkova" — menný zoznam, nie veta s predložkou. Appka mená
 * skloňovať nevie (`oslovenie.ts` zvláda len 5. pád) a „za Anna Kadličkova"
 * je na stránke pre klienta horšie než holý zoznam.
 */
export function vetaZaKoho(polozky: PolozkaPlatby[]): string {
  const cudzi = polozky.filter((p) => !p.ja).map((p) => p.klient);
  return cudzi.length ? `za: ${cudzi.join(", ")}` : "";
}

/**
 * ROZDELENIE PRIJATEJ PLATBY MEDZI ĽUDÍ, ZA KTORÝCH PRIŠLA.
 *
 * Používa sa pri bitcoine, kde platba nemá protistranu na rozobratie —
 * v knihe stojí len meno toho, kto poslal. Rozdeľuje sa podľa toho, KOĽKO SA
 * OD KOHO ČAKALO, nie rovným dielom: Jakub a Anna majú zhodou okolností
 * rovnakú sumu, ale pri inom balíčku by rovný diel vyrobil dva nesprávne
 * zápisy.
 *
 * `ocakavane` je presne to, čo pýtala jeho stránka `/v/`: dlh každého
 * z nich, a pri platiteľovi cena nového balíčka, keď práve nič nedlží
 * (dochodený balíček). Bez toho by sa dvojica rozpadla v tom najhoršom
 * okamihu — v deň, keď platiteľ balíček dočerpal a nový mu ešte nevznikol.
 *
 * SÚČET MUSÍ SEDIEŤ, INAK SA NEDELÍ. Bitcoinová platba sa súdi s toleranciou
 * (pravidlo z 15. 10. 2026: rozdiel z kurzu nie je dlh), ale len na celok:
 * keď Jakub pošle 7 401 a čakalo sa 14 802, nie je to spoločná platba —
 * zaplatil len za seba a appka ju nesmie roztrhnúť. Zle priradená platba je
 * horšia než nepriradená (pravidlo z 22. 9. 2026).
 */
export function rozdelPodlaDlhov(
  suma: number,
  ocakavane: { klient: string; dlzi: number }[],
  tolerancia = 0.1,
): { klient: string; suma: number }[] | null {
  const kus = ocakavane.filter((d) => d.dlzi > 0);
  if (kus.length < 2) return null;
  const spolu = kus.reduce((a, d) => a + d.dlzi, 0);
  if (!(spolu > 0) || Math.abs(suma - spolu) > spolu * tolerancia) return null;
  const diely = kus.map((d) => ({ klient: d.klient, suma: Math.round((suma * d.dlzi) / spolu) }));
  // Zaokrúhľovanie nesmie zmeniť súčet — rozdiel padne na prvý diel.
  const rozdiel = Math.round(suma) - diely.reduce((a, d) => a + d.suma, 0);
  if (rozdiel) diely[0].suma += rozdiel;
  return diely;
}

/**
 * Obrátený pohľad: meno dlžníka → kto zaňho platí. Čítajú to karty dlžníkov
 * a krok Platby, aby appka neposielala výzvu človeku, za ktorého platí
 * niekto iný.
 */
export function platiteliaZOverridov(
  overrides: Record<string, { platiZa?: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [kto, o] of Object.entries(overrides || {})) {
    for (const m of menaPlatiZa(o?.platiZa)) if (normName(m) !== normName(kto)) out[m] = kto;
  }
  return out;
}

/**
 * KONTROLA RUČNÉHO ROZDELENIA JEDNEJ PLATBY.
 *
 * Jerry, 21. 10. 2026: „som schopný to nastaviť aj v Kokpite — takto
 * rozdeliť tú BTC platbu?" Automatické rozdelenie zabere len vtedy, keď
 * súčet očakávaných sedí; keď nesedí, musí sa to dať spraviť rukou. Diely
 * sa musia zložiť PRESNE na sumu platby (tolerancia koruna) — platba je
 * záznam v knihe a rozdelením sa nesmie zmeniť, koľko peňazí prišlo.
 *
 * Vracia vetu pre človeka, alebo `null`, keď je rozdelenie v poriadku.
 */
export function chybaDielov(
  suma: number,
  diely: { klient: string; suma: number }[],
): string | null {
  if (diely.length < 2) return "Na rozdelenie treba aspoň dvoch klientov.";
  if (diely.some((d) => !String(d.klient || "").trim())) return "Každý diel potrebuje klienta.";
  if (diely.some((d) => !(d.suma > 0))) return "Každý diel potrebuje kladnú sumu.";
  if (new Set(diely.map((d) => normName(d.klient))).size !== diely.length) {
    return "Ten istý klient je v dieloch dvakrát — spoj jeho diely do jedného.";
  }
  const spolu = diely.reduce((a, d) => a + Math.round(d.suma), 0);
  const cela = Math.round(suma);
  if (Math.abs(spolu - cela) > 1) return `Diely dávajú ${spolu} Kč, platba je ${cela} Kč.`;
  return null;
}
