import type { D1Database } from "@cloudflare/workers-types";
import { podpisOdkazu } from "./auth.server";

/**
 * ODKAZ NA FAKTÚRU — `/v/fa<18 znakov>`.
 *
 * Jerry, 29. 10. 2026: „chcem mať možnosť poslať FA mailom a potom aj cez
 * SMS, preto by sme asi mohli vytvoriť nový odkaz, kde by bola FA." Odkaz
 * klienta (`/v/<token>`) ukazuje hodiny; faktúru môže platiť firma, ktorú
 * hodiny nezaujímajú a ktorá potrebuje doklad.
 *
 * PREČO POD `/v/` A BEZ TABUĽKY. Krátke odkazy idú cez prosapiens.cz
 * (snippet 26 vo WordPresse pozná `/u/ /v/ /t/ /k/ /d/ /f/` a tvar tokenu)
 * — nová cesta by znamenala zmenu na živom webe a bez nej dlhú adresu
 * workera, teda dve SMS namiesto jednej. Token je podpis čísla faktúry
 * (`podpisOdkazu`), takže netreba stĺpec ani migráciu a ten istý odkaz
 * vyjde pri každom odoslaní rovnaký.
 */
export const PREDPONA_FAKTURY = "fa";

export async function tokenFaktury(cislo: string): Promise<string> {
  return `${PREDPONA_FAKTURY}${(await podpisOdkazu(`faktura|${cislo}`)).slice(0, 18)}`;
}

/** Faktúra podľa tokenu — hľadá sa medzi faktúrami za posledných 13 mesiacov. */
export async function fakturaPodlaTokenu(DB: D1Database, token: string): Promise<string | null> {
  if (!token.startsWith(PREDPONA_FAKTURY) || token.length !== PREDPONA_FAKTURY.length + 18) return null;
  const rs = (((await DB.prepare("SELECT id, cislo FROM vydane_faktury WHERE vystavene >= date('now', '-400 days')")
    .all().catch(() => null))?.results) || []) as { id: string; cislo: string }[];
  for (const r of rs) if ((await tokenFaktury(r.cislo)) === token) return r.id;
  return null;
}
