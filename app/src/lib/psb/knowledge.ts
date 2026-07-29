// Background/context the AI assistant draws from — BEYOND the live data snapshot.
// This is where PSB's history, philosophy and the "why" behind the numbers lives,
// distilled from documents Jerry provides. It's embedded in the (prompt-cached)
// system prompt, so every answer can be grounded in this context.
//
// HOW TO UPDATE: paste the distilled background below. Keep it focused prose /
// bullet points (facts, terminology, philosophy, decisions) — not raw dumps.

export const PSB_KNOWLEDGE = `
Základné fakty o štúdiu (z nástroja):
- ProSapiens Biomechanic (PSB) — štúdio osobného tréningu, tréneri Jerry a Terezka.
- 6M program = 6-mesačný proces s fázami: Obnova (1.–6. mesiac), Integrácia (7.–18.), Udržateľnosť (19.+). Produkt "S viazanostou" = 6 990 CZK/mesiac.
- "BEZ viazanosti" = 7 790 CZK / 8 týždňov. Ďalšie balíčky: ONE YEAR (ročné), 8h, 18h, 1h, Online, Doplnenie členstva, Špeciál.
- Zdravá zóna vyťaženia trénera = 24–34 h/týždeň (ideál 29 h).

[SEM PRIDÁM POZADIE PSB Z JERRYHO DOKUMENTOV — história štúdia, filozofia tréningu, prečo sú čísla také aké sú, dôležité rozhodnutia a kontext.]
`.trim();
