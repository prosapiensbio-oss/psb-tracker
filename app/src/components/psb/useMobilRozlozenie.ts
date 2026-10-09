import { useEffect, useState } from "react";

import { jeBeta } from "../../lib/psb/beta";
import { useUzke } from "./useUzke";

/**
 * MOBILNÉ ROZLOŽENIE — skúška v BETE (Jerry, 9. 10. 2026: „postav A a C ako
 * betu, len tak na preštukanie, nech si to vyskúšam").
 *
 * A = spodná lišta Dnes · Workspace · Kalendár · Firma · Viac, hore hľadanie,
 *     + Zápis a Jarvis ako ikony.
 * C = spodná lišta Dnes · Workspace · veľké „+" · Kalendár · Jarvis, ostatné
 *     (aj Firma) pod ≡ „Viac" hore vľavo.
 *
 * `null` = staré rozloženie: ostrý Kokpit, počítač, iPad. Voľba sa pamätá
 * v prehliadači a prepína sa vo „Viac"; zmena sa oznámi celej appke
 * udalosťou, lebo hook číta viac komponentov naraz (App, Workspace, Jarvis).
 */
export type MobilRozlozenie = "A" | "C";
const KLUC = "psb-mobil-rozlozenie";
const UDALOST = "psb-mobil-rozlozenie";

const citaj = (): MobilRozlozenie => {
  try { return localStorage.getItem(KLUC) === "A" ? "A" : "C"; } catch { return "C"; }
};

export function nastavMobilRozlozenie(r: MobilRozlozenie) {
  try { localStorage.setItem(KLUC, r); } catch { /* bez úložiska ostane na tejto návšteve */ }
  window.dispatchEvent(new CustomEvent(UDALOST, { detail: r }));
}

export function useMobilRozlozenie(): MobilRozlozenie | null {
  const uzke = useUzke();
  const [r, setR] = useState<MobilRozlozenie>("C");
  const [beta, setBeta] = useState(false);
  useEffect(() => {
    setBeta(jeBeta());
    setR(citaj());
    const pocuvaj = (e: Event) => setR(((e as CustomEvent).detail as MobilRozlozenie) || citaj());
    window.addEventListener(UDALOST, pocuvaj);
    return () => window.removeEventListener(UDALOST, pocuvaj);
  }, []);
  return beta && uzke ? r : null;
}
