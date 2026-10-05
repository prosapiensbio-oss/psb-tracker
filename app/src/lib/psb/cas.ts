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
/**
 * Formátovač sa stavia RAZ a výsledok sa pamätá do konca minúty.
 *
 * Od 5. 10. 2026 („deň podľa Prahy, nie UTC") sa `dnesPraha()` volá na ~130
 * miestach, aj v predvolených parametroch funkcií, ktoré bežia pre každého
 * klienta. `toLocaleString` s časovým pásmom stál 42 µs na volanie — drahý
 * objekt v slučke je presne pasca z kalendára (CLAUDE.md, 13. 9. 2026).
 */
let FORMAT: Intl.DateTimeFormat | null = null;
let posledna = { minuta: -1, text: "" };
export function terazPraha(teraz: Date = new Date()): string {
  const ms = teraz.getTime();
  const minuta = Math.floor(ms / 60000);
  if (minuta === posledna.minuta) return posledna.text;
  FORMAT ||= new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  // „sv-SE" dáva ISO tvar („2026-10-02 15:02"), stačí vymeniť medzeru.
  const text = FORMAT.format(teraz).replace(" ", "T").slice(0, 16);
  posledna = { minuta, text };
  return text;
}

/** Dnešný deň v Prahe. Po polnoci UTC, ale ešte včera v Prahe, sa to líši. */
export const dnesPraha = (teraz: Date = new Date()): string => terazPraha(teraz).slice(0, 10);

/** Deň `den` (RRRR-MM-DD) posunutý o `n` dní — čisto kalendárne, bez pásma. */
export const posunDen = (den: string, n: number): string =>
  new Date(Date.parse(`${den.slice(0, 10)}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Deň v týždni pražského dňa: 1 = pondelok … 7 = nedeľa. */
export const denVTyzdniPraha = (teraz: Date = new Date()): number =>
  new Date(`${dnesPraha(teraz)}T12:00:00Z`).getUTCDay() || 7;

/** Mesiac (RRRR-MM) posunutý o `n` mesiacov od pražského dňa `teraz`. */
export const mesiacPraha = (teraz: Date = new Date(), n = 0): string => {
  const [y, m] = dnesPraha(teraz).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/**
 * Okamih pražskej polnoci dnešného dňa ako UTC ISO — na porovnanie s časmi
 * zápisu (`created_at`, `vzas_audit.at`), ktoré sú v UTC. Porovnať ich
 * s holým dňom „2026-10-05" by znamenalo začať deň až o 01:00/02:00 v Prahe.
 * Posun sa berie pri polnoci, nie teraz (v deň zmeny času sa líši).
 */
export function polnocPrahaUtc(teraz: Date = new Date()): string {
  const den = dnesPraha(teraz);
  const posun = (d: Date) => Date.parse(`${terazPraha(d)}:00Z`) - Math.floor(d.getTime() / 60000) * 60000;
  const odhad = Date.parse(`${den}T00:00:00Z`) - posun(teraz);
  return new Date(Date.parse(`${den}T00:00:00Z`) - posun(new Date(odhad))).toISOString();
}
