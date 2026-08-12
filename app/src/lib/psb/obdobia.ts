/**
 * Časové okno — JEDEN zoznam pre celý Marketing.
 *
 * PREČO TO NIE JE V KAŽDEJ KARTE ZVLÁŠŤ
 *
 * Bolo. Marketing.tsx mal `6m/3m/1m/custom`, MarketingLievik.tsx mal `6/3/1`
 * bez vlastného rozsahu a nové karty si vymýšľali ďalšie (`12/6/all`). Na
 * jednej obrazovke tak boli tri rôzne prepínače, ktoré vyzerali rovnako
 * a robili niečo iné — a „posledných 6 mesiacov" na jednej karte znamenalo
 * iné mesiace než na susednej.
 *
 * PREČO SA NEZAČÍNA JEDNÝM MESIACOM PRI OBSAHU
 *
 * Pri 2–7 reels mesačne je rozdiel medzi 4 a 6 náhoda, nie trend. Karty
 * o obsahu si preto z tohto zoznamu berú len dlhšie okná.
 *
 * PREČO NIE JE OKNO ZAKOTVENÉ TU
 *
 * `mesiaceVOkne` dostáva zoznam mesiacov, ktoré v dátach naozaj sú — nepočíta
 * od kalendára. Keby počítalo od dneška, mesiac bez publikovania by okno
 * utrhlo a karta by tvrdila, že dvanásť mesiacov bolo desať.
 */

export type Obdobie = { value: string; label: string };

/**
 * Poradie je rovnaké ako v Peniazoch, len s krátkymi oknami navrchu.
 *
 * `30d` je jediné okno, ktoré NIE JE mesačné — počíta sa na dni. Preto je
 * v zozname len tam, kde má karta presné dátumy (príspevky, dopyty). Na
 * mesačných kartách (kanály, náklady) by „posledných 30 dní" tíško znamenalo
 * „posledný mesiac" a to sú dve rôzne veci: 30 dní k 12. augustu je pol júla
 * a pol augusta.
 */
export const OBDOBIA: Obdobie[] = [
  { value: "all", label: "Celé obdobie" },
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
  { value: "12m", label: "Posledných 12 mes." },
  { value: "6m", label: "Posledných 6 mes." },
  { value: "3m", label: "Posledné 3 mes." },
  { value: "30d", label: "Posledných 30 dní" },
  { value: "1m", label: "Posledný mesiac" },
  { value: "custom", label: "Vlastné" },
];

/** Karty s mesačnou zrnitosťou — bez „posledných 30 dní", to sa tam nedá. */
export const OBDOBIA_MESACNE = OBDOBIA.filter((o) => o.value !== "30d");

/** Pre karty o obsahu: bez „posledný mesiac", lebo pri 2–7 kusoch je to šum. */
export const OBDOBIA_OBSAH = OBDOBIA.filter((o) => o.value !== "1m");

export const obdobieLabel = (v: string) =>
  OBDOBIA.find((o) => o.value === v)?.label ?? (v.startsWith("custom:") ? "Vlastné" : v);

/**
 * Mesiace „YYYY-MM", ktoré do okna patria.
 *
 * `vsetky` sú mesiace prítomné v dátach. Vlastný rozsah nesie hranice priamo
 * v hodnote („custom:2026-01|2026-04") — inak by stav rozsahu musela držať
 * každá karta zvlášť.
 */
export function mesiaceVOkne(obdobie: string, vsetky: string[]): string[] {
  const zoradene = [...new Set(vsetky)].filter(Boolean).sort();
  if (!obdobie || obdobie === "all") return zoradene;
  if (/^\d{4}$/.test(obdobie)) return zoradene.filter((m) => m.startsWith(obdobie));
  if (obdobie.startsWith("custom:")) {
    const [od, doM] = obdobie.slice(7).split("|");
    return zoradene.filter((m) => (!od || m >= od) && (!doM || m <= doM));
  }
  // Na mesačnej karte sa „30 dní" nedá spraviť poctivo; berie sa posledný
  // mesiac a karta má tú možnosť radšej vôbec neponúkať (OBDOBIA_MESACNE).
  if (obdobie === "30d") return zoradene.slice(-1);
  // „6m" aj holé „6" — staršie karty posielali číslo bez písmena.
  const n = Number(obdobie.replace(/m$/, ""));
  return Number.isFinite(n) && n > 0 ? zoradene.slice(-n) : zoradene;
}

/**
 * Okno pre zoznamy s presnými dátumami (príspevky, dopyty).
 *
 * Kotva je NAJNOVŠÍ dátum v dátach, nie dnešok — inak by týždeň bez
 * publikovania okno utrhol a karta by tvrdila, že za 30 dní nebolo nič.
 */
export function vOknePodlaDna(obdobie: string, datumy: string[]): (d: string) => boolean {
  if (!obdobie || obdobie === "all") return () => true;
  if (/^\d{4}$/.test(obdobie)) return (d) => d.startsWith(obdobie);
  if (obdobie.startsWith("custom:")) {
    const [od, doD] = obdobie.slice(7).split("|");
    // Hranice sú mesiace („2026-01"); koniec musí zahrnúť celý mesiac.
    return (d) => (!od || d.slice(0, 7) >= od) && (!doD || d.slice(0, 7) <= doD);
  }
  const najnovsi = datumy.reduce((a, d) => (d > a ? d : a), "");
  if (!najnovsi) return () => true;
  if (obdobie === "30d") {
    const od = new Date(Date.parse(najnovsi.slice(0, 10)) - 29 * 864e5).toISOString().slice(0, 10);
    return (d) => d.slice(0, 10) >= od;
  }
  const okno = new Set(mesiaceVOkne(obdobie, datumy.map((d) => d.slice(0, 7))));
  return (d) => okno.has(d.slice(0, 7));
}
