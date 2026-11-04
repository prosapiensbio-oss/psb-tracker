/**
 * DOKLAD O SÚHLASE. Znenie sa drží tu a k odberateľovi sa ukladá celé, nie
 * z prehliadača: z webu príde len verzia. Keď sa veta na webe zmení, pribudne
 * nová verzia a staré doklady ostanú pravdivé.
 *
 * Jerry, 4. 11. 2026: súhlas má byť slobodné začiarknutie, po prihlásení dostane
 * človek darček. Dokument sa dá získať aj bez začiarknutia.
 */
export const ZNENIA_SUHLASU: Record<string, string> = {
  v1: "Chci dostávat e-maily od ProSapiens Biomechanic o tréninku a pohybu a jako dárek získat {darcek}. Odhlásit se můžete jedním klikem přímo v každém e-mailu.",
};
export const AKTUALNA_VERZIA = "v1";

/** Odkiaľ smie prísť prihlásenie. Prehliadač to overí cez CORS. */
export const WEBY_PRIHLASENIA = ["https://www.prosapiens.cz", "https://prosapiens.cz"];

/** Viac čakajúcich potvrdení za 24 h znamená útok, nie záujem: chráni denný limit. */
export const STROP_CAKAJUCICH = 40;
