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
export type VysledokKontroly = { text: string; stav: StavVysledku };

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
 * Výsledky pre jednu kontrolu. `id` je holá oblasť („peniaze"), nie celý kľúč
 * s mesiacom.
 */
export function vysledkyKontroly(id: string, v: VstupKontroly): VysledokKontroly[] {
  switch (id) {
    case "peniaze":
      return [
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
      return [vek("Metricool", najnovsi(v.importy, ["metricool", "kanaly"]), v.dnes, 14)];
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
