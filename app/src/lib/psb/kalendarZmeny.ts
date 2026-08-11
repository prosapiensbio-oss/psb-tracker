/**
 * KTORÚ ZMENU V KALENDÁRI OHLÁSIŤ.
 *
 * Pôvodné pravidlo znelo „pýtame sa len na to, čo už prebehlo" a bolo napísané
 * pre PRIDANÉ tréningy: dohodnutý termín na budúci štvrtok naozaj nie je
 * udalosť na vysvetlenie, Jerry si ho práve dohodol.
 *
 * Lenže platilo na všetko — a tým prehltlo presne to, čo Jerry vidieť chce.
 * Michal Knapčok mal stredu 12. 8. o 15:00, zrušil ju, synchronizácia
 * v pondelok o 17:23 to VIDELA (`zmizla_at` sa zapísalo), ale záznam sa
 * zahodil, lebo streda bola v budúcnosti. A keďže udalosť je odvtedy označená
 * ako zmiznutá, rozdiel ju už nikdy znova nevyrobí — ticho je trvalé.
 *
 * Zrušená budúca hodina je pritom to najdrahšie, čo kalendár vie povedať:
 * je to voľné okno a nezarobené peniaze, a čím skôr sa o ňom vie, tým väčšia
 * šanca ho zaplniť. Preto:
 *
 *   • zrušené a posunuté — hlásiť VŽDY, minulé aj budúce,
 *   • pridané a premenované — len keď sa to týka minulosti (nová rezervácia
 *     do budúcna je plán, nie otázka; premenovanie budúcej udalosti je šum).
 */
export function ohlasitZmenu(
  druh: string,
  /** Pôvodný termín (zrušenie, posun) — tvar `YYYY-MM-DDTHH:MM`. */
  pred: string | null,
  /** Nový termín (pridanie, posun). */
  po: string | null,
  /** Dnešný deň `YYYY-MM-DD`. */
  dnesDen: string,
): boolean {
  if (druh === "zrusene" || druh === "posunute") return true;
  const kedy = (pred || po || "").slice(0, 10);
  return !!kedy && kedy <= dnesDen;
}
