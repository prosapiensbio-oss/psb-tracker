// Čo si z mesačnej kontroly appka overí sama.
//
// Jerry, 10. 10. 2026: „sú skutočne urobené?" Z databázy sa to zistiť nedalo —
// appka zaznamenávala KLIK, nie prácu, a samotná kontrola bola zoznam domácich
// úloh („porovnaj tri čísla", „over vek importov"). Časť z nich sú pritom veci,
// ktoré Kokpit v dátach má a vie ich porovnať rýchlejšie a spoľahlivejšie než
// človek.
//
// Preto sa kontrola delí na dve časti a obrazovka ich drží oddelene:
//   • ČO OVERILA APPKA — výsledok, nie zadanie,
//   • ČO MUSÍŠ TY — to, čo stroj nespraví (je to upozornenie pravdivé?
//     nevymýšľa si Jarvis pri prázdnej tabuľke?).
//
// Pravidlo, ktoré tu platí a inde v Kokpite tiež: keď zdroj chýba, výsledok je
// „neviem", nie „v poriadku". Prázdna odpoveď nie je dôkaz.

export type StavVysledku = "ok" | "pozor" | "nevie";
export type VysledokKontroly = {
  text: string;
  stav: StavVysledku;
  /**
   * Dvojstĺpec: čo hovorí Kokpit a čo DRUHÝ, nezávislý zdroj.
   *
   * Jerry, 10. 10. 2026 chcel prehliadku so zvýraznenými políčkami a tlačidlom
   * Potvrdiť. Zvýraznené číslo sa ale potvrdiť nedá — ukázala ho tá istá
   * appka, ktorá sa pýta, takže by vznikol súhlas, nie overenie. Kontrola
   * vzniká z POROVNANIA DVOCH ZDROJOV; zhodu počíta appka, nie klik.
   *
   * Riadok bez `druhy` je jednoduché zistenie (vek importu, počet otvorených
   * upozornení) — tam druhý zdroj neexistuje a netvárime sa, že áno.
   */
  kokpit?: string;
  druhy?: string;
  /** Odkiaľ je to druhé číslo — „PTminder", „Fio". */
  zdroj?: string;
};

export type VstupKontroly = {
  /** Dnešný deň v Prahe (RRRR-MM-DD). */
  dnes: string;
  /** Posledný import podľa druhu: { sessions: "2026-10-03", … }. */
  importy: Record<string, string>;
  /** Koľko upozornení mesiaca čaká na odpoveď. */
  otvoreneUpozornenia?: number;
  /** Ku ktorému dňu je známy zostatok účtu a hotovosti. */
  stavUctu?: { datum: string } | null;
  stavHotovosti?: { datum: string } | null;
  /** Tržby uzatváraného mesiaca z dvoch zdrojov. */
  trzby?: { kokpit: number; ptminder: number } | null;
  /** Dopyty mesiaca — koľko ich je a koľkým chýba zdroj. */
  dopyty?: { spolu: number; bezZdroja: number } | null;
};

const dni = (od: string, do_: string): number | null => {
  const a = Date.parse(`${od}T00:00:00Z`);
  const b = Date.parse(`${do_}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
};

const vek = (
  nazov: string,
  datum: string | undefined,
  dnes: string,
  strop: number,
): VysledokKontroly => {
  if (!datum) return { text: `${nazov}: nikdy sa nenahral`, stav: "nevie" };
  const d = dni(datum, dnes);
  if (d === null) return { text: `${nazov}: dátum sa nedá prečítať (${datum})`, stav: "nevie" };
  const kedy = d === 0 ? "dnes" : d === 1 ? "včera" : `pred ${d} dňami`;
  return { text: `${nazov}: ${kedy}`, stav: d <= strop ? "ok" : "pozor" };
};

/** Najnovší z viacerých druhov importu — PTminder ich má päť. */
const najnovsi = (importy: Record<string, string>, druhy: string[]): string | undefined =>
  druhy.map((d) => importy[d]).filter(Boolean).sort().pop();

/**
 * TRŽBY Z DVOCH ZDROJOV.
 *
 * Tolerancia je tá istá ako pri prepínači peňazí (`mozePrepnut`): 200 Kč
 * alebo 1 %, čo je viac. Jedna zabudnutá platba za úvodný nemá rozsvietiť
 * nález, rozdiel za tisícky áno.
 *
 * Keď PTminder za ten mesiac nemá nič, nie je s čím porovnávať — výsledok je
 * „neviem". Nula proti nule nie je zhoda.
 */
function trzbyRiadok(v: VstupKontroly): VysledokKontroly[] {
  if (!v.trzby) return [];
  const { kokpit, ptminder } = v.trzby;
  const kc = (n: number) => `${Math.round(n).toLocaleString("sk-SK")} Kč`;
  if (ptminder <= 0) {
    return [{ text: "Tržby mesiaca", kokpit: kc(kokpit), druhy: "nemá platby", zdroj: "PTminder", stav: "nevie" }];
  }
  const rozdiel = Math.round(kokpit - ptminder);
  const sedia = Math.abs(rozdiel) <= Math.max(200, ptminder * 0.01);
  return [{
    text: sedia ? "Tržby mesiaca" : `Tržby mesiaca (rozdiel ${rozdiel > 0 ? "+" : ""}${rozdiel} Kč)`,
    kokpit: kc(kokpit), druhy: kc(ptminder), zdroj: "PTminder",
    stav: sedia ? "ok" : "pozor",
  }];
}

/**
 * Výsledky pre jednu kontrolu. `id` je holá oblasť („peniaze"), nie celý kľúč
 * s mesiacom.
 */
export function vysledkyKontroly(id: string, v: VstupKontroly): VysledokKontroly[] {
  switch (id) {
    case "peniaze":
      return [
        ...trzbyRiadok(v),
        v.stavUctu
          ? vek("Stav účtu je k", v.stavUctu.datum, v.dnes, 31)
          : { text: "Stav účtu: appka ho nepozná", stav: "nevie" },
        v.stavHotovosti
          ? vek("Stav hotovosti je k", v.stavHotovosti.datum, v.dnes, 31)
          : { text: "Stav hotovosti: appka ho nepozná", stav: "nevie" },
      ];
    case "klienti": {
      const n = v.otvoreneUpozornenia;
      if (n === undefined) return [{ text: "Upozornenia mesiaca: nenačítali sa", stav: "nevie" }];
      return [{
        text: n === 0 ? "Upozornenia mesiaca: žiadne otvorené" : `Upozornenia mesiaca: ${n} čaká na odpoveď`,
        stav: n === 0 ? "ok" : "pozor",
      }];
    }
    case "marketing":
      return [
        vek("Metricool", najnovsi(v.importy, ["metricool", "kanaly"]), v.dnes, 14),
        ...(v.dopyty
          ? [{
              text: "Dopyty mesiaca bez zdroja",
              kokpit: `${v.dopyty.bezZdroja} z ${v.dopyty.spolu}`,
              stav: (v.dopyty.bezZdroja === 0 ? "ok" : "pozor") as StavVysledku,
            }]
          : []),
      ];
    case "jarvis":
      return [
        vek("PTminder", najnovsi(v.importy, ["sessions", "packages", "payments", "services", "transakcie"]), v.dnes, 14),
        vek("Instagram", najnovsi(v.importy, ["metricool", "kanaly"]), v.dnes, 14),
      ];
    default:
      return [];
  }
}

/** Oblasť z kľúča `kontrola-<oblasť>-RRRR-MM`. */
export const oblastKontroly = (id: string): string => id.replace(/^kontrola-/, "").replace(/-\d{4}-\d{2}$/, "");

/** Najhorší stav zo zoznamu — to, čo má hlásiť nadpis. */
export function stavSpolu(v: VysledokKontroly[]): StavVysledku | null {
  if (!v.length) return null;
  if (v.some((x) => x.stav === "pozor")) return "pozor";
  if (v.some((x) => x.stav === "nevie")) return "nevie";
  return "ok";
}
