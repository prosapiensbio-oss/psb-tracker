/**
 * Klienti, ktorých členstvo je barter proti Jarkovmu dlhu, nie tržba.
 *
 * Samostatný modul, aby ho jedno pravidlo „zaplatený" (`zaplatene.ts`) mohlo
 * čítať bez ťahania celého `vzas.ts` (ten importuje `compute`). Barterový
 * balíček nie je dlh — nikdy sa nezaplatí peniazmi (Sofia Resnerová, Jerry
 * 21. 10. 2026: „sofia resnerová má vlastné pravidlo").
 */
export const BARTER_KLIENTI = ["Sofia Resnerová"];
