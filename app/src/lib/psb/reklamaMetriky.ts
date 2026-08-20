/**
 * Metriky jednej REKLAMY — a hlavne to, čo znamenajú.
 *
 * Kampaň povie, koľko to stálo. Reklama povie prečo. Rešerš z 19. 8. 2026
 * (docs/meta-ads-co-treba.md) hovorí jasne: keď je hook rate pod 25 %, je to
 * problém KREATÍVY, nie nákupu médií — nemá zmysel prehadzovať rozpočet,
 * keď video nezastaví palec.
 *
 * PREČO SA HOOK ČÍTA VŽDY S HOLD
 *
 * Vysoký hook a nízky hold znamená, že prácu urobila prvá sekunda a zvyšok
 * videa nedoručil. Samotný hook by v tom prípade vyzeral ako úspech.
 */

export type ReklamaRiadok = {
  id: string; nazov: string; kampan: string; mesiac: string;
  spend: number; impressions: number; clicks: number;
  ctr: number; cpm: number; frekvencia: number;
  videnia2s: number; thruplay: number;
};

export type Pasmo = "dobre" | "hranica" | "zle" | "nevie";

/** Koľko ľudí zastavilo aspoň na dve sekundy (Meta trojsekundové videnia zrušila). */
export function hookRate(r: Pick<ReklamaRiadok, "videnia2s" | "impressions">): number | null {
  if (!r.impressions || !r.videnia2s) return null;
  return Math.round((r.videnia2s / r.impressions) * 1000) / 10;
}

/** Koľko z tých, čo zastavili, aj dopozeralo. */
export function holdRate(r: Pick<ReklamaRiadok, "thruplay" | "videnia2s">): number | null {
  if (!r.videnia2s || !r.thruplay) return null;
  return Math.round((r.thruplay / r.videnia2s) * 1000) / 10;
}

/**
 * Hook sa meria proti VLASTNÉMU priemeru, nie proti benchmarku z internetu.
 *
 * Odvetvové pásma (18–28 % feed) sú merané na TROJSEKUNDOVÝCH videniach.
 * Meta ich zrušila a dnes dáva dvojsekundové, ktoré sú oveľa benevolentnejšie:
 * reklamy PSB vychádzajú na 63–65 %. Keby sa proti tým pásmam merali,
 * appka by o každej reklame povedala „výborné" a stĺpec by neniesol žiadnu
 * informáciu — presne ten druh čísla, ktoré vyzerá ako odpoveď a nie je ňou.
 *
 * Preto sa porovnáva s mediánom vlastných reklám. Otázka „je toto video
 * lepšie než to, čo zvyčajne robíme?" je aj užitočnejšia.
 */
export function pasmoHook(v: number | null, median?: number | null): Pasmo {
  if (v === null) return "nevie";
  if (!median) return "nevie";
  if (v >= median * 1.15) return "dobre";
  if (v >= median * 0.85) return "hranica";
  return "zle";
}

/** Medián hookov, proti ktorému sa porovnáva. Bez aspoň troch reklám nemá zmysel. */
export function medianHooku(hodnoty: (number | null)[]): number | null {
  const c = hodnoty.filter((x): x is number => x !== null && x > 0).sort((a, b) => a - b);
  if (c.length < 3) return null;
  const s = Math.floor(c.length / 2);
  return c.length % 2 ? c[s] : Math.round(((c[s - 1] + c[s]) / 2) * 10) / 10;
}

/** Medián naprieč odvetviami je 2,19 % (2026). */
export function pasmoCtr(v: number | null): Pasmo {
  if (v === null || !Number.isFinite(v)) return "nevie";
  if (v >= 2.19) return "dobre";
  if (v >= 1.2) return "hranica";
  return "zle";
}

/** Nad 3 pri malom publiku znamená únavu — tí istí ľudia to videli priveľakrát. */
export function pasmoFrekvencie(v: number | null): Pasmo {
  if (!v) return "nevie";
  if (v < 2.5) return "dobre";
  if (v < 3.5) return "hranica";
  return "zle";
}

/**
 * Jedna veta, čo s tým. Poradie je poradie príčin: keď nezastaví palec,
 * nemá zmysel riešiť CTR, lebo ľudia sa k odkazu nedostali.
 */
export function coStym(r: ReklamaRiadok, medianHook?: number | null): string {
  const h = hookRate(r);
  if (h !== null && pasmoHook(h, medianHook) === "zle") {
    return "Zastaví menej ľudí než tvoje bežné video — problém je v prvých sekundách, nie v rozpočte.";
  }
  const hold = holdRate(r);
  if (h !== null && hold !== null && pasmoHook(h, medianHook) !== "zle" && hold < 30) {
    return "Začiatok funguje, zvyšok nie — ľudia zastavia a odídu.";
  }
  if (pasmoFrekvencie(r.frekvencia) === "zle") {
    return `Ten istý človek to videl ${String(Math.round(r.frekvencia * 10) / 10).replace(".", ",")}× — publikum je malé alebo kreatíva beží pridlho.`;
  }
  if (pasmoCtr(r.ctr) === "zle" && r.impressions > 500) {
    return "Ľudia to vidia, ale neklikajú — sľub v texte a to, kam odkaz vedie, si asi neodpovedajú.";
  }
  return "";
}
