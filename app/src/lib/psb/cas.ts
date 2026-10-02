/**
 * PRAŽSKÝ ČAS — jediné miesto, kde sa berie „teraz" na porovnanie s kalendárom.
 *
 * Jerry, 2. 10. 2026 o 15:02 nad stránkou Lukáša Hanusa: stálo na nej
 * „Další trénink: pátek 2. 10. · 14:00", teda tréning, ktorý už bol.
 *
 * `kal_udalosti.zaciatok` nesie MIESTNY čas („2026-10-02T14:00"), lenže
 * dopyty ho porovnávali s `new Date().toISOString()`, čo je UTC. V lete je
 * Praha o dve hodiny vpredu, v zime o jednu — a presne tak dlho appka
 * ponúkala ako „ďalší" tréning, ktorý sa už odohral.
 *
 * Bolo to na piatich miestach naraz (stránky /a/, /u/, /v/, kalendár,
 * mail). Preto funkcia, nie šiesta kópia toho istého výrazu.
 */
export function terazPraha(teraz: Date = new Date()): string {
  // „sv-SE" dáva ISO tvar („2026-10-02 15:02:11"), stačí vymeniť medzeru.
  return teraz.toLocaleString("sv-SE", { timeZone: "Europe/Prague" }).replace(" ", "T").slice(0, 16);
}

/** Dnešný deň v Prahe. Po polnoci UTC, ale ešte včera v Prahe, sa to líši. */
export const dnesPraha = (teraz: Date = new Date()): string => terazPraha(teraz).slice(0, 10);
