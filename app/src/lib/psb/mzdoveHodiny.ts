import { CURRENT_ERA, VZAS_MONTHS } from "./vzas";
import { platbaNavyse, type HodinyNavyse } from "./hodinyNavyse";

/**
 * Mzdové hodiny trénerov po mesiacoch — zo sedení, bez úvodných tréningov
 * (tie sa platia zvlášť a do mzdových hodín nepatria). JEDNA definícia: číta ju
 * App (→ `nastavHodinyZTrackera`, dlh trénera) aj most pre Peniaze manažér.
 */
export function mzdoveHodiny(
  sessions: { date: string; duration: number; sessionType?: string; sessionTrainer?: string }[],
): Record<string, { jerry: number; terezka: number }> {
  const podlaMesiaca: Record<string, { jerry: number; terezka: number }> = {};
  for (const s of sessions) {
    if (s.sessionType === "UVODNE") continue;
    const mk = s.date.slice(0, 7);
    const e = (podlaMesiaca[mk] ||= { jerry: 0, terezka: 0 });
    if (s.sessionTrainer === "Jerry") e.jerry += s.duration / 60;
    else if (s.sessionTrainer === "Terezka") e.terezka += s.duration / 60;
  }
  return podlaMesiaca;
}

/**
 * Jerryho nárok za mesiac podľa dnešného mzdového modelu
 * (fix + (hodiny − prah) × sadzba). Mesiace pred modelom nárok nemajú — vtedy
 * platila iná éra a vzorec by klamal. Bežiaci mesiac sa vráti s príznakom
 * `beziaci`: nárok z polovice mesiaca je polovica čísla, nie nižší nárok
 * (rovnaký dôvod, prečo ho `salaryCalc` do dlhu nepočíta).
 */
export function narokJerryho(
  hodiny: Record<string, { jerry: number; terezka: number }>,
  od: string,
  dnesMesiac: string,
  /** Hodiny navyše po mesiacoch (model A od 10/2026) — pripočítajú sa × 450. */
  navyse: HodinyNavyse = {},
): { mesiac: string; hodiny: number; narok: number; beziaci: boolean; navyse: number }[] {
  const zaciatokModelu = VZAS_MONTHS[CURRENT_ERA.from] || "";
  return Object.keys(hodiny)
    .filter((mk) => mk >= od.slice(0, 7) && mk >= zaciatokModelu && mk <= dnesMesiac)
    .sort()
    .map((mk) => {
      const h = Math.round(hodiny[mk].jerry * 100) / 100;
      return {
        mesiac: mk,
        hodiny: h,
        narok: Math.round(CURRENT_ERA.fix + (h - CURRENT_ERA.hoursThreshold) * CURRENT_ERA.hourlyRate + platbaNavyse(mk, navyse[mk]).jerry),
        navyse: platbaNavyse(mk, navyse[mk]).jerry,
        beziaci: mk === dnesMesiac,
      };
    });
}
