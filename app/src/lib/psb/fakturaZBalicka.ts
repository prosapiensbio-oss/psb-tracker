import { normName } from "./format";
import { nazovProduktu } from "./nazvyProduktov";
import type { DlhPolozka } from "./zaplatene";

/**
 * FAKTÚRA NA BALÍČEK ZNIE NA TO, ČO KLIENT DLŽÍ (Jerry, 23. 10. 2026:
 * „prečo Podolová, keď má zaplatiť iba 4 290, ale faktúra sa jej vygeneruje
 * na 5 640 — suma faktúry aj suma v SMS má byť definovaná dlhom").
 *
 * Stránka s QR suma brala z dlhu (`dlhyKlientov`) vždy; faktúra z profilu
 * brala cenu balíčka. Lucia má na předplatné od 2. 10. preplatok zo
 * septembra, takže dlh je 4 290 a faktúra na 5 640 by pýtala o 1 350 viac.
 *
 * Keď balíček v dlhu nie je (zaplatený), faktúra ide na jeho cenu — doklad
 * na niečo, čo už prišlo.
 */
export function fakturaZBalicka(
  klient: string,
  b: { id?: string; nazov: string; cena: number | null | undefined; platnostOd?: string },
  dlhy: DlhPolozka[] | undefined,
): { klient: string; popis: string; cena: number; balicekId?: string; dlh: boolean } {
  const cena = Math.round(b.cena || 0);
  const d = (dlhy || []).find((x) => (b.id && x.id === b.id)
    || (!x.id && normName(x.klient) === normName(klient) && !!b.platnostOd && x.den === b.platnostOd.slice(0, 10)));
  // Faktúra ide klientovi (česky): názov produktu, nie interný z PTmindera
  // („ON - 6h S viazanostou" → „6h Předplatné online"), a „doplatek".
  const nazov = nazovProduktu(b.nazov) || b.nazov;
  if (!d || !(d.doplatit > 0)) return { klient, popis: nazov, cena, balicekId: b.id, dlh: false };
  const doplatok = d.doplatit < cena;
  return {
    klient,
    popis: doplatok ? `${nazov} — doplatek` : nazov,
    cena: Math.round(d.doplatit),
    balicekId: b.id,
    dlh: true,
  };
}
