import { normName } from "./format";
import { KOKPIT_OD } from "./sedeniaZKalendara";

/**
 * Klienti, ktorých členstvo je barter proti Jarkovmu dlhu, nie tržba.
 *
 * Samostatný modul, aby ho jedno pravidlo „zaplatený" (`zaplatene.ts`) mohlo
 * čítať bez ťahania celého `vzas.ts` (ten importuje `compute`). Barterový
 * balíček nie je dlh — nikdy sa nezaplatí peniazmi (Sofia Resnerová, Jerry
 * 21. 10. 2026: „sofia resnerová má vlastné pravidlo").
 */
export const BARTER_KLIENTI = ["Sofia Resnerová"];

/**
 * Barterové členstvá ako predaje: pred 1. 10. 2026 zo snímky PTmindera,
 * od toho dňa z balíčkov v Kokpite. PTminder sa od 19. 10. nepíše — nový
 * Sofiin balíček by inak Jarkov dlh nikdy neznížil (audit 21. 10. 2026).
 */
export function barterovePredaje(data: {
  packages?: { client: string; validFrom?: string; payment?: number }[];
  balickyKokpit?: { klient: string; platnostOd: string; zruseneAt?: string | null; kotva?: boolean; cena?: number | null }[];
}): { client: string; validFrom: string; payment: number }[] {
  const jeBarter = (m: string) => BARTER_KLIENTI.some((b) => normName(b) === normName(m));
  return [
    ...(data.packages || [])
      .filter((p) => jeBarter(p.client) && !!p.payment && !!p.validFrom && p.validFrom.slice(0, 10) < KOKPIT_OD)
      .map((p) => ({ client: p.client, validFrom: p.validFrom!.slice(0, 10), payment: p.payment! })),
    ...(data.balickyKokpit || [])
      .filter((b) => jeBarter(b.klient) && !b.zruseneAt && !b.kotva && (b.cena || 0) > 0 && b.platnostOd >= KOKPIT_OD)
      .map((b) => ({ client: b.klient, validFrom: b.platnostOd, payment: b.cena! })),
  ];
}
