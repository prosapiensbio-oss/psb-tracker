import { normName } from "./format";
import type { Udalost } from "./klientOsCasu";

/**
 * ČO V PROFILE PATRÍ POD „STARŠIA HISTÓRIA" — len to, čo nie je v evidencii.
 *
 * Jerry, 28. 10. 2026: „pri balíčkoch alebo platbách z PTmindera záznamy tam
 * môžu ostať, ale prečo to tam musí byť 2×?" Profil kreslil pod vlastnou
 * evidenciou (balíčky a platby z Kokpitu, dajú sa upraviť) ešte časovú os
 * s nadpisom „Z PTMINDERA" — a os nesie aj tie isté položky z Kokpitu
 * (`zKokpitu`) a balíčky naliate z PTmindera, ktoré sú v evidencii tiež.
 *
 * Mení sa LEN zobrazenie. Os, odpočet hodín, dlh ani súčty sa nedotýkajú —
 * toto je filter na to, ktoré riadky sa kreslia pod sebou druhýkrát.
 */

type BalicekEvidencie = { platnost_od: string; nazov: string; hodiny?: number | null };

const den = (s: string) => String(s || "").slice(0, 10);
const dniMedzi = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400_000;

/**
 * Riadky osi pre zoznam balíčkov, ktoré v evidencii NIE SÚ.
 * Rovnaký balíček = začiatok najviac 3 dni od seba a rovnaký názov (naliaty
 * z PTmindera nesie názov z exportu). Koniec obdobia (`balicekDo`) ide s ním.
 */
export function historiaBalickov(os: Udalost[], evidencia: BalicekEvidencie[]): Udalost[] {
  const jeVEvidencii = (d: string, nazov: string) =>
    evidencia.some((b) => normName(b.nazov) === normName(nazov) && dniMedzi(den(b.platnost_od), d) <= 3);
  type Od = Extract<Udalost, { druh: "balicekOd" }>;
  const vynechane = os.filter((x): x is Od => x.druh === "balicekOd" && (!!x.zKokpitu || jeVEvidencii(x.den, x.nazov)));
  return os.filter((x) => {
    if (x.druh === "balicekOd") return !vynechane.includes(x);
    // Koniec obdobia ide so svojím začiatkom: keď je začiatok v evidencii,
    // je tam aj platnosť. Koniec bez začiatku (prepadnuté hodiny) ostáva.
    if (x.druh === "balicekDo") return !vynechane.some((o) => o.doDna === x.den && normName(o.nazov) === normName(x.nazov));
    return false;
  });
}

/** Riadky osi pre zoznam platieb, ktoré nie sú v knihe Kokpitu (napr. hotovosť a bitcoin spred 10/2026). */
export function historiaPlatieb(os: Udalost[], kniha: { datum: string; suma_czk: number }[]): Udalost[] {
  return os.filter((x) => {
    if (x.druh !== "platba") return false;
    if (x.zKokpitu) return false;
    return !kniha.some((p) => den(p.datum) === x.den && Math.abs(Number(p.suma_czk) - x.suma) < 1);
  });
}
