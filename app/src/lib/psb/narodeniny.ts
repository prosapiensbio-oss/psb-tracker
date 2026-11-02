import { normName } from "./format";
import { bezDiakritiky } from "./sms";

/**
 * DÁTUM NARODENIA OD KLIENTA (Jerry, 2. 11. 2026: „vedeli by sme pripraviť
 * nejaký odkaz, ktorý by sme im hromadne poslali a oni by ho vyplnili").
 *
 * Za deti odpovedá rodič: SMS ide jemu, na stránke je meno dieťaťa. Komu
 * patrí ktorý rodič, povedal Jerry; nové dieťa sa pripisuje sem.
 */
const ZASTUPCOVIA: Record<string, string> = {
  [normName("Luky Križ")]: "Dominika Križova",
  [normName("Maty Přínosil")]: "Lenka Prinosilova",
  [normName("Anetka Přinosilová")]: "Lenka Prinosilova",
  [normName("Sofia Resnerová")]: "Marketa Resnerová",
};

/** Za koho vypĺňa niekto iný; `null` = klient sám. */
export const zastupcaKlienta = (klient: string): string | null => ZASTUPCOVIA[normName(klient)] ?? null;

export const krstneMeno = (klient: string): string => (klient || "").trim().split(/\s+/)[0] || "";

/** Bez diakritiky, aby to bola jedna SMS. Klientom sa tyká. */
export function textSmsNarodenin(klient: string, url: string): string {
  const pre = zastupcaKlienta(klient) ? ` pro ${bezDiakritiky(krstneMeno(klient))}` : "";
  return `Dobry den, doplnujeme si evidenci. Vypln prosim datum narozeni${pre}, zabere to chvilku: ${url} ProSapiens`;
}
